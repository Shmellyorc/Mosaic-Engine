import {
  compileBlueprint,
  displayValue,
  typeOf,
  type Blueprint,
  type Signal,
  type BlueprintContext,
  type Diagnostic,
  type Property,
  type Value,
} from "@mosaic/blueprints";
import {
  emptySignals,
  type Entity,
  type Frame,
  type Project,
  type Scene,
} from "@mosaic/model";
import { BlueprintScheduler, type Binding } from "./blueprints";
export type { BlueprintPause } from "./blueprints";

export const STEP = 1 / 60;
export type Matrix2D = {
  a: number;
  b: number;
  c: number;
  d: number;
  x: number;
  y: number;
};
export type Camera = { x: number; y: number; zoom: number };
export type RuntimeLog = {
  level: "info" | "error";
  message: string;
  blockId?: string;
  entityId?: string;
};
export type Draw = {
  matrix: Matrix2D;
  width: number;
  height: number;
  alpha: number;
  entityId?: string;
} & (
  | { kind: "rect"; color: string }
  | { kind: "sprite"; assetId: string; frame?: Frame }
  | { kind: "text"; text: string; color: string; size: number }
);
export type RenderFrame = {
  width: number;
  height: number;
  background: string;
  draws: Draw[];
};
type WorldEntity = {
  entity: Entity;
  variables: Map<string, Value>;
  clip: string | null;
  elapsed: number;
};
type WorldTransform = { matrix: Matrix2D; alpha: number; visible: boolean };

export function transformPoint(m: Matrix2D, x: number, y: number) {
  return { x: m.a * x + m.c * y + m.x, y: m.b * x + m.d * y + m.y };
}
export function inversePoint(m: Matrix2D, x: number, y: number) {
  const determinant = m.a * m.d - m.b * m.c;
  if (Math.abs(determinant) < 1e-10) return null;
  return {
    x: (m.d * (x - m.x) - m.c * (y - m.y)) / determinant,
    y: (-m.b * (x - m.x) + m.a * (y - m.y)) / determinant,
  };
}
function multiply(a: Matrix2D, b: Matrix2D): Matrix2D {
  const translation = transformPoint(a, b.x, b.y);
  return {
    a: a.a * b.a + a.c * b.b,
    b: a.b * b.a + a.d * b.b,
    c: a.a * b.c + a.c * b.d,
    d: a.b * b.c + a.d * b.d,
    ...translation,
  };
}
function translation(x: number, y: number): Matrix2D {
  return { a: 1, b: 0, c: 0, d: 1, x, y };
}
export function fitFrame(
  width: number,
  height: number,
  targetWidth: number,
  targetHeight: number,
) {
  const scale = Math.min(targetWidth / width, targetHeight / height);
  return {
    scale,
    x: (targetWidth - width * scale) / 2,
    y: (targetHeight - height * scale) / 2,
  };
}

export class InputState {
  private held = new Set<string>();
  constructor(private axes: Project["input"]) {}
  press(code: string) {
    this.held.add(code);
  }
  release(code: string) {
    this.held.delete(code);
  }
  clear() {
    this.held.clear();
  }
  uses(code: string) {
    return this.axes.some(
      (axis) => axis.positive.includes(code) || axis.negative.includes(code),
    );
  }
  axis(id: string) {
    const axis = this.axes.find((item) => item.id === id);
    if (!axis) return 0;
    return (
      Number(axis.positive.some((key) => this.held.has(key))) -
      Number(axis.negative.some((key) => this.held.has(key)))
    );
  }
}
export function connectKeyboard(
  target: HTMLElement | Window,
  input: InputState,
) {
  const down = (event: Event) => {
    const key = event as KeyboardEvent;
    if (input.uses(key.code)) {
      key.preventDefault();
      input.press(key.code);
    }
  };
  const up = (event: Event) => input.release((event as KeyboardEvent).code);
  const clear = () => input.clear();
  target.addEventListener("keydown", down);
  window.addEventListener("keyup", up);
  target.addEventListener("blur", clear);
  window.addEventListener("blur", clear);
  return () => {
    target.removeEventListener("keydown", down);
    window.removeEventListener("keyup", up);
    target.removeEventListener("blur", clear);
    window.removeEventListener("blur", clear);
    clear();
  };
}

