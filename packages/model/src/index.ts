import { z } from "zod";
import { blueprintSchema } from "@mosaic/blueprints";

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
});
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
  }),
  layers: z
    .array(z.object({ id, name, visible: z.boolean() }))
    .min(1)
    .max(128),
  entities: z.array(entitySchema).max(20000),
  tilemap: z.object({
    size: z.number().int().min(4).max(128),
    width: z.number().int().min(1).max(256),
    height: z.number().int().min(1).max(256),
    tiles: z.array(tile).max(65536),
  }),
});
const codes = z.array(z.string().regex(/^[A-Za-z][A-Za-z0-9]{0,31}$/)).max(16);
const projectSchema = z.object({
  version: z.literal(1),
  id,
  name,
  width: dimension,
  height: dimension,
  startSceneId: id,
  scenes: z.array(sceneSchema).min(1).max(500),
  assets: z.array(assetSchema).max(4096),
  blueprints: z.array(blueprintSchema).max(4096),
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
export const newId = () => globalThis.crypto.randomUUID();

function idsOf(items: { id: string }[], label: string): Set<string> {
  const ids = new Set(items.map((item) => item.id));
  if (ids.size !== items.length) throw new Error(`Duplicate ${label} ID.`);
  return ids;
}

export function validateProject(input: unknown): Project {
  if (!input || typeof input !== "object" || !("version" in input))
    throw new Error("Project has no format version.");
  if (input.version !== 1)
    throw new Error(
      `Unsupported Mosaic project format version. Expected version 1.`,
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
  idsOf(project.input, "input");
  if (!sceneIds.has(project.startSceneId))
    throw new Error("The starting scene is missing.");
  for (const scene of project.scenes) {
    const layerIds = idsOf(scene.layers, "layer");
    const entityIds = idsOf(scene.entities, "entity");
    const parents = new Map(
      scene.entities.map((entity) => [entity.id, entity.parentId]),
    );
    const checked = new Set<string>();
    if (scene.camera.follow && !entityIds.has(scene.camera.follow))
      throw new Error(`"${scene.name}" camera target is missing.`);
    for (const entity of scene.entities) {
      if (!layerIds.has(entity.layerId))
        throw new Error(`"${entity.name}" has no valid layer.`);
      if (entity.blueprintId && !blueprintIds.has(entity.blueprintId))
        throw new Error(`"${entity.name}" references a missing blueprint.`);
      if (
        entity.visual?.kind === "sprite" &&
        !assetIds.has(entity.visual.assetId)
      )
        throw new Error(`"${entity.name}" references a missing image.`);
      idsOf(entity.clips, "clip");
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
    const cells = new Set<number>();
    const { width, height, tiles } = scene.tilemap;
    for (const cell of tiles) {
      if (cell.x >= width || cell.y >= height)
        throw new Error(`"${scene.name}" contains a tile outside the map.`);
      const index = cell.y * width + cell.x;
      if (cells.has(index))
        throw new Error(`"${scene.name}" contains duplicate tiles.`);
      cells.add(index);
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
  const source = JSON.stringify(validateProject(project), null, 2);
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
    version: 1,
    id: newId(),
    name: blueprintName,
    variables: [],
    events: [
      { id: newId(), kind: "start", blocks: [] },
      { id: newId(), kind: "update", blocks: [] },
    ],
  });
}
