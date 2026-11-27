import type { Entity, Scene } from "@mosaic/model";
import { SpatialGrid } from "./spatial";
import { type Point, type Rect, type TileWorld } from "./tiles";

const EPSILON = 1e-7;
type Physical = Entity & { body: NonNullable<Entity["body"]> };
type BodyState = {
  entity: Physical;
  velocity: Point;
  movement: Point;
  index: number;
  start: Rect;
};
export type Contact = {
  entityId: string;
  otherId: string | null;
  phase: "enter" | "exit";
};

export function bodyRect(entity: Physical): Rect {
  const { body, transform } = entity;
  return {
    x: transform.x + body.offsetX,
    y: transform.y + body.offsetY,
    width: body.width,
    height: body.height,
  };
}
export function overlaps(a: Rect, b: Rect, tolerance = 0) {
  return (
    a.x + a.width + tolerance > b.x &&
    b.x + b.width + tolerance > a.x &&
    a.y + a.height + tolerance > b.y &&
    b.y + b.height + tolerance > a.y
  );
}
function sweep(rect: Rect, x: number, y: number) {
  return {
    x: Math.min(rect.x, x),
    y: Math.min(rect.y, y),
    width: rect.width + Math.abs(x - rect.x),
    height: rect.height + Math.abs(y - rect.y),
  };
}

function sensorSweep(a: Rect, end: Rect, b: Rect, otherEnd: Rect) {
  const x = a.x + (end.x - a.x) - (otherEnd.x - b.x);
  const y = a.y + (end.y - a.y) - (otherEnd.y - b.y);
  return overlaps(sweep(a, x, a.y), b) || overlaps(sweep({ ...a, x }, x, y), b);
}

function clippedAxis(
  actor: Rect,
  collider: Rect,
  axis: "x" | "y",
  velocity: number,
) {
  const pos = actor[axis],
    obstacle = collider[axis];
  const size = axis === "x" ? "width" : "height";
  const across = axis === "x" ? "y" : "x";
  const acrossSize = axis === "x" ? "height" : "width";
  if (
    actor[across] + actor[acrossSize] <= collider[across] + EPSILON ||
    collider[across] + collider[acrossSize] <= actor[across] + EPSILON
  )
    return velocity;
  const edge = pos + actor[size];
  const far = obstacle + collider[size];
  if (velocity > 0 && edge <= obstacle + EPSILON)
    return Math.min(velocity, Math.max(0, obstacle - edge));
  if (velocity < 0 && pos >= far - EPSILON)
    return Math.max(velocity, Math.min(0, far - pos));
  // A spawn or teleport can overlap. Permit movement toward the nearer exit.
  if (edge > obstacle && pos < far) {
    if (velocity > 0 && obstacle - edge > pos - far) return 0;
    if (velocity < 0 && obstacle - edge < pos - far) return 0;
  }
  return velocity;
}

