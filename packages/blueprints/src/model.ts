import { z } from "zod";

const id = z.string().min(1).max(100);
const text = z.string().max(300);
export const valueType = z.enum([
  "number",
  "boolean",
  "string",
  "vector",
  "entity",
  "asset",
  "enum",
  "record",
]);
export type ValueType = z.infer<typeof valueType>;
export const resultType = z.union([valueType, z.literal("void")]);
const vector = z.object({
  kind: z.literal("vector"),
  x: z.number(),
  y: z.number(),
});
const entity = z.object({ kind: z.literal("entity"), id: text });
const asset = z.object({ kind: z.literal("asset"), id: text });
const enumValue = z.object({
  kind: z.literal("enum"),
  enumId: text,
  key: text,
});
export const scalarSchema = z.union([
  z.number(),
  z.boolean(),
  text,
  vector,
  entity,
  asset,
  enumValue,
]);
const record = z.object({
  kind: z.literal("record"),
  schema: text,
  fields: z.record(id, scalarSchema),
});
export const blueprintValueSchema = z.union([scalarSchema, record]);
const value = blueprintValueSchema;
export type Value = z.infer<typeof value>;
export type Scalar = z.infer<typeof scalarSchema>;
export const propertySchema = z.enum([
  "x",
  "y",
  "rotation",
  "alpha",
  "visible",
  "text",
]);
export type Property = z.infer<typeof propertySchema>;
export const propertyTypes: Record<Property, ValueType> = {
  x: "number",
  y: "number",
  rotation: "number",
  alpha: "number",
  visible: "boolean",
  text: "string",
};
export const binaryOperators = z.enum([
  "+",
  "-",
  "*",
  "/",
  "%",
  "==",
  "!=",
  "<",
  ">",
  "<=",
  ">=",
  "and",
  "or",
]);
export type Binary = z.infer<typeof binaryOperators>;
export const dataSourceSchema = z.enum([
  "global",
  "sheet",
  "resource",
  "translation",
  "locale",
  "slot",
]);
export type DataSource = z.infer<typeof dataSourceSchema>;
export interface DataSymbols {
  readType(source: DataSource, id: string): ValueType | undefined;
  writeType(id: string): ValueType | undefined;
  fields(
    source: DataSource,
    id: string,
  ): ReadonlyMap<string, ValueType> | undefined;
  hasSlot(id: string): boolean;
  hasLocale(id: string): boolean;
}

export type Expression =
  | { kind: "literal"; value: Value }
  | { kind: "variable" | "input"; id: string }
  | { kind: "binary"; op: Binary; left: Expression; right: Expression }
  | {
      kind: "unary";
      op: "not" | "negate" | "abs" | "floor" | "round" | "sqrt";
      value: Expression;
    }
  | { kind: "property"; property: Property; target?: Expression }
  | {
      kind: "runtimeRead";
      member: string;
      target?: Expression;
      args?: Record<string, Expression>;
    }
  | { kind: "exists"; reference: Expression }
  | { kind: "toText"; value: Expression }
  | { kind: "vector"; x: Expression; y: Expression }
  | { kind: "component"; vector: Expression; axis: "x" | "y" }
  | {
      kind: "field";
      record: Expression;
      key: string;
      type: Exclude<ValueType, "record">;
    }
  | {
      kind: "extension";
      extensionId: string;
      functionId: string;
      args: Record<string, Expression>;
    }
  | { kind: "query"; query: "self" | "parent" | "scene" }
  | {
      kind: "data";
      source: DataSource;
      id: string;
      type: ValueType;
      key?: Expression;
    };
