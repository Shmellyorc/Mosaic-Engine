import { z } from "zod";
import {
  blueprintSchema,
  blueprintValueSchema,
  typeOf,
  extensionSchema,
  parseExtensionManifest,
  signalSchema,
} from "@mosaic/blueprints";

import {
  animatorSchema,
  emitterSchema,
  MAX_EMITTERS,
  mixerSchema,
  MASTER_BUS,
  timelineSchema,
} from "./effects";
import { catalogSchema, validateCatalog } from "./data";
import { uiSchema, validateUi } from "./ui";
import { behaviorTreeSchema, validateBehaviorTree } from "./behavior-tree";
export * from "./behavior-tree";
import { uiFlowSchema, validateUiFlow } from "./ui-flow";
export * from "./ui-flow";
import { sceneFlowSchema } from "./scene-flow";
export * from "./scene-flow";
export * from "./ui";
export * from "./effects";
export * from "./entity-components";
export * from "./prefabs";
export * from "./data";

export { inspectWav } from "./wav";

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_PROJECT_BYTES = 64 * 1024 * 1024;
const id = z.string().min(1).max(100);
const name = z.string().trim().min(1).max(100);
const color = z.string().regex(/^#[0-9a-f]{6}$/i);
const position = z.number().min(-1e7).max(1e7);
const dimension = z.number().int().min(1).max(8192);
const assetPrefix = /^data:image\/(png|jpeg|webp|gif);base64,/;
const assetSchema = z.object({
  id,
  name,
  source: z
    .string()
    .max(4 * Math.ceil(MAX_IMAGE_BYTES / 3) + 32)
    .refine((s) => {
      const prefix = assetPrefix.exec(s);
      if (!prefix) return false;
      const payload = s.slice(prefix[0].length);
      return (
        payload.length % 4 === 0 &&
        /^[A-Za-z0-9+/]+={0,2}$/.test(payload) &&
        (payload.length * 3) / 4 -
          (payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0) <=
          MAX_IMAGE_BYTES
      );
    }, "Expected an embedded PNG, JPEG, WebP or GIF image."),
});
const frame = z.object({
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative(),
  w: dimension,
  h: dimension,
});
const worldBounds = z.object({
  x: position,
  y: position,
  width: dimension,
  height: dimension,
});
const rate = z.number().min(-10000).max(10000);
const bodySchema = z.object({
  kind: z.enum(["static", "kinematic", "dynamic", "sensor"]),
  width: dimension,
  height: dimension,
  offsetX: position,
  offsetY: position,
  velocityX: rate,
  velocityY: rate,
  gravityScale: z.number().min(-8).max(8),
  bounce: z.number().min(0).max(1),
  enterSignal: id.nullable(),
  exitSignal: id.nullable(),
});
const agentSchema = z.object({
  speed: z.number().min(1).max(1000),
  x: position,
  y: position,
  target: id.nullable(),
  enabled: z.boolean(),
});
const lightSchema = z.object({
  radius: z.number().min(1).max(8192),
  color,
  intensity: z.number().min(0).max(1),
  enabled: z.boolean(),
});
export type Body = z.infer<typeof bodySchema>;
export type NavigationAgent = z.infer<typeof agentSchema>;
export type PointLight = z.infer<typeof lightSchema>;
export const createBody = (width = 32, height = 32): Body => ({
  kind: "kinematic",
  width,
  height,
  offsetX: 0,
  offsetY: 0,
  velocityX: 0,
  velocityY: 0,
  gravityScale: 1,
  bounce: 0,
  enterSignal: null,
  exitSignal: null,
});
export const createAgent = (x: number, y: number): NavigationAgent => ({
  speed: 80,
  x,
  y,
  target: null,
  enabled: true,
});
export const createLight = (): PointLight => ({
  radius: 120,
  color: "#ffd891",
  intensity: 0.8,
  enabled: true,
});
const visual = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("rect"), color }),
  z.object({ kind: z.literal("sprite"), assetId: id, frame: frame.optional() }),
  z.object({
    kind: z.literal("text"),
    text: z.string().max(300),
    color,
    size: z.number().int().min(6).max(192),
    screen: z.boolean(),
  }),
]);
const attachmentSchema = z.object({
  id,
  blueprintId: id,
  enabled: z.boolean(),
  overrides: z.record(id, blueprintValueSchema).optional(),
});
export type BlueprintAttachment = z.infer<typeof attachmentSchema>;
const prefabLinkSchema = z.object({
  assetId: id,
  instanceId: id,
  sourceId: id,
});