export class PhysicsWorld {
  private states = new Map<string, BodyState>();
  private index = new SpatialGrid<BodyState>();
  private candidates = new Set<BodyState>();
  private watched: BodyState[] = [];
  private contacts = new Map<number, [BodyState, BodyState]>();
  private tileContacts = new Set<BodyState>();
  constructor(
    entities: Entity[],
    private tiles: TileWorld,
    private gravity: Scene["gravity"],
    previous?: PhysicsWorld,
    keepVelocity?: ReadonlySet<string>,
  ) {
    for (const entity of entities) {
      if (!entity.body || entity.parentId) continue;
      const physical = entity as Physical;
      const retained = keepVelocity?.has(entity.id)
        ? previous?.states.get(entity.id)
        : undefined;
      const state: BodyState = {
        entity: physical,
        index: this.states.size,
        velocity: retained
          ? { ...retained.velocity }
          : { x: entity.body.velocityX, y: entity.body.velocityY },
        movement: retained ? { ...retained.movement } : { x: 0, y: 0 },
        start: bodyRect(physical),
      };
      this.states.set(entity.id, state);
      if (entity.body.enterSignal || entity.body.exitSignal)
        this.watched.push(state);
      this.index.update(state, state.start);
    }
    if (previous && keepVelocity) {
      const watched = new Set(this.watched);
      for (const [before, other] of previous.contacts.values()) {
        const state = this.states.get(before.entity.id);
        const neighbor = this.states.get(other.entity.id);
        if (
          state &&
          neighbor &&
          watched.has(state) &&
          keepVelocity.has(state.entity.id) &&
          keepVelocity.has(neighbor.entity.id)
        )
          this.contacts.set(state.index * this.states.size + neighbor.index, [
            state,
            neighbor,
          ]);
      }
      for (const before of previous.tileContacts) {
        const state = this.states.get(before.entity.id);
        if (state && watched.has(state) && keepVelocity.has(state.entity.id))
          this.tileContacts.add(state);
      }
    }
  }
  request(id: string, x: number, y: number) {
    const state = this.states.get(id);
    if (!state) return false;
    state.movement.x += x;
    state.movement.y += y;
    return true;
  }
  private clip(
    state: BodyState,
    actor: Rect,
    axis: "x" | "y",
    desired: number,
  ) {
    if (!desired || state.entity.body.kind === "sensor") return desired;
    const area = sweep(
      actor,
      actor.x + (axis === "x" ? desired : 0),
      actor.y + (axis === "y" ? desired : 0),
    );
    let change = desired;
    this.tiles.solids(area, (tile) => {
      change = clippedAxis(actor, tile, axis, change);
    });
    for (const other of this.index.query(area, this.candidates)) {
      if (other !== state && other.entity.body.kind !== "sensor")
        change = clippedAxis(actor, bodyRect(other.entity), axis, change);
    }
    return change;
  }
  step(seconds: number, notify: (contact: Contact) => void) {
    for (const state of this.states.values()) {
      state.start = bodyRect(state.entity);
      this.index.update(state, state.start);
    }
    for (const state of this.states.values()) {
      const { entity, velocity, movement, start } = state;
      const { body } = entity;
      if (body.kind === "static") {
        movement.x = 0;
        movement.y = 0;
        continue;
      }
      if (body.kind === "dynamic") {
        velocity.x += (this.gravity?.x ?? 0) * body.gravityScale * seconds;
        velocity.y += (this.gravity?.y ?? 0) * body.gravityScale * seconds;
      }
      const limit = (value: number) => Math.min(1e7, Math.max(-1e7, value));
      const dx =
        limit(entity.transform.x + movement.x + velocity.x * seconds) -
        entity.transform.x;
      const dy =
        limit(entity.transform.y + movement.y + velocity.y * seconds) -
        entity.transform.y;
      const x = this.clip(state, start, "x", dx);
      const y = this.clip(state, { ...start, x: start.x + x }, "y", dy);
      entity.transform.x += x;
      entity.transform.y += y;
      if (x !== dx && Math.sign(velocity.x) === Math.sign(dx))
        velocity.x *= -body.bounce;
      if (y !== dy && Math.sign(velocity.y) === Math.sign(dy))
        velocity.y *= -body.bounce;
      movement.x = 0;
      movement.y = 0;
      this.index.update(state, bodyRect(entity));
    }
    if (!this.watched.length) return;
    for (const state of this.states.values()) {
      const end = bodyRect(state.entity);
      this.index.update(state, sweep(state.start, end.x, end.y));
    }
    const tileContacts = new Set<BodyState>();
    const contacts = new Map<number, [BodyState, BodyState]>();
    const size = this.states.size;
    for (const state of this.watched) {
      const finish = bodyRect(state.entity);
      const area = sweep(state.start, finish.x, finish.y);
      this.tiles.solids(
        {
          x: finish.x - EPSILON,
          y: finish.y - EPSILON,
          width: finish.width + 2 * EPSILON,
          height: finish.height + 2 * EPSILON,
        },
        (tile) => {
          if (overlaps(finish, tile, EPSILON)) tileContacts.add(state);
        },
      );
      if (tileContacts.has(state) && !this.tileContacts.has(state))
        notify({ entityId: state.entity.id, otherId: null, phase: "enter" });
      for (const neighbor of this.index.query(
        {
          x: area.x - EPSILON,
          y: area.y - EPSILON,
          width: area.width + 2 * EPSILON,
          height: area.height + 2 * EPSILON,
        },
        this.candidates,
      )) {
        if (
          neighbor === state ||
          (state.entity.body.kind === "static" &&
            neighbor.entity.body.kind === "static")
        )
          continue;
        const target = bodyRect(neighbor.entity);
        const touch = overlaps(finish, target, EPSILON);
        const sensor =
          state.entity.body.kind === "sensor" ||
          neighbor.entity.body.kind === "sensor";
        if (!touch && !sensor) continue;
        if (!touch && !sensorSweep(state.start, finish, neighbor.start, target))
          continue;
        const key = state.index * size + neighbor.index;
        contacts.set(key, [state, neighbor]);
        if (!this.contacts.has(key))
          notify({
            entityId: state.entity.id,
            otherId: neighbor.entity.id,
            phase: "enter",
          });
      }
    }
    for (const [key, [state, neighbor]] of this.contacts) {
      if (!contacts.has(key))
        notify({
          entityId: state.entity.id,
          otherId: neighbor.entity.id,
          phase: "exit",
        });
    }
    this.contacts = contacts;
    for (const state of this.tileContacts)
      if (!tileContacts.has(state))
        notify({ entityId: state.entity.id, otherId: null, phase: "exit" });
    this.tileContacts = tileContacts;
  }
}
