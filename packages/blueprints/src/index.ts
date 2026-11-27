import { z } from "zod";

const identifier = z.string().min(1).max(100);
const text = z.string().max(300);
export const valueType = z.enum(["number", "boolean", "string"]);
export type ValueType = z.infer<typeof valueType>;
export type Value = number | boolean | string;
export type Binary =
  "+" | "-" | "*" | "/" | "==" | "!=" | "<" | ">" | "and" | "or";
export type Expression =
  | { kind: "literal"; value: Value }
  | { kind: "variable"; id: string }
  | { kind: "input"; id: string }
  | { kind: "binary"; op: Binary; left: Expression; right: Expression };

const valueSchema = z.union([z.number(), z.boolean(), text]);
export const expressionSchema: z.ZodType<Expression> = z.lazy(() =>
  z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("literal"), value: valueSchema }),
    z.object({ kind: z.literal("variable"), id: identifier }),
    z.object({ kind: z.literal("input"), id: identifier }),
    z.object({
      kind: z.literal("binary"),
      op: z.enum(["+", "-", "*", "/", "==", "!=", "<", ">", "and", "or"]),
      left: expressionSchema,
      right: expressionSchema,
    }),
  ]),
);
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
export type Block = { id: string } & (
  | { kind: "set"; variable: string; value: Expression }
  | { kind: "if"; condition: Expression; then: Block[]; else: Block[] }
  | { kind: "move"; x: Expression; y: Expression }
  | { kind: "property"; property: Property; value: Expression }
  | { kind: "animate"; clip: string }
  | { kind: "log"; value: Expression }
);
const blockSchema: z.ZodType<Block> = z.lazy(() =>
  z.discriminatedUnion("kind", [
    z.object({
      id: identifier,
      kind: z.literal("set"),
      variable: identifier,
      value: expressionSchema,
    }),
    z.object({
      id: identifier,
      kind: z.literal("if"),
      condition: expressionSchema,
      then: z.array(blockSchema).max(500),
      else: z.array(blockSchema).max(500),
    }),
    z.object({
      id: identifier,
      kind: z.literal("move"),
      x: expressionSchema,
      y: expressionSchema,
    }),
    z.object({
      id: identifier,
      kind: z.literal("property"),
      property: propertySchema,
      value: expressionSchema,
    }),
    z.object({ id: identifier, kind: z.literal("animate"), clip: text }),
    z.object({
      id: identifier,
      kind: z.literal("log"),
      value: expressionSchema,
    }),
  ]),
);

export const blueprintSchema = z.object({
  version: z.literal(1),
  id: identifier,
  name: identifier,
  variables: z
    .array(
      z.object({
        id: identifier,
        name: identifier,
        type: valueType,
        initial: valueSchema,
      }),
    )
    .max(500),
  events: z
    .array(
      z.object({
        id: identifier,
        kind: z.enum(["start", "update"]),
        blocks: z.array(blockSchema).max(500),
      }),
    )
    .max(20),
});
export type Blueprint = z.infer<typeof blueprintSchema>;
export type EventKind = Blueprint["events"][number]["kind"];
export type Diagnostic = { blockId: string; message: string };
export type BlueprintContext = {
  axis(id: string): number;
  variables: Map<string, Value>;
  move(x: number, y: number): void;
  set(property: Property, value: Value): void;
  animate(clip: string): void;
  log(blockId: string, value: Value): void;
  fault(diagnostic: Diagnostic): void;
  trace?(blockId: string): void;
};
type Evaluate = (ctx: BlueprintContext) => Value;
type Instruction = (ctx: BlueprintContext) => void;
const valueKind = (value: Value): ValueType => typeof value as ValueType;