export const entitySchema = z.object({
  id,
  name,
  parentId: id.nullable(),
  layerId: id,
  order: z.number().int(),
  visible: z.boolean(),
  transform: z.object({
    x: position,
    y: position,
    rotation: z.number(),
    scaleX: z.number().min(-100).max(100),
    scaleY: z.number().min(-100).max(100),
    width: dimension,
    height: dimension,
    alpha: z.number().min(0).max(1),
  }),
  visual: visual.nullable(),
  blueprintId: id.nullable(),
  behaviorTree: id.optional(),
  attachments: z.array(attachmentSchema).max(32).optional(),
  prefab: prefabLinkSchema.optional(),
  persistent: z.boolean().optional(),
  camera: z
    .object({
      enabled: z.boolean(),
      zoom: z.number().min(0.05).max(8),
      damping: z.number().min(0).max(60).optional(),
    })
    .optional(),
  tileLayers: z.array(id).max(32).optional(),
  audio: z.object({ soundId: id, autoplay: z.boolean() }).optional(),
  body: bodySchema.optional(),
  navigation: agentSchema.optional(),
  light: lightSchema.optional(),
  animator: animatorSchema.optional(),
  particles: emitterSchema.optional(),
  clips: z
    .array(
      z.object({
        id,
        name,
        fps: z.number().min(0.1).max(120),
        loop: z.boolean(),
        frames: z.array(frame).min(1).max(128),
      }),
    )
    .max(50),
});
const tile = z.object({
  x: z.number().int().min(0).max(255),
  y: z.number().int().min(0).max(255),
  color,
  terrainId: id.optional(),
  solid: z.boolean().optional(),
  cost: z.number().min(1).max(100).optional(),
});
const terrainSchema = z.object({
  id,
  name,
  color,
  edge: color,
  solid: z.boolean(),
  cost: z.number().min(1).max(100),
  atlas: z
    .object({
      assetId: id,
      size: dimension,
      columns: z.number().int().min(1).max(64),
      first: z.number().int().min(0).max(4096),
    })
    .optional(),
});
const tileLayer = z.object({
  id,
  name,
  layerId: id,
  visible: z.boolean(),
  collision: z.boolean(),
  navigation: z.boolean(),
  opacity: z.number().min(0).max(1),
  tiles: z.array(tile).max(65536),
});
export type Terrain = z.infer<typeof terrainSchema>;
export type TileLayer = z.infer<typeof tileLayer>;
const sceneSchema = z.object({
  id,
  name,
  background: color,
  camera: z.object({
    x: position,
    y: position,
    zoom: z.number().min(0.05).max(8),
    follow: id.nullable(),
    offsetY: position,
    offsetX: position.optional(),
    damping: z.number().min(0).max(60).optional(),
    deadZone: z
      .object({
        width: z.number().min(0).max(8192),
        height: z.number().min(0).max(8192),
      })
      .optional(),
    bounds: worldBounds.optional(),
  }),
  layers: z
    .array(z.object({ id, name, visible: z.boolean() }))
    .min(1)
    .max(128),
  entities: z.array(entitySchema).max(20000),
  timelines: z.array(timelineSchema).max(64).optional(),
  ui: uiSchema.optional(),
  gravity: z.object({ x: rate, y: rate }).optional(),
  lighting: z.object({ ambient: color, enabled: z.boolean() }).optional(),
  tilemap: z.object({
    size: z.number().int().min(4).max(128),
    width: z.number().int().min(1).max(256),
    height: z.number().int().min(1).max(256),
    tiles: z.array(tile).max(65536),
    layers: z.array(tileLayer).max(32).optional(),
    terrains: z.array(terrainSchema).max(128).optional(),
  }),
});
const prefabSchema = z.object({
  id,
  name,
  entities: z.array(entitySchema).min(1).max(2000),
});
export type Prefab = z.infer<typeof prefabSchema>;

