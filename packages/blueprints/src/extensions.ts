import { z } from "zod";
import { parseExpression } from "./expressions";
import type { Expression } from "./model";

const identifier = z
  .string()
  .max(40)
  .regex(/^[a-z][a-z0-9_]*$/);
const scalarType = z.enum(["number", "boolean", "string"]);
export const extensionSchema = z.strictObject({
  version: z.literal(1),
  id: z
    .string()
    .max(100)
    .regex(/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/),
  name: z.string().trim().min(1).max(100),
  functions: z
    .array(
      z.strictObject({
        id: identifier,
        name: z.string().trim().min(1).max(100),
        parameters: z
          .array(z.strictObject({ id: identifier, type: scalarType }))
          .max(8),
        result: scalarType,
        body: z.string().trim().min(1).max(512),
      }),
    )
    .min(1)
    .max(24),
});
export type ExtensionManifest = z.infer<typeof extensionSchema>;
export type ExtensionFunction = ExtensionManifest["functions"][number];

export function extensionBody(definition: ExtensionFunction) {
  const variables = definition.parameters.map(({ id }) => ({ id, name: id }));
  if (new Set(variables.map(({ id }) => id)).size !== variables.length)
    throw new Error("Parameter IDs must be unique.");
  const parameterIds = new Set(variables.map(({ id }) => id));
  const root = parseExpression(definition.body, { axes: [], variables });
  const pending = [root];
  let count = 0;
  while (pending.length) {
    if (++count > 96)
      throw new Error("An extension expression can contain at most 96 nodes.");
    const node: Expression = pending.pop()!;
    if (node.kind === "literal" && typeof node.value !== "object") continue;
    if (node.kind === "variable" && parameterIds.has(node.id)) continue;
    if (node.kind === "binary") pending.push(node.left, node.right);
    else if (node.kind === "unary") pending.push(node.value);
    else
      throw new Error(
        "Functions may use scalar literals, parameters, and scalar operators.",
      );
  }
  return root;
}
