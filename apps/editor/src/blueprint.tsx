import {
  ChevronDown,
  ChevronRight,
  CircleAlert,
  ClipboardList,
  Code2,
  Film,
  Gamepad2,
  GitBranch,
  Move,
  Plus,
  Settings2,
  Terminal,
  Variable,
  Zap,
} from "lucide-react";
import { useMemo, useState, type DragEvent, type ReactNode } from "react";
import {
  compileBlueprint,
  defaultValue,
  literal,
  propertyTypes,
  type Binary,
  type Block,
  type Blueprint,
  type Expression,
  type Property,
  type Value,
  type ValueType,
} from "@mosaic/blueprints";
import { createBlueprint, newId, type Project } from "@mosaic/model";
import {
  editBlueprint,
  selectedBlueprint,
  selectedEntity,
  useEditor,
} from "./state";
import { Field, NumberField, Section, TextField } from "./controls";

const kinds = {
  set: {
    name: "Set Variable",
    description: "Store a typed value for this entity.",
    tone: "blue",
    Icon: Variable,
  },
  if: {
    name: "If",
    description:
      "Run one of two nested sequences when a condition is evaluated.",
    tone: "blue",
    Icon: GitBranch,
  },
  move: {
    name: "Move",
    description: "Move this entity by its local velocity in units per second.",
    tone: "green",
    Icon: Move,
  },
  animate: {
    name: "Play Animation",
    description: "Play a spritesheet clip on this entity.",
    tone: "purple",
    Icon: Film,
  },
  property: {
    name: "Set Property",
    description: "Write a transform or visual property on this entity.",
    tone: "green",
    Icon: Settings2,
  },
  log: {
    name: "Log",
    description: "Write the expression’s value to the runtime console.",
    tone: "neutral",
    Icon: Terminal,
  },
} as const;
type BlockKind = keyof typeof kinds;
type Branch = "then" | "else";
type ListAddress = { eventId: string; parentId?: string; branch?: Branch };
type Match = { blocks: Block[]; index: number; block: Block };
const operators: Record<Binary, string> = {
  "+": "+",
  "-": "−",
  "*": "×",
  "/": "÷",
  "==": "=",
  "!=": "≠",
  "<": "<",
  ">": ">",
  and: "and",
  or: "or",
};
const symbolByKind = (block: Block) =>
  block.kind === "set" && block.value.kind === "input"
    ? Gamepad2
    : kinds[block.kind].Icon;
const nameByKind = (block: Block) =>
  block.kind === "set" && block.value.kind === "input"
    ? "Read Input"
    : kinds[block.kind].name;

function findBlock(blocks: Block[], id: string): Match | undefined {
  for (let index = 0; index < blocks.length; index++) {
    const block = blocks[index];
    if (block.id === id) return { blocks, index, block };
    if (block.kind === "if") {
      const found = findBlock(block.then, id) ?? findBlock(block.else, id);
      if (found) return found;
    }
  }
}
function getBlocks(blueprint: Blueprint, address: ListAddress) {
  const event = blueprint.events.find((event) => event.id === address.eventId);
  const parent =
    address.parentId &&
    event &&
    findBlock(event.blocks, address.parentId)?.block;
  return address.parentId
    ? parent && parent.kind === "if" && address.branch
      ? parent[address.branch]
      : undefined
    : event?.blocks;
}
function changeBlock(
  address: ListAddress,
  id: string,
  update: (block: Block) => void,
) {
  editBlueprint((draft) => {
    const block = getBlocks(draft, address)?.find((entry) => entry.id === id);
    if (block) update(block);
  });
}
function makeBlock(
  kind: BlockKind,
  blueprint: Blueprint,
  clip?: string,
): Block {
  const id = newId();
  const firstVariable = blueprint.variables[0];
  switch (kind) {
    case "set":
      return {
        id,
        kind,
        variable: firstVariable?.id ?? "unassigned",
        value: literal(firstVariable ? defaultValue[firstVariable.type] : 0),
      };
    case "if":
      return { id, kind, condition: literal(true), then: [], else: [] };
    case "move":
      return { id, kind, x: literal(0), y: literal(0) };
    case "animate":
      return { id, kind, clip: clip ?? "" };
    case "property":
      return { id, kind, property: "visible", value: literal(true) };
    case "log":
      return { id, kind, value: literal("Hello from Mosaic") };
  }
}
function activeEvent(blueprint: Blueprint, eventId: string | null) {
  return (
    blueprint.events.find((event) => event.id === eventId) ??
    blueprint.events[0]
  );
}
function addBlock(kind: BlockKind, address?: ListAddress) {
  const state = useEditor.getState();
  const blueprint = selectedBlueprint(state);
  if (!blueprint) return;
  const event = activeEvent(blueprint, state.eventId);
  if (!address && !event) return;
  const block = makeBlock(
    kind,
    blueprint,
    selectedEntity(state)?.clips[0]?.name,
  );
  editBlueprint((draft) => {
    getBlocks(draft, address ?? { eventId: event.id })?.push(block);
  });
  useEditor.setState({ selectedTile: block.id });
}
function createBehaviour() {
  const blueprint = createBlueprint("New Behaviour");
  useEditor.getState().edit((project) => {
    project.blueprints.push(blueprint);
  });
  useEditor.setState({
    blueprintId: blueprint.id,
    eventId: blueprint.events.find((event) => event.kind === "update")?.id,
    selectedTile: null,
  });
}