const codes = z.array(z.string().regex(/^[A-Za-z][A-Za-z0-9]{0,31}$/)).max(16);
export const emptySignals: never[] = [];
const projectSchema = z.object({
  version: z.union([z.literal(1), z.literal(2)]),
  id,
  name,
  width: dimension,
  height: dimension,
  startSceneId: id,
  sceneFlow: sceneFlowSchema.optional(),
  uiFlow: uiFlowSchema.optional(),
  behaviorTrees: z.array(behaviorTreeSchema).max(256).optional(),
  scenes: z.array(sceneSchema).min(1).max(500),
  assets: z.array(assetSchema).max(4096),
  blueprints: z.array(blueprintSchema).max(4096),
  prefabs: z.array(prefabSchema).max(512).optional(),
  extensions: z.array(extensionSchema).max(64).optional(),
  mixer: mixerSchema.optional(),
  data: catalogSchema.optional(),
  signals: z.array(signalSchema).max(256).optional(),
  input: z
    .array(z.object({ id, name, negative: codes, positive: codes }))
    .max(128),
});
export type Project = z.infer<typeof projectSchema>;
export type Scene = z.infer<typeof sceneSchema>;
export type Entity = z.infer<typeof entitySchema>;
export type Asset = z.infer<typeof assetSchema>;
export type Frame = z.infer<typeof frame>;
export type Tile = z.infer<typeof tile>;
/** Legacy single bindings have a stable instance key within their entity. */
export const primaryAttachmentId = "primary";
export function attachmentBlueprints(entity: Entity) {
  return [
    ...(entity.blueprintId ? [entity.blueprintId] : []),
    ...(entity.attachments ?? [])
      .filter(({ enabled }) => enabled)
      .map(({ blueprintId }) => blueprintId),
  ];
}

export const newId = () => globalThis.crypto.randomUUID();

function idsOf(items: { id: string }[], label: string): Set<string> {
  const ids = new Set(items.map((item) => item.id));
  if (ids.size !== items.length) throw new Error(`Duplicate ${label} ID.`);
  return ids;
}

