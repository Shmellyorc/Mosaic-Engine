import {
  literal,
  type Binary,
  type Block,
  type Blueprint,
  type BlueprintEvent,
  type BlueprintFunction,
  type Expression,
  type Property,
  type UiProperty,
} from "@mosaic/blueprints";
import {
  createCatalog,
  createEntity,
  createProject,
  createWidget,
  type Widget,
  type WidgetKind,
} from "@mosaic/model";
import panorama from "../../assets/ridge.png?inline";
import keeper from "../../assets/lantern.png?inline";
import { signalMixer } from "../signal-lab";

type Position = [x: number, y: number, width: number, height: number];
const frame = (i: number) => ({ x: i * 24, y: 0, w: 24, h: 24 });
export const variable = (id: string): Expression => ({ kind: "variable", id });
export const axis = (id: string): Expression => ({ kind: "input", id });
type Input = string | number | boolean | Expression;
export const value = (input: Input): Expression =>
  typeof input === "object" ? input : literal(input);
export const binary = (op: Binary, left: Input, right: Input): Expression => ({
  kind: "binary",
  op,
  left: value(left),
  right: value(right),
});
export const text = (expression: Expression): Expression => ({
  kind: "toText",
  value: expression,
});
export const math = (
  op: "floor" | "round" | "not",
  expression: Expression,
): Expression => ({
  kind: "unary",
  op,
  value: expression,
});
export const entityRef = (id: string) => literal({ kind: "entity", id });
export const globalNumber = (id: string): Expression => ({
  kind: "data",
  source: "global",
  id,
  type: "number",
});

export function builder(id: string, name: string) {
  let next = 0;
  const block = (data: OmitBlock): Block => ({
    ...data,
    id: `block-${++next}`,
  });
  const blueprint: Blueprint = {
    version: 2,
    id,
    name,
    variables: [],
    events: [],
    functions: [],
  };
  return {
    blueprint,
    block,
    event(kind: BlueprintEvent["kind"], blocks: Block[], signalId?: string) {
      blueprint.events.push({
        id: kind === "signal" ? "on-" + signalId : kind,
        kind,
        blocks,
        signalId,
      });
    },
    fn(
      id: string,
      name: string,
      blocks: Block[],
      parameters?: BlueprintFunction["parameters"],
    ) {
      blueprint.functions!.push({
        id,
        name,
        returns: "void",
        parameters: parameters ?? [],
        blocks,
      });
    },
    when(condition: Expression, then: Block[], otherwise: Block[] = []): Block {
      return block({ kind: "if", condition, then, else: otherwise });
    },
    set(variable: string, input: Input): Block {
      return block({ kind: "set", variable, value: value(input) });
    },
    property(property: Property, input: Input, target?: string): Block {
      return block({
        kind: "property",
        property,
        value: value(input),
        target: target ? entityRef(target) : undefined,
      });
    },
    ui(widgetId: string, property: UiProperty, input?: Input): Block {
      return block({
        kind: "ui",
        widgetId,
        property,
        value: input === undefined ? undefined : value(input),
      });
    },
    call(functionId: string, args: Record<string, Expression> = {}): Block {
      return block({ kind: "call", functionId, args });
    },
    chime() {
      return block({ kind: "sound", soundId: "signal-chime", playing: true });
    },
  };
}
type OmitId<T> = T extends unknown ? Omit<T, "id"> : never;
type OmitBlock = OmitId<Block>;

export function gameProject(id: string, name: string, recordName: string) {
  const project = createProject(name);
  project.id = id;
  project.startSceneId = id + "-scene";
  const [scene] = project.scenes;
  scene.id = project.startSceneId;
  scene.name = name;
  scene.layers = [
    { id: "background", name: "Backdrop", visible: true },
    { id: "ground", name: "Terrain", visible: true },
    { id: "actors", name: "Actors and effects", visible: true },
  ];
  project.assets = [
    { id: "ridge-art", name: "Ridge panorama", source: panorama },
  ];
  scene.entities = [
    {
      ...rectangle(
        "panorama",
        "Ridge panorama",
        [0, 0, 640, 360],
        "#24324d",
        "background",
      ),
      visual: { kind: "sprite", assetId: "ridge-art" },
    },
    {
      ...rectangle(
        "sky-shade",
        "Evening shade",
        [0, 0, 640, 360],
        "#101225",
        "background",
      ),
      order: 1,
    },
  ];
  scene.entities[1].transform.alpha = 0.52;
  project.mixer = signalMixer();
  const data = createCatalog();
  data.globals.push({
    id: "best",
    name: recordName,
    initial: 0,
    saved: true,
    constant: false,
  });
  data.saves.slots.push({ id: "records", name: "Personal Best" });
  project.data = data;
  return { project, scene, data };
}
export function rectangle(
  id: string,
  name: string,
  [x, y, width, height]: Position,
  color: string,
  layer = "actors",
) {
  const entity = createEntity(layer, name);
  entity.id = id;
  Object.assign(entity.transform, { x, y, width, height });
  entity.visual = { kind: "rect", color };
  return entity;
}
export function keeperSprite([x, y, width, height]: Position) {
  const actor = rectangle(
    "courier",
    "Courier",
    [x, y, width, height],
    "#f1c778",
  );
  actor.visual = { kind: "sprite", assetId: "keeper-art", frame: frame(0) };
  actor.clips = [
    {
      id: "idle",
      name: "Idle",
      fps: 2,
      loop: true,
      frames: [frame(0), frame(1)],
    },
    {
      id: "walk",
      name: "Walk",
      fps: 8,
      loop: true,
      frames: [frame(1), frame(2), frame(3), frame(2)],
    },
  ];
  return actor;
}
export const keeperAsset = {
  id: "keeper-art",
  name: "Courier spritesheet",
  source: keeper,
};

export function widget(
  id: string,
  kind: WidgetKind,
  label: string,
  [x, y, width, height]: Position,
  parent: string | null = null,
): Widget {
  const element = createWidget(id, kind, parent);
  element.name = label;
  element.text = label;
  Object.assign(element.rect, { x, y, width, height });
  return element;
}
export function centered(element: Widget, top = 0.5) {
  Object.assign(element.rect, {
    left: 0.5,
    right: 0.5,
    top,
    bottom: top,
    pivotX: 0.5,
    pivotY: top ? 0.5 : 0,
  });
  return element;
}
