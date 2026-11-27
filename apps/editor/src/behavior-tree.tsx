import { useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  BrainCircuit,
  ChevronRight,
  GitBranch,
  Play,
  Plus,
  Trash2,
} from "lucide-react";
import {
  defaultValue,
  displayValue,
  typeOf,
  type Blueprint,
  type Value,
  type ValueType,
} from "@mosaic/blueprints";
import {
  behaviorChildren,
  newId,
  treeComparisons,
  treeDecorators,
  type BehaviorNode,
  type BehaviorTree,
  type TreeValue,
} from "@mosaic/model";
import { Field, NumberField, Section, TextField } from "./controls";
import { LocalTools } from "./document-view";
import { playGame } from "./play";
import {
  activeDocument,
  openDocument,
  selectedScene,
  useEditor,
} from "./state";
import { ValueControl, TypeOptions } from "./blueprint-values";

const nodeKinds = [
  "sequence",
  "selector",
  "condition",
  "wait",
  "write",
  "call",
  "decorator",
] as const;
const names: Record<BehaviorNode["kind"], string> = {
  sequence: "Sequence",
  selector: "Selector",
  condition: "Condition",
  wait: "Wait",
  write: "Set Blackboard",
  call: "Blueprint Action",
  decorator: "Decorator",
};
const direct = (value: Value): TreeValue => ({ kind: "value", value });
function nodeFor(
  kind: BehaviorNode["kind"],
  tree: BehaviorTree,
  blueprints: Blueprint[],
): BehaviorNode {
  const core = { id: newId(), name: names[kind] };
  switch (kind) {
    case "sequence":
    case "selector":
      return { ...core, kind, children: [] };
    case "condition":
      return {
        ...core,
        kind,
        left: direct(true),
        right: direct(true),
        operator: "==",
      };
    case "wait":
      return { ...core, kind, seconds: 0.25 };
    case "write": {
      const entry = tree.blackboard[0];
      return {
        ...core,
        kind,
        key: entry?.id ?? "unassigned",
        input: direct(entry?.initial ?? false),
      };
    }
    case "decorator":
      return {
        ...core,
        kind,
        mode: "invert",
        amount: 1,
        child: nodeFor("condition", tree, blueprints),
      };
    case "call": {
      const blueprint = blueprints.find((item) => item.functions?.length);
      const fn = blueprint?.functions?.[0];
      return {
        ...core,
        kind,
        blueprintId: blueprint?.id ?? "unassigned",
        functionId: fn?.id ?? "unassigned",
        args: Object.fromEntries(
          (fn?.parameters ?? []).map(({ id, type }) => [
            id,
            direct(defaultValue[type]),
          ]),
        ),
      };
    }
  }
}
export function newBehaviorTree() {
  const tree: BehaviorTree = {
    id: newId(),
    name: "New Behavior",
    blackboard: [],
    root: { id: newId(), kind: "sequence", name: "Sequence", children: [] },
  };
  useEditor.getState().edit((project) => {
    (project.behaviorTrees ??= []).push(tree);
  });
  openDocument({ kind: "behaviorTree", id: tree.id });
}
function find(node: BehaviorNode, id: string): BehaviorNode | undefined {
  if (node.id === id) return node;
  for (const child of behaviorChildren(node)) {
    const result = find(child, id);
    if (result) return result;
  }
}
function parent(node: BehaviorNode, id: string): BehaviorNode | undefined {
  if (behaviorChildren(node).some((item) => item.id === id)) return node;
  for (const child of behaviorChildren(node)) {
    const result = parent(child, id);
    if (result) return result;
  }
}