export function validateProject(input: unknown): Project {
  if (!input || typeof input !== "object" || !("version" in input))
    throw new Error("Project has no format version.");
  if (input.version !== 1 && input.version !== 2)
    throw new Error(
      `Unsupported Mosaic project format version. Expected version 1 or 2.`,
    );
  let parsed: ReturnType<typeof projectSchema.safeParse>;
  try {
    parsed = projectSchema.safeParse(input);
  } catch (error) {
    if (error instanceof RangeError)
      throw new Error("Project data is nested too deeply.");
    throw error;
  }
  if (!parsed.success) {
    throw new Error(
      parsed.error.issues
        .slice(0, 6)
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("\n"),
    );
  }
  const project = parsed.data;
  const sceneIds = idsOf(project.scenes, "scene");
  const assetIds = idsOf(project.assets, "asset");
  const blueprintIds = idsOf(project.blueprints, "blueprint");
  const behaviorTrees = idsOf(project.behaviorTrees ?? [], "behavior tree");
  for (const tree of project.behaviorTrees ?? [])
    validateBehaviorTree(tree, project.blueprints);
  const definitions = new Map(
    project.blueprints.map((blueprint) => [blueprint.id, blueprint]),
  );
  idsOf(project.prefabs ?? [], "prefab");
  const prefabSources = new Map(
    project.prefabs?.map(({ id, entities }) => [
      id,
      new Set(entities.map((entity) => entity.id)),
    ]),
  );
  const soundIds = new Set(project.mixer?.sounds.map(({ id }) => id));
  function validateAttachments(entity: Entity, entityIds: Set<string>) {
    if (entity.behaviorTree && !behaviorTrees.has(entity.behaviorTree))
      throw new Error(
        `Entity "${entity.name}" references a missing Behavior Tree.`,
      );
    const attachments = entity.attachments;
    if (!attachments?.length) return;
    idsOf(attachments, "Blueprint attachment");
    for (const attachment of attachments) {
      if (attachment.id === primaryAttachmentId)
        throw Error("A Blueprint attachment uses a reserved ID.");
      const definition = definitions.get(attachment.blueprintId);
      if (!definition)
        throw Error(`"${entity.name}" references a missing Blueprint.`);
      for (const [key, value] of Object.entries(attachment.overrides ?? {})) {
        const variable = definition.variables.find(
          (v) => v.id === key && v.exposed,
        );
        if (!variable || typeOf(value) !== variable.type)
          throw Error(
            `"${entity.name}" has an invalid exposed Blueprint override.`,
          );
        if (
          typeof value === "object" &&
          ((value.kind === "entity" && value.id && !entityIds.has(value.id)) ||
            (value.kind === "asset" && value.id && !assetIds.has(value.id)))
        )
          throw Error(`"${entity.name}" has a missing override reference.`);
      }
    }
  }
  for (const prefab of project.prefabs ?? []) {
    const ids = idsOf(prefab.entities, "prefab entity");
    if (prefab.entities.filter(({ parentId }) => !parentId).length !== 1)
      throw Error(`Prefab "${prefab.name}" requires one root.`);
    const parents = new Map(
      prefab.entities.map((entity) => [entity.id, entity.parentId]),
    );
    for (const entity of prefab.entities) {
      const seen = new Set<string>();
      let at: string | null = entity.id;
      while (at) {
        if (seen.has(at) || !parents.has(at))
          throw Error(`Prefab "${prefab.name}" has an invalid hierarchy.`);
        seen.add(at);
        at = parents.get(at)!;
      }
      if (
        entity.prefab ||
        entity.tileLayers?.length ||
        (entity.parentId && (entity.body || entity.navigation)) ||
        (entity.navigation?.target && !ids.has(entity.navigation.target)) ||
        (entity.visual?.kind === "sprite" &&
          !assetIds.has(entity.visual.assetId)) ||
        (entity.blueprintId && !definitions.has(entity.blueprintId)) ||
        (entity.audio && !soundIds.has(entity.audio.soundId))
      )
        throw Error(
          `Prefab "${prefab.name}" contains an invalid component reference.`,
        );
      validateAttachments(entity, ids);
    }
  }
  idsOf(project.input, "input");
  idsOf(project.extensions ?? [], "extension");
  for (const extension of project.extensions ?? [])
    parseExtensionManifest(extension);
  idsOf(project.signals ?? [], "event");
  const signals = new Map(
    (project.signals ?? []).map((signal) => [signal.id, signal.type]),
  );
  if (project.data) validateCatalog(project.data);
  if (project.mixer) {
    const buses = idsOf(project.mixer.buses, "audio bus");
    idsOf(project.mixer.sounds, "sound");
    if (buses.has(MASTER_BUS))
      throw new Error("The master audio bus ID is reserved.");
    for (const sound of project.mixer.sounds) {
      if (sound.bus !== MASTER_BUS && !buses.has(sound.bus))
        throw new Error(`Sound "${sound.name}" has a missing audio bus.`);
    }
  }
  if (project.uiFlow)
    validateUiFlow(project.uiFlow, sceneIds, assetIds, signals);
  if (project.sceneFlow) {
    idsOf(project.sceneFlow.routes, "scene route");
    const triggers = new Map<string, Set<string | null>>();
    for (const route of project.sceneFlow.routes) {
      if ((route.from && !sceneIds.has(route.from)) || !sceneIds.has(route.to))
        throw new Error(
          `Scene route "${route.name}" references a missing scene.`,
        );
      if (route.signalId) {
        if (!project.signals?.some((signal) => signal.id === route.signalId))
          throw new Error(
            `Scene route "${route.name}" references a missing signal.`,
          );
        const sources =
          triggers.get(route.signalId) ?? new Set<string | null>();
        if (sources.has(route.from))
          throw new Error(
            `Scene route "${route.name}" duplicates a signal trigger.`,
          );
        sources.add(route.from);
        triggers.set(route.signalId, sources);
      }
    }
    for (const sceneId of Object.keys(project.sceneFlow.positions ?? {}))
      if (!sceneIds.has(sceneId))
        throw new Error("Scene Flow contains a missing scene position.");
  }
  if (!sceneIds.has(project.startSceneId))
    throw new Error("The starting scene is missing.");
  for (const scene of project.scenes) {
    if (scene.ui) validateUi(scene.ui, assetIds);
    const layerIds = idsOf(scene.layers, "layer");
    const entityIds = idsOf(scene.entities, "entity");
    const parents = new Map(
      scene.entities.map((entity) => [entity.id, entity.parentId]),
    );
    const checked = new Set<string>();
    if (scene.camera.follow && !entityIds.has(scene.camera.follow))
      throw new Error(`"${scene.name}" camera target is missing.`);
    if (scene.entities.filter((entity) => entity.light).length > 128)
      throw new Error(`"${scene.name}" exceeds the 128 light limit.`);
    if (
      scene.entities.filter((entity) => entity.particles).length > MAX_EMITTERS
    )
      throw new Error(
        `"${scene.name}" exceeds the ${MAX_EMITTERS} emitter limit.`,
      );
    idsOf(scene.timelines ?? [], "timeline");
    for (const timeline of scene.timelines ?? []) {
      idsOf(timeline.tracks, "timeline track");
      const targets = new Set<string>();
      for (const track of timeline.tracks) {
        const binding = JSON.stringify([track.entityId, track.property]);
        if (!entityIds.has(track.entityId) || targets.has(binding))
          throw new Error(
            `Timeline "${timeline.name}" has an invalid or duplicate track binding.`,
          );
        targets.add(binding);
        let previous = -1;
        for (const key of track.keys) {
          if (key.time <= previous || key.time > timeline.duration)
            throw new Error(
              `Timeline "${timeline.name}" requires unique, ordered keys within its duration.`,
            );
          previous = key.time;
        }
      }
    }
    const prefabMembers = new Map<
      string,
      { asset: string; sources: Set<string> }
    >();
    const availableTileLayers = new Set(
      scene.tilemap.layers?.map(({ id }) => id),
    );
    const ownedTiles = new Set<string>();
    for (const entity of scene.entities) {
      validateAttachments(entity, entityIds);
      if (entity.audio && !soundIds.has(entity.audio.soundId))
        throw Error(`"${entity.name}" has a missing audio source.`);
      for (const layer of entity.tileLayers ?? []) {
        if (!availableTileLayers.has(layer) || ownedTiles.has(layer))
          throw Error(`"${entity.name}" has a missing or shared tile layer.`);
        ownedTiles.add(layer);
      }
      const link = entity.prefab;
      if (link) {
        const group = prefabMembers.get(link.instanceId) ?? {
          asset: link.assetId,
          sources: new Set<string>(),
        };
        if (
          group.asset !== link.assetId ||
          group.sources.has(link.sourceId) ||
          !prefabSources.get(link.assetId)?.has(link.sourceId)
        )
          throw Error(`"${entity.name}" has an invalid prefab instance link.`);
        group.sources.add(link.sourceId);
        prefabMembers.set(link.instanceId, group);
      }
      if ((entity.body || entity.navigation) && entity.parentId)
        throw new Error(
          `"${entity.name}" must be a root entity to use physics or navigation.`,
        );
      if (entity.navigation?.target && !entityIds.has(entity.navigation.target))
        throw new Error(`"${entity.name}" has a missing navigation target.`);
      for (const signal of [
        entity.body?.enterSignal,
        entity.body?.exitSignal,
      ]) {
        if (
          signal &&
          signals.get(signal) !== "void" &&
          signals.get(signal) !== "entity"
        )
          throw new Error(
            `"${entity.name}" has an invalid contact event. Choose a scene event with an entity or no payload.`,
          );
      }
      if (!layerIds.has(entity.layerId))
        throw new Error(`"${entity.name}" has no valid layer.`);
      if (entity.blueprintId && !blueprintIds.has(entity.blueprintId))
        throw new Error(`"${entity.name}" references a missing blueprint.`);
      if (
        entity.visual?.kind === "sprite" &&
        !assetIds.has(entity.visual.assetId)
      )
        throw new Error(`"${entity.name}" references a missing image.`);
      const clips = idsOf(entity.clips, "clip");
      const animator = entity.animator;
      if (animator) {
        const states = idsOf(animator.states, "animation state");
        const parameters = idsOf(animator.parameters, "animation parameter");
        idsOf(animator.transitions, "animation transition");
        if (
          entity.visual?.kind !== "sprite" ||
          !states.has(animator.entry) ||
          animator.states.some((state) => !clips.has(state.clipId))
        )
          throw new Error(
            `"${entity.name}" animator requires a sprite, an entry state, and assigned clips.`,
          );
        for (const { from, to, condition } of animator.transitions) {
          if (
            (from !== null && !states.has(from)) ||
            !states.has(to) ||
            from === to ||
            (condition.kind === "parameter" &&
              !parameters.has(condition.parameterId))
          )
            throw new Error(
              `"${entity.name}" has an invalid animation transition.`,
            );
        }
      }
      if (
        new Set(entity.clips.map((clip) => clip.name)).size !==
        entity.clips.length
      )
        throw new Error(`"${entity.name}" has duplicate clip names.`);
      const path = new Set<string>();
      let cursor: string | null = entity.id;
      while (cursor && !checked.has(cursor)) {
        if (path.has(cursor))
          throw new Error(`"${scene.name}" has an entity hierarchy cycle.`);
        const parent: string | null | undefined = parents.get(cursor);
        if (parent === undefined)
          throw new Error(`"${entity.name}" has a missing parent.`);
        path.add(cursor);
        cursor = parent;
      }
      for (const visited of path) checked.add(visited);
    }
    const { width, height, tiles, terrains, layers } = scene.tilemap;
    const terrainIds = idsOf(terrains ?? [], "terrain");
    idsOf(layers ?? [], "tile layer");
    for (const terrain of terrains ?? []) {
      if (terrain.atlas && !assetIds.has(terrain.atlas.assetId))
        throw new Error(
          `Terrain "${terrain.name}" references a missing atlas.`,
        );
    }
    for (const layer of layers ?? []) {
      if (!layerIds.has(layer.layerId))
        throw new Error(
          `Tile layer "${layer.name}" references a missing render layer.`,
        );
    }
    for (const cells of [
      tiles,
      ...(layers ?? []).map((layer) => layer.tiles),
    ]) {
      const occupied = new Set<number>();
      for (const cell of cells) {
        if (cell.x >= width || cell.y >= height)
          throw new Error(`"${scene.name}" contains a tile outside the map.`);
        if (cell.terrainId && !terrainIds.has(cell.terrainId))
          throw new Error(
            `"${scene.name}" contains a tile with a missing terrain.`,
          );
        const index = cell.y * width + cell.x;
        if (occupied.has(index))
          throw new Error(
            `"${scene.name}" contains duplicate tiles on a layer.`,
          );
        occupied.add(index);
      }
    }
  }
  return project;
}

