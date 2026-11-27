import {
  compileBlueprint,
  inspectVisit,
  MAX_OPERATIONS,
  type BlockVisit,
  type BlueprintContext,
  type Execution,
  type Value,
  type Yield,
} from "@mosaic/blueprints";

type Program = ReturnType<typeof compileBlueprint>;
export type Binding = {
  id: string;
  blueprintId: string;
  program: Program;
  context: BlueprintContext;
};
type Entry = Program["entries"][number];
type Job = {
  binding: Binding;
  entry: Entry;
  execution: Execution;
  pending?: Yield;
  wake: number;
  tick: number;
  operations: number;
};
type Delivery = {
  id: string;
  payload?: Value;
  source: Binding;
  blockId: string;
};
type Pause = { job: Job; visit: BlockVisit };
export type BlueprintPause = ReturnType<typeof inspectVisit> & {
  entityId: string;
  blueprintId: string;
  blockId: string;
  entryId: string;
};
const MAX_SIGNALS_PER_TICK = 256;
const MAX_DELIVERIES_PER_TICK = 4096;
const MAX_SIGNAL_JOBS = 8192;

export class BlueprintScheduler {
  activeBlocks = new Set<string>();
  breakpoints = new Map<string, ReadonlySet<string>>();
  private ready: Job[] = [];
  private cursor = 0;
  private sleeping: Job[] = [];
  private deliveries: Delivery[] = [];
  private contacts: { signalId: string; entityId?: string; payload?: Value }[] =
    [];
  private listeners = new Map<string, { binding: Binding; entry: Entry }[]>();
  private updates: { binding: Binding; entry: Entry }[] = [];
  private updating = new Map<Binding, Set<Entry>>();
  private pause?: Pause;
  private tick = 0;
  private emitted = 0;
  private delivered = 0;
  private signalJobs = 0;
  private executing?: { job: Job; visit: BlockVisit };

  constructor(
    private stepSeconds: number,
    private debug: boolean,
  ) {}

