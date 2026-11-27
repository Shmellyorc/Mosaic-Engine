import type { ValueType } from "./model";

type Bounds = readonly [number, number, "integer"?];
export type RuntimeField = {
  id: string;
  group: string;
  name: string;
  type: ValueType;
  component?: string;
  key?: string;
  writable?: boolean;
  bounds?: Bounds;
  options?: readonly string[];
  format?: "color" | "id" | "text";
};
type FieldInfo = Omit<RuntimeField, "id" | "group" | "component" | "key">;
const number = (
  name: string,
  min: number,
  max: number,
  integer?: "integer",
): FieldInfo => ({
  name,
  type: "number",
  writable: true,
  bounds: [min, max, integer],
});
const flag = (name: string, writable = true): FieldInfo => ({
  name,
  type: "boolean",
  writable,
});
const text = (
  name: string,
  format: RuntimeField["format"] = "text",
  writable = true,
): FieldInfo => ({ name, type: "string", writable, format });
const read = (name: string, type: ValueType): FieldInfo => ({ name, type });
const pick = (
  name: string,
  options: readonly string[],
  writable = true,
): FieldInfo => ({ name, type: "string", options, writable });
const p = 1e7;
function fields(
  group: string,
  component: string,
  list: Record<string, FieldInfo>,
): RuntimeField[] {
  return Object.entries(list).map(([key, value]) => ({
    id: component + "." + key,
    group,
    component,
    key,
    ...value,
  }));
}
export const runtimeFields: readonly RuntimeField[] = [
  ...fields("Entities", "entity", {
    id: text("ID", "id", false),
    name: text("Name"),
    visible: flag("Visible"),
    parentId: read("Parent", "entity"),
    layerId: text("Render layer ID", "id", false),
    order: number("Render order", -p, p, "integer"),
    persistent: flag("Persistent", false),
    prefabAsset: read("Prefab asset", "asset"),
    prefabInstance: text("Prefab instance ID", "id", false),
    prefabSource: text("Prefab member ID", "id", false),
    blueprintId: read("Primary Blueprint", "asset"),
    behaviorTree: read("Behavior Tree", "asset"),
    attachmentCount: read("Blueprint attachment count", "number"),
    worldPosition: read("World position", "vector"),
  }),
  ...fields("Transforms", "transform", {
    x: number("X", -p, p),
    y: number("Y", -p, p),
    rotation: number("Rotation", -p, p),
    scaleX: number("Scale X", -100, 100),
    scaleY: number("Scale Y", -100, 100),
    width: number("Width", 1, 8192, "integer"),
    height: number("Height", 1, 8192, "integer"),
    alpha: number("Opacity", 0, 1),
  }),
  ...fields("Sprites", "sprite", {
    assetId: { name: "Image", type: "asset", writable: true },
    frameX: number("Frame X", 0, p, "integer"),
    frameY: number("Frame Y", 0, p, "integer"),
    frameWidth: number("Frame width", 1, 8192, "integer"),
    frameHeight: number("Frame height", 1, 8192, "integer"),
    hasFrame: flag("Has source frame", false),
  }),
  ...fields("Visuals", "visual", {
    kind: read("Visual kind", "string"),
    color: text("Color", "color"),
    text: text("Text"),
    size: number("Font size", 6, 192, "integer"),
    screen: flag("Screen space"),
  }),
  ...fields("Physics", "body", {
    kind: pick("Body kind", ["static", "kinematic", "dynamic", "sensor"]),
    width: number("Body width", 1, 8192, "integer"),
    height: number("Body height", 1, 8192, "integer"),
    offsetX: number("Collider offset X", -p, p),
    offsetY: number("Collider offset Y", -p, p),
    velocityX: number("Velocity X", -10000, 10000),
    velocityY: number("Velocity Y", -10000, 10000),
    gravityScale: number("Gravity scale", -8, 8),
    bounce: number("Bounce", 0, 1),
    enterSignal: text("Contact entered signal ID", "id", false),
    exitSignal: text("Contact exited signal ID", "id", false),
  }),
  ...fields("Navigation", "navigation", {
    x: number("Goal X", -p, p),
    y: number("Goal Y", -p, p),
    target: { name: "Target entity", type: "entity", writable: true },
    speed: number("Speed", 1, 1000),
    enabled: flag("Enabled"),
  }),
  ...fields("Lighting", "light", {
    enabled: flag("Enabled"),
    radius: number("Radius", 1, 8192),
    intensity: number("Intensity", 0, 1),
    color: text("Light color", "color"),
  }),
  ...fields("Cameras", "camera", {
    enabled: flag("Enabled"),
    zoom: number("Zoom", 0.05, 8),
    damping: number("Damping", 0, 60),
  }),
  ...fields("Particles", "particles", {
    enabled: flag("Emitting"),
    rate: number("Rate", 0, 500),
    burst: number("Burst count", 1, 256, "integer"),
    limit: number("Limit", 1, 1024, "integer"),
    lifetime: number("Lifetime", 0.05, 20),
    size: number("Start size", 1, 256),
    endSize: number("End size", 0, 256),
    angle: number("Angle", -360, 360),
    spread: number("Spread", 0, 360),
    speed: number("Speed", 0, 4000),
    gravity: number("Gravity", -4000, 4000),
    color: text("Particle color", "color"),
    seed: number("Random seed", 1, 0xffffffff, "integer"),
    active: read("Live count", "number"),
  }),
  ...fields("Animation", "animator", {
    entry: text("Entry state ID", "id", false),
    state: read("Current state ID", "string"),
    clip: read("Current clip", "string"),
    elapsed: read("Clip time", "number"),
    clipCount: read("Clip count", "number"),
  }),
  ...fields("Audio", "audio", {
    soundId: { name: "Sound", type: "asset", writable: true },
    autoplay: flag("Autoplay at scene entry", false),
  }),
];