export function BehaviorWorkspace() {
  const ref = useEditor(activeDocument);
  const project = useEditor((state) => state.project);
  const scene = useEditor(selectedScene);
  const transport = useEditor((state) => state.transport);
  useEditor((state) => state.snapshot);
  const [selection, setSelection] = useState("");
  const [entity, setEntity] = useState("");
  const tree = project.behaviorTrees?.find(({ id }) => id === ref?.id);
  if (!tree) return null;
  const selected = find(tree.root, selection) ?? tree.root;
  const actors = scene.entities.filter(
    ({ behaviorTree }) => behaviorTree === tree.id,
  );
  const target = actors.find(({ id }) => id === entity) ?? actors[0];
  const game = transport === "editing" ? undefined : playGame();
  const runtimeId = target && game?.getSceneEntityId(scene.id, target.id);
  const live = runtimeId ? game?.getBehaviorTree(runtimeId) : undefined;
  const edit = (recipe: (tree: BehaviorTree) => void) =>
    useEditor.getState().edit((project) => {
      const draft = project.behaviorTrees?.find(({ id }) => id === tree.id);
      if (draft) recipe(draft);
    });
  const change = (revision: Partial<BehaviorNode>) =>
    edit((draft) => {
      const node = find(draft.root, selected.id);
      if (node) Object.assign(node, revision);
    });
  function append(kind: BehaviorNode["kind"]) {
    if (!tree) return;
    const item = nodeFor(kind, tree, project.blueprints);
    edit((draft) => {
      const node = find(draft.root, selected.id);
      if (node?.kind === "sequence" || node?.kind === "selector")
        node.children.push(item);
      else if (node?.kind === "decorator") node.child = item;
      else {
        const owner = parent(draft.root, selected.id);
        if (owner?.kind === "sequence" || owner?.kind === "selector")
          owner.children.push(item);
        else if (owner?.kind === "decorator") owner.child = item;
        else draft.root = item;
      }
    });
    setSelection(item.id);
  }
  function order(id: string, delta: number) {
    edit((draft) => {
      const caret = parent(draft.root, id);
      if (caret?.kind !== "sequence" && caret?.kind !== "selector") return;
      const index = caret.children.findIndex((node) => node.id === id);
      const next = index + delta;
      if (caret.children[next])
        [caret.children[index], caret.children[next]] = [
          caret.children[next],
          caret.children[index],
        ];
    });
  }
  function rows(node: BehaviorNode): React.ReactNode {
    const status = live?.nodes[node.id];
    return (
      <article className={"tree-tile tree-tile-" + node.kind} key={node.id}>
        <header>
          <button
            className="tree-tile-name"
            aria-pressed={node.id === selected.id}
            onClick={() => setSelection(node.id)}
          >
            {node.kind === "sequence" || node.kind === "selector" ? (
              <GitBranch size={15} />
            ) : (
              <ChevronRight size={15} />
            )}
            {node.name}
          </button>
          <small>{names[node.kind]}</small>
          {status && (
            <span className="tree-tile-status" data-status={status}>
              {status}
            </span>
          )}
          <button
            aria-label={"Move " + node.name + " earlier"}
            onClick={() => order(node.id, -1)}
          >
            <ArrowUp size={12} />
          </button>
          <button
            aria-label={"Move " + node.name + " later"}
            onClick={() => order(node.id, 1)}
          >
            <ArrowDown size={12} />
          </button>
        </header>
        {!!behaviorChildren(node).length && (
          <div className="tree-tile-children">
            {behaviorChildren(node).map(rows)}
          </div>
        )}
      </article>
    );
  }
  return (
    <LocalTools
      title="Node Library"
      storageKey="behavior-nodes"
      tool={
        <div className="panel-body">
          {nodeKinds.map((kind) => (
            <button
              key={kind}
              className="tree-row"
              onClick={() => append(kind)}
            >
              <Plus size={14} />
              {names[kind]}
            </button>
          ))}
        </div>
      }
    >
      <div className="flow-workspace">
        <div className="flow-board">
          <div className="flow-toolbar">
            <BrainCircuit size={16} />
            <strong>{tree.name}</strong>
            {!!actors.length && (
              <select
                aria-label="Debug tree on entity"
                value={target?.id}
                onChange={(event) => setEntity(event.target.value)}
              >
                {actors.map(({ id, name }) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            )}
            {live && (
              <span>
                <Play size={13} /> {live.nodes[tree.root.id] ?? "Ready"}
              </span>
            )}
          </div>
          <div className="flow-scroll">
            <div className="behavior-board">{rows(tree.root)}</div>
          </div>
        </div>
        <aside className="flow-inspector panel-body">
          <Section title="Behavior Tree">
            <TextField
              label="Behavior tree name"
              value={tree.name}
              onChange={(name) =>
                edit((draft) => {
                  draft.name = name;
                })
              }
            />
          </Section>
          <Section title="Node">
            <TextField
              label="Behavior node name"
              value={selected.name}
              onChange={(name) => change({ name })}
            />
            <NodeFields
              tree={tree}
              node={selected}
              change={change}
              blueprints={project.blueprints}
            />
            {selected.id !== tree.root.id && (
              <button
                onClick={() =>
                  edit((draft) => {
                    const owner = parent(draft.root, selected.id);
                    if (
                      owner?.kind === "sequence" ||
                      owner?.kind === "selector"
                    )
                      owner.children = owner.children.filter(
                        ({ id }) => id !== selected.id,
                      );
                    else if (owner?.kind === "decorator")
                      owner.child = nodeFor(
                        "condition",
                        draft,
                        project.blueprints,
                      );
                  })
                }
              >
                <Trash2 size={14} /> Remove node
              </button>
            )}
          </Section>
          <Section title="Blackboard">
            {tree.blackboard.map((entry, index) => {
              const type = typeOf(entry.initial);
              return (
                <div className="tree-variable" key={entry.id}>
                  <TextField
                    label={"Blackboard key " + (index + 1)}
                    value={entry.name}
                    onChange={(name) =>
                      edit(({ blackboard }) => {
                        blackboard[index].name = name;
                      })
                    }
                  />
                  <select
                    aria-label={"Blackboard type " + (index + 1)}
                    value={type}
                    onChange={(event) =>
                      edit(({ blackboard }) => {
                        blackboard[index].initial =
                          defaultValue[event.target.value as ValueType];
                      })
                    }
                  >
                    <TypeOptions />
                  </select>
                  <ValueControl
                    label={entry.name + " initial"}
                    value={entry.initial}
                    change={(initial) =>
                      edit(({ blackboard }) => {
                        blackboard[index].initial = initial;
                      })
                    }
                  />
                  {live &&
                    runtimeId &&
                    Object.hasOwn(live.blackboard, entry.id) && (
                      <>
                        <output>
                          {displayValue(live.blackboard[entry.id])}
                        </output>
                        <ValueControl
                          label={entry.name + " live"}
                          value={live.blackboard[entry.id]}
                          change={(value) =>
                            game?.writeBlackboard(runtimeId, entry.id, value)
                          }
                        />
                      </>
                    )}
                </div>
              );
            })}
            <button
              onClick={() =>
                edit(({ blackboard }) => {
                  blackboard.push({
                    id: newId(),
                    name: "Key " + (blackboard.length + 1),
                    initial: false,
                  });
                })
              }
            >
              <Plus size={14} /> Key
            </button>
          </Section>
        </aside>
      </div>
    </LocalTools>
  );
}

function NodeFields({
  tree,
  node,
  change,
  blueprints,
}: {
  tree: BehaviorTree;
  node: BehaviorNode;
  change: (patch: Partial<BehaviorNode>) => void;
  blueprints: Blueprint[];
}) {
  switch (node.kind) {
    case "sequence":
    case "selector":
      return (
        <Field label="Policy">
          <select
            aria-label="Branch policy"
            value={node.kind}
            onChange={(event) =>
              change({
                kind:
                  event.target.value === "selector" ? "selector" : "sequence",
              })
            }
          >
            <option>sequence</option>
            <option>selector</option>
          </select>
        </Field>
      );
    case "condition": {
      const leftType =
        node.left.kind === "value"
          ? typeOf(node.left.value)
          : typeOf(
              tree.blackboard.find(
                ({ id }) => node.left.kind === "key" && id === node.left.key,
              )?.initial ?? false,
            );
      return (
        <>
          {(node.operator === "==" || node.operator === "!=") && (
            <select
              aria-label="Condition value type"
              value={leftType}
              onChange={(event) => {
                const value = defaultValue[event.target.value as ValueType];
                change({ left: direct(value), right: direct(value) });
              }}
            >
              <TypeOptions />
            </select>
          )}
          <select
            aria-label="Condition operator"
            value={node.operator}
            onChange={(event) => {
              const operator =
                treeComparisons.find(
                  (candidate) => candidate === event.target.value,
                ) ?? "==";
              const ordered = operator !== "==" && operator !== "!=";
              change(
                ordered && leftType !== "number"
                  ? { operator, left: direct(0), right: direct(0) }
                  : { operator },
              );
            }}
          >
            {treeComparisons.map((operator) => (
              <option key={operator}>{operator}</option>
            ))}
          </select>
          <TreeValueEditor
            tree={tree}
            value={node.left}
            type={leftType}
            label="Left"
            change={(left) => change({ left })}
          />
          <TreeValueEditor
            tree={tree}
            value={node.right}
            type={leftType}
            label="Right"
            change={(right) => change({ right })}
          />
        </>
      );
    }
    case "wait":
      return (
        <NumberField
          label="Wait seconds"
          value={node.seconds}
          min={0}
          max={3600}
          step={0.05}
          onChange={(seconds) => change({ seconds })}
        />
      );
    case "write": {
      const key = tree.blackboard.find(({ id }) => id === node.key);
      return (
        <>
          <select
            aria-label="Write blackboard key"
            value={node.key}
            onChange={(event) => {
              const next = tree.blackboard.find(
                ({ id }) => id === event.target.value,
              );
              if (next) change({ key: next.id, input: direct(next.initial) });
            }}
          >
            <option disabled value="unassigned">
              Choose a key
            </option>
            {tree.blackboard.map(({ id, name }) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
          {key && (
            <TreeValueEditor
              tree={tree}
              value={node.input}
              type={typeOf(key.initial)}
              label="Value"
              change={(input) => change({ input })}
            />
          )}
        </>
      );
    }
    case "decorator":
      return (
        <>
          <select
            aria-label="Decorator"
            value={node.mode}
            onChange={(event) => {
              const mode = treeDecorators.find(
                (mode) => mode === event.target.value,
              );
              if (mode)
                change({ mode, amount: mode === "repeat" ? 1 : node.amount });
            }}
          >
            {treeDecorators.map((mode) => (
              <option key={mode}>{mode}</option>
            ))}
          </select>
          {["repeat", "timeout", "cooldown"].includes(node.mode) && (
            <NumberField
              label={node.mode === "repeat" ? "Iterations" : "Seconds"}
              value={node.amount}
              min={node.mode === "repeat" ? 1 : 0}
              max={node.mode === "repeat" ? 1024 : 3600}
              step={node.mode === "repeat" ? 1 : 0.05}
              onChange={(amount) =>
                change({
                  amount: node.mode === "repeat" ? Math.round(amount) : amount,
                })
              }
            />
          )}
        </>
      );
    case "call": {
      const blueprint = blueprints.find(({ id }) => id === node.blueprintId);
      const fn = blueprint?.functions?.find(({ id }) => id === node.functionId);
      const functions = blueprints.flatMap((blueprint) =>
        (blueprint.functions ?? []).map((fn) => ({
          blueprint,
          fn,
          key: JSON.stringify([blueprint.id, fn.id]),
        })),
      );
      return (
        <>
          <select
            aria-label="Blueprint function"
            value={
              fn ? JSON.stringify([node.blueprintId, node.functionId]) : ""
            }
            onChange={(event) => {
              const target = functions.find(
                ({ key }) => key === event.target.value,
              );
              if (target)
                change({
                  blueprintId: target.blueprint.id,
                  functionId: target.fn.id,
                  args: Object.fromEntries(
                    target.fn.parameters.map(({ id, type }) => [
                      id,
                      direct(defaultValue[type]),
                    ]),
                  ),
                  result: undefined,
                });
            }}
          >
            <option value="" disabled>
              Choose a function
            </option>
            {functions.map(({ blueprint, fn, key }) => (
              <option key={key} value={key}>
                {blueprint.name} / {fn.name}
              </option>
            ))}
          </select>
          {fn?.parameters.map(({ id, name, type }) => (
            <TreeValueEditor
              key={id}
              tree={tree}
              value={node.args[id] ?? direct(defaultValue[type])}
              type={type}
              label={name}
              change={(value) =>
                change({ args: { ...node.args, [id]: value } })
              }
            />
          ))}
          {fn && fn.returns !== "void" && (
            <select
              aria-label="Function result key"
              value={node.result ?? ""}
              onChange={(event) =>
                change({ result: event.target.value || undefined })
              }
            >
              <option value="">Discard result</option>
              {tree.blackboard
                .filter(({ initial }) => typeOf(initial) === fn.returns)
                .map(({ id, name }) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
            </select>
          )}
        </>
      );
    }
  }
}
function TreeValueEditor({
  tree,
  value,
  type,
  label,
  change,
}: {
  tree: BehaviorTree;
  value: TreeValue;
  type: ValueType;
  label: string;
  change: (value: TreeValue) => void;
}) {
  return (
    <Field label={label}>
      <div className="tree-variable">
        <select
          aria-label={label + " source"}
          value={value.kind === "key" ? value.key : ""}
          onChange={(event) =>
            change(
              event.target.value
                ? { kind: "key", key: event.target.value }
                : direct(defaultValue[type]),
            )
          }
        >
          <option value="">Literal</option>
          {tree.blackboard
            .filter(({ initial }) => typeOf(initial) === type)
            .map(({ id, name }) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
        </select>
        {value.kind === "value" && (
          <ValueControl
            label={label + " value"}
            value={value.value}
            change={(initial) => change(direct(initial))}
          />
        )}
      </div>
    </Field>
  );
}