export const expressionSchema: z.ZodType<Expression> = z.lazy(() =>
  z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("runtimeRead"),
      member: id,
      target: expressionSchema.optional(),
      args: z.record(id, expressionSchema).optional(),
    }),
    z.object({ kind: z.literal("literal"), value }),
    z.object({ kind: z.literal("variable"), id }),
    z.object({ kind: z.literal("input"), id }),
    z.object({
      kind: z.literal("binary"),
      op: binaryOperators,
      left: expressionSchema,
      right: expressionSchema,
    }),
    z.object({
      kind: z.literal("unary"),
      op: z.enum(["not", "negate", "abs", "floor", "round", "sqrt"]),
      value: expressionSchema,
    }),
    z.object({
      kind: z.literal("property"),
      property: propertySchema,
      target: expressionSchema.optional(),
    }),
    z.object({ kind: z.literal("exists"), reference: expressionSchema }),
    z.object({ kind: z.literal("toText"), value: expressionSchema }),
    z.object({
      kind: z.literal("vector"),
      x: expressionSchema,
      y: expressionSchema,
    }),
    z.object({
      kind: z.literal("component"),
      vector: expressionSchema,
      axis: z.enum(["x", "y"]),
    }),
    z.object({
      kind: z.literal("field"),
      record: expressionSchema,
      key: text,
      type: valueType.exclude(["record"]),
    }),
    z.object({
      kind: z.literal("data"),
      source: dataSourceSchema,
      id: text,
      type: valueType,
      key: expressionSchema.optional(),
    }),
    z.object({
      kind: z.literal("extension"),
      extensionId: id,
      functionId: id,
      args: z
        .record(id, expressionSchema)
        .refine(
          (args) => Object.keys(args).length <= 8,
          "Expected at most eight arguments.",
        ),
    }),
    z.object({
      kind: z.literal("query"),
      query: z.enum(["self", "parent", "scene"]),
    }),
  ]),
);
export const motionPropertySchema = z.enum([
  "x",
  "y",
  "rotation",
  "alpha",
  "scaleX",
  "scaleY",
]);
export const easingSchema = z.enum(["linear", "step", "in", "out", "in-out"]);
export type MotionProperty = z.infer<typeof motionPropertySchema>;
export type Easing = z.infer<typeof easingSchema>;
export type EffectCommand =
  | { kind: "animationParameter"; parameterId: string; value: number }
  | { kind: "timeline"; timelineId: string; playing: boolean }
  | {
      kind: "tween";
      property: MotionProperty;
      value: number;
      seconds: number;
      ease: Easing;
    }
  | { kind: "particles"; operation: "burst" | "start" | "stop" }
  | { kind: "sound"; soundId: string; playing: boolean };

export const sceneOperationSchema = z.enum([
  "change",
  "add",
  "unload",
  "reload",
  "preload",
]);
export type SceneOperation = z.infer<typeof sceneOperationSchema>;

export const screenActionSchema = z.enum([
  "show",
  "hide",
  "push",
  "pop",
  "replace",
  "move",
  "theme",
]);
export type ScreenAction = z.infer<typeof screenActionSchema>;

export const uiPropertySchema = z.enum([
  "text",
  "visible",
  "enabled",
  "value",
  "focus",
]);
export const uiValueTypeSchema = z.enum(["string", "boolean", "number"]);
export type UiProperty = z.infer<typeof uiPropertySchema>;

