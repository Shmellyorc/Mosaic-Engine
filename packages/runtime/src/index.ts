import { UiWorld } from "./ui";
export { UiWorld } from "./ui";
export { mountGameUi } from "./ui-dom";
import { GameData, type SlotStorage } from "./data";
export {
  GameData,
  browserSlotStorage,
  memorySlotStorage,
  MAX_SAVE_BYTES,
} from "./data";
import {
  compileBlueprint,
  displayValue,
  typeOf,
  type Blueprint,
  type Signal,
  type BlueprintContext,
  type Diagnostic,
  type EffectCommand,
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
import { cameraView, type Camera } from "./camera";
import {
  autotileFrame,
  TileWorld,
  NORTH,
  EAST,
  SOUTH,
  WEST,
  type TileGrid,
  type Rect,
} from "./tiles";
import { PhysicsWorld } from "./physics";
import { SpatialGrid } from "./spatial";
import { NavigationGrid, NavigationWorld } from "./navigation";
import { AnimationPlayer, MotionWorld } from "./motion";
import { ParticleWorld } from "./particles";
import type { AudioCommand } from "./audio";
export { AudioMixer } from "./audio";
export { AnimationPlayer, sampleClip } from "./motion";
export type { Camera } from "./camera";
export {
  TileWorld,
  TileGrid,
  autotileFrame,
  TILE_CHUNK_SIZE,
  RESIDENT_TILE_CHUNKS,
} from "./tiles";
export { SpatialGrid } from "./spatial";
export { cameraView } from "./camera";
export { PhysicsWorld, bodyRect } from "./physics";
export { NavigationGrid, entityCenter } from "./navigation";
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
export type LightingPass = {
  ambient: string;
  worldDraws: number;
  lights: {
    x: number;
    y: number;
    radius: number;
    color: string;
    intensity: number;
  }[];
};
export type RenderFrame = {
  width: number;
  height: number;
  background: string;
  draws: Draw[];
  lighting?: LightingPass;
};
type WorldEntity = {
  entity: Entity;
  variables: Map<string, Value>;
  animation?: AnimationPlayer;
  parent?: WorldEntity;
  rank: number;
  pose: WorldTransform;
};
type WorldTransform = {
  matrix: Matrix2D;
  alpha: number;
  visible: boolean;
  rotation: number;
  cos: number;
  sin: number;
  width: number;
  height: number;
  revision: number;
  indexed: number;
  bounds: Rect;
};

const pose = (): WorldTransform => ({
  matrix: { a: 1, b: 0, c: 0, d: 1, x: 0, y: 0 },
  alpha: 1,
  visible: false,
  rotation: 0,
  cos: 1,
  sin: 0,
  width: 0,
  height: 0,
  revision: 0,
  indexed: -1,
  bounds: { x: 0, y: 0, width: 0, height: 0 },
});

function instantiateEntity(source: Entity): Entity {
  if (
    source.clips.length ||
    source.visual?.kind === "sprite" ||
    source.animator ||
    source.body ||
    source.navigation ||
    source.light ||
    source.particles
  )
    return structuredClone(source);
  return {
    ...source,
    transform: { ...source.transform },
    visual: source.visual && { ...source.visual },
    clips: [],
  };
}

function measureBounds(
  output: Rect,
  matrix: Matrix2D,
  width: number,
  height: number,
) {
  const x = matrix.a * width,
    y = matrix.b * width;
  const u = matrix.c * height,
    v = matrix.d * height;
  output.x = matrix.x + Math.min(0, x) + Math.min(0, u);
  output.y = matrix.y + Math.min(0, y) + Math.min(0, v);
  output.width = Math.abs(x) + Math.abs(u);
  output.height = Math.abs(y) + Math.abs(v);
}

function intersects(a: Rect, b: Rect) {
  return !(
    a.x + a.width < b.x ||
    a.y + a.height < b.y ||
    b.x + b.width < a.x ||
    b.y + b.height < a.y
  );
}

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
  configure(axes: Project["input"]) {
    this.axes = axes;
    for (const code of this.held) if (!this.uses(code)) this.held.delete(code);
  }
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
    if (
      key.target instanceof HTMLElement &&
      key.target.closest(
        "button, input, textarea, select, [contenteditable='true']",
      )
    )
      return;
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
  readonly data: GameData;
  ui: UiWorld;
  readonly logs: RuntimeLog[] = [];
  scene: Scene;
  private scheduler: BlueprintScheduler;
  private reported = new Set<string>();
  private world = new Map<string, WorldEntity>();
  private assets: Set<string>;
  private entities: WorldEntity[];
  private hierarchy: WorldEntity[] = [];
  private textEntries: WorldEntity[] = [];
  private animations: AnimationPlayer[] = [];
  private renderIndex = new SpatialGrid<WorldEntity>(128, 192);
  private renderCandidates = new Set<WorldEntity>();
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
  private tiles: TileWorld;
  private physics: PhysicsWorld;
  private navigation: NavigationWorld;
  private motion: MotionWorld;
  private particles: ParticleWorld;
  private soundIds: Set<string>;
  private audio: AudioCommand[] = [];
  private currentCamera?: Camera;
  private signalTypes = new Map<string, Signal["type"]>();
  private lights: WorldEntity[];
  private layerOrder: Map<string, number>;
  private layerVisible: Map<string, boolean>;
  time = 0;

  constructor(
    public project: Project,
    sceneId = project.startSceneId,
    debug = false,
    slots?: SlotStorage,
  ) {
    const scene = project.scenes.find((entry) => entry.id === sceneId);
    if (!scene) throw new Error("Scene could not be found.");
    this.scene = scene;
    this.input = new InputState(project.input);
    this.data = new GameData(project.id, project.data, slots);
    this.tiles = new TileWorld(scene.tilemap);
    this.scheduler = new BlueprintScheduler(STEP, debug);
    this.ui = this.createUi(scene);
    this.assets = new Set(project.assets.map((asset) => asset.id));
    this.signals = project.signals ?? emptySignals;
    this.layerOrder = new Map(
      scene.layers.map((layer, index) => [layer.id, index]),
    );
    const sorted = [...scene.entities].sort(
      (a, b) =>
        this.layerOrder.get(a.layerId)! - this.layerOrder.get(b.layerId)! ||
        a.order - b.order,
    );
    this.entities = sorted.map((source, rank) => {
      const entity = instantiateEntity(source);
      const state: WorldEntity = {
        entity,
        variables: new Map(),
        rank,
        pose: pose(),
        animation: this.animationFor(entity),
      };
      this.world.set(entity.id, state);
      return state;
    });
    const entities = this.entities.map(({ entity }) => entity);
    this.physics = new PhysicsWorld(entities, this.tiles, scene.gravity);
    this.navigation = new NavigationWorld(
      new NavigationGrid(this.tiles, entities),
      entities,
    );
    this.motion = new MotionWorld(
      scene.timelines ?? [],
      (id) => this.world.get(id)?.entity,
    );
    this.particles = new ParticleWorld(entities);
    this.soundIds = new Set(project.mixer?.sounds.map(({ id }) => id));
    this.lights = this.entities.filter(({ entity }) => entity.light);
    this.layerVisible = new Map(
      scene.layers.map((layer) => [layer.id, layer.visible]),
    );
    this.buildHierarchy();
    this.reloadBlueprints(project.blueprints, this.signals);
  }

  private createUi(scene: Scene, previous?: UiWorld) {
    return new UiWorld(
      scene.ui,
      this.data,
      (id, payload) => {
        const type = this.signalTypes.get(id);
        if (type !== (payload === undefined ? "void" : typeOf(payload)))
          throw Error("The UI event is missing or has the wrong payload type.");
        this.scheduler.queueUi(id, payload);
      },
      previous,
    );
  }

  // Apply authored edits at the boundary between animation frames. Keep live values
  // for retained entities unless the corresponding authored field was changed.
  reloadProject(project: Project) {
    if (project === this.project) return true;
    const previous = this.project;
    const oldScene = this.scene;
    const scene = project.scenes.find(({ id }) => id === oldScene.id);
    if (project.id !== previous.id || !scene) return false;
    this.project = project;
    this.scene = scene;
    const assetsChanged = previous.assets !== project.assets;
    const axesChanged = previous.input !== project.input;
    const dataChanged = previous.data !== project.data;
    if (axesChanged) this.input.configure(project.input);
    if (assetsChanged)
      this.assets = new Set(project.assets.map(({ id }) => id));
    if (dataChanged) this.data.reload(project.data);
    if (previous.mixer !== project.mixer)
      this.soundIds = new Set(project.mixer?.sounds.map(({ id }) => id));
    if (oldScene.ui !== scene.ui) this.ui = this.createUi(scene, this.ui);
    if (
      oldScene.camera !== scene.camera ||
      previous.width !== project.width ||
      previous.height !== project.height
    )
      this.currentCamera = undefined;
    if (oldScene.layers !== scene.layers) {
      this.layerOrder = new Map(
        scene.layers.map(({ id }, index) => [id, index]),
      );
      this.layerVisible = new Map(
        scene.layers.map(({ id, visible }) => [id, visible]),
      );
    }
    let rebuildWorld =
      oldScene.tilemap !== scene.tilemap || oldScene.gravity !== scene.gravity;
    let rebuildNavigation = false;
    let rebuildParticles = false;
    let rebind = false;
    const added = new Set<string>();
    const keepVelocity = new Set<string>();
    if (
      oldScene.entities !== scene.entities ||
      oldScene.layers !== scene.layers
    ) {
      const oldById = new Map(
        oldScene.entities.map((entity) => [entity.id, entity]),
      );
      const nextById = new Map<string, WorldEntity>();
      const next = [...scene.entities].sort(
        (a, b) =>
          this.layerOrder.get(a.layerId)! - this.layerOrder.get(b.layerId)! ||
          a.order - b.order,
      );
      this.entities = next.map((source, rank) => {
        let state = this.world.get(source.id);
        const authored = oldById.get(source.id);
        if (!state || !authored) {
          const entity = instantiateEntity(source);
          state = {
            entity,
            rank,
            pose: pose(),
            variables: new Map(),
            animation: this.animationFor(entity),
          };
          added.add(source.id);
          rebuildNavigation = true;
          rebuildWorld ||= !!source.body || !!source.navigation;
          rebuildParticles ||= !!source.particles;
          rebind ||= !!source.blueprintId;
        } else {
          // A valid layer, visibility, and pose can change without replacing the state instance.
          const { entity, pose } = state;
          const transformFields = Object.keys(
            source.transform,
          ) as (keyof Entity["transform"])[];
          for (const field of transformFields)
            if (authored.transform[field] !== source.transform[field])
              entity.transform[field] = source.transform[field];
          for (const field of [
            "name",
            "parentId",
            "layerId",
            "order",
            "visible",
            "blueprintId",
          ] as const)
            if (authored[field] !== source[field])
              Object.assign(entity, { [field]: source[field] });
          if (authored.visual !== source.visual) {
            entity.visual = structuredClone(source.visual);
            this.renderIndex.remove(state);
            pose.indexed = -1;
          }
          if (
            authored.clips !== source.clips ||
            authored.animator !== source.animator ||
            authored.visual?.kind !== source.visual?.kind
          ) {
            entity.clips = structuredClone(source.clips);
            entity.animator = structuredClone(source.animator);
            state.animation = this.animationFor(entity);
          }
          if (authored.body !== source.body) {
            entity.body = structuredClone(source.body);
            rebuildWorld = true;
          } else keepVelocity.add(source.id);
          if (
            authored.navigation !== source.navigation ||
            authored.parentId !== source.parentId ||
            (source.body?.kind === "static" &&
              authored.transform !== source.transform)
          )
            rebuildWorld = true;
          if (authored.navigation !== source.navigation)
            entity.navigation = structuredClone(source.navigation);
          if (authored.light !== source.light)
            entity.light = structuredClone(source.light);
          if (authored.particles !== source.particles) {
            entity.particles = structuredClone(source.particles);
            rebuildParticles = true;
          }
          if (authored.blueprintId !== source.blueprintId) rebind = true;
        }
        state.rank = rank;
        nextById.set(source.id, state);
        return state;
      });
      for (const [id, state] of this.world) {
        if (nextById.has(id)) continue;
        rebuildNavigation = true;
        this.motion.removeEntity(id);
        this.renderIndex.remove(state);
        rebuildWorld ||= !!state.entity.body || !!state.entity.navigation;
        rebuildParticles ||= !!state.entity.particles;
        rebind ||= !!state.entity.blueprintId;
      }
      this.world = nextById;
      this.lights = this.entities.filter(({ entity }) => entity.light);
      this.buildHierarchy();
    } else if (rebuildWorld) {
      for (const { entity } of this.entities) keepVelocity.add(entity.id);
    }
    if (oldScene.tilemap !== scene.tilemap)
      this.tiles = new TileWorld(scene.tilemap);
    if (rebuildWorld || rebuildNavigation || rebuildParticles) {
      const entities = this.entities.map(({ entity }) => entity);
      if (rebuildWorld) {
        this.physics = new PhysicsWorld(
          entities,
          this.tiles,
          scene.gravity,
          this.physics,
          keepVelocity,
        );
      }
      if (rebuildWorld || rebuildNavigation)
        this.navigation = new NavigationWorld(
          new NavigationGrid(this.tiles, entities),
          entities,
        );
      if (rebuildParticles) this.particles.reload(entities);
    }
    if (oldScene.timelines !== scene.timelines)
      this.motion.reload(scene.timelines ?? [], this.started);
    if (
      rebind ||
      dataChanged ||
      axesChanged ||
      previous.extensions !== project.extensions ||
      previous.blueprints !== project.blueprints ||
      previous.signals !== project.signals
    ) {
      this.reloadBlueprints(
        project.blueprints,
        project.signals ?? emptySignals,
        dataChanged ||
          axesChanged ||
          previous.extensions !== project.extensions,
      );
      if (this.started && added.size)
        this.scheduler.start(this.program.filter(({ id }) => added.has(id)));
    }
    return true;
  }

  private animationFor(entity: Entity) {
    return entity.visual?.kind === "sprite" && entity.clips.length
      ? new AnimationPlayer(entity.animator, entity.clips)
      : undefined;
  }

  reloadBlueprints(
    blueprints: Blueprint[],
    signals: readonly Signal[] = this.signals,
    force = false,
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
        old.blueprintId === (definition && definition.id) &&
        !force &&
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
        if (old) state.variables = new Map();
        return [];
      }
      let program = compiled.get(definition.id);
      if (!program) {
        program = compileBlueprint(
          definition,
          axes,
          signals,
          this.data.index,
          this.project.extensions,
        );
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
    for (const old of previous.values()) {
      if (!this.world.has(old.id)) changed.add(old);
    }
    this.documents = documents;
    this.signals = signals;
    this.signalTypes = new Map(
      signals.map((signal) => [signal.id, signal.type]),
    );
    this.scheduler.configure(this.program, changed);
  }

  private context(state: WorldEntity): BlueprintContext {
    const entity = state.entity;
    return {
      axis: (id) => this.input.axis(id),
      variables: state.variables,
      move: (x, y) => {
        if (this.physics.request(entity.id, x * STEP, y * STEP)) return;
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
        if (entity.visual?.kind !== "sprite")
          throw new Error("Animation requires an assigned sprite.");
        if (!state.animation)
          throw new Error(`Animation "${clip}" is missing.`);
        state.animation.play(clip);
      },
      effect: (command) => this.effect(state, command),
      ui: (id, property, value) => this.ui.set(id, property, value),
      data: {
        read: (source, id, key) => this.data.read(source, id, key),
        write: (id, value) => this.data.write(id, value),
        slot: (id, operation) => {
          if (operation === "save") this.data.save(id);
          else this.data.load(id);
        },
        language: (locale) => this.data.setLanguage(locale),
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

  private effect(state: WorldEntity, command: EffectCommand) {
    switch (command.kind) {
      case "animationParameter":
        if (!state.animation) throw new Error("The entity has no animator.");
        state.animation.parameter(command.parameterId, command.value);
        break;
      case "timeline":
        this.motion.play(command.timelineId, command.playing);
        break;
      case "tween":
        this.motion.tween(
          state.entity,
          command.property,
          command.value,
          command.seconds,
          command.ease,
        );
        break;
      case "particles":
        this.particles.control(state.entity.id, command.operation);
        break;
      case "sound":
        if (!this.soundIds.has(command.soundId))
          throw new Error("The sound is missing from this project.");
        if (this.audio.length === 128) this.audio.shift();
        this.audio.push({ soundId: command.soundId, playing: command.playing });
        break;
    }
  }

  consumeAudio(play: (command: AudioCommand) => void) {
    for (const command of this.audio) play(command);
    this.audio.length = 0;
  }

  seekTimeline(id: string, seconds: number) {
    this.motion.seek(id, seconds);
  }

  previewParticles(id: string, burst: boolean, delta: number) {
    if (burst) this.particles.control(id, "burst");
    if (delta > 0) this.stepParticles(Math.min(delta, 0.05));
  }

  private stepParticles(delta: number) {
    if (!this.particles.hasEmitters) return;
    let refreshed = false;
    this.particles.step(delta, (id) => {
      const entity = this.world.get(id)!.entity;
      if (!entity.visible || !this.layerVisible.get(entity.layerId)) return;
      const { x, y, width, height, scaleX, scaleY, rotation } =
        entity.transform;
      if (entity.parentId) {
        if (!refreshed) {
          this.refreshTransforms();
          refreshed = true;
        }
        const world = this.world.get(id)!.pose;
        return world.visible
          ? transformPoint(world.matrix, width / 2, height / 2)
          : undefined;
      }
      const radians = ((rotation % 360) * Math.PI) / 180;
      const halfWidth = (width * scaleX) / 2,
        halfHeight = (height * scaleY) / 2;
      return {
        x: x + Math.cos(radians) * halfWidth - Math.sin(radians) * halfHeight,
        y: y + Math.sin(radians) * halfWidth + Math.cos(radians) * halfHeight,
      };
    });
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
    this.motion.start();
    this.scheduler.start(this.program);
  }
  private beginTick() {
    this.tickPending = true;
    this.scheduler.nextTick();
  }
  private finishTick() {
    if (this.scheduler.paused || !this.tickPending) return;
    this.tickPending = false;
    this.motion.step(STEP);
    this.navigation.step(STEP, this.physics);
    this.physics.step(STEP, ({ entityId, otherId, phase }) => {
      const body = this.world.get(entityId)?.entity.body;
      const signal = phase === "enter" ? body?.enterSignal : body?.exitSignal;
      if (!signal) return;
      const type = this.signalTypes.get(signal);
      if (type === "void" || type === "entity")
        this.scheduler.queueContact(
          signal,
          entityId,
          type === "entity" ? { kind: "entity", id: otherId ?? "" } : undefined,
        );
    });
    this.currentCamera = cameraView(
      this.scene.camera,
      this.cameraTarget(),
      this.project.width,
      this.project.height,
      this.currentCamera,
      STEP,
    );
    for (const animation of this.animations) animation.step(STEP);
    this.stepParticles(STEP);
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

  private buildHierarchy() {
    this.hierarchy = [];
    this.textEntries = [];
    this.animations = [];
    const placed = new Set<WorldEntity>();
    for (const state of this.entities) {
      state.parent = state.entity.parentId
        ? this.world.get(state.entity.parentId)
        : undefined;
      if (state.entity.visual?.kind === "text") this.textEntries.push(state);
      if (state.animation) this.animations.push(state.animation);
    }
    const branch: WorldEntity[] = [];
    for (const state of this.entities) {
      if (placed.has(state)) continue;
      branch.length = 0;
      let cursor: WorldEntity | undefined = state;
      while (cursor && !placed.has(cursor)) {
        branch.push(cursor);
        placed.add(cursor);
        cursor = cursor.parent;
      }
      for (let i = branch.length - 1; i >= 0; i--)
        this.hierarchy.push(branch[i]);
    }
  }

  private updateTransform(state: WorldEntity) {
    const { entity, pose } = state;
    const { transform: t } = entity;
    if (t.rotation !== pose.rotation) {
      pose.rotation = t.rotation;
      const radians = ((t.rotation % 360) * Math.PI) / 180;
      pose.cos = Math.cos(radians);
      pose.sin = Math.sin(radians);
    }
    const parent = state.parent?.pose;
    pose.alpha = (parent?.alpha ?? 1) * t.alpha;
    pose.visible = Boolean(
      this.layerVisible.get(entity.layerId) &&
      entity.visible &&
      (parent?.visible ?? true),
    );
    const p = parent?.matrix;
    const la = pose.cos * t.scaleX,
      lb = pose.sin * t.scaleX;
    const lc = -pose.sin * t.scaleY,
      ld = pose.cos * t.scaleY;
    const a = p ? p.a * la + p.c * lb : la;
    const b = p ? p.b * la + p.d * lb : lb;
    const c = p ? p.a * lc + p.c * ld : lc;
    const d = p ? p.b * lc + p.d * ld : ld;
    const x = p ? p.a * t.x + p.c * t.y + p.x : t.x;
    const y = p ? p.b * t.x + p.d * t.y + p.y : t.y;
    const m = pose.matrix;
    if (
      m.a === a &&
      m.b === b &&
      m.c === c &&
      m.d === d &&
      m.x === x &&
      m.y === y &&
      pose.width === t.width &&
      pose.height === t.height
    )
      return;
    m.a = a;
    m.b = b;
    m.c = c;
    m.d = d;
    m.x = x;
    m.y = y;
    pose.width = t.width;
    pose.height = t.height;
    pose.revision++;
  }

  private refreshTransforms(index = false) {
    for (const state of this.hierarchy) {
      this.updateTransform(state);
      const { entity, pose } = state;
      if (
        !index ||
        pose.indexed === pose.revision ||
        !entity.visual ||
        entity.visual.kind === "text"
      )
        continue;
      measureBounds(pose.bounds, pose.matrix, pose.width, pose.height);
      this.renderIndex.update(state, pose.bounds);
      pose.indexed = pose.revision;
    }
  }

  worldPoint(id: string) {
    const state = this.world.get(id);
    if (!state) return undefined;
    if (!state.parent) return state.entity.transform;
    const branch: WorldEntity[] = [];
    let current: WorldEntity | undefined = state;
    while (current) {
      branch.push(current);
      current = current.parent;
    }
    for (let i = branch.length - 1; i >= 0; i--)
      this.updateTransform(branch[i]);
    return { ...state.pose.matrix };
  }
  private cameraTarget() {
    return this.scene.camera.follow
      ? this.worldPoint(this.scene.camera.follow)
      : undefined;
  }
  view() {
    return (
      this.currentCamera ??
      cameraView(
        this.scene.camera,
        this.cameraTarget(),
        this.project.width,
        this.project.height,
      )
    );
  }

  renderMetrics() {
    return {
      entities: this.entities.length,
      candidates: this.renderCandidates.size,
      chunks:
        this.tiles.legacy.residentChunks +
        this.tiles.layers.reduce(
          (sum, { grid }) => sum + grid.residentChunks,
          0,
        ),
    };
  }

  frame(cameraOverride?: Camera): RenderFrame {
    const { width, height } = this.project;
    this.refreshTransforms(true);
    const view = cameraOverride ?? this.view();
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
    const area = {
      x: -cameraMatrix.x / view.zoom,
      y: -cameraMatrix.y / view.zoom,
      width: width / view.zoom,
      height: height / view.zoom,
    };
    const paint = (grid: TileGrid, alpha: number) => {
      if (!alpha) return;
      const { size } = grid;
      grid.forArea(area, (tile) => {
        const terrain = this.tiles.terrain(tile);
        const x = tile.x * size,
          y = tile.y * size;
        const base = {
          width: size,
          height: size,
          alpha,
          matrix: multiply(cameraMatrix, translation(x, y)),
        };
        const mask = terrain ? grid.mask(tile) : 0;
        if (terrain?.atlas) {
          draws.push({
            ...base,
            kind: "sprite",
            assetId: terrain.atlas.assetId,
            frame: autotileFrame(terrain.atlas, mask),
          });
          return;
        }
        draws.push({
          ...base,
          kind: "rect",
          color: terrain?.color ?? tile.color,
        });
        if (!terrain || alpha < 1) return;
        const border = Math.max(1, Math.floor(size / 8));
        const edge = (dx: number, dy: number, w: number, h: number) =>
          draws.push({
            kind: "rect",
            alpha,
            color: terrain.edge,
            width: w,
            height: h,
            matrix: multiply(cameraMatrix, translation(x + dx, y + dy)),
          });
        if (!(mask & NORTH)) edge(0, 0, size, border);
        if (!(mask & EAST))
          edge(size - border, border, border, size - 2 * border);
        if (!(mask & SOUTH)) edge(0, size - border, size, border);
        if (!(mask & WEST)) edge(0, border, border, size - 2 * border);
      });
    };
    const particlesByLayer = this.particles.hasEmitters
      ? new Map<string, Draw[]>()
      : undefined;
    this.particles.forEach((layerId, x, y, size, alpha, color) => {
      if (!this.layerVisible.get(layerId)) return;
      const half = size / 2;
      if (
        x + half < area.x ||
        x - half > area.x + area.width ||
        y + half < area.y ||
        y - half > area.y + area.height
      )
        return;
      const draws = particlesByLayer!.get(layerId) ?? [];
      if (!draws.length) particlesByLayer!.set(layerId, draws);
      draws.push({
        kind: "rect",
        color,
        width: size,
        height: size,
        alpha,
        matrix: multiply(cameraMatrix, translation(x - half, y - half)),
      });
    });
    let renderedLayer: string | undefined;
    const flushParticles = () => {
      if (!particlesByLayer || !renderedLayer) return;
      const particles = particlesByLayer.get(renderedLayer);
      if (particles) draws.push(...particles);
      renderedLayer = undefined;
    };
    let layerIndex = 0;
    const paintLayers = (through: number) => {
      for (; layerIndex <= through; layerIndex++) {
        flushParticles();
        if (layerIndex === 1) paint(this.tiles.legacy, 1);
        const layer = this.scene.layers[layerIndex];
        if (!layer?.visible) continue;
        renderedLayer = layer.id;
        for (const { definition, grid } of this.tiles.layers) {
          if (definition.visible && definition.layerId === layer.id)
            paint(grid, definition.opacity);
        }
      }
    };
    const candidates = this.renderIndex.query(area, this.renderCandidates);
    for (const state of this.textEntries) candidates.add(state);
    for (const state of [...candidates].sort((a, b) => a.rank - b.rank)) {
      const { entity, pose: world } = state;
      paintLayers(this.layerOrder.get(entity.layerId)!);
      const visual = entity.visual;
      if (
        !visual ||
        !world.visible ||
        !world.alpha ||
        (visual.kind !== "text" && !intersects(world.bounds, area))
      )
        continue;
      const screen = visual.kind === "text" && visual.screen;
      const base = {
        width: world.width,
        height: world.height,
        matrix: screen
          ? { ...world.matrix }
          : multiply(cameraMatrix, world.matrix),
        alpha: world.alpha,
        entityId: entity.id,
      };
      if (visual.kind === "text")
        (screen ? hud : draws).push({ ...base, ...visual });
      else if (visual.kind === "sprite")
        draws.push({
          ...base,
          ...visual,
          frame: state.animation?.frame() ?? visual.frame,
        });
      else draws.push({ ...base, ...visual });
    }
    paintLayers(Math.max(1, this.scene.layers.length - 1));
    flushParticles();
    const config = this.scene.lighting;
    const lighting: LightingPass | undefined = config?.enabled
      ? { ambient: config.ambient, worldDraws: draws.length, lights: [] }
      : undefined;
    if (lighting) {
      for (const { entity, pose: transform } of this.lights) {
        const light = entity.light!;
        if (!light.enabled || !light.intensity || !transform?.visible) continue;
        const { x, y } = transformPoint(
          cameraMatrix,
          transform.matrix.x,
          transform.matrix.y,
        );
        const radius = light.radius * view.zoom;
        if (
          x + radius < 0 ||
          y + radius < 0 ||
          x - radius > width ||
          y - radius > height
        )
          continue;
        lighting.lights.push({
          x,
          y,
          radius,
          color: light.color,
          intensity: light.intensity,
        });
      }
    }
    draws.push(...hud);
    return {
      width,
      height,
      background: this.scene.background,
      draws,
      ...(lighting ? { lighting } : {}),
    };
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
