import { z } from "zod";
import {
  blueprintValueSchema,
  equalValues,
  type Blueprint,
  type Value,
  type ValueType,
  typeOf,
} from "@mosaic/blueprints";

const id = z.string().min(1).max(100);
const name = z.string().trim().min(1).max(100);
export const treeValueSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("value"), value: blueprintValueSchema }),
  z.object({ kind: z.literal("key"), key: id }),
]);
export const treeComparisons = ["==", "!=", "<", ">", "<=", ">="] as const;
export const treeDecorators = [
  "invert",
  "succeed",
  "repeat",
  "timeout",
  "cooldown",
] as const;
export type TreeValue = z.infer<typeof treeValueSchema>;
export type BehaviorStatus = "running" | "success" | "failure";
type Node = { id: string; name: string };
export type BehaviorNode = Node &
  (
    | { kind: "sequence" | "selector"; children: BehaviorNode[] }
    | {
        kind: "condition";
        left: TreeValue;
        operator: (typeof treeComparisons)[number];
        right: TreeValue;
      }
    | { kind: "wait"; seconds: number }
    | { kind: "write"; key: string; input: TreeValue }
    | {
        kind: "call";
        blueprintId: string;
        functionId: string;
        args: Record<string, TreeValue>;
        result?: string;
      }
    | {
        kind: "decorator";
        mode: (typeof treeDecorators)[number];
        amount: number;
        child: BehaviorNode;
      }
  );
const nodeRecord = { id, name };
const node: z.ZodType<BehaviorNode> = z.lazy(() =>
  z.union([
    z.object({
      ...nodeRecord,
      kind: z.enum(["sequence", "selector"]),
      children: z.array(node).max(64),
    }),
    z.object({
      ...nodeRecord,
      kind: z.literal("condition"),
      left: treeValueSchema,
      operator: z.enum(treeComparisons),
      right: treeValueSchema,
    }),
    z.object({
      ...nodeRecord,
      kind: z.literal("wait"),
      seconds: z.number().min(0).max(3600),
    }),
    z.object({
      ...nodeRecord,
      kind: z.literal("write"),
      key: id,
      input: treeValueSchema,
    }),
    z.object({
      ...nodeRecord,
      kind: z.literal("call"),
      blueprintId: id,
      functionId: id,
      args: z.record(id, treeValueSchema),
      result: id.optional(),
    }),
    z.object({
      ...nodeRecord,
      kind: z.literal("decorator"),
      mode: z.enum(treeDecorators),
      amount: z.number().min(0).max(3600),
      child: node,
    }),
  ]),
);
export const behaviorTreeSchema = z.object({
  id,
  name,
  blackboard: z
    .array(z.object({ id, name, initial: blueprintValueSchema }))
    .max(128),
  root: node,
});
export type BehaviorTree = z.infer<typeof behaviorTreeSchema>;
export type BlackboardEntry = BehaviorTree["blackboard"][number];
export const behaviorChildren = (node: BehaviorNode) =>
  node.kind === "sequence" || node.kind === "selector"
    ? node.children
    : node.kind === "decorator"
      ? [node.child]
      : [];

export function validateBehaviorTree(
  tree: BehaviorTree,
  blueprints: Blueprint[],
) {
  const keys = new Map(
    tree.blackboard.map(({ id, initial }) => [id, typeOf(initial)]),
  );
  if (keys.size !== tree.blackboard.length)
    throw new Error(`Tree "${tree.name}" has duplicate blackboard keys.`);
  const require = (input: TreeValue, expected?: ValueType) => {
    const type =
      input.kind === "key" ? keys.get(input.key) : typeOf(input.value);
    if (!type || (expected && type !== expected))
      throw new Error(
        `Tree "${tree.name}" has a missing or incompatible blackboard value.`,
      );
    return type;
  };
  const seen = new Set<string>();
  function check(node: BehaviorNode, depth: number) {
    if (depth > 32 || seen.size >= 1024 || seen.has(node.id))
      throw new Error(
        `Tree "${tree.name}" exceeds node limits or has duplicate node IDs.`,
      );
    seen.add(node.id);
    if (node.kind === "condition") {
      const ordered = node.operator !== "==" && node.operator !== "!=";
      const type = require(node.left, ordered ? "number" : undefined);
      require(node.right, type);
    } else if (node.kind === "write") {
      const type = keys.get(node.key);
      if (!type)
        throw new Error(
          `Tree "${tree.name}" references a missing blackboard key.`,
        );
      require(node.input, type);
    } else if (node.kind === "call") {
      const fn = blueprints
        .find(({ id }) => id === node.blueprintId)
        ?.functions?.find(({ id }) => id === node.functionId);
      if (!fn || Object.keys(node.args).length !== fn.parameters.length)
        throw new Error(
          `Tree "${tree.name}" references a missing Blueprint function or arguments.`,
        );
      for (const parameter of fn.parameters) {
        const input = Object.hasOwn(node.args, parameter.id)
          ? node.args[parameter.id]
          : undefined;
        if (!input)
          throw new Error(
            `Tree "${tree.name}" has a missing function argument.`,
          );
        require(input, parameter.type);
      }
      if (
        node.result &&
        (fn.returns === "void" || keys.get(node.result) !== fn.returns)
      )
        throw new Error(
          `Tree "${tree.name}" has an incompatible function result key.`,
        );
    } else if (
      node.kind === "decorator" &&
      node.mode === "repeat" &&
      (!Number.isInteger(node.amount) || node.amount < 1 || node.amount > 1024)
    )
      throw new Error(
        `Tree "${tree.name}" must repeat from one to 1024 times.`,
      );
    for (const child of behaviorChildren(node)) check(child, depth + 1);
  }
  check(tree.root, 0);
}

export function evaluateTreeCondition(
  operator: (typeof treeComparisons)[number],
  left: Value,
  right: Value,
) {
  if (operator === "==" || operator === "!=") {
    const same = equalValues(left, right);
    return operator === "==" ? same : !same;
  }
  if (typeof left !== "number" || typeof right !== "number") return false;
  switch (operator) {
    case "<":
      return left < right;
    case ">":
      return left > right;
    case "<=":
      return left <= right;
    case ">=":
      return left >= right;
  }
}