type BlockData =
  | {
      kind: "runtimeWrite";
      member: string;
      target?: Expression;
      value: Expression;
    }
  | {
      kind: "runtimeAction";
      member: string;
      target?: Expression;
      args: Record<string, Expression>;
      result?: string;
    }
  | { kind: "set"; variable: string; value: Expression }
  | { kind: "let"; name: string; type: ValueType; value: Expression }
  | { kind: "if"; condition: Expression; then: Block[]; else: Block[] }
  | { kind: "repeat"; count: Expression; body: Block[] }
  | { kind: "while"; condition: Expression; body: Block[] }
  | { kind: "break" | "continue" }
  | { kind: "move"; x: Expression; y: Expression }
  | {
      kind: "property";
      property: Property;
      value: Expression;
      target?: Expression;
    }
  | { kind: "animate"; clip: string }
  | { kind: "animationParameter"; parameterId: string; value: Expression }
  | { kind: "timeline"; timelineId: string; playing: boolean }
  | {
      kind: "tween";
      property: MotionProperty;
      value: Expression;
      seconds: Expression;
      ease: Easing;
    }
  | { kind: "particles"; operation: "burst" | "start" | "stop" }
  | { kind: "sound"; soundId: string; playing: boolean }
  | {
      kind: "sceneFlow";
      operation: SceneOperation;
      target: Expression;
      route: boolean;
    }
  | { kind: "writeGlobal"; globalId: string; value: Expression }
  | { kind: "saveSlot"; slotId: string; operation: "save" | "load" }
  | { kind: "language"; locale: string }
  | {
      kind: "screen";
      action: ScreenAction;
      target: Expression;
      layerId?: string;
    }
  | {
      kind: "ui";
      widgetId: string;
      screenId?: string;
      property: UiProperty;
      valueType?: z.infer<typeof uiValueTypeSchema>;
      value?: Expression;
    }
  | { kind: "log"; value: Expression }
  | {
      kind: "call";
      functionId: string;
      args: Record<string, Expression>;
      result?: string;
    }
  | { kind: "return"; value?: Expression }
  | { kind: "emit"; signalId: string; value?: Expression }
  | { kind: "wait"; seconds: Expression };
export type Block = { id: string } & BlockData;
const blocks = () => z.array(blockSchema).max(500);
const blockSchema: z.ZodType<Block> = z.lazy(() =>
  z.discriminatedUnion("kind", [
    z.object({
      id,
      kind: z.literal("runtimeWrite"),
      member: id,
      target: expressionSchema.optional(),
      value: expressionSchema,
    }),
    z.object({
      id,
      kind: z.literal("runtimeAction"),
      member: id,
      target: expressionSchema.optional(),
      args: z.record(id, expressionSchema),
      result: id.optional(),
    }),
    z.object({
      id,
      kind: z.literal("set"),
      variable: id,
      value: expressionSchema,
    }),
    z.object({
      id,
      kind: z.literal("let"),
      name: id,
      type: valueType,
      value: expressionSchema,
    }),
    z.object({
      id,
      kind: z.literal("if"),
      condition: expressionSchema,
      then: blocks(),
      else: blocks(),
    }),
    z.object({
      id,
      kind: z.literal("repeat"),
      count: expressionSchema,
      body: blocks(),
    }),
    z.object({
      id,
      kind: z.literal("while"),
      condition: expressionSchema,
      body: blocks(),
    }),
    z.object({ id, kind: z.literal("break") }),
    z.object({ id, kind: z.literal("continue") }),
    z.object({
      id,
      kind: z.literal("move"),
      x: expressionSchema,
      y: expressionSchema,
    }),
    z.object({
      id,
      kind: z.literal("property"),
      property: propertySchema,
      value: expressionSchema,
      target: expressionSchema.optional(),
    }),
    z.object({ id, kind: z.literal("animate"), clip: text }),
    z.object({
      id,
      kind: z.literal("animationParameter"),
      parameterId: id,
      value: expressionSchema,
    }),
    z.object({
      id,
      kind: z.literal("timeline"),
      timelineId: id,
      playing: z.boolean(),
    }),
    z.object({
      id,
      kind: z.literal("tween"),
      property: motionPropertySchema,
      value: expressionSchema,
      seconds: expressionSchema,
      ease: easingSchema,
    }),
    z.object({
      id,
      kind: z.literal("particles"),
      operation: z.enum(["burst", "start", "stop"]),
    }),
    z.object({
      id,
      kind: z.literal("sound"),
      soundId: id,
      playing: z.boolean(),
    }),
    z.object({
      id,
      kind: z.literal("writeGlobal"),
      globalId: id,
      value: expressionSchema,
    }),
    z.object({
      id,
      kind: z.literal("saveSlot"),
      slotId: id,
      operation: z.enum(["save", "load"]),
    }),
    z.object({ id, kind: z.literal("language"), locale: text }),
    z.object({
      id,
      kind: z.literal("screen"),
      action: screenActionSchema,
      target: expressionSchema,
      layerId: id.optional(),
    }),
    z.object({
      id,
      kind: z.literal("sceneFlow"),
      operation: sceneOperationSchema,
      target: expressionSchema,
      route: z.boolean(),
    }),
    z.object({
      id,
      kind: z.literal("ui"),
      widgetId: id,
      screenId: id.optional(),
      property: uiPropertySchema,
      valueType: uiValueTypeSchema.optional(),
      value: expressionSchema.optional(),
    }),
    z.object({ id, kind: z.literal("log"), value: expressionSchema }),
    z.object({
      id,
      kind: z.literal("call"),
      functionId: id,
      args: z.record(id, expressionSchema),
      result: id.optional(),
    }),
    z.object({
      id,
      kind: z.literal("return"),
      value: expressionSchema.optional(),
    }),
    z.object({
      id,
      kind: z.literal("emit"),
      signalId: id,
      value: expressionSchema.optional(),
    }),
    z.object({ id, kind: z.literal("wait"), seconds: expressionSchema }),
  ]),
);
export const signalSchema = z.object({ id, name: id, type: resultType });
const parameterSchema = z.object({ id, name: id, type: valueType });
const functionSchema = z.object({
  id,
  name: id,
  parameters: z.array(parameterSchema).max(32),
  returns: resultType,
  blocks: blocks(),
});
const eventSchema = z.object({
  id,
  kind: z.enum(["start", "update", "signal", "runtime"]),
  signalId: id.optional(),
  blocks: blocks(),
});
export const blueprintDependencies = z.enum([
  "visual",
  "body",
  "navigation",
  "light",
  "animator",
  "particles",
  "camera",
  "tileLayers",
  "audio",
]);
export const blueprintSchema = z.object({
  version: z.union([z.literal(1), z.literal(2)]),
  id,
  name: id,
  variables: z
    .array(
      parameterSchema.extend({
        initial: value,
        exposed: z.boolean().optional(),
      }),
    )
    .max(500),
  events: z.array(eventSchema).max(80),
  functions: z.array(functionSchema).max(100).optional(),
  requires: z.array(blueprintDependencies).max(9).optional(),
});
export type Blueprint = z.infer<typeof blueprintSchema>;
export type Signal = z.infer<typeof signalSchema>;
export type BlueprintFunction = z.infer<typeof functionSchema>;
export type BlueprintEvent = z.infer<typeof eventSchema>;
export type EventKind = BlueprintEvent["kind"];
export type Variable = z.infer<typeof parameterSchema>;
export type Diagnostic = { blockId: string; message: string };
export type Branch = "body" | "then" | "else";