export function parseProject(source: string): Project {
  if (
    source.length > MAX_PROJECT_BYTES ||
    new TextEncoder().encode(source).byteLength > MAX_PROJECT_BYTES
  ) {
    throw new Error("Project exceeds the 64 MiB format limit.");
  }
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new Error("Project is not valid JSON.");
  }
  return validateProject(value);
}
export function serializeProject(project: Project): string {
  const modern =
    project.version === 2 ||
    !!project.prefabs?.length ||
    project.scenes.some(({ entities }) =>
      entities.some(
        (entity) =>
          !!(
            entity.attachments?.length ||
            entity.prefab ||
            entity.persistent ||
            entity.camera ||
            entity.tileLayers?.length ||
            entity.audio
          ),
      ),
    ) ||
    !!project.sceneFlow ||
    !!project.uiFlow ||
    !!project.behaviorTrees?.length ||
    project.blueprints.some(
      ({ requires, variables }) =>
        !!requires?.length || variables.some(({ exposed }) => exposed),
    );
  const source = JSON.stringify(
    validateProject(
      modern && project.version === 1 ? { ...project, version: 2 } : project,
    ),
    null,
    2,
  );
  if (new TextEncoder().encode(source).byteLength > MAX_PROJECT_BYTES)
    throw new Error("Project exceeds the 64 MiB format limit.");
  return source;
}

