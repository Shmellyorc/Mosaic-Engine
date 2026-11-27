import { z } from "zod";
import type { ValueType } from "@mosaic/blueprints";

const id = z.string().min(1).max(100);
const color = z.string().regex(/^#[0-9a-f]{6}$/i);
const fraction = z.number().min(0).max(1);
const offset = z.number().min(-8192).max(8192);
const size = z.number().min(1).max(8192);
const align = z.enum(["start", "center", "end", "stretch"]);
export const widgetKind = z.enum([
  "container",
  "text",
  "image",
  "button",
  "toggle",
  "slider",
  "input",
  "progress",
]);
export const bindingSchema = z.discriminatedUnion("source", [
  z.object({ source: z.literal("global"), id }),
  z.object({ source: z.literal("translation"), id }),
  z.object({ source: z.literal("resource"), id, field: id }),
  z.object({ source: z.literal("sheet"), id, rowId: id, field: id }),
]);
export const widgetSchema = z.object({
  id,
  name: z.string().trim().min(1).max(100),
  kind: widgetKind,
  parent: id.nullable(),
  rect: z
    .object({
      left: fraction,
      top: fraction,
      right: fraction,
      bottom: fraction,
      x: offset,
      y: offset,
      endX: offset,
      endY: offset,
      width: size,
      height: size,
      pivotX: fraction,
      pivotY: fraction,
      grow: z.number().min(0).max(10),
    })
    .refine(
      ({ left, top, right, bottom }) => left <= right && top <= bottom,
      "Anchor start must be before or equal to its end.",
    ),
  visible: z.boolean(),
  enabled: z.boolean(),
  text: z.string().max(300),
  accessibleName: z.string().max(160),
  image: id.optional(),
  fit: z.enum(["contain", "cover", "fill"]).optional(),
  value: z.union([z.boolean(), z.number(), z.string().max(300)]).optional(),
  range: z
    .object({
      min: z.number().min(-1e6).max(1e6),
      max: z.number().min(-1e6).max(1e6),
      step: z.number().min(0.001).max(1e6),
    })
    .refine(
      ({ min, max }) => max > min,
      "The maximum must be greater than the minimum.",
    )
    .optional(),
  layout: z
    .object({
      mode: z.enum(["free", "row", "column"]),
      gap: z.number().min(0).max(256),
      padding: z.number().min(0).max(256),
      align,
      justify: z.enum(["start", "center", "end", "space-between"]),
      clip: z.boolean(),
    })
    .optional(),
  style: z.object({
    background: color.nullable(),
    color,
    border: color,
    borderWidth: z.number().min(0).max(16),
    radius: z.number().min(0).max(256),
    fontSize: z.number().min(6).max(192),
    align: z.enum(["left", "center", "right"]),
    accent: color,
  }),
  textBinding: bindingSchema.optional(),
  valueBinding: bindingSchema.optional(),
  writeBack: z.boolean().optional(),
  signal: id.optional(),
  navigation: z
    .object({
      up: id.optional(),
      down: id.optional(),
      left: id.optional(),
      right: id.optional(),
    })
    .optional(),
});
export const uiSchema = z.object({
  widgets: z.array(widgetSchema).max(1000),
  initialFocus: id.optional(),
});
export type Widget = z.infer<typeof widgetSchema>;
export type WidgetKind = Widget["kind"];
export type WidgetBinding = z.infer<typeof bindingSchema>;
export type UiDocument = z.infer<typeof uiSchema>;
export type WidgetValue = string | number | boolean;
export type Direction = keyof NonNullable<Widget["navigation"]>;
export const directions: Direction[] = ["up", "down", "left", "right"];

export function widgetValueType(
  kind: WidgetKind,
): "boolean" | "number" | "string" | undefined {
  if (kind === "slider" || kind === "progress") return "number";
  if (kind === "toggle") return "boolean";
  if (kind === "input") return "string";
}
export function interactiveWidget(kind: WidgetKind) {
  return (
    kind === "button" ||
    kind === "toggle" ||
    kind === "slider" ||
    kind === "input"
  );
}
export function widgetSignalType(
  kind: WidgetKind,
): ValueType | "void" | undefined {
  if (kind === "button") return "void";
  if (interactiveWidget(kind)) return widgetValueType(kind);
}
export const widgetRange = (widget: Widget) =>
  widget.range ?? { min: 0, max: 100, step: 1 };
export function normalizeWidgetValue(
  widget: Widget,
  value: WidgetValue,
): WidgetValue {
  const type = widgetValueType(widget.kind);
  if (
    !type ||
    typeof value !== type ||
    (typeof value === "number" && !Number.isFinite(value))
  )
    throw Error(`"${widget.name}" requires a ${type ?? "supported"} value.`);
  if (typeof value === "number") {
    const { min, max, step } = widgetRange(widget);
    const bounded = Math.min(max, Math.max(min, value));
    if (widget.kind === "progress") return bounded;
    const units = Math.min(
      Math.round((bounded - min) / step),
      Math.floor((max - min) / step + 1e-9),
    );
    return Number((min + units * step).toPrecision(12));
  }
  return typeof value === "string" ? value.slice(0, 300) : value;
}

export function createWidget(
  id: string,
  kind: WidgetKind,
  parent: string | null = null,
): Widget {
  const isContainer = kind === "container";
  const interactive = interactiveWidget(kind);
  const value =
    kind === "toggle"
      ? false
      : kind === "input"
        ? ""
        : kind === "slider" || kind === "progress"
          ? 35
          : undefined;
  const label = kind.charAt(0).toUpperCase() + kind.slice(1);
  return {
    id,
    kind,
    name: label,
    parent,
    visible: true,
    enabled: true,
    text: label,
    accessibleName: "",
    rect: {
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
      x: 24,
      y: 24,
      endX: 24,
      endY: 24,
      width: isContainer ? 240 : 148,
      height: isContainer ? 200 : kind === "image" ? 96 : 34,
      pivotX: 0,
      pivotY: 0,
      grow: 0,
    },
    style: {
      background: isContainer ? "#211b36" : interactive ? "#453365" : null,
      color: "#f5edff",
      border: "#9070c5",
      borderWidth: isContainer || interactive ? 1 : 0,
      radius: isContainer ? 10 : 6,
      fontSize: 15,
      align: kind === "button" ? "center" : "left",
      accent: "#c09afa",
    },
    ...(isContainer
      ? {
          layout: {
            mode: "free",
            gap: 8,
            padding: 12,
            align: "stretch",
            justify: "start",
            clip: false,
          },
        }
      : {}),
    ...(value !== undefined ? { value } : {}),
  };
}

export function validateUi(ui: UiDocument, assets: Set<string>) {
  const nodes = new Map(ui.widgets.map((widget) => [widget.id, widget]));
  if (nodes.size !== ui.widgets.length) throw Error("Duplicate UI widget ID.");
  const focusable = (id: string) => {
    const widget = nodes.get(id);
    return widget && interactiveWidget(widget.kind);
  };
  if (ui.initialFocus && !focusable(ui.initialFocus))
    throw Error("Initial UI focus must target an interactive widget.");
  for (const widget of ui.widgets) {
    if (
      widget.parent !== null &&
      nodes.get(widget.parent)?.kind !== "container"
    )
      throw Error(`"${widget.name}" needs a valid UI container parent.`);
    if (widget.image && !assets.has(widget.image))
      throw Error(`"${widget.name}" references a missing UI image.`);
    if (widget.value !== undefined) normalizeWidgetValue(widget, widget.value);
    if (
      (widget.valueBinding || widget.writeBack) &&
      !widgetValueType(widget.kind)
    )
      throw Error(`"${widget.name}" has no bindable value.`);
    if (
      widget.writeBack &&
      (widget.valueBinding?.source !== "global" ||
        !interactiveWidget(widget.kind))
    )
      throw Error(
        `"${widget.name}" can write back only to a global from an interactive value.`,
      );
    if (widget.signal && !widgetSignalType(widget.kind))
      throw Error(`"${widget.name}" cannot emit an interaction event.`);
    for (const id of Object.values(widget.navigation ?? {}))
      if (id && (id === widget.id || !focusable(id)))
        throw Error(`"${widget.name}" has an invalid focus target.`);
    let parent = widget.parent;
    let depth = 0;
    while (parent) {
      if (parent === widget.id)
        throw Error("The UI hierarchy contains a cycle.");
      if (++depth > 32)
        throw Error("UI hierarchies support up to 32 levels of nesting.");
      parent = nodes.get(parent)?.parent ?? null;
    }
  }
}