export function children(block: Block): { branch: Branch; blocks: Block[] }[] {
  if (block.kind === "if")
    return [
      { branch: "then", blocks: block.then },
      { branch: "else", blocks: block.else },
    ];
  if (block.kind === "repeat" || block.kind === "while")
    return [{ branch: "body", blocks: block.body }];
  return [];
}
export const literal = (value: Value): Expression => ({
  kind: "literal",
  value,
});
export function typeOf(value: Value): ValueType {
  if (typeof value === "object") return value.kind;
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  return "string";
}
export const defaultValue: Record<ValueType, Value> = {
  number: 0,
  boolean: false,
  string: "",
  vector: { kind: "vector", x: 0, y: 0 },
  entity: { kind: "entity", id: "" },
  asset: { kind: "asset", id: "" },
  enum: { kind: "enum", enumId: "", key: "" },
  record: { kind: "record", schema: "", fields: {} },
};
export function displayValue(value: Value): string {
  if (typeof value !== "object") return String(value);
  switch (value.kind) {
    case "vector":
      return "(" + value.x + ", " + value.y + ")";
    case "entity":
    case "asset":
      return value.id || "None";
    case "enum":
      return [value.enumId, value.key].filter(Boolean).join(".") || "None";
    case "record":
      return (
        (value.schema || "Record") +
        " · " +
        Object.keys(value.fields).length +
        " fields"
      );
  }
}
