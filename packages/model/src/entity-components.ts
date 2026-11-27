import type { Entity } from "./index";

export const componentNames = [
  "transform",
  "visual",
  "body",
  "navigation",
  "light",
  "animator",
  "particles",
  "camera",
  "tileLayers",
  "audio",
  "blueprints",
] as const;
export type ComponentName = (typeof componentNames)[number];
type RegisteredComponent = {
  key: ComponentName;
  name: string;
  present(entity: Entity): boolean;
};
export const entityComponents: readonly RegisteredComponent[] = [
  { key: "transform", name: "Transform", present: () => true },
  { key: "visual", name: "Visual", present: (entity) => !!entity.visual },
  { key: "body", name: "Physics body", present: (entity) => !!entity.body },
  {
    key: "navigation",
    name: "Navigation agent",
    present: (entity) => !!entity.navigation,
  },
  { key: "light", name: "Point light", present: (entity) => !!entity.light },
  { key: "animator", name: "Animator", present: (entity) => !!entity.animator },
  {
    key: "particles",
    name: "Particle emitter",
    present: (entity) => !!entity.particles,
  },
  { key: "camera", name: "Camera", present: (entity) => !!entity.camera },
  {
    key: "tileLayers",
    name: "Tile layers",
    present: (entity) => !!entity.tileLayers?.length,
  },
  { key: "audio", name: "Audio source", present: (entity) => !!entity.audio },
  {
    key: "blueprints",
    name: "Blueprint behaviours",
    present: (entity) => !!entity.blueprintId || !!entity.attachments?.length,
  },
];