export function createScene(sceneName = "Main"): Scene {
  return {
    id: newId(),
    name: sceneName,
    background: "#15172b",
    camera: { x: 320, y: 180, zoom: 1, follow: null, offsetY: 0 },
    layers: [{ id: newId(), name: "World", visible: true }],
    entities: [],
    tilemap: { size: 32, width: 20, height: 12, tiles: [] },
  };
}

export function createProject(projectName = "Untitled Project"): Project {
  const scene = createScene();
  return {
    version: 1,
    id: newId(),
    name: projectName,
    width: 640,
    height: 360,
    startSceneId: scene.id,
    scenes: [scene],
    assets: [],
    blueprints: [],
    input: [
      {
        id: "horizontal",
        name: "Horizontal",
        negative: ["ArrowLeft", "KeyA"],
        positive: ["ArrowRight", "KeyD"],
      },
      {
        id: "vertical",
        name: "Vertical",
        negative: ["ArrowUp", "KeyW"],
        positive: ["ArrowDown", "KeyS"],
      },
    ],
  };
}

export function createEntity(layerId: string, entityName = "Entity"): Entity {
  return {
    id: newId(),
    name: entityName,
    parentId: null,
    layerId,
    order: 0,
    visible: true,
    transform: {
      x: 320,
      y: 180,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      width: 48,
      height: 48,
      alpha: 1,
    },
    visual: { kind: "rect", color: "#9670e8" },
    blueprintId: null,
    clips: [],
  };
}

export function createBlueprint(blueprintName = "Behaviour") {
  return blueprintSchema.parse({
    version: 2,
    id: newId(),
    name: blueprintName,
    variables: [],
    events: [
      { id: newId(), kind: "start", blocks: [] },
      { id: newId(), kind: "update", blocks: [] },
    ],
  });
}