  configure(bindings: Binding[], changed?: ReadonlySet<Binding>) {
    this.listeners.clear();
    this.updates = [];
    if (changed?.size) {
      const keep = (job: Job) => {
        if (!changed.has(job.binding)) return true;
        if (job.entry.kind === "signal") this.signalJobs--;
        job.execution.return(undefined);
        return false;
      };
      this.ready = this.ready.slice(this.cursor).filter(keep);
      this.cursor = 0;
      this.sleeping = this.sleeping.filter(keep);
      for (const binding of changed) this.updating.delete(binding);
      this.deliveries = this.deliveries.filter(
        ({ source }) => !changed.has(source),
      );
      const changedEntities = new Set(Array.from(changed, ({ id }) => id));
      this.contacts = this.contacts.filter(
        ({ entityId }) => !entityId || !changedEntities.has(entityId),
      );
      if (this.pause && changed.has(this.pause.job.binding))
        this.pause = undefined;
    }
    for (const binding of bindings) {
      if (binding.program.diagnostics.length) continue;
      for (const entry of binding.program.entries) {
        if (entry.kind === "update") this.updates.push({ binding, entry });
        if (entry.kind !== "signal" || !entry.signalId) continue;
        const items = this.listeners.get(entry.signalId) ?? [];
        items.push({ binding, entry });
        this.listeners.set(entry.signalId, items);
      }
    }
  }
  start(bindings: Binding[]) {
    for (const binding of bindings) {
      if (binding.program.diagnostics.length) continue;
      for (const entry of binding.program.entries)
        if (entry.kind === "start") this.enqueue(binding, entry);
    }
    this.pump();
  }
  nextTick() {
    this.tick++;
    this.emitted = 0;
    this.delivered = 0;
    this.activeBlocks.clear();
    for (const contact of this.contacts) {
      for (const { binding, entry } of this.listeners.get(contact.signalId) ??
        []) {
        if (contact.entityId && binding.id !== contact.entityId) continue;
        if (
          this.signalJobs >= MAX_SIGNAL_JOBS ||
          this.delivered >= MAX_DELIVERIES_PER_TICK
        )
          break;
        this.delivered++;
        this.enqueue(binding, entry, contact.payload);
      }
    }
    this.contacts = [];
    const sleeping: Job[] = [];
    for (const job of this.sleeping) {
      if (job.wake <= this.tick) this.ready.push(job);
      else sleeping.push(job);
    }
    this.sleeping = sleeping;
    for (const { binding, entry } of this.updates) {
      if (!this.updating.get(binding)?.has(entry)) this.enqueue(binding, entry);
    }
  }
  queueContact(signalId: string, entityId: string, payload?: Value) {
    if (
      this.listeners.has(signalId) &&
      this.contacts.length < MAX_DELIVERIES_PER_TICK
    )
      this.contacts.push({ signalId, entityId, payload });
  }
  queueUi(signalId: string, payload?: Value) {
    if (
      this.listeners.has(signalId) &&
      this.contacts.length < MAX_DELIVERIES_PER_TICK
    )
      this.contacts.push({ signalId, payload });
  }
  private enqueue(binding: Binding, entry: Entry, payload?: Value) {
    if (entry.kind === "update") {
      const live = this.updating.get(binding) ?? new Set<Entry>();
      live.add(entry);
      this.updating.set(binding, live);
    }
    if (entry.kind === "signal") this.signalJobs++;
    this.ready.push({
      binding,
      entry,
      execution: entry.begin(binding.context, payload),
      wake: 0,
      tick: this.tick,
      operations: 0,
    });
  }
  emit(id: string, payload?: Value) {
    const executed = this.executing;
    if (!executed || !this.listeners.has(id)) return;
    if (this.emitted >= MAX_SIGNALS_PER_TICK)
      throw new Error("Scene event limit exceeded for this tick.");
    this.emitted++;
    this.deliveries.push({
      id,
      payload,
      source: executed.job.binding,
      blockId: executed.visit.blockId,
    });
  }
  private deliver() {
    const deliveries = this.deliveries;
    this.deliveries = [];
    for (const delivery of deliveries) {
      for (const { binding, entry } of this.listeners.get(delivery.id) ?? []) {
        if (
          this.delivered >= MAX_DELIVERIES_PER_TICK ||
          this.signalJobs >= MAX_SIGNAL_JOBS
        ) {
          delivery.source.context.fault({
            blockId: delivery.blockId,
            message: "Scene event delivery limit exceeded.",
          });
          break;
        }
        this.delivered++;
        this.enqueue(binding, entry, delivery.payload);
      }
    }
  }
  get paused() {
    return this.pause !== undefined;
  }
  get pauseDetails(): BlueprintPause | undefined {
    if (!this.pause) return;
    const { job, visit } = this.pause;
    return {
      entityId: job.binding.id,
      blueprintId: job.binding.blueprintId,
      blockId: visit.blockId,
      entryId: visit.entryId,
      ...inspectVisit(visit),
    };
  }
  private finish(job: Job) {
    this.cursor++;
    if (job.entry.kind === "update")
      this.updating.get(job.binding)?.delete(job.entry);
    if (job.entry.kind === "signal") this.signalJobs--;
  }
  pump(mode: "play" | "resume" | "step" = "play") {
    if (this.pause && mode === "play") return;
    const skipped = this.pause?.visit;
    this.pause = undefined;
    let executed = false;
    while (this.cursor < this.ready.length || this.deliveries.length > 0) {
      if (this.cursor === this.ready.length) {
        this.deliver();
        continue;
      }
      const job = this.ready[this.cursor];
      if (!job.pending) {
        const next = job.execution.next();
        if (next.done) {
          this.finish(job);
          continue;
        }
        job.pending = next.value;
      }
      const visit = job.pending;
      if (visit.kind === "wait") {
        job.pending = undefined;
        this.cursor++;
        job.wake =
          this.tick +
          Math.max(1, Math.ceil(visit.seconds / this.stepSeconds - 1e-10));
        this.sleeping.push(job);
        continue;
      }
      if (job.tick !== this.tick) {
        job.operations = 0;
        job.tick = this.tick;
      }
      if (job.operations >= MAX_OPERATIONS) {
        job.binding.context.fault({
          blockId: visit.blockId,
          message: "Blueprint operation limit exceeded for this tick.",
        });
        job.execution.return(undefined);
        this.finish(job);
        continue;
      }
      const breakpoint =
        this.debug &&
        this.breakpoints.get(job.binding.blueprintId)?.has(visit.blockId);
      if (
        (mode === "step" && executed) ||
        (mode !== "step" && breakpoint && visit !== skipped)
      ) {
        this.pause = { job, visit };
        return;
      }
      executed = true;
      job.operations++;
      if (this.debug) this.activeBlocks.add(visit.blockId);
      this.executing = { job, visit };
      try {
        const next = job.execution.next();
        if (next.done) this.finish(job);
        else job.pending = next.value;
      } finally {
        this.executing = undefined;
      }
    }
    this.ready = [];
    this.cursor = 0;
  }
}