export class Game {
  readonly input: InputState;
  readonly logs: RuntimeLog[] = [];
  readonly scene: Scene;
  private scheduler: BlueprintScheduler;
  private reported = new Set<string>();
  private world = new Map<string, WorldEntity>();
  private assets: Set<string>;
  private entities: WorldEntity[];
  private program: Binding[] = [];
  private documents = new Map<string, Blueprint>();
  private signals: readonly Signal[];
  private tickPending = false;
  get activeBlocks() {
    return this.scheduler.activeBlocks;
  }
  get blueprintPause() {
    return this.scheduler.pauseDetails;
  }
  setBreakpoints(breakpoints: Map<string, ReadonlySet<string>>) {
    this.scheduler.breakpoints = breakpoints;
  }
  resumeBlueprints() {
    this.scheduler.pump("resume");
    this.finishTick();
  }
  stepBlueprint() {
    if (!this.scheduler.paused && !this.tickPending) this.beginTick();
    this.scheduler.pump("step");
    this.finishTick();
  }
  private started = false;
  private accumulator = 0;
  private tiles = new Map<number, Scene["tilemap"]["tiles"][number]>();
  time = 0;

  constructor(
    readonly project: Project,
    sceneId = project.startSceneId,
    debug = false,
  ) {
    const scene = project.scenes.find((entry) => entry.id === sceneId);
    if (!scene) throw new Error("Scene could not be found.");
    this.scene = scene;
    this.input = new InputState(project.input);
    for (const cell of scene.tilemap.tiles)
      this.tiles.set(cell.y * scene.tilemap.width + cell.x, cell);
    this.scheduler = new BlueprintScheduler(STEP, debug);
    this.assets = new Set(project.assets.map((asset) => asset.id));
    this.signals = project.signals ?? emptySignals;
    const layerOrder = new Map(
      scene.layers.map((layer, index) => [layer.id, index]),
    );
    const sorted = [...scene.entities].sort(
      (a, b) =>
        layerOrder.get(a.layerId)! - layerOrder.get(b.layerId)! ||
        a.order - b.order,
    );
    this.entities = sorted.map((source) => {
      const entity = structuredClone(source);
      const state: WorldEntity = {
        entity,
        variables: new Map(),
        clip: null,
        elapsed: 0,
      };
      this.world.set(entity.id, state);
      return state;
    });
    this.reloadBlueprints(project.blueprints, this.signals);
  }

  reloadBlueprints(
    blueprints: Blueprint[],
    signals: readonly Signal[] = this.signals,
  ) {
    const documents = new Map(
      blueprints.map((blueprint) => [blueprint.id, blueprint]),
    );
    const previous = new Map(
      this.program.map((binding) => [binding.id, binding]),
    );
    const changed = new Set<Binding>();
    const axes = new Set(this.project.input.map((axis) => axis.id));
    const compiled = new Map<string, Binding["program"]>();
    const sameSignals = signals === this.signals;
    this.program = this.entities.flatMap((state) => {
      const id = state.entity.blueprintId;
      const old = previous.get(state.entity.id);
      const definition = id && documents.get(id);
      if (
        old &&
        sameSignals &&
        definition &&
        definition === this.documents.get(definition.id)
      )
        return [old];
      if (old) {
        changed.add(old);
        for (const key of this.reported)
          if (key.startsWith(JSON.stringify(state.entity.id) + "|"))
            this.reported.delete(key);
      }
      if (!definition) {
        state.variables = new Map();
        return [];
      }
      let program = compiled.get(definition.id);
      if (!program) {
        program = compileBlueprint(definition, axes, signals);
        compiled.set(definition.id, program);
      }
      const variables = program.createVariables();
      for (const [key, initial] of variables) {
        const value = state.variables.get(key);
        if (value !== undefined && typeOf(value) === typeOf(initial))
          variables.set(key, value);
      }
      state.variables = variables;
      for (const diagnostic of program.diagnostics)
        this.fault(state.entity.id, diagnostic);
      return [
        {
          id: state.entity.id,
          blueprintId: definition.id,
          program,
          context: this.context(state),
        },
      ];
    });
    this.documents = documents;
    this.signals = signals;
    this.scheduler.configure(this.program, changed);
  }