export type RuntimeArgument = {
  name: string;
  type: ValueType;
  default?: string | number | boolean;
  choices?: readonly string[];
  reference?: string;
};
export type RuntimeOperation = {
  id: string;
  group: string;
  name: string;
  scope: "entity" | "scene";
  args: Readonly<Record<string, RuntimeArgument>>;
  result?: ValueType;
};
const arg = (
  name: string,
  type: ValueType,
  extra: Omit<RuntimeArgument, "name" | "type"> = {},
): RuntimeArgument => ({ name, type, ...extra });
const id = (name: string, reference?: string) =>
  arg(name, "string", { reference });
const n = (name: string, fallback = 0) =>
  arg(name, "number", { default: fallback });
const b = (name: string, fallback = true) =>
  arg(name, "boolean", { default: fallback });
const coordinates = {
  layer: id("Tile layer", "tileLayer"),
  x: n("Cell X"),
  y: n("Cell Y"),
};
const widget = {
  screen: id("Screen", "screen"),
  widget: id("Widget", "widget"),
};
const action = (
  id: string,
  group: string,
  name: string,
  scope: RuntimeOperation["scope"],
  args: RuntimeOperation["args"],
  result?: ValueType,
): RuntimeOperation => ({ id, group, name, scope, args, result });
export const runtimeOperations: readonly RuntimeOperation[] = [
  action(
    "entity.component",
    "Entities",
    "Has component",
    "entity",
    { component: id("Component", "component") },
    "boolean",
  ),
  action(
    "entity.find",
    "Entities",
    "Find entity by name",
    "scene",
    { name: id("Name") },
    "entity",
  ),
  action(
    "entity.spawn",
    "Entities",
    "Instantiate prefab",
    "scene",
    {
      prefab: arg("Prefab", "asset", { reference: "prefab" }),
      x: n("X"),
      y: n("Y"),
    },
    "entity",
  ),
  action("entity.destroy", "Entities", "Destroy entity tree", "entity", {}),
  action("tile.get", "Tilemaps", "Read tile", "scene", coordinates, "record"),
  action("tile.paint", "Tilemaps", "Paint tile", "scene", {
    ...coordinates,
    color: arg("Color", "string", { default: "#68748a" }),
    solid: b("Solid", false),
    cost: n("Navigation cost", 1),
  }),
  action("tile.erase", "Tilemaps", "Erase tile", "scene", coordinates),
  action(
    "tile.layer",
    "Tilemaps",
    "Read tile layer",
    "scene",
    { layer: coordinates.layer },
    "record",
  ),
  action("tile.layerSet", "Tilemaps", "Set tile layer", "scene", {
    layer: coordinates.layer,
    visible: b("Visible"),
    collision: b("Collision", false),
    navigation: b("Navigation", false),
    opacity: n("Opacity", 1),
  }),
  action("particles.control", "Particles", "Control target emitter", "entity", {
    operation: arg("Operation", "string", {
      choices: ["burst", "start", "stop"],
      default: "burst",
    }),
  }),
  action("physics.impulse", "Physics", "Apply impulse", "entity", {
    x: n("Velocity X"),
    y: n("Velocity Y"),
  }),
  action("nav.goal", "Navigation", "Set world goal", "entity", {
    x: n("X"),
    y: n("Y"),
  }),
  action(
    "nav.remaining",
    "Navigation",
    "Remaining path points",
    "entity",
    {},
    "number",
  ),
  action("camera.view", "Cameras", "Read active camera", "scene", {}, "record"),
  action("camera.set", "Cameras", "Set scene camera", "scene", {
    x: n("X"),
    y: n("Y"),
    zoom: n("Zoom", 1),
  }),
  action(
    "lighting.settings",
    "Lighting",
    "Read scene lighting",
    "scene",
    {},
    "record",
  ),
  action("lighting.set", "Lighting", "Set scene lighting", "scene", {
    enabled: b("Enabled"),
    ambient: arg("Ambient color", "string", { default: "#ffffff" }),
  }),
  action(
    "anim.parameter",
    "Animation",
    "Read animation parameter",
    "entity",
    { parameter: id("Parameter", "parameter") },
    "number",
  ),
  action("anim.play", "Animation", "Play target clip", "entity", {
    clip: id("Clip", "clip"),
  }),
  action("motion.seek", "Animation", "Seek timeline", "scene", {
    timeline: id("Timeline", "timeline"),
    time: n("Seconds"),
  }),
  action(
    "motion.status",
    "Animation",
    "Read timeline",
    "scene",
    { timeline: id("Timeline", "timeline") },
    "record",
  ),
  action("audio.play", "Audio", "Play sound on target", "entity", {
    sound: arg("Sound", "asset", { reference: "sound" }),
    playing: b("Playing"),
  }),
  action(
    "audio.active",
    "Audio",
    "Is playback requested",
    "scene",
    { sound: arg("Sound", "asset", { reference: "sound" }) },
    "boolean",
  ),
  ...(["number", "boolean", "string"] as const).map((type) =>
    action(
      "ui.value." + type,
      "Interface",
      "Read " + type + " widget value",
      "scene",
      widget,
      type,
    ),
  ),
  action(
    "audio.clip",
    "Audio",
    "Read sound settings",
    "scene",
    { sound: arg("Sound", "asset", { reference: "sound" }) },
    "record",
  ),
  action("sprite.clearFrame", "Sprites", "Clear source frame", "entity", {}),
  action("ui.get", "Interface", "Read widget", "scene", widget, "record"),
  action(
    "ui.screen",
    "Interface",
    "Is screen open",
    "scene",
    { screen: widget.screen },
    "boolean",
  ),
  action(
    "scene.status",
    "Scene Flow",
    "Read scene state",
    "scene",
    { scene: id("Scene", "scene") },
    "record",
  ),
  action(
    "tree.read",
    "Behavior Trees",
    "Read blackboard key",
    "entity",
    { key: id("Key", "blackboard") },
    "record",
  ),
  ...(
    [
      "number",
      "boolean",
      "string",
      "entity",
      "asset",
      "vector",
      "enum",
      "record",
    ] as const
  ).map((type) =>
    action(
      "tree.write." + type,
      "Behavior Trees",
      "Write " + type + " blackboard key",
      "entity",
      { key: id("Key", "blackboard"), value: arg("Value", type) },
    ),
  ),
  action(
    "sprite.frame",
    "Sprites",
    "Read rendered frame",
    "entity",
    {},
    "record",
  ),
  action(
    "camera.settings",
    "Cameras",
    "Read scene camera settings",
    "scene",
    {},
    "record",
  ),
  action("camera.follow", "Cameras", "Set camera follow", "scene", {
    target: arg("Follow entity", "entity"),
    offsetX: n("Offset X"),
    offsetY: n("Offset Y"),
    damping: n("Damping"),
  }),
  action(
    "physics.gravity",
    "Physics",
    "Read scene gravity",
    "scene",
    {},
    "vector",
  ),
  action("physics.setGravity", "Physics", "Set scene gravity", "scene", {
    x: n("Horizontal gravity"),
    y: n("Vertical gravity"),
  }),
  action(
    "audio.bus",
    "Audio",
    "Read mixer bus",
    "scene",
    { bus: id("Bus", "bus") },
    "record",
  ),
  action("audio.mix", "Audio", "Set mixer bus", "scene", {
    bus: id("Bus", "bus"),
    gain: n("Gain", 1),
    muted: b("Muted", false),
  }),
  action(
    "scene.settings",
    "Scene Flow",
    "Read scene settings",
    "scene",
    {},
    "record",
  ),
  action("scene.background", "Scene Flow", "Set scene background", "scene", {
    color: arg("Color", "string", { default: "#15172b" }),
  }),
  action(
    "tile.terrain",
    "Tilemaps",
    "Read tile terrain",
    "scene",
    { layer: coordinates.layer, terrain: id("Terrain", "terrain") },
    "record",
  ),
  action("tile.paintTerrain", "Tilemaps", "Paint terrain tile", "scene", {
    ...coordinates,
    terrain: id("Terrain", "terrain"),
  }),
  action(
    "anim.setParameter",
    "Animation",
    "Set target animation parameter",
    "entity",
    { parameter: id("Parameter", "parameter"), value: n("Parameter value") },
  ),
  ...(
    [
      "number",
      "boolean",
      "string",
      "entity",
      "asset",
      "vector",
      "enum",
      "record",
    ] as const
  ).map((type) =>
    action(
      "tree.read." + type,
      "Behavior Trees",
      "Read " + type + " blackboard key",
      "entity",
      { key: id("Key", "blackboard") },
      type,
    ),
  ),
  action(
    "input.key",
    "Input",
    "Is key held",
    "scene",
    { key: arg("Key code", "string", { default: "Space" }) },
    "boolean",
  ),
];
const fieldIndex = new Map(runtimeFields.map((field) => [field.id, field]));
const operationIndex = new Map(
  runtimeOperations.map((operation) => [operation.id, operation]),
);
export const runtimeField = (id: string) => fieldIndex.get(id);
export const runtimeOperation = (id: string) => operationIndex.get(id);

