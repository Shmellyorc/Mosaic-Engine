import { BehaviorRunner } from "./behavior-tree";
import { SceneWorld, type SceneCommand } from "./scene-flow";
export type { SceneCommand } from "./scene-flow";
import { UiFlowWorld, type UiCommand } from "./ui-flow";
export type { UiCommand, UiScreenView } from "./ui-flow";
import { UiWorld } from "./ui";
export { UiWorld } from "./ui";
export { mountGameUi, mountUiStack } from "./ui-dom";
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
  primaryAttachmentId,
  type BlueprintAttachment,
  type ComponentName,
  entityComponents,
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
  type Point,
  type Rect,
} from "./tiles";
import { PhysicsWorld } from "./physics";
import { SpatialGrid } from "./spatial";
import { EntityStore, type EntityHandle } from "./entities";
export type { EntityHandle } from "./entities";
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
  blueprintId?: string;
  attachmentId?: string;
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
    source.particles ||
    source.attachments ||
    source.camera ||
    source.tileLayers ||
    source.audio ||
    source.prefab
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
  private screens: UiFlowWorld;
  readonly logs: RuntimeLog[] = [];
  scene: Scene;
  private scheduler: BlueprintScheduler;
  private sceneWorld?: SceneWorld;
  private behaviors = new Map<string, BehaviorRunner>();
  private sceneQueue: SceneCommand[] = [];
  private transition?: {
    command: SceneCommand;
    elapsed: number;
    applied: boolean;
  };
  private sceneRevision = 0;
  private previousSceneRevision = 0;
  private reported = new Set<string>();
  private world = new EntityStore<WorldEntity>();
  private prefabMembers = new Map<string, Map<string, string>>();
  private componentCamera?: Entity;
  private tileOwners = new Map<string, Entity>();
  private tileVisibilityChanged = false;
  private assets: Set<string>;
  private entities: WorldEntity[];
  private hierarchy: WorldEntity[] = [];
  private textEntries: WorldEntity[] = [];
  private animations: AnimationPlayer[] = [];
  private renderIndex = new SpatialGrid<WorldEntity>(128, 192);
  private renderCandidates = new Set<WorldEntity>();
  private program: Binding[] = [];
  private bindingsByEntity = new Map<string, Binding[]>();
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
    if (project.sceneFlow) this.sceneWorld = new SceneWorld(project, sceneId);
    this.input = new InputState(project.input);
    this.data = new GameData(project.id, project.data, slots);
    this.tiles = this.createTiles(scene);
    this.scheduler = new BlueprintScheduler(STEP, debug);
    this.screens = new UiFlowWorld(
      this.data,
      (id, value, screen, source) =>
        this.handleUiSignal(id, value, screen, source),
      project.uiFlow,
    );
    this.screens.refresh(project.uiFlow, scene.id, [scene.id]);
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
        rank,
        pose: pose(),
        animation: this.animationFor(entity),
      };
      this.world.add(state);
      return state;
    });
    const entities = this.entities.map(({ entity }) => entity);
    this.physics = new PhysicsWorld(
      this.componentRows("body"),
      this.tiles,
      scene.gravity,
    );
    this.navigation = new NavigationWorld(
      new NavigationGrid(this.tiles, entities),
      entities,
    );
    this.motion = new MotionWorld(
      scene.timelines ?? [],
      (id) => this.world.get(id)?.entity,
    );
    this.particles = new ParticleWorld(this.componentRows("particles"));
    this.soundIds = new Set(project.mixer?.sounds.map(({ id }) => id));
    this.lights = [];
    this.refreshComponents();
    this.layerVisible = new Map(
      scene.layers.map((layer) => [layer.id, layer.visible]),
    );
    this.buildHierarchy();
    this.reloadBlueprints(project.blueprints, this.signals);
    this.refreshBehaviorTrees();
  }

  private createUi(scene: Scene, previous?: UiWorld) {
    return new UiWorld(
      scene.ui,
      this.data,
      (id, payload) => this.handleUiSignal(id, payload, undefined, scene.id),
      previous,
    );
  }

  private handleUiSignal(
    id: string,
    payload?: Value,
    screen?: string,
    source?: string,
  ) {
    const type = this.signalTypes.get(id);
    if (type !== (payload === undefined ? "void" : typeOf(payload)))
      throw Error("The UI event is missing or has the wrong payload type.");
    this.scheduler.queueUi(id, payload);
    this.triggerSceneSignal(id, source ?? this.scene.id);
    this.screens.signal(id, source ?? this.scene.id, screen);
    if (this.screens.paused) this.input.clear();
  }

  get uiScreens() {
    return this.screens.views(this.ui);
  }
  get gameplayPaused() {
    return this.screens.paused;
  }

  controlUi(command: UiCommand, scene = this.scene.id) {
    this.screens.command(command, scene);
    if (this.screens.paused) this.input.clear();
  }

  // Apply authored edits at the boundary between animation frames. Keep live values
  // for retained entities unless the corresponding authored field was changed.
  reloadProject(project: Project) {
    if (project === this.project) return true;
    if (project.id !== this.project.id) return false;
    if (!this.sceneWorld && project.sceneFlow)
      this.sceneWorld = new SceneWorld(this.project, this.scene.id);
    if (this.sceneWorld && !this.sceneWorld.reload(project)) return false;
    const scene =
      this.sceneWorld?.compose() ??
      project.scenes.find(({ id }) => id === this.scene.id);
    if (!scene) return false;
    this.applyScene(project, scene);
    return true;
  }

  get sceneStatus() {
    return (
      this.sceneWorld?.status ?? {
        primary: this.scene.id,
        loaded: [this.scene.id],
        preloaded: [],
      }
    );
  }

  controlScene(command: SceneCommand) {
    if (this.sceneQueue.length >= 64)
      throw new Error("The scene command queue is full.");
    const { x, y } = command.offset ?? { x: 0, y: 0 };
    if (
      ![x, y].every(
        (value) => Number.isInteger(value) && value >= 0 && value <= 16384,
      )
    )
      throw new Error("Scene offsets must be whole pixels from 0 to 16384.");
    if (command.fade !== undefined && !(command.fade >= 0 && command.fade <= 5))
      throw new Error("Scene fade must be between 0 and 5 seconds.");
    const world = (this.sceneWorld ??= new SceneWorld(
      this.project,
      this.scene.id,
    ));
    world.validate(command);
    this.sceneQueue.push({
      ...command,
      offset: command.offset && { ...command.offset },
    });
  }

  private triggerSceneSignal(id: string, source: string) {
    const command = this.sceneWorld?.signal(id, source);
    if (command) {
      try {
        this.controlScene(command);
      } catch (error) {
        this.log({ level: "error", message: String(error) });
      }
    }
  }

  private processScenes(delta: number) {
    if (this.transition) {
      const route = this.transition;
      route.elapsed += delta;
      const duration = route.command.fade!;
      if (!route.applied && route.elapsed >= duration / 2) {
        route.applied = true;
        this.commitSceneCommand(route.command);
      }
      if (route.elapsed >= duration) this.transition = undefined;
      return;
    }
    const command = this.sceneQueue.shift();
    if (!command) return;
    if (command.fade && command.operation !== "preload") {
      this.transition = { command, elapsed: 0, applied: false };
    } else this.commitSceneCommand(command);
  }

  private commitSceneCommand(command: SceneCommand) {
    try {
      const world = this.sceneWorld!;
      if (world.apply(command)) {
        this.sceneRevision++;
        this.applyScene(
          this.project,
          world.compose(),
          command.operation === "reload" && command.sceneId === world.primary,
        );
      }
    } catch (error) {
      this.log({ level: "error", message: String(error) });
    }
  }

  private applyScene(project: Project, scene: Scene, resetUi = false) {
    const previous = this.project;
    const oldScene = this.scene;
    const sceneChanged = oldScene.id !== scene.id;
    const residencyChanged = this.previousSceneRevision !== this.sceneRevision;
    this.previousSceneRevision = this.sceneRevision;
    this.project = project;
    this.scene = scene;
    if (residencyChanged || previous.uiFlow !== project.uiFlow || resetUi)
      this.screens.refresh(
        project.uiFlow,
        scene.id,
        this.sceneStatus.loaded,
        resetUi ? scene.id : undefined,
      );
    const assetsChanged = previous.assets !== project.assets;
    const axesChanged = previous.input !== project.input;
    const dataChanged = previous.data !== project.data;
    if (axesChanged) this.input.configure(project.input);
    if (assetsChanged)
      this.assets = new Set(project.assets.map(({ id }) => id));
    if (dataChanged) this.data.reload(project.data);
    if (previous.mixer !== project.mixer)
      this.soundIds = new Set(project.mixer?.sounds.map(({ id }) => id));
    if (oldScene.ui !== scene.ui || sceneChanged || resetUi)
      this.ui = this.createUi(
        scene,
        sceneChanged || resetUi ? undefined : this.ui,
      );
    if (
      sceneChanged ||
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
      residencyChanged ||
      oldScene.tilemap !== scene.tilemap ||
      oldScene.gravity !== scene.gravity;
    let rebuildNavigation = false;
    let rebuildParticles = false;
    let rebind = false;
    const keepVelocity = new Set<string>();
    if (
      oldScene.entities !== scene.entities ||
      oldScene.layers !== scene.layers
    ) {
      const oldById = new Map(
        oldScene.entities.map((entity) => [entity.id, entity]),
      );
      const nextIds = new Set(scene.entities.map(({ id }) => id));
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
            animation: this.animationFor(entity),
          };
          rebuildNavigation = true;
          rebuildWorld ||= !!source.body || !!source.navigation;
          rebuildParticles ||= !!source.particles;
          rebind ||= !!source.blueprintId || !!source.attachments?.length;
          this.world.add(state);
          if (source.tileLayers?.length) this.tileVisibilityChanged = true;
          if (this.started && entity.audio?.autoplay)
            this.queueAudio(entity.audio.soundId, true, entity.id);
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
          if (
            authored.tileLayers !== source.tileLayers ||
            (source.tileLayers?.length && authored.visible !== source.visible)
          )
            this.tileVisibilityChanged = true;
          if (authored.audio !== source.audio && this.started) {
            if (entity.audio)
              this.queueAudio(entity.audio.soundId, false, entity.id);
            if (source.audio?.autoplay)
              this.queueAudio(source.audio.soundId, true, entity.id);
          }
          for (const key of [
            "attachments",
            "behaviorTree",
            "audio",
            "camera",
            "tileLayers",
            "prefab",
            "persistent",
          ] as const)
            if (source[key] !== authored[key])
              Object.assign(entity, { [key]: source[key] });

          const membershipChanged =
            authored !== source && this.world.update(source.id);
          if (
            authored.blueprintId !== source.blueprintId ||
            authored.attachments !== source.attachments ||
            ((source.blueprintId || source.attachments?.length) &&
              membershipChanged)
          )
            rebind = true;
        }
        state.rank = rank;
        return state;
      });
      for (const [id, state] of this.world) {
        if (nextIds.has(id)) continue;
        if (this.started && state.entity.audio)
          this.queueAudio(state.entity.audio.soundId, false, id);
        this.world.remove(id);
        if (state.entity.tileLayers?.length) this.tileVisibilityChanged = true;
        rebuildNavigation = true;
        this.motion.removeEntity(id);
        this.renderIndex.remove(state);
        rebuildWorld ||= !!state.entity.body || !!state.entity.navigation;
        rebuildParticles ||= !!state.entity.particles;
        rebind ||=
          !!state.entity.blueprintId || !!state.entity.attachments?.length;
      }
      this.refreshComponents();
      this.buildHierarchy();
    } else if (rebuildWorld) {
      for (const { entity } of this.entities) keepVelocity.add(entity.id);
    }
    if (
      residencyChanged ||
      oldScene.tilemap !== scene.tilemap ||
      (this.sceneWorld?.tileSources.length ?? 0) > 1
    ) {
      this.tiles = this.createTiles(scene);
      rebuildWorld = true;
    }
    if (rebuildWorld || rebuildNavigation || rebuildParticles) {
      const entities = this.entities.map(({ entity }) => entity);
      if (rebuildWorld) {
        this.physics = new PhysicsWorld(
          this.componentRows("body"),
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
      if (rebuildParticles)
        this.particles.reload(this.componentRows("particles"));
    }
    if (oldScene.timelines !== scene.timelines)
      this.motion.reload(scene.timelines ?? [], this.started);
    const blueprintsChanged =
      rebind ||
      dataChanged ||
      axesChanged ||
      previous.extensions !== project.extensions ||
      previous.blueprints !== project.blueprints ||
      previous.signals !== project.signals;
    if (blueprintsChanged) {
      this.reloadBlueprints(
        project.blueprints,
        project.signals ?? emptySignals,
        dataChanged ||
          axesChanged ||
          previous.extensions !== project.extensions,
      );
    }
    if (
      blueprintsChanged ||
      previous.behaviorTrees !== project.behaviorTrees ||
      oldScene.entities !== scene.entities
    )
      this.refreshBehaviorTrees(blueprintsChanged);
  }

  private refreshBehaviorTrees(force = false) {
    const documents = this.project.behaviorTrees;
    if (!documents?.length && !this.behaviors.size) return;
    const trees = new Map(documents?.map((tree) => [tree.id, tree]));
    const compiled = new Map<string, ReturnType<typeof compileBlueprint>>();
    const axes = new Set(this.project.input.map(({ id }) => id));
    const definitions = new Map(
      this.project.blueprints.map((blueprint) => [blueprint.id, blueprint]),
    );
    const next = new Map<string, BehaviorRunner>();
    for (const state of this.world.query("behaviorTree")) {
      const id = state.entity.id;
      const tree = trees.get(state.entity.behaviorTree!);
      if (!tree) continue;
      const previous = this.behaviors.get(id);
      if (previous?.tree === tree && !force) {
        next.set(id, previous);
        continue;
      }
      const contexts = new Map<string, BlueprintContext>();
      const runner = new BehaviorRunner(
        tree,
        (node, args) => {
          const bound = this.bindingsByEntity
            .get(id)
            ?.find(({ blueprintId }) => blueprintId === node.blueprintId);
          const definition = definitions.get(node.blueprintId);
          if (!definition)
            throw new Error("The Blueprint action definition is missing.");
          const missing = definition.requires?.find(
            (key) =>
              !entityComponents
                .find((item) => item.key === key)
                ?.present(state.entity),
          );
          if (missing)
            throw new Error("The Blueprint action requires " + missing + ".");
          let program = bound?.program ?? compiled.get(node.blueprintId);
          if (!program) {
            program = compileBlueprint(
              definition,
              axes,
              this.signals,
              this.data.index,
              this.project.extensions,
            );
            compiled.set(node.blueprintId, program);
          }
          let context = contexts.get(node.blueprintId);
          if (!context) {
            context = this.context(
              state,
              bound?.context.variables ?? program.createVariables(),
              node.blueprintId,
              "behavior:" + tree.id,
              true,
            );
            contexts.set(node.blueprintId, context);
          }
          return program.beginFunction(context, node.functionId, args);
        },
        (node, error) =>
          this.fault(id, { blockId: node, message: String(error) }),
        previous?.tree.id === tree.id ? previous : undefined,
      );
      next.set(id, runner);
    }
    this.behaviors = next;
  }

  getBehaviorTree(id: string) {
    return this.behaviors.get(id)?.snapshot();
  }

  writeBlackboard(entityId: string, key: string, value: Value) {
    const behavior = this.behaviors.get(entityId);
    if (!behavior) throw new Error("The entity has no Behavior Tree.");
    behavior.write(key, value);
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
    const bindings = new Map<string, Map<string, Binding>>();
    for (const binding of this.program) {
      const row = bindings.get(binding.id) ?? new Map<string, Binding>();
      row.set(binding.attachmentId, binding);
      bindings.set(binding.id, row);
    }
    const retained = new Set<Binding>();
    const pendingStart: Binding[] = [];
    const axes = new Set(this.project.input.map((axis) => axis.id));
    const compiled = new Map<string, Binding["program"]>();
    const sameSignals = signals === this.signals;
    const next: Binding[] = [];
    const attach = (
      state: WorldEntity,
      attachmentId: string,
      definitionId: string,
      overrides?: BlueprintAttachment["overrides"],
    ) => {
      const entityId = state.entity.id;
      const definition = documents.get(definitionId);
      if (!definition) return;
      const missing = definition.requires?.find(
        (key) =>
          !entityComponents
            .find((component) => component.key === key)
            ?.present(state.entity),
      );
      if (missing) {
        this.fault(
          entityId,
          {
            blockId: definition.id,
            message: "Missing required " + missing + " component.",
          },
          definitionId,
          attachmentId,
        );
        return;
      }
      const old = bindings.get(entityId)?.get(attachmentId);
      const sameBinding = old?.blueprintId === definitionId;
      if (
        sameBinding &&
        old.overrides === overrides &&
        !force &&
        sameSignals &&
        definition === this.documents.get(definitionId)
      ) {
        retained.add(old);
        next.push(old);
        return;
      }
      let program = compiled.get(definitionId);
      if (!program) {
        program = compileBlueprint(
          definition,
          axes,
          signals,
          this.data.index,
          this.project.extensions,
        );
        compiled.set(definitionId, program);
      }
      const variables = program.createVariables();
      for (const variable of definition.variables) {
        const id = variable.id;
        const override =
          overrides && Object.hasOwn(overrides, id) ? overrides[id] : undefined;
        const prior = sameBinding ? old.context.variables.get(id) : undefined;
        const oldOverride =
          sameBinding && old.overrides && Object.hasOwn(old.overrides, id)
            ? old.overrides[id]
            : undefined;
        if (variable.exposed && override !== oldOverride) {
          if (override !== undefined && typeOf(override) === variable.type)
            variables.set(id, override);
        } else if (prior !== undefined && typeOf(prior) === variable.type)
          variables.set(id, prior);
      }
      for (const diagnostic of program.diagnostics)
        this.fault(entityId, diagnostic, definitionId, attachmentId);
      const binding: Binding = {
        id: entityId,
        attachmentId,
        blueprintId: definitionId,
        program,
        overrides,
        context: this.context(state, variables, definitionId, attachmentId),
      };
      next.push(binding);
      if (!sameBinding) pendingStart.push(binding);
    };
    const active = [...this.world.query("blueprints")].sort(
      (a, b) => a.rank - b.rank,
    );
    for (const state of active) {
      const { blueprintId, attachments } = state.entity;
      if (blueprintId) attach(state, primaryAttachmentId, blueprintId);
      for (const attachment of attachments ?? []) {
        if (attachment.enabled)
          attach(
            state,
            attachment.id,
            attachment.blueprintId,
            attachment.overrides,
          );
      }
    }
    const changed = new Set(
      this.program.filter((binding) => !retained.has(binding)),
    );
    this.program = next;
    this.bindingsByEntity = new Map();
    for (const binding of next) {
      const row = this.bindingsByEntity.get(binding.id) ?? [];
      row.push(binding);
      this.bindingsByEntity.set(binding.id, row);
    }
    this.documents = documents;
    this.signals = signals;
    this.signalTypes = new Map(
      signals.map((signal) => [signal.id, signal.type]),
    );
    this.scheduler.configure(this.program, changed);
    if (this.started && pendingStart.length) this.scheduler.start(pendingStart);
  }

  private context(
    state: WorldEntity,
    variables: Map<string, Value>,
    blueprintId: string,
    attachmentId: string,
    external = false,
  ): BlueprintContext {
    const entity = state.entity;
    return {
      axis: (id) => this.input.axis(id),
      variables,
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
          ? (this.sceneWorld?.scopes.get(entity.id)?.name ?? this.scene.name)
          : {
              kind: "entity",
              id: query === "self" ? entity.id : (entity.parentId ?? ""),
            },
      exists: (reference) =>
        typeof reference === "object" &&
        ((reference.kind === "entity" &&
          this.world.has(this.resolveReference(entity, reference.id))) ||
          (reference.kind === "asset" && this.assets.has(reference.id))),
      emit: (id, value) => {
        if (external) this.scheduler.queueUi(id, value);
        else this.scheduler.emit(id, value);
        const source =
          this.sceneWorld?.scopes.get(entity.id)?.sceneId ?? this.scene.id;
        this.triggerSceneSignal(id, source);
        this.screens.signal(id, source);
      },
      sceneFlow: (operation, target, route) => {
        if (!route) this.controlScene({ operation, sceneId: target });
        else {
          const command = this.sceneWorld?.route(
            target,
            this.sceneWorld?.scopes.get(entity.id)?.sceneId ?? this.scene.id,
          );
          if (!command)
            throw new Error("The project has no Scene Flow routes.");
          this.controlScene(command);
        }
      },
      animate: (clip) => {
        if (entity.visual?.kind !== "sprite")
          throw new Error("Animation requires an assigned sprite.");
        if (!state.animation)
          throw new Error(`Animation "${clip}" is missing.`);
        state.animation.play(clip);
      },
      effect: (command) => this.effect(state, command),
      ui: (id, property, value, screenId) =>
        this.screens.setWidget(
          this.ui,
          id,
          property,
          value,
          screenId,
          this.sceneWorld?.scopes.get(entity.id)?.sceneId ?? this.scene.id,
        ),
      screen: (action, target, layerId) =>
        this.controlUi(
          action === "theme"
            ? { action, themeId: target || undefined }
            : { action, screenId: target, layerId },
          this.sceneWorld?.scopes.get(entity.id)?.sceneId ?? this.scene.id,
        ),
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
          ...(attachmentId !== primaryAttachmentId
            ? { blueprintId, attachmentId }
            : {}),
          blockId,
          message: displayValue(value),
        }),
      fault: (diagnostic) => {
        if (external) throw new Error(diagnostic.message);
        this.fault(entity.id, diagnostic, blueprintId, attachmentId);
      },
    };
  }

  private effect(state: WorldEntity, command: EffectCommand) {
    switch (command.kind) {
      case "animationParameter":
        if (!state.animation) throw new Error("The entity has no animator.");
        state.animation.parameter(command.parameterId, command.value);
        break;
      case "timeline":
        this.motion.play(
          this.sceneWorld?.scopes
            .get(state.entity.id)
            ?.timelines.get(command.timelineId) ?? command.timelineId,
          command.playing,
        );
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
        this.queueAudio(command.soundId, command.playing);
        break;
    }
  }

  private queueAudio(soundId: string, playing: boolean, owner?: string) {
    if (this.audio.length === 128) this.audio.shift();
    this.audio.push(owner ? { soundId, playing, owner } : { soundId, playing });
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

  private resolveReference(entity: Entity, id: string) {
    const prefab =
      entity.prefab &&
      this.prefabMembers.get(entity.prefab.instanceId)?.get(id);
    return (
      prefab || this.sceneWorld?.scopes.get(entity.id)?.entities.get(id) || id
    );
  }

  private target(entity: Entity, id?: string) {
    if (id === undefined) return entity;
    const target = this.world.get(this.resolveReference(entity, id));
    if (!target)
      throw new Error("The target entity is absent from this scene.");
    return target.entity;
  }

  private set(entity: Entity, property: Property, value: Value) {
    if (property === "visible") {
      if (entity.tileLayers?.length && entity.visible !== Boolean(value))
        this.tileVisibilityChanged = true;
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
  private fault(
    entityId: string,
    { blockId, message }: Diagnostic,
    blueprintId?: string,
    attachmentId?: string,
  ) {
    const key =
      JSON.stringify(entityId) +
      "|" +
      JSON.stringify([attachmentId, blueprintId, blockId, message]);
    if (this.reported.has(key)) return;
    this.reported.add(key);
    this.log({
      level: "error",
      entityId,
      blockId,
      message,
      ...(attachmentId && attachmentId !== primaryAttachmentId
        ? { blueprintId, attachmentId }
        : {}),
    });
  }

  start() {
    if (this.started) return;
    this.started = true;
    this.motion.start();
    for (const { entity } of this.world.query("audio"))
      if (entity.audio?.autoplay)
        this.queueAudio(entity.audio.soundId, true, entity.id);
    this.scheduler.start(this.program);
  }
  private beginTick() {
    this.tickPending = true;
    this.scheduler.nextTick();
  }
  private finishTick() {
    if (this.scheduler.paused || !this.tickPending) return;
    this.tickPending = false;
    if (this.behaviors.size)
      for (const behavior of this.behaviors.values()) behavior.tick(STEP);
    this.motion.step(STEP);
    if (this.tileVisibilityChanged) {
      this.navigation.invalidate();
      this.tileVisibilityChanged = false;
    }
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
      this.cameraSettings(),
      this.cameraTarget(),
      this.project.width,
      this.project.height,
      this.currentCamera,
      STEP,
    );
    for (const animation of this.animations) animation.step(STEP);
    this.stepParticles(STEP);
    this.time += STEP;
    this.processScenes(STEP);
  }
  advance(seconds: number) {
    if (!Number.isFinite(seconds) || seconds < 0) return;
    this.start();
    if (this.scheduler.paused) return;
    this.screens.advance(Math.min(seconds, 0.15));
    if (this.screens.paused) this.scheduler.pumpPausedUi();
    this.scheduler.pump();
    const pending = this.tickPending;
    this.finishTick();
    if (this.scheduler.paused) return;
    if (!pending)
      this.processScenes(this.screens.paused ? Math.min(seconds, 0.15) : 0);
    if (this.screens.paused) {
      this.input.clear();
      this.accumulator = 0;
      return;
    }
    this.accumulator += Math.min(seconds, 0.15);
    while (this.accumulator + 1e-10 >= STEP) {
      this.accumulator -= STEP;
      this.beginTick();
      this.scheduler.pump();
      this.finishTick();
      if (this.scheduler.paused || this.screens.paused) {
        this.accumulator = 0;
        break;
      }
    }
  }
  getSceneEntityId(sceneId: string, entityId: string) {
    return (
      this.sceneWorld?.entityId(sceneId, entityId) ??
      (sceneId === this.scene.id && this.world.has(entityId)
        ? entityId
        : undefined)
    );
  }
  getEntity(id: string) {
    return this.world.get(id)?.entity;
  }
  getVariables(id: string, attachmentId?: string) {
    const bindings = this.bindingsByEntity.get(id);
    return (
      attachmentId
        ? bindings?.find((binding) => binding.attachmentId === attachmentId)
        : bindings?.[0]
    )?.context.variables;
  }
  getEntityHandle(id: string) {
    return this.world.handle(id);
  }
  resolveEntity(handle: EntityHandle) {
    return this.world.resolve(handle)?.entity;
  }
  queryEntities(...components: ComponentName[]) {
    return this.world.query(...components).map(({ entity }) => entity);
  }

  private componentRows(...keys: ComponentName[]) {
    return [...this.world.query(...keys)]
      .sort((a, b) => a.rank - b.rank)
      .map(({ entity }) => entity);
  }

  private refreshComponents() {
    this.lights = [...this.world.query("light")].sort(
      (a, b) => a.rank - b.rank,
    );
    const previousCamera = this.componentCamera;
    this.componentCamera = [...this.world.query("camera")]
      .sort((a, b) => a.rank - b.rank)
      .find(({ entity }) => entity.camera?.enabled)?.entity;
    if (previousCamera !== this.componentCamera) this.currentCamera = undefined;
    this.prefabMembers.clear();
    this.tileOwners.clear();
    for (const { entity } of this.entities) {
      for (const id of entity.tileLayers ?? []) this.tileOwners.set(id, entity);
      if (!entity.prefab) continue;
      const { instanceId, sourceId } = entity.prefab;
      const group =
        this.prefabMembers.get(instanceId) ?? new Map<string, string>();
      group.set(sourceId, entity.id);
      this.prefabMembers.set(instanceId, group);
    }
  }

  private createTiles(scene: Scene) {
    return new TileWorld(
      scene.tilemap,
      (layer) => this.tileOwners.get(layer)?.visible ?? true,
      this.sceneWorld?.tileSources,
    );
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
    const follow = this.componentCamera?.id ?? this.scene.camera.follow;
    return follow ? this.worldPoint(follow) : undefined;
  }

  private cameraSettings(): Scene["camera"] {
    if (!this.componentCamera?.camera) return this.scene.camera;
    return {
      x: this.componentCamera.transform.x,
      y: this.componentCamera.transform.y,
      follow: this.componentCamera.id,
      offsetY: 0,
      zoom: this.componentCamera.camera.zoom,
      damping: this.componentCamera.camera.damping,
    };
  }
  view() {
    return (
      this.currentCamera ??
      cameraView(
        this.cameraSettings(),
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
    const paint = (
      grid: TileGrid,
      alpha: number,
      world = this.tiles,
      offset?: Point,
    ) => {
      if (!alpha) return;
      const { size } = grid;
      grid.forArea(
        offset ? { ...area, x: area.x - offset.x, y: area.y - offset.y } : area,
        (tile) => {
          const terrain = world.terrain(tile);
          const x = tile.x * size + (offset?.x ?? 0),
            y = tile.y * size + (offset?.y ?? 0);
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
        },
      );
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
    const paintWorld = (world: TileWorld, offset?: Point, firstLayer = 0) => {
      if (layerIndex === firstLayer + 1) paint(world.legacy, 1, world, offset);
      const layer = this.scene.layers[layerIndex];
      if (!layer?.visible) return;
      renderedLayer = layer.id;
      for (const { definition, grid } of world.layers) {
        if (
          definition.visible &&
          definition.layerId === layer.id &&
          (this.tileOwners.get(definition.id)?.visible ?? true)
        )
          paint(grid, definition.opacity, world, offset);
      }
    };
    const paintLayers = (through: number) => {
      for (; layerIndex <= through; layerIndex++) {
        flushParticles();
        if (this.tiles.parts.length) {
          for (const { world, offset, layerIndex: firstLayer } of this.tiles
            .parts)
            paintWorld(world, offset, firstLayer);
        } else paintWorld(this.tiles);
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
    paintLayers(
      Math.max(
        (this.tiles.parts.at(-1)?.layerIndex ?? 0) + 1,
        this.scene.layers.length - 1,
      ),
    );
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
    const fade = this.transition;
    if (fade) {
      const ratio = fade.elapsed / fade.command.fade!;
      const alpha = Math.max(0, 1 - Math.abs(2 * ratio - 1));
      if (alpha)
        draws.push({
          kind: "rect",
          width,
          height,
          color: "#000000",
          alpha,
          matrix: translation(0, 0),
        });
    }
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