  private context(state: WorldEntity): BlueprintContext {
    const entity = state.entity;
    return {
      axis: (id) => this.input.axis(id),
      variables: state.variables,
      move: (x, y) => {
        this.set(entity, "x", entity.transform.x + x * STEP);
        this.set(entity, "y", entity.transform.y + y * STEP);
      },
      set: (property, value, target) =>
        this.set(this.target(entity, target), property, value),
      get: (property, target) => {
        const object = this.target(entity, target);
        if (property === "visible") return object.visible;
        if (property === "text") {
          if (object.visual?.kind !== "text")
            throw new Error("The entity has no text component.");
          return object.visual.text;
        }
        return object.transform[property];
      },
      query: (query) =>
        query === "scene"
          ? this.scene.name
          : {
              kind: "entity",
              id: query === "self" ? entity.id : (entity.parentId ?? ""),
            },
      exists: (reference) =>
        typeof reference === "object" &&
        ((reference.kind === "entity" && this.world.has(reference.id)) ||
          (reference.kind === "asset" && this.assets.has(reference.id))),
      emit: (id, value) => this.scheduler.emit(id, value),
      animate: (clip) => {
        if (state.clip === clip) return;
        if (entity.visual?.kind !== "sprite")
          throw new Error("Animation requires an assigned sprite.");
        if (!entity.clips.some((c) => c.name === clip))
          throw new Error(`Animation "${clip}" is missing.`);
        state.clip = clip;
        state.elapsed = 0;
      },
      log: (blockId, value) =>
        this.log({
          level: "info",
          entityId: entity.id,
          blockId,
          message: displayValue(value),
        }),
      fault: (diagnostic) => this.fault(entity.id, diagnostic),
    };
  }

  private target(entity: Entity, id?: string) {
    if (id === undefined) return entity;
    const target = this.world.get(id);
    if (!target)
      throw new Error("The target entity is absent from this scene.");
    return target.entity;
  }

  private set(entity: Entity, property: Property, value: Value) {
    if (property === "visible") {
      entity.visible = Boolean(value);
      return;
    }
    if (property === "text") {
      if (entity.visual?.kind !== "text")
        throw new Error("The entity has no text component.");
      entity.visual.text = String(value);
      return;
    }
    const number = Number(value);
    if (!Number.isFinite(number))
      throw new Error("Property value must be finite.");
    if ((property === "x" || property === "y") && Math.abs(number) > 1e7)
      throw new Error("Position exceeds the world bounds.");
    entity.transform[property] =
      property === "alpha" ? Math.max(0, Math.min(1, number)) : number;
  }

  private log(entry: RuntimeLog) {
    if (this.logs.length === 200) this.logs.shift();
    this.logs.push(entry);
  }
  private fault(entityId: string, { blockId, message }: Diagnostic) {
    const key =
      JSON.stringify(entityId) + "|" + JSON.stringify([blockId, message]);
    if (this.reported.has(key)) return;
    this.reported.add(key);
    this.log({ level: "error", entityId, blockId, message });
  }

  start() {
    if (this.started) return;
    this.started = true;
    this.scheduler.start(this.program);
  }
  private beginTick() {
    this.tickPending = true;
    this.scheduler.nextTick();
  }
  private finishTick() {
    if (this.scheduler.paused || !this.tickPending) return;
    this.tickPending = false;
    for (const state of this.entities) if (state.clip) state.elapsed += STEP;
    this.time += STEP;
  }
  advance(seconds: number) {
    if (!Number.isFinite(seconds) || seconds < 0) return;
    this.start();
    if (this.scheduler.paused) return;
    this.scheduler.pump();
    this.finishTick();
    if (this.scheduler.paused) return;
    this.accumulator += Math.min(seconds, 0.15);
    while (this.accumulator + 1e-10 >= STEP) {
      this.accumulator -= STEP;
      this.beginTick();
      this.scheduler.pump();
      this.finishTick();
      if (this.scheduler.paused) {
        this.accumulator = 0;
        break;
      }
    }
  }
  getEntity(id: string) {
    return this.world.get(id)?.entity;
  }
  getVariables(id: string) {
    return this.world.get(id)?.variables;
  }

  private transforms() {
    const layers = new Map(
      this.scene.layers.map((layer) => [layer.id, layer.visible]),
    );
    const resolved = new Map<string, WorldTransform>();
    for (const state of this.entities) {
      const chain: Entity[] = [];
      let entity: Entity | undefined = state.entity;
      while (entity && !resolved.has(entity.id)) {
        chain.push(entity);
        entity = entity.parentId
          ? this.world.get(entity.parentId)?.entity
          : undefined;
      }
      for (let i = chain.length - 1; i >= 0; i--) {
        const child = chain[i];
        const t = child.transform;
        const radians = ((t.rotation % 360) * Math.PI) / 180;
        const cos = Math.cos(radians);
        const sin = Math.sin(radians);
        const local = {
          a: cos * t.scaleX,
          b: sin * t.scaleX,
          c: -sin * t.scaleY,
          d: cos * t.scaleY,
          x: t.x,
          y: t.y,
        };
        const parent = child.parentId
          ? resolved.get(child.parentId)
          : undefined;
        resolved.set(child.id, {
          matrix: parent ? multiply(parent.matrix, local) : local,
          alpha: (parent?.alpha ?? 1) * t.alpha,
          visible: Boolean(
            layers.get(child.layerId) &&
            child.visible &&
            (parent?.visible ?? true),
          ),
        });
      }
    }
    return resolved;
  }

