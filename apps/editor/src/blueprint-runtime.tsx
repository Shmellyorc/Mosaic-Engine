import {
  defaultValue,
  literal,
  runtimeFields,
  runtimeOperations,
  type Expression,
  type RuntimeOperation,
  type RuntimeField,
  type ValueType,
} from "@mosaic/blueprints";
import { audioAssets, entityComponents } from "@mosaic/model";
import { Field } from "./controls";
import { selectedEntity, selectedScene, useEditor } from "./state";
import type { ReactNode } from "react";

export function groupItems<T extends { group: string }>(items: readonly T[]) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const group = groups.get(item.group);
    if (group) group.push(item);
    else groups.set(item.group, [item]);
  }
  return groups;
}
export const readable = [
  ...runtimeFields,
  ...runtimeOperations.flatMap((operation) =>
    operation.result && operation.id !== "entity.spawn"
      ? [{ ...operation, type: operation.result }]
      : [],
  ),
];
export const writable = runtimeFields.filter(({ writable }) => writable);
export const actions = runtimeOperations.filter(
  ({ id, result }) => !result || id === "entity.spawn",
);
export function initialField(field: RuntimeField) {
  if (field.options?.length) return literal(field.options[0]);
  if (field.format === "color") return literal("#ffffff");
  if (field.id === "entity.name") return literal("Entity");
  if (field.bounds)
    return literal(Math.min(field.bounds[1], Math.max(field.bounds[0], 0)));
  return literal(defaultValue[field.type]);
}
export function operationArguments(operation: RuntimeOperation) {
  return Object.fromEntries(
    Object.entries(operation.args).map(([id, argument]) => [
      id,
      literal(argument.default ?? defaultValue[argument.type]),
    ]),
  );
}

export function RuntimeMemberSelect({
  label,
  members,
  member,
  change,
}: {
  label: string;
  members: readonly { id: string; group: string; name: string }[];
  member: string;
  change: (member: string) => void;
}) {
  const groups = groupItems(members);
  return (
    <Field label={label}>
      <select
        aria-label={label}
        value={member}
        onChange={(event) => change(event.target.value)}
      >
        {!members.some(({ id }) => id === member) && (
          <option value={member}>Choose…</option>
        )}
        {[...groups].map(([group, items]) => (
          <optgroup key={group} label={group}>
            {items.map(({ id, name }) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </Field>
  );
}
export function RuntimeArgs({
  operation,
  args,
  change,
  render,
}: {
  operation: RuntimeOperation;
  args: Record<string, Expression>;
  change: (args: Record<string, Expression>) => void;
  render: (
    label: string,
    node: Expression,
    change: (node: Expression) => void,
    type: ValueType,
  ) => ReactNode;
}) {
  const project = useEditor((state) => state.project);
  const scene = useEditor(selectedScene);
  const entity = useEditor(selectedEntity);
  const options = (reference: string | undefined) => {
    switch (reference) {
      case "prefab":
        return project.prefabs;
      case "sound":
        return audioAssets(project);
      case "component":
        return [
          ...entityComponents.map(({ key, name }) => ({ id: key, name })),
          { id: "sprite", name: "Sprite" },
        ];
      case "screen":
        return project.uiFlow?.screens;
      case "scene":
        return project.scenes;
      case "bus":
        return [
          { id: "master", name: "Master" },
          ...(project.mixer?.buses ?? []),
        ];
      case "terrain":
        return scene.tilemap.terrains;
      case "tileLayer":
        return scene.tilemap.layers;
      case "timeline":
        return scene.timelines;
      case "parameter":
        return entity?.animator?.parameters;
      case "clip":
        return entity?.clips.map(({ name }) => ({ id: name, name }));
      case "blackboard":
        return project.behaviorTrees?.find(
          ({ id }) => id === entity?.behaviorTree,
        )?.blackboard;
      case "widget": {
        const screen = args.screen;
        const screenId = screen?.kind === "literal" ? screen.value : undefined;
        return (
          project.uiFlow?.screens.find(({ id }) => id === screenId)?.document ??
          scene.ui
        )?.widgets;
      }
    }
  };
  return (
    <>
      {Object.entries(operation.args).map(([id, argument]) => {
        const slot = Object.hasOwn(args, id)
          ? args[id]
          : literal(argument.default ?? defaultValue[argument.type]);
        const update = (expression: Expression) =>
          change({ ...args, [id]: expression });
        const choices =
          argument.choices?.map((id) => ({ id, name: id })) ??
          options(argument.reference);
        const raw = slot.kind === "literal" ? slot.value : undefined;
        const selected =
          typeof raw === "object" && raw.kind === "asset"
            ? raw.id
            : typeof raw === "string"
              ? raw
              : "";
        return (
          <div className="runtime-argument" key={id}>
            {choices && choices.length > 0 && (
              <Field label={argument.name}>
                <select
                  aria-label={argument.name + " reference"}
                  value={selected}
                  onChange={(event) =>
                    update(
                      literal(
                        argument.type === "asset"
                          ? { kind: "asset", id: event.target.value }
                          : event.target.value,
                      ),
                    )
                  }
                >
                  <option value="">Choose or enter an expression</option>
                  {!choices.some(({ id }) => id === selected) && selected && (
                    <option value={selected}>{selected}</option>
                  )}
                  {choices.map(({ id, name }) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {render(argument.name, slot, update, argument.type)}
          </div>
        );
      })}
    </>
  );
}
