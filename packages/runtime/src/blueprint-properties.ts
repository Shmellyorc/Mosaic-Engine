import {
  runtimeField,
  type RuntimeField,
  type Scalar,
  type Value,
  typeOf,
} from "@mosaic/blueprints";
import type { Entity } from "@mosaic/model";

export const entityReference = (
  id?: string | null,
): Value & { kind: "entity" } => ({ kind: "entity", id: id ?? "" });
export const assetReference = (
  id?: string | null,
): Value & { kind: "asset" } => ({ kind: "asset", id: id ?? "" });
export const runtimeRecord = (
  schema: string,
  fields: Record<string, Scalar>,
): Value => ({ kind: "record", schema, fields });
export function runtimeColor(value: string) {
  if (!/^#[a-f0-9]{6}$/i.test(value))
    throw new Error("Expected a six-digit hex color.");
  return value;
}
export function runtimeNumber(
  value: number,
  min: number,
  max: number,
  integer = false,
) {
  if (
    !Number.isFinite(value) ||
    value < min ||
    value > max ||
    (integer && !Number.isInteger(value))
  )
    throw new Error(
      `Expected ${integer ? "a whole number" : "a number"} from ${min} to ${max}.`,
    );
  return value;
}
export function propertyValue(member: RuntimeField, value: Value) {
  if (typeOf(value) !== member.type)
    throw new Error("Property value has the wrong type.");
  if (typeof value === "number" && member.bounds)
    return runtimeNumber(
      value,
      member.bounds[0],
      member.bounds[1],
      !!member.bounds[2],
    );
  if (typeof value === "string") {
    if (member.options && !member.options.includes(value))
      throw new Error("Choose a valid property value.");
    if (member.format === "color") return runtimeColor(value);
    if (member.id === "entity.name" && !value.trim())
      throw new Error("An entity name cannot be empty.");
    return value.slice(0, member.id === "entity.name" ? 100 : 300);
  }
  return value;
}
const frameKeys = {
  frameX: "x",
  frameY: "y",
  frameWidth: "w",
  frameHeight: "h",
} as const;
export function propertyMember(id: string) {
  const member = runtimeField(id);
  if (!member) throw new Error("The runtime property is unavailable.");
  return member;
}
export function propertyLocation(
  entity: Entity,
  member: RuntimeField,
  writing = false,
): [Record<string, unknown>, string] {
  const key = member.key!;
  if (member.component === "sprite") {
    if (entity.visual?.kind !== "sprite")
      throw new Error("The entity has no sprite.");
    const frameKey = Object.hasOwn(frameKeys, key)
      ? frameKeys[key as keyof typeof frameKeys]
      : undefined;
    if (!frameKey) return [entity.visual, key];
    if (writing)
      entity.visual.frame ??= {
        x: 0,
        y: 0,
        w: entity.transform.width,
        h: entity.transform.height,
      };
    return [
      entity.visual.frame ?? {
        x: 0,
        y: 0,
        w: entity.transform.width,
        h: entity.transform.height,
      },
      frameKey,
    ];
  }
  const component =
    member.component === "entity"
      ? entity
      : entity[member.component as keyof Entity];
  if (!component || typeof component !== "object")
    throw new Error(
      "The entity has no " + member.group.toLowerCase() + " component.",
    );
  return [component as Record<string, unknown>, key];
}