type ExprProps = {
  expr: Expression;
  label: string;
  expected?: ValueType;
  blueprint: Blueprint;
  axes: Project["input"];
  change: (expr: Expression) => void;
};
function ValueControl({
  label,
  value,
  change,
}: {
  label: string;
  value: Value;
  change: (value: Value) => void;
}) {
  if (typeof value === "number")
    return (
      <NumberField label={label} value={value} onChange={change} step={0.1} />
    );
  if (typeof value === "boolean")
    return (
      <select
        aria-label={label}
        value={String(value)}
        onChange={(event) => change(event.target.value === "true")}
      >
        <option value="true">True</option>
        <option value="false">False</option>
      </select>
    );
  return (
    <TextField
      label={label}
      value={value}
      onChange={change}
      allowEmpty
      maxLength={300}
    />
  );
}
function ExpressionControl({
  expr,
  label,
  expected,
  blueprint,
  axes,
  change,
}: ExprProps) {
  const [editing, setEditing] = useState(false);
  const summary = (expression: Expression): ReactNode => {
    switch (expression.kind) {
      case "literal":
        return (
          <span className="value-chip">
            {typeof expression.value === "string"
              ? `"${expression.value}"`
              : String(expression.value)}
          </span>
        );
      case "variable":
        return (
          <span className="value-chip">
            {blueprint.variables.find((v) => v.id === expression.id)?.name ??
              "Missing variable"}
          </span>
        );
      case "input":
        return (
          <span>
            Input.Axis(
            <b className="string-value">
              "
              {axes.find((a) => a.id === expression.id)?.name ?? "Missing axis"}
              "
            </b>
            )
          </span>
        );
      case "binary":
        return (
          <span className="operator-line">
            {summary(expression.left)}
            <b>{operators[expression.op]}</b>
            {summary(expression.right)}
          </span>
        );
    }
  };
  function changeKind(kind: Expression["kind"]) {
    if (kind === "literal") change(literal(defaultValue[expected ?? "number"]));
    if (kind === "input") change({ kind, id: axes[0]?.id ?? "unassigned" });
    if (kind === "variable")
      change({
        kind,
        id:
          (
            blueprint.variables.find((v) => v.type === expected) ??
            blueprint.variables[0]
          )?.id ?? "unassigned",
      });
    if (kind === "binary")
      change({
        kind,
        op: expected === "boolean" ? "!=" : "+",
        left: literal(0),
        right: literal(0),
      });
  }
  return (
    <div className="expression">
      <button
        className="expression-summary"
        aria-label={`Edit ${label}`}
        aria-expanded={editing}
        onClick={() => setEditing(!editing)}
      >
        {summary(expr)}
        <ChevronDown size={12} />
      </button>
      {editing && (
        <div className="expression-editor">
          <Field label="Source">
            <select
              aria-label={`${label} source`}
              value={expr.kind}
              onChange={(event) =>
                changeKind(event.target.value as Expression["kind"])
              }
            >
              <option value="literal">Literal</option>
              <option value="variable">Variable</option>
              <option value="input">Input axis</option>
              <option value="binary">Binary operation</option>
            </select>
          </Field>
          {expr.kind === "literal" && (
            <>
              <Field label="Type">
                <select
                  aria-label={`${label} type`}
                  value={typeof expr.value}
                  onChange={(event) =>
                    change(
                      literal(defaultValue[event.target.value as ValueType]),
                    )
                  }
                >
                  <option value="number">Number</option>
                  <option value="boolean">Boolean</option>
                  <option value="string">Text</option>
                </select>
              </Field>
              <Field label="Value">
                <ValueControl
                  label={`${label} value`}
                  value={expr.value}
                  change={(value) => change(literal(value))}
                />
              </Field>
            </>
          )}
          {expr.kind === "variable" && (
            <Field label="Variable">
              <select
                aria-label={`${label} variable`}
                value={expr.id}
                onChange={(event) =>
                  change({ ...expr, id: event.target.value })
                }
              >
                {!blueprint.variables.some(
                  (variable) => variable.id === expr.id,
                ) && <option value={expr.id}>Choose a variable</option>}
                {blueprint.variables.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} · {v.type}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {expr.kind === "input" && (
            <Field label="Axis">
              <select
                aria-label={`${label} axis`}
                value={expr.id}
                onChange={(event) =>
                  change({ ...expr, id: event.target.value })
                }
              >
                {!axes.some((axis) => axis.id === expr.id) && (
                  <option value={expr.id}>Choose an axis</option>
                )}
                {axes.map((axis) => (
                  <option key={axis.id} value={axis.id}>
                    {axis.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {expr.kind === "binary" && (
            <>
              <Field label="Operator">
                <select
                  aria-label={`${label} operator`}
                  value={expr.op}
                  onChange={(event) =>
                    change({ ...expr, op: event.target.value as Binary })
                  }
                >
                  {Object.entries(operators).map(([op, symbol]) => (
                    <option key={op} value={op}>
                      {symbol}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Left">
                <ExpressionControl
                  expr={expr.left}
                  label={`${label} left`}
                  blueprint={blueprint}
                  axes={axes}
                  change={(left) => change({ ...expr, left })}
                />
              </Field>
              <Field label="Right">
                <ExpressionControl
                  expr={expr.right}
                  label={`${label} right`}
                  blueprint={blueprint}
                  axes={axes}
                  change={(right) => change({ ...expr, right })}
                />
              </Field>
            </>
          )}
        </div>
      )}
    </div>
  );
}
function AddBlock({ address }: { address: ListAddress }) {
  return (
    <label className="add-block">
      <Plus size={15} />
      <select
        aria-label={
          address.parentId ? `Add block to ${address.branch}` : "Add block"
        }
        value=""
        onChange={(event) => {
          if (event.target.value)
            addBlock(event.target.value as BlockKind, address);
        }}
      >
        <option value="" disabled>
          Add Block
        </option>
        {Object.entries(kinds).map(([key, info]) => (
          <option value={key} key={key}>
            {info.name}
          </option>
        ))}
      </select>
    </label>
  );
}

const dragType = "application/x-mosaic-block";
function dropBlock(event: DragEvent, address: ListAddress, target?: string) {
  const source = event.dataTransfer.getData(dragType);
  if (!source || source === target) return;
  event.preventDefault();
  event.stopPropagation();
  editBlueprint((draft) => {
    const from = draft.events
      .map((entry) => findBlock(entry.blocks, source))
      .find(Boolean);
    const to = getBlocks(draft, address);
    if (!from || !to || from.block.id === address.parentId) return;
    if (
      address.parentId &&
      from.block.kind === "if" &&
      (findBlock(from.block.then, address.parentId) ||
        findBlock(from.block.else, address.parentId))
    )
      return;
    const [block] = from.blocks.splice(from.index, 1);
    const index = target
      ? to.findIndex((block) => block.id === target)
      : to.length;
    if (index >= 0) to.splice(index, 0, block);
    else from.blocks.splice(from.index, 0, block);
  });
}
function allowDrop(event: DragEvent) {
  if (event.dataTransfer.types.includes(dragType)) {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
  }
}
interface Cards {
  blueprint: Blueprint;
  axes: Project["input"];
  problems: Map<string, string[]>;
}
function CardList({
  blocks,
  address,
  ...data
}: Cards & { blocks: Block[]; address: ListAddress }) {
  return (
    <div
      className="card-list"
      onDragOver={allowDrop}
      onDrop={(event) => dropBlock(event, address)}
    >
      {blocks.map((block, index) => (
        <BlockCard
          key={block.id}
          address={address}
          block={block}
          index={index}
          count={blocks.length}
          {...data}
        />
      ))}
      <AddBlock address={address} />
    </div>
  );
}
function BlockCard({
  block,
  address,
  index,
  count,
  blueprint,
  axes,
  problems,
}: Cards & {
  block: Block;
  address: ListAddress;
  index: number;
  count: number;
}) {
  const selected = useEditor((state) => state.selectedTile === block.id);
  const active = useEditor((state) => state.snapshot.blocks.includes(block.id));
  const entity = useEditor(selectedEntity);
  const [closed, setClosed] = useState(
    () => localStorage.getItem(`mosaic-collapse-${block.id}`) === "1",
  );
  const info = kinds[block.kind];
  const Icon = symbolByKind(block);
  const expressions = (
    label: string,
    expr: Expression,
    change: (expr: Expression) => void,
    expected?: ValueType,
  ) => (
    <ExpressionControl
      label={label}
      expr={expr}
      change={change}
      expected={expected}
      blueprint={blueprint}
      axes={axes}
    />
  );
  const move = (offset: number) =>
    editBlueprint((draft) => {
      const list = getBlocks(draft, address);
      if (!list || index + offset < 0 || index + offset >= list.length) return;
      [list[index + offset], list[index]] = [list[index], list[index + offset]];
    });
  const variable =
    block.kind === "set"
      ? blueprint.variables.find((variable) => variable.id === block.variable)
      : undefined;
  const issues = problems.get(block.id);
  return (
    <article
      data-block-id={block.id}
      className={`logic-card ${info.tone} ${selected ? "focused" : ""} ${active ? "executed" : ""}`}
      onClick={(event) => {
        event.stopPropagation();
        useEditor.setState({ selectedTile: block.id });
      }}
      onDragOver={allowDrop}
      onDrop={(event) => dropBlock(event, address, block.id)}
    >
      <header className="logic-header">
        <button
          className="block-name"
          aria-label={nameByKind(block)}
          title="Select or drag to reorder"
          draggable
          onDragStart={(event) => {
            event.dataTransfer.setData(dragType, block.id);
            event.dataTransfer.effectAllowed = "move";
          }}
          onKeyDown={(event) => {
            if (
              event.altKey &&
              (event.key === "ArrowUp" || event.key === "ArrowDown")
            ) {
              event.preventDefault();
              move(event.key === "ArrowUp" ? -1 : 1);
            }
          }}
        >
          <Icon size={17} />
          <strong>{nameByKind(block)}</strong>
          {block.kind === "move" && <span>(Self)</span>}
        </button>
        {active && (
          <span className="execution-light" title="Executed in play mode" />
        )}
        {issues && (
          <CircleAlert
            size={15}
            className="problem-icon"
            aria-label="Blueprint diagnostic"
          />
        )}
        <button
          aria-label={closed ? "Expand block" : "Collapse block"}
          title={closed ? "Expand" : "Collapse"}
          onClick={() => {
            localStorage.setItem(
              `mosaic-collapse-${block.id}`,
              closed ? "0" : "1",
            );
            setClosed(!closed);
          }}
        >
          {closed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
        </button>
        <details className="block-actions">
          <summary aria-label="Block actions" title="Block actions">
            ···
          </summary>
          <div>
            <button disabled={index === 0} onClick={() => move(-1)}>
              Move up
            </button>
            <button disabled={index + 1 === count} onClick={() => move(1)}>
              Move down
            </button>
            <button
              onClick={() =>
                editBlueprint((draft) => {
                  getBlocks(draft, address)?.splice(index, 1);
                })
              }
            >
              Remove block
            </button>
          </div>
        </details>
      </header>
      {!closed && (
        <>
          <div className="logic-body">
            {block.kind === "set" && (
              <div className="expression-row">
                <select
                  aria-label="Assignment variable"
                  value={block.variable}
                  onChange={(event) =>
                    changeBlock(address, block.id, (draft) => {
                      if (draft.kind === "set") {
                        draft.variable = event.target.value;
                        const type = blueprint.variables.find(
                          (v) => v.id === draft.variable,
                        )?.type;
                        if (type) draft.value = literal(defaultValue[type]);
                      }
                    })
                  }
                >
                  {!variable && (
                    <option value={block.variable}>Choose variable</option>
                  )}
                  {blueprint.variables.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
                <span className="type-chip">
                  {variable?.type === "number"
                    ? "Float"
                    : (variable?.type ?? "Value")}
                </span>
                <b>=</b>
                {expressions(
                  "Assignment value",
                  block.value,
                  (value) =>
                    changeBlock(address, block.id, (draft) => {
                      if (draft.kind === "set") draft.value = value;
                    }),
                  variable?.type,
                )}
              </div>
            )}
            {block.kind === "if" && (
              <Field label="Condition">
                {expressions(
                  "Condition",
                  block.condition,
                  (value) =>
                    changeBlock(address, block.id, (draft) => {
                      if (draft.kind === "if") draft.condition = value;
                    }),
                  "boolean",
                )}
              </Field>
            )}
            {block.kind === "move" && (
              <>
                <div className="expression-row">
                  <span>Velocity</span>
                  {(["x", "y"] as const).map((axis) => (
                    <div className="expression-row" key={axis}>
                      <span className="axis-tag">{axis.toUpperCase()}</span>
                      {expressions(
                        `Velocity ${axis.toUpperCase()}`,
                        block[axis],
                        (value) =>
                          changeBlock(address, block.id, (draft) => {
                            if (draft.kind === "move") draft[axis] = value;
                          }),
                        "number",
                      )}
                    </div>
                  ))}
                </div>
                <div className="logic-note">Local space · units / second</div>
              </>
            )}
            {block.kind === "animate" && (
              <Field label="Animation">
                <input
                  aria-label="Animation clip"
                  list={`clips-${block.id}`}
                  value={block.clip}
                  maxLength={100}
                  onChange={(event) =>
                    changeBlock(address, block.id, (draft) => {
                      if (draft.kind === "animate")
                        draft.clip = event.target.value;
                    })
                  }
                />
                <datalist id={`clips-${block.id}`}>
                  {entity?.clips.map((clip) => (
                    <option value={clip.name} key={clip.id} />
                  ))}
                </datalist>
              </Field>
            )}
            {block.kind === "property" && (
              <>
                <Field label="Property">
                  <select
                    aria-label="Entity property"
                    value={block.property}
                    onChange={(event) =>
                      changeBlock(address, block.id, (draft) => {
                        if (draft.kind === "property") {
                          draft.property = event.target.value as Property;
                          draft.value = literal(
                            defaultValue[propertyTypes[draft.property]],
                          );
                        }
                      })
                    }
                  >
                    {Object.keys(propertyTypes).map((property) => (
                      <option key={property}>{property}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Value">
                  {expressions(
                    "Property value",
                    block.value,
                    (value) =>
                      changeBlock(address, block.id, (draft) => {
                        if (draft.kind === "property") draft.value = value;
                      }),
                    propertyTypes[block.property],
                  )}
                </Field>
              </>
            )}
            {block.kind === "log" && (
              <Field label="Value">
                {expressions("Log value", block.value, (value) =>
                  changeBlock(address, block.id, (draft) => {
                    if (draft.kind === "log") draft.value = value;
                  }),
                )}
              </Field>
            )}
            {issues?.map((issue) => (
              <div key={issue} className="logic-error">
                {issue}
              </div>
            ))}
          </div>
          {block.kind === "if" && (
            <div className="branch-stack">
              <CardList
                address={{
                  eventId: address.eventId,
                  parentId: block.id,
                  branch: "then",
                }}
                blocks={block.then}
                blueprint={blueprint}
                axes={axes}
                problems={problems}
              />
              <div className="else-branch">
                <div className="else-header">
                  <GitBranch size={14} /> Otherwise
                </div>
                <CardList
                  address={{
                    eventId: address.eventId,
                    parentId: block.id,
                    branch: "else",
                  }}
                  blocks={block.else}
                  blueprint={blueprint}
                  axes={axes}
                  problems={problems}
                />
              </div>
            </div>
          )}
        </>
      )}
    </article>
  );
}

export function BlueprintWorkspace() {
  const list = useEditor((state) => state.project.blueprints);
  const blueprint = useEditor(selectedBlueprint);
  const axes = useEditor((state) => state.project.input);
  const eventId = useEditor((state) => state.eventId);
  const [scale, setScale] = useState(100);
  const compiled = useMemo(
    () =>
      blueprint &&
      compileBlueprint(blueprint, new Set(axes.map((axis) => axis.id))),
    [axes, blueprint],
  );
  const diagnostics = compiled?.diagnostics ?? [];
  const problems = new Map<string, string[]>();
  for (const diagnostic of diagnostics)
    problems.set(diagnostic.blockId, [
      ...(problems.get(diagnostic.blockId) ?? []),
      diagnostic.message,
    ]);
  const event = blueprint && activeEvent(blueprint, eventId);
  return (
    <div className="workspace blueprint-workspace">
      <div className="workspace-bar">
        <Code2 size={17} />
        <select
          aria-label="Blueprint"
          value={blueprint?.id ?? ""}
          onChange={(change) =>
            useEditor.setState({
              blueprintId: change.target.value,
              eventId: null,
              selectedTile: null,
            })
          }
        >
          {!blueprint && <option value="">Choose a blueprint</option>}
          {list.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <button onClick={createBehaviour} title="New blueprint">
          <Plus size={15} /> New
        </button>
        {blueprint && (
          <>
            <span
              className={`blueprint-status push ${diagnostics.length ? "error" : ""}`}
            >
              {diagnostics.length
                ? `${diagnostics.length} problems`
                : "✓ Valid"}
            </span>
            <select
              aria-label="Blueprint zoom"
              value={scale}
              onChange={(event) => setScale(Number(event.target.value))}
            >
              {[75, 90, 100, 115, 130].map((size) => (
                <option key={size} value={size}>
                  {size}%
                </option>
              ))}
            </select>
          </>
        )}
      </div>
      {!blueprint || !event ? (
        <div className="empty-state">
          <Code2 size={26} />
          <h2>Blueprints</h2>
          <p>Create a behaviour to add event-driven logic to an entity.</p>
          <button onClick={createBehaviour}>New Blueprint</button>
        </div>
      ) : (
        <div className="blueprint-canvas">
          <div className="event-card" style={{ zoom: scale / 100 }}>
            <header className="event-header">
              <div className="event-icon">
                <Zap size={21} fill="currentColor" />
              </div>
              <div>
                <h2>{blueprint.name}</h2>
                <p>Event</p>
              </div>
              <select
                aria-label="Blueprint event"
                value={event.id}
                onChange={(change) =>
                  useEditor.setState({
                    eventId: change.target.value,
                    selectedTile: null,
                  })
                }
              >
                {blueprint.events.map((entry) => (
                  <option value={entry.id} key={entry.id}>
                    {entry.kind === "update"
                      ? "Update · Every Frame"
                      : "On Start"}
                  </option>
                ))}
              </select>
            </header>
            {problems.get(event.id)?.map((message) => (
              <p className="logic-error" key={message}>
                {message}
              </p>
            ))}
            <CardList
              address={{ eventId: event.id }}
              blocks={event.blocks}
              blueprint={blueprint}
              axes={axes}
              problems={problems}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export function LibraryPanel() {
  const [search, setSearch] = useState("");
  const hasBlueprint = useEditor((state) => Boolean(selectedBlueprint(state)));
  return (
    <div className="panel-body library-panel">
      <input
        aria-label="Search blocks"
        placeholder="Search blocks…"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      {Object.entries(kinds)
        .filter(([, info]) =>
          (info.name + " " + info.description)
            .toLowerCase()
            .includes(search.toLowerCase()),
        )
        .map(([kind, info]) => (
          <button
            className={`library-row ${info.tone}`}
            disabled={!hasBlueprint}
            key={kind}
            title={info.description}
            onClick={() => addBlock(kind as BlockKind)}
          >
            <info.Icon size={17} />
            {info.name}
            <Plus size={14} />
          </button>
        ))}
    </div>
  );
}

export function BlueprintInspector() {
  const blueprint = useEditor(selectedBlueprint);
  const eventId = useEditor((state) => state.eventId);
  const tile = useEditor((state) => state.selectedTile);
  const axes = useEditor((state) => state.project.input);
  if (!blueprint)
    return (
      <div className="panel-body muted">
        Choose a blueprint to edit its variables.
      </div>
    );
  const events = blueprint.events;
  const block = tile
    ? events.map((entry) => findBlock(entry.blocks, tile)).find(Boolean)?.block
    : undefined;
  const diagnostics = compileBlueprint(
    blueprint,
    new Set(axes.map((axis) => axis.id)),
  ).diagnostics;
  return (
    <div className="panel-body inspector">
      <div className="inspector-title">
        <div
          className={`object-icon ${block ? kinds[block.kind].tone : "purple"}`}
        >
          {block ? <ClipboardList size={20} /> : <Code2 size={20} />}
        </div>
        <div>
          <strong>{block ? nameByKind(block) : blueprint.name}</strong>
          <small>{block ? kinds[block.kind].description : "Blueprint"}</small>
        </div>
      </div>
      <Section title="Behaviour">
        <Field label="Name">
          <TextField
            label="Blueprint name"
            value={blueprint.name}
            onChange={(name) =>
              editBlueprint((draft) => {
                draft.name = name;
              })
            }
          />
        </Field>
      </Section>
      <Section title="Variables">
        {blueprint.variables.map((variable) => (
          <div className="variable-entry" key={variable.id}>
            <TextField
              label="Variable name"
              value={variable.name}
              onChange={(name) =>
                editBlueprint((draft) => {
                  draft.variables.find((v) => v.id === variable.id)!.name =
                    name;
                })
              }
            />
            <select
              aria-label="Variable type"
              value={variable.type}
              onChange={(event) =>
                editBlueprint((draft) => {
                  const value = draft.variables.find(
                    (v) => v.id === variable.id,
                  )!;
                  value.type = event.target.value as ValueType;
                  value.initial = defaultValue[value.type];
                })
              }
            >
              <option value="number">Float</option>
              <option value="boolean">Bool</option>
              <option value="string">Text</option>
            </select>
            <ValueControl
              label={`Initial ${variable.name}`}
              value={variable.initial}
              change={(value) =>
                editBlueprint((draft) => {
                  draft.variables.find((v) => v.id === variable.id)!.initial =
                    value;
                })
              }
            />
            <button
              aria-label={`Remove variable ${variable.name}`}
              onClick={() =>
                editBlueprint((draft) => {
                  draft.variables = draft.variables.filter(
                    (v) => v.id !== variable.id,
                  );
                })
              }
            >
              ×
            </button>
          </div>
        ))}
        <button
          className="section-button"
          onClick={() =>
            editBlueprint((draft) => {
              draft.variables.push({
                id: newId(),
                name: `variable${draft.variables.length + 1}`,
                initial: 0,
                type: "number",
              });
            })
          }
        >
          <Plus size={15} /> Variable
        </button>
      </Section>
      <Section title="Events">
        {events.map((entry) => (
          <button
            key={entry.id}
            className={`tree-row ${activeEvent(blueprint, eventId)?.id === entry.id ? "selected" : ""}`}
            onClick={() =>
              useEditor.setState({ eventId: entry.id, selectedTile: null })
            }
          >
            <Zap size={15} />
            {entry.kind === "update" ? "Update (Every Frame)" : "On Start"}
          </button>
        ))}
      </Section>
      {diagnostics.length > 0 && (
        <Section title="Problems">
          {diagnostics.map((d, index) => (
            <button
              key={index}
              className="diagnostic-row"
              onClick={() =>
                useEditor.setState({
                  selectedTile: d.blockId,
                  eventId:
                    events.find((entry) => findBlock(entry.blocks, d.blockId))
                      ?.id ?? eventId,
                })
              }
            >
              {d.message}
            </button>
          ))}
        </Section>
      )}
    </div>
  );
}