/** Context-sensitive groups that share the same field metadata in authoring. */
export const transformRuntimeFields = runtimeFields.filter(
  ({ component }) => component === "transform",
);

export const runtimeEvents = [
  { id: "scene.entered", name: "Scene Entered", type: "string" },
  { id: "scene.exited", name: "Scene Exited", type: "string" },
  { id: "scene.loaded", name: "Scene Loaded", type: "string" },
  { id: "scene.unloaded", name: "Scene Unloaded", type: "string" },
  { id: "entity.spawned", name: "Prefab Spawned", type: "entity" },
  { id: "entity.destroyed", name: "Entity Destroyed", type: "entity" },
  { id: "tile.changed", name: "Tile Changed", type: "vector" },
  { id: "screen.changed", name: "Screen Changed", type: "string" },
  { id: "physics.entered", name: "Contact Entered", type: "entity" },
  { id: "physics.exited", name: "Contact Exited", type: "entity" },
  { id: "input.pressed", name: "Key Pressed", type: "string" },
  { id: "input.released", name: "Key Released", type: "string" },
  { id: "anim.changed", name: "Animation State Changed", type: "string" },
  { id: "nav.arrived", name: "Navigation Arrived", type: "entity" },
] as const;
export const runtimeEvent = (id: string) =>
  runtimeEvents.find((event) => event.id === id);