  frame(cameraOverride?: Camera): RenderFrame {
    const { width, height } = this.project;
    const transforms = this.transforms();
    const { camera, tilemap } = this.scene;
    const target = camera.follow
      ? transforms.get(camera.follow)?.matrix
      : undefined;
    const view = cameraOverride ?? {
      x: target?.x ?? camera.x,
      y: target ? target.y + camera.offsetY : camera.y,
      zoom: camera.zoom,
    };
    const cameraMatrix = {
      a: view.zoom,
      b: 0,
      c: 0,
      d: view.zoom,
      x: width / 2 - view.x * view.zoom,
      y: height / 2 - view.y * view.zoom,
    };
    const draws: Draw[] = [];
    const hud: Draw[] = [];
    let tilesDrawn = false;
    const pushTiles = () => {
      tilesDrawn = true;
      if (!this.tiles.size) return;
      const { size } = tilemap;
      const x0 = Math.max(0, Math.floor(-cameraMatrix.x / view.zoom / size));
      const y0 = Math.max(0, Math.floor(-cameraMatrix.y / view.zoom / size));
      const x1 = Math.min(
        tilemap.width - 1,
        Math.floor((width - cameraMatrix.x) / view.zoom / size),
      );
      const y1 = Math.min(
        tilemap.height - 1,
        Math.floor((height - cameraMatrix.y) / view.zoom / size),
      );
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          const tile = this.tiles.get(y * tilemap.width + x);
          if (tile)
            draws.push({
              kind: "rect",
              color: tile.color,
              width: size,
              height: size,
              alpha: 1,
              matrix: multiply(cameraMatrix, translation(x * size, y * size)),
            });
        }
    };
    const firstLayer = this.scene.layers[0]?.id;
    for (const state of this.entities) {
      const { entity } = state;
      if (!tilesDrawn && entity.layerId !== firstLayer) pushTiles();
      const world = transforms.get(entity.id)!;
      const visual = entity.visual;
      if (!visual || !world.visible || !world.alpha) continue;
      const screen = visual.kind === "text" && visual.screen;
      const matrix = screen
        ? world.matrix
        : multiply(cameraMatrix, world.matrix);
      const dimensions = {
        width: entity.transform.width,
        height: entity.transform.height,
      };
      const base = {
        ...dimensions,
        matrix,
        alpha: world.alpha,
        entityId: entity.id,
      };
      if (visual.kind === "text") {
        (screen ? hud : draws).push({ ...base, ...visual });
        continue;
      }
      const corners = [
        transformPoint(matrix, 0, 0),
        transformPoint(matrix, dimensions.width, 0),
        transformPoint(matrix, 0, dimensions.height),
        transformPoint(matrix, dimensions.width, dimensions.height),
      ];
      if (
        corners.every((p) => p.x < 0) ||
        corners.every((p) => p.y < 0) ||
        corners.every((p) => p.x > width) ||
        corners.every((p) => p.y > height)
      )
        continue;
      if (visual.kind === "sprite") {
        const clip = state.clip
          ? entity.clips.find((entry) => entry.name === state.clip)
          : undefined;
        const step = clip ? Math.floor(state.elapsed * clip.fps) : 0;
        const frame =
          clip?.frames[
            clip.loop
              ? step % clip.frames.length
              : Math.min(step, clip.frames.length - 1)
          ];
        draws.push({ ...base, ...visual, frame: frame ?? visual.frame });
      } else draws.push({ ...base, ...visual });
    }
    if (!tilesDrawn) pushTiles();
    draws.push(...hud);
    return { width, height, background: this.scene.background, draws };
  }
}

export function pickEntity(frame: RenderFrame, x: number, y: number) {
  for (let index = frame.draws.length - 1; index >= 0; index--) {
    const draw = frame.draws[index];
    if (!draw.entityId) continue;
    const point = inversePoint(draw.matrix, x, y);
    if (
      point &&
      point.x >= 0 &&
      point.y >= 0 &&
      point.x <= draw.width &&
      point.y <= draw.height
    )
      return draw.entityId;
  }
  return null;
}