export function compileBlueprint(
  blueprint: Blueprint,
  axes: ReadonlySet<string>,
) {
  const diagnostics: Diagnostic[] = [];
  const report = (blockId: string, message: string) =>
    diagnostics.push({ blockId, message });
  const ids = new Set<string>();
  const register = (id: string) => {
    if (ids.has(id)) report(id, "Duplicate ID in blueprint.");
    ids.add(id);
  };
  const variables = new Map<string, ValueType>();
  for (const variable of blueprint.variables) {
    register(variable.id);
    variables.set(variable.id, variable.type);
    if (valueKind(variable.initial) !== variable.type)
      report(variable.id, "Initial value has the wrong type.");
  }

  function expression(
    node: Expression,
    id: string,
  ): { type: ValueType; read: Evaluate } {
    if (node.kind === "literal")
      return { type: valueKind(node.value), read: () => node.value };
    if (node.kind === "variable") {
      const type = variables.get(node.id);
      if (!type) report(id, "Choose a declared variable.");
      return {
        type: type ?? "number",
        read: (ctx) => ctx.variables.get(node.id) ?? 0,
      };
    }
    if (node.kind === "input") {
      if (!axes.has(node.id)) report(id, "Choose an existing input axis.");
      return { type: "number", read: (ctx) => ctx.axis(node.id) };
    }

    const left = expression(node.left, id);
    const right = expression(node.right, id);
    const equality = node.op === "==" || node.op === "!=";
    const logical = node.op === "and" || node.op === "or";
    const relation = node.op === "<" || node.op === ">";
    const expected = logical ? "boolean" : "number";
    if (
      equality
        ? left.type !== right.type
        : left.type !== expected || right.type !== expected
    ) {
      report(
        id,
        `Operands for "${node.op}" must ${equality ? "have the same type" : `both be ${expected}`}.`,
      );
    }
    const read: Evaluate = (ctx) => {
      const a = left.read(ctx);
      if (node.op === "and") return Boolean(a) && Boolean(right.read(ctx));
      if (node.op === "or") return Boolean(a) || Boolean(right.read(ctx));
      const b = right.read(ctx);
      const x = Number(a);
      const y = Number(b);
      switch (node.op) {
        case "+":
          return x + y;
        case "-":
          return x - y;
        case "*":
          return x * y;
        case "/":
          return x / y;
        case "==":
          return a === b;
        case "!=":
          return a !== b;
        case "<":
          return x < y;
        case ">":
          return x > y;
      }
    };
    return {
      type: equality || logical || relation ? "boolean" : "number",
      read: (ctx) => {
        const result = read(ctx);
        if (typeof result === "number" && !Number.isFinite(result))
          throw new Error("Expression produced a non-finite number.");
        return result;
      },
    };
  }

  function field(node: Expression, id: string, expected?: ValueType) {
    const { type, read } = expression(node, id);
    if (expected && type !== expected)
      report(id, `Expected ${expected}, received ${type}.`);
    return read;
  }

  function compileBlocks(blocks: Block[]): Instruction[] {
    return blocks.map((block) => {
      register(block.id);
      const instruction = compileBlock(block);
      return (ctx) => {
        ctx.trace?.(block.id);
        try {
          instruction(ctx);
        } catch (error) {
          ctx.fault({
            blockId: block.id,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      };
    });
  }

  function compileBlock(block: Block): Instruction {
    switch (block.kind) {
      case "if": {
        const condition = field(block.condition, block.id, "boolean");
        const yes = compileBlocks(block.then);
        const no = compileBlocks(block.else);
        return (ctx) => {
          for (const action of condition(ctx) ? yes : no) action(ctx);
        };
      }
      case "set": {
        const type = variables.get(block.variable);
        if (!type) report(block.id, "Choose a variable to assign.");
        const read = field(block.value, block.id, type);
        return (ctx) => {
          ctx.variables.set(block.variable, read(ctx));
        };
      }
      case "move": {
        const x = field(block.x, block.id, "number");
        const y = field(block.y, block.id, "number");
        return (ctx) => ctx.move(Number(x(ctx)), Number(y(ctx)));
      }
      case "property": {
        const read = field(
          block.value,
          block.id,
          propertyTypes[block.property],
        );
        return (ctx) => ctx.set(block.property, read(ctx));
      }
      case "animate":
        if (!block.clip.trim())
          report(block.id, "Enter an animation clip name.");
        return (ctx) => ctx.animate(block.clip);
      case "log": {
        const read = field(block.value, block.id);
        return (ctx) => ctx.log(block.id, read(ctx));
      }
    }
  }

  const handlers: Record<EventKind, Instruction[]> = { start: [], update: [] };
  for (const event of blueprint.events) {
    register(event.id);
    handlers[event.kind].push(...compileBlocks(event.blocks));
  }
  return {
    diagnostics,
    createVariables: () =>
      new Map(
        blueprint.variables.map((variable) => [variable.id, variable.initial]),
      ),
    run(event: EventKind, ctx: BlueprintContext) {
      if (!diagnostics.length)
        for (const instruction of handlers[event]) instruction(ctx);
    },
  };
}

export const literal = (value: Value): Expression => ({
  kind: "literal",
  value,
});
export const defaultValue: Record<ValueType, Value> = {
  number: 0,
  boolean: false,
  string: "",
};
