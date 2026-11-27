import type { Project } from "@mosaic/model";

export const editors = [
  "Scene",
  "Blueprints",
  "Tilemap",
  "Physics",
  "Cameras",
  "Navigation",
  "Lighting",
  "Animator",
  "Timeline",
  "Particles",
  "Audio",
  "Data",
  "UI",
  "Input",
] as const;
export type Workspace = (typeof editors)[number];

export type DocumentKind =
  | "scene"
  | "entity"
  | "blueprint"
  | "image"
  | "prefab"
  | "tilemap"
  | "animator"
  | "timeline"
  | "particles"
  | "sound"
  | "data"
  | "ui"
  | "input";
export type DocumentRef = { kind: DocumentKind; id: string; sceneId?: string };
export const documentKey = ({ kind, id, sceneId }: DocumentRef) =>
  JSON.stringify([kind, sceneId ?? null, id]);

const sceneKinds = new Set<DocumentKind>([
  "scene",
  "tilemap",
  "timeline",
  "ui",
]);
const entityKinds = new Set<DocumentKind>(["entity", "animator", "particles"]);
const kinds = new Set<DocumentKind>([
  ...sceneKinds,
  ...entityKinds,
  "blueprint",
  "image",
  "prefab",
  "sound",
  "data",
  "input",
]);

export function documentInfo(project: Project, ref: DocumentRef) {
  const scene = ref.sceneId
    ? project.scenes.find(({ id }) => id === ref.sceneId)
    : undefined;
  const entity = entityKinds.has(ref.kind)
    ? scene?.entities.find(({ id }) => id === ref.id)
    : undefined;
  let name: string | undefined;
  let extension: string = ref.kind;
  let workspace: Workspace = "Scene";
  switch (ref.kind) {
    case "scene":
      name = scene?.name;
      break;
    case "entity":
      name = entity?.name;
      break;
    case "blueprint":
      name = project.blueprints.find(({ id }) => id === ref.id)?.name;
      workspace = "Blueprints";
      break;
    case "image": {
      const image = project.assets.find(({ id }) => id === ref.id);
      name = image?.name;
      extension = image?.source.match(/^data:image\/(\w+)/)?.[1] ?? "image";
      break;
    }
    case "prefab":
      name = project.prefabs?.find(({ id }) => id === ref.id)?.name;
      break;
    case "tilemap": {
      const layer = scene?.tilemap.layers?.find(({ id }) => id === ref.id);
      name = ref.id === scene?.id ? scene.name : layer?.name;
      workspace = "Tilemap";
      break;
    }
    case "animator":
      name = entity?.name;
      workspace = "Animator";
      break;
    case "particles":
      name = entity?.name;
      workspace = "Particles";
      break;
    case "timeline":
      name =
        ref.id === scene?.id
          ? scene.name
          : scene?.timelines?.find(({ id }) => id === ref.id)?.name;
      workspace = "Timeline";
      break;
    case "sound":
      name = project.mixer?.sounds.find(({ id }) => id === ref.id)?.name;
      extension = "wav";
      workspace = "Audio";
      break;
    case "data":
      name = "Project Data";
      workspace = "Data";
      break;
    case "ui":
      name = scene?.name;
      workspace = "UI";
      break;
    case "input":
      name = "Input";
      workspace = "Input";
      break;
  }
  if (!name) return;
  const suffix = "." + extension;
  return {
    title: name.toLowerCase().endsWith(suffix) ? name : name + suffix,
    workspace,
  };
}

export function restoreDocumentRefs(project: Project, input: unknown) {
  if (!Array.isArray(input)) return [];
  const valid = new Map<string, DocumentRef>();
  for (const item of input) {
    if (!item || typeof item !== "object") continue;
    const { kind, id, sceneId } = item as Partial<DocumentRef>;
    if (
      !kind ||
      !kinds.has(kind) ||
      typeof id !== "string" ||
      (sceneId !== undefined && typeof sceneId !== "string")
    )
      continue;
    const ref = { kind, id, sceneId };
    if (documentInfo(project, ref)) valid.set(documentKey(ref), ref);
  }
  return [...valid.values()];
}

export function sceneDocument(sceneId: string): DocumentRef {
  return { kind: "scene", id: sceneId, sceneId };
}