export const runtimeEventChannel = (id: string) => "mosaic.runtime." + id;

export const runtimeRecordMembers: Readonly<
  Record<string, Readonly<Record<string, Exclude<ValueType, "record">>>>
> = {
  "tile.get": {
    exists: "boolean",
    color: "string",
    solid: "boolean",
    cost: "number",
    terrain: "string",
  },
  "tile.layer": {
    id: "string",
    name: "string",
    width: "number",
    height: "number",
    size: "number",
    visible: "boolean",
    opacity: "number",
    collision: "boolean",
    navigation: "boolean",
  },
  "tile.terrain": {
    id: "string",
    name: "string",
    color: "string",
    edge: "string",
    solid: "boolean",
    cost: "number",
    atlas: "asset",
    columns: "number",
    size: "number",
    first: "number",
  },
  "sprite.frame": {
    exists: "boolean",
    x: "number",
    y: "number",
    width: "number",
    height: "number",
  },
  "camera.view": { x: "number", y: "number", zoom: "number", follow: "entity" },
  "camera.settings": {
    x: "number",
    y: "number",
    zoom: "number",
    follow: "entity",
    offsetX: "number",
    offsetY: "number",
    damping: "number",
    deadWidth: "number",
    deadHeight: "number",
    bounded: "boolean",
    boundsX: "number",
    boundsY: "number",
    boundsWidth: "number",
    boundsHeight: "number",
  },
  "lighting.settings": { enabled: "boolean", ambient: "string" },
  "motion.status": {
    name: "string",
    playing: "boolean",
    elapsed: "number",
    duration: "number",
    loop: "boolean",
    autoplay: "boolean",
  },
  "audio.bus": { gain: "number", muted: "boolean" },
  "audio.clip": {
    name: "string",
    bus: "string",
    gain: "number",
    loop: "boolean",
  },
  "ui.get": {
    text: "string",
    visible: "boolean",
    enabled: "boolean",
    available: "boolean",
  },
  "scene.status": {
    id: "string",
    primary: "boolean",
    loaded: "boolean",
    preloaded: "boolean",
  },
  "scene.settings": {
    id: "string",
    name: "string",
    background: "string",
    width: "number",
    height: "number",
  },
};
