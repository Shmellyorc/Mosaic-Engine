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
  Variable as VariableIcon,
  Zap,
  Circle,
  Clock3,
  Repeat2,
  Radio,
  ArrowUpRight,
  AudioLines,
  Sparkles,
} from "lucide-react";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from "react";
import {
  compileBlueprint,
  children as blockChildren,
  displayValue,
  parseExpression,
  typeOf,
  type Branch,
  type BlueprintEvent,
  type BlueprintFunction,
  type Signal,
  type Variable,
  defaultValue,
  literal,
  propertyTypes,
  easingSchema,
  motionPropertySchema,
  type EffectCommand,
  type Binary,
  type Block,
  type Blueprint,
  type Expression,
  type Property,
  type ValueType,
} from "@mosaic/blueprints";
import {
  createBlueprint,
  emptySignals,
  newId,
  type Project,
} from "@mosaic/model";
import {
  editBlueprint,
  selectedBlueprint,
  selectedEntity,
  selectedScene,
  useEditor,
} from "./state";
import { Field, Section, TextField } from "./controls";
import { TypeOptions, ValueControl } from "./blueprint-values";

const kinds = {
  set: {
    name: "Set Variable",
    description: "Store a typed value for this entity.",
    tone: "blue",
    Icon: VariableIcon,
  },
  if: {
    name: "If",
    description:
      "Run one of two nested sequences when a condition is evaluated.",
    tone: "blue",
    Icon: GitBranch,
  },
  let: {
    name: "Declare Local",
    description: "Declare a typed variable for the rest of this stack.",
    tone: "blue",
    Icon: VariableIcon,
  },
  repeat: {
    name: "Repeat",
    description: "Run a nested stack a fixed number of times.",
    tone: "blue",
    Icon: Repeat2,
  },
  while: {
    name: "While",
    description: "Run a nested stack as long as a condition remains true.",
    tone: "blue",
    Icon: Repeat2,
  },
  break: {
    name: "Break",
    description: "Exit the nearest loop.",
    tone: "neutral",
    Icon: ArrowUpRight,
  },
  continue: {
    name: "Continue",
    description: "Start the next iteration of the nearest loop.",
    tone: "neutral",
    Icon: Repeat2,
  },
  call: {
    name: "Call Function",
    description: "Run a reusable typed stack and optionally store its result.",
    tone: "purple",
    Icon: Code2,
  },
  return: {
    name: "Return",
    description: "Finish the current function.",
    tone: "purple",
    Icon: ArrowUpRight,
  },
  emit: {
    name: "Emit Event",
    description: "Send a typed event to listeners in this scene.",
    tone: "purple",
    Icon: Radio,
  },
  wait: {
    name: "Wait",
    description: "Pause this stack for simulation time.",
    tone: "blue",
    Icon: Clock3,
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
  animationParameter: {
    name: "Set Animation Parameter",
    description: "Set a numeric Animator parameter on this entity.",
    tone: "purple",
    Icon: Film,
  },
  timeline: {
    name: "Control Timeline",
    description: "Play or stop a timeline in this scene.",
    tone: "purple",
    Icon: Clock3,
  },
  tween: {
    name: "Tween Property",
    description: "Animate a numeric transform property over simulation time.",
    tone: "green",
    Icon: Move,
  },
  particles: {
    name: "Control Particles",
    description: "Burst, start, or stop this entity’s emitter.",
    tone: "green",
    Icon: Sparkles,
  },
  sound: {
    name: "Control Sound",
    description: "Play or stop an imported sound through its mixer bus.",
    tone: "purple",
    Icon: AudioLines,
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
type ListAddress = { eventId: string; parentId?: string; branch?: Branch };
type Match = { blocks: Block[]; index: number; block: Block };
const operators: Record<Binary, string> = {
  "+": "+",
  "-": "−",
  "*": "×",
  "/": "÷",
  "%": "%",
  "<=": "≤",
  ">=": "≥",
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
    for (const { blocks } of blockChildren(block)) {
      const found = findBlock(blocks, id);
      if (found) return found;
    }
  }
}
type Entry = BlueprintEvent | BlueprintFunction;
function entries(blueprint: Blueprint): Entry[] {
  return [...blueprint.events, ...(blueprint.functions ?? [])];
}
function activeEvent(blueprint: Blueprint, eventId: string | null) {
  return (
    entries(blueprint).find((entry) => entry.id === eventId) ??
    blueprint.events[0] ??
    blueprint.functions?.[0]
  );
}
function entryName(entry: Entry, signals: readonly Signal[]): string {
  if ("parameters" in entry) return entry.name;
  if (entry.kind === "start") return "On Start";
  if (entry.kind === "update") return "Update (Every Frame)";
  return (
    signals.find((signal) => signal.id === entry.signalId)?.name ??
    "Missing event"
  );
}
function getBlocks(blueprint: Blueprint, address: ListAddress) {
  const entry = entries(blueprint).find(
    (entry) => entry.id === address.eventId,
  );
  if (!address.parentId || !entry) return entry?.blocks;
  const parent = findBlock(entry.blocks, address.parentId)?.block;
  return (
    parent &&
    blockChildren(parent).find((child) => child.branch === address.branch)
      ?.blocks
  );
}
function variablesAt(
  blueprint: Blueprint,
  address: ListAddress,
  signals: readonly Signal[],
  before?: string,
): Variable[] {
  const entry = entries(blueprint).find(
    (entry) => entry.id === address.eventId,
  );
  const variables: Variable[] = [...blueprint.variables];
  if (!entry) return variables;
  if ("parameters" in entry) variables.push(...entry.parameters);
  else if (entry.kind === "signal") {
    const signal = signals.find((signal) => signal.id === entry.signalId);
    if (signal && signal.type !== "void")
      variables.push({ id: entry.id, name: "payload", type: signal.type });
  }
  function walk(blocks: Block[], current: Variable[]): Variable[] | undefined {
    for (const block of blocks) {
      if (block.id === before) return current;
      if (block.kind === "let")
        current.push({ id: block.id, name: block.name, type: block.type });
      for (const child of blockChildren(block)) {
        if (
          !before &&
          block.id === address.parentId &&
          child.branch === address.branch
        ) {
          const inner = [...current];
          return walk(child.blocks, inner) ?? inner;
        }
        const found = walk(child.blocks, [...current]);
        if (found) return found;
      }
    }
    if (!before && blocks === entry!.blocks && !address.parentId)
      return current;
  }
  return walk(entry.blocks, variables) ?? variables;
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
  variables: Variable[],
  signals: readonly Signal[],
  entry: Entry | undefined,
  clip?: string,
): Block {
  const id = newId();
  const firstVariable = variables[0];
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
    case "let":
      return { id, kind, name: "local", type: "number", value: literal(0) };
    case "repeat":
      return { id, kind, count: literal(3), body: [] };
    case "while":
      return { id, kind, condition: literal(false), body: [] };
    case "break":
    case "continue":
      return { id, kind };
    case "wait":
      return { id, kind, seconds: literal(0.25) };
    case "call": {
      const fn = blueprint.functions?.[0];
      return {
        id,
        kind,
        functionId: fn?.id ?? "unassigned",
        args: Object.fromEntries(
          (fn?.parameters ?? []).map((p) => [
            p.id,
            literal(defaultValue[p.type]),
          ]),
        ),
      };
    }
    case "return": {
      const returns = entry && "parameters" in entry && entry.returns;
      return {
        id,
        kind,
        ...(returns && returns !== "void"
          ? { value: literal(defaultValue[returns]) }
          : {}),
      };
    }
    case "emit": {
      const signal = signals[0];
      return {
        id,
        kind,
        signalId: signal?.id ?? "unassigned",
        ...(signal && signal.type !== "void"
          ? { value: literal(defaultValue[signal.type]) }
          : {}),
      };
    }
    case "move":
      return { id, kind, x: literal(0), y: literal(0) };
    case "animate":
      return { id, kind, clip: clip ?? "" };
    case "animationParameter":
      return { id, kind, parameterId: "unassigned", value: literal(0) };
    case "timeline":
      return { id, kind, timelineId: "unassigned", playing: true };
    case "tween":
      return {
        id,
        kind,
        property: "alpha",
        value: literal(1),
        seconds: literal(0.5),
        ease: "linear",
      };
    case "particles":
      return { id, kind, operation: "burst" };
    case "sound":
      return { id, kind, soundId: "unassigned", playing: true };
    case "property":
      return { id, kind, property: "visible", value: literal(true) };
    case "log":
      return { id, kind, value: literal("Hello from Mosaic") };
  }
}
function addBlock(kind: BlockKind, address?: ListAddress) {
  const state = useEditor.getState();
  const blueprint = selectedBlueprint(state);
  if (!blueprint) return;
  const event = activeEvent(blueprint, state.eventId);
  if (!address && !event) return;
  const target = address ?? { eventId: event!.id };
  const signals = state.project.signals ?? emptySignals;
  const block = makeBlock(
    kind,
    blueprint,
    variablesAt(blueprint, target, signals),
    signals,
    entries(blueprint).find((entry) => entry.id === target.eventId),
    selectedEntity(state)?.clips[0]?.name,
  );
  editBlueprint((draft) => {
    draft.version = 2;
    getBlocks(draft, target)?.push(block);
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
  variables: Variable[];
  axes: Project["input"];
  change: (expr: Expression) => void;
};
function ExpressionControl({
  expr,
  label,
  expected,
  variables,
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
              : displayValue(expression.value)}
          </span>
        );
      case "variable":
        return (
          <span className="value-chip">
            {variables.find((v) => v.id === expression.id)?.name ??
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
      case "unary":
        return (
          <span>
            {expression.op}({summary(expression.value)})
          </span>
        );
      case "query":
        return <span>{expression.query}</span>;
      case "property":
        return (
          <span>
            {expression.target ? summary(expression.target) : "Self"}.
            {expression.property}
          </span>
        );
      case "exists":
        return <span>Exists({summary(expression.reference)})</span>;
      case "vector":
        return (
          <span>
            Vector({summary(expression.x)}, {summary(expression.y)})
          </span>
        );
      case "component":
        return (
          <span>
            {summary(expression.vector)}.{expression.axis}
          </span>
        );
      case "field":
        return (
          <span>
            {summary(expression.record)}.{expression.key || "field"}
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
    switch (kind) {
      case "literal":
        change(literal(defaultValue[expected ?? "number"]));
        break;
      case "input":
        change({ kind, id: axes[0]?.id ?? "unassigned" });
        break;
      case "variable":
        change({
          kind,
          id:
            (variables.find((v) => v.type === expected) ?? variables[0])?.id ??
            "unassigned",
        });
        break;
      case "binary":
        change({
          kind,
          op: expected === "boolean" ? "!=" : "+",
          left: literal(0),
          right: literal(0),
        });
        break;
      case "unary":
        change({
          kind,
          op: expected === "boolean" ? "not" : "abs",
          value: literal(expected === "boolean" ? false : 0),
        });
        break;
      case "query":
        change({ kind, query: expected === "string" ? "scene" : "self" });
        break;
      case "property":
        change({
          kind,
          property:
            expected === "boolean"
              ? "visible"
              : expected === "string"
                ? "text"
                : "x",
        });
        break;
      case "exists":
        change({ kind, reference: { kind: "query", query: "self" } });
        break;
      case "vector":
        change({ kind, x: literal(0), y: literal(0) });
        break;
      case "component":
        change({ kind, axis: "x", vector: literal(defaultValue.vector) });
        break;
      case "field":
        change({
          kind,
          key: "",
          type: expected && expected !== "record" ? expected : "number",
          record: literal(defaultValue.record),
        });
        break;
    }
  }
  const nested = (
    name: string,
    value: Expression,
    update: (value: Expression) => void,
    type?: ValueType,
  ) => (
    <Field label={name}>
      <ExpressionControl
        expr={value}
        label={label + " " + name.toLowerCase()}
        change={update}
        variables={variables}
        axes={axes}
        expected={type}
      />
    </Field>
  );
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
              <option value="unary">Unary operation</option>
              <option value="query">Scene query</option>
              <option value="property">Read property</option>
              <option value="exists">Reference exists</option>
              <option value="vector">Make vector</option>
              <option value="component">Vector component</option>
              <option value="field">Record field</option>
            </select>
          </Field>
          <ExpressionEntry
            label={label}
            variables={variables}
            axes={axes}
            change={change}
          />
          {expr.kind === "literal" && (
            <>
              <Field label="Type">
                <select
                  aria-label={`${label} type`}
                  value={typeOf(expr.value)}
                  onChange={(event) =>
                    change(
                      literal(defaultValue[event.target.value as ValueType]),
                    )
                  }
                >
                  <TypeOptions />
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
                {!variables.some((variable) => variable.id === expr.id) && (
                  <option value={expr.id}>Choose a variable</option>
                )}
                {variables.map((v) => (
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
          {expr.kind === "unary" && (
            <>
              <Field label="Operator">
                <select
                  aria-label={label + " unary operator"}
                  value={expr.op}
                  onChange={(e) => {
                    const op = e.target.value as typeof expr.op;
                    change({
                      ...expr,
                      op,
                      value:
                        (op === "not") === (expr.op === "not")
                          ? expr.value
                          : literal(op === "not" ? false : 0),
                    });
                  }}
                >
                  {["not", "negate", "abs", "floor", "round", "sqrt"].map(
                    (op) => (
                      <option key={op}>{op}</option>
                    ),
                  )}
                </select>
              </Field>
              {nested(
                "Operand",
                expr.value,
                (value) => change({ ...expr, value }),
                expr.op === "not" ? "boolean" : "number",
              )}
            </>
          )}
          {expr.kind === "query" && (
            <Field label="Query">
              <select
                aria-label={label + " query"}
                value={expr.query}
                onChange={(e) =>
                  change({
                    ...expr,
                    query: e.target.value as typeof expr.query,
                  })
                }
              >
                <option value="self">Self Entity</option>
                <option value="parent">Parent Entity</option>
                <option value="scene">Scene Name</option>
              </select>
            </Field>
          )}
          {expr.kind === "property" && (
            <>
              <PropertyChoice
                label={label + " property"}
                value={expr.property}
                change={(property) => change({ ...expr, property })}
              />
              <TargetChoice
                target={expr.target}
                set={(target) => change({ ...expr, target })}
                render={(target) =>
                  nested(
                    "Entity",
                    target,
                    (next) => change({ ...expr, target: next }),
                    "entity",
                  )
                }
              />
            </>
          )}
          {expr.kind === "exists" &&
            nested(
              "Reference",
              expr.reference,
              (reference) => change({ ...expr, reference }),
              "entity",
            )}
          {expr.kind === "vector" && (
            <>
              {nested("X", expr.x, (x) => change({ ...expr, x }), "number")}
              {nested("Y", expr.y, (y) => change({ ...expr, y }), "number")}
            </>
          )}
          {expr.kind === "component" && (
            <>
              <Field label="Axis">
                <select
                  aria-label={label + " component"}
                  value={expr.axis}
                  onChange={(e) =>
                    change({ ...expr, axis: e.target.value as "x" | "y" })
                  }
                >
                  <option>x</option>
                  <option>y</option>
                </select>
              </Field>
              {nested(
                "Vector",
                expr.vector,
                (vector) => change({ ...expr, vector }),
                "vector",
              )}
            </>
          )}
          {expr.kind === "field" && (
            <>
              {nested(
                "Record",
                expr.record,
                (record) => change({ ...expr, record }),
                "record",
              )}
              <Field label="Field">
                <TextField
                  label={label + " record field"}
                  value={expr.key}
                  onChange={(key) => change({ ...expr, key })}
                />
              </Field>
              <Field label="Type">
                <select
                  aria-label={label + " field type"}
                  value={expr.type}
                  onChange={(e) =>
                    change({
                      ...expr,
                      type: e.target.value as typeof expr.type,
                    })
                  }
                >
                  <TypeOptions allowRecord={false} />
                </select>
              </Field>
            </>
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
                  variables={variables}
                  axes={axes}
                  change={(left) => change({ ...expr, left })}
                />
              </Field>
              <Field label="Right">
                <ExpressionControl
                  expr={expr.right}
                  label={`${label} right`}
                  variables={variables}
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
function ExpressionEntry({
  label,
  variables,
  axes,
  change,
}: Pick<ExprProps, "label" | "variables" | "axes" | "change">) {
  const [source, setSource] = useState("");
  const [error, setError] = useState("");
  const listId = useId();
  function apply() {
    try {
      change(parseExpression(source, { variables, axes }));
      setError("");
      setSource("");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  }
  return (
    <details className="expression-source">
      <summary>Enter expression</summary>
      <div className="inline-actions">
        <input
          aria-label={label + " expression"}
          value={source}
          list={listId}
          maxLength={4096}
          onChange={(event) => setSource(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              apply();
            }
          }}
        />
        <button disabled={!source.trim()} onClick={apply}>
          Apply
        </button>
      </div>
      <datalist id={listId}>
        {variables.map((v) => (
          <option
            key={v.id}
            value={
              /^[A-Za-z_$][\w$]*$/.test(v.name)
                ? v.name
                : `variable(${JSON.stringify(v.name)})`
            }
          />
        ))}
        {axes.map((axis) => (
          <option key={axis.id} value={`axis(${JSON.stringify(axis.name)})`} />
        ))}
      </datalist>
      {error && (
        <small className="logic-error" role="alert">
          {error}
        </small>
      )}
    </details>
  );
}
function PropertyChoice({
  label,
  value,
  change,
}: {
  label: string;
  value: Property;
  change: (property: Property) => void;
}) {
  return (
    <Field label="Property">
      <select
        aria-label={label}
        value={value}
        onChange={(e) => change(e.target.value as Property)}
      >
        {Object.keys(propertyTypes).map((property) => (
          <option key={property}>{property}</option>
        ))}
      </select>
    </Field>
  );
}
function TargetChoice({
  target,
  set,
  render,
}: {
  target?: Expression;
  set: (target?: Expression) => void;
  render: (target: Expression) => ReactNode;
}) {
  return (
    <>
      <Field label="Target">
        <select
          aria-label="Target mode"
          value={target ? "entity" : "self"}
          onChange={(e) =>
            set(
              e.target.value === "entity"
                ? literal(defaultValue.entity)
                : undefined,
            )
          }
        >
          <option value="self">Self</option>
          <option value="entity">Entity expression</option>
        </select>
      </Field>
      {target && render(target)}
    </>
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
    const from = entries(draft)
      .map((entry) => findBlock(entry.blocks, source))
      .find(Boolean);
    const to = getBlocks(draft, address);
    if (!from || !to || from.block.id === address.parentId) return;
    if (
      address.parentId &&
      blockChildren(from.block).some((child) =>
        findBlock(child.blocks, address.parentId!),
      )
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
  signals: readonly Signal[];
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
  signals,
}: Cards & {
  block: Block;
  address: ListAddress;
  index: number;
  count: number;
}) {
  const selected = useEditor((state) => state.selectedTile === block.id);
  const active = useEditor((state) => state.snapshot.blocks.includes(block.id));
  const breakpoint = useEditor(
    (state) =>
      Object.hasOwn(state.breakpoints, blueprint.id) &&
      state.breakpoints[blueprint.id].includes(block.id),
  );
  const paused = useEditor(
    (state) =>
      state.snapshot.pause?.blueprintId === blueprint.id &&
      state.snapshot.pause.blockId === block.id,
  );
  const card = useRef<HTMLElement>(null);
  useEffect(() => {
    if (selected) card.current?.scrollIntoView({ block: "nearest" });
  }, [selected]);
  const entity = useEditor(selectedEntity);
  const [closed, setClosed] = useState(
    () => localStorage.getItem(`mosaic-collapse-${block.id}`) === "1",
  );
  const variables = variablesAt(blueprint, address, signals, block.id);
  const entry = entries(blueprint).find(
    (entry) => entry.id === address.eventId,
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
      variables={variables}
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
      ? variables.find((variable) => variable.id === block.variable)
      : undefined;
  const issues = problems.get(block.id);
  return (
    <article
      ref={card}
      data-block-id={block.id}
      className={`logic-card ${info.tone} ${selected ? "focused" : ""} ${active ? "executed" : ""} ${paused ? "debug-paused" : ""}`}
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
            if (event.key === "F9") {
              event.preventDefault();
              useEditor.getState().toggleBreakpoint(blueprint.id, block.id);
            }
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
        <button
          className={`breakpoint ${breakpoint ? "enabled" : ""}`}
          aria-label={breakpoint ? "Remove breakpoint" : "Set breakpoint"}
          aria-pressed={breakpoint}
          title={breakpoint ? "Remove breakpoint (F9)" : "Set breakpoint (F9)"}
          onClick={() =>
            useEditor.getState().toggleBreakpoint(blueprint.id, block.id)
          }
        >
          <Circle size={12} fill={breakpoint ? "currentColor" : "none"} />
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
            <AdvancedFields
              block={block}
              blueprint={blueprint}
              signals={signals}
              variables={variables}
              entry={entry}
              expression={expressions}
              replace={(next) =>
                changeBlock(address, block.id, (draft) =>
                  Object.assign(draft, next),
                )
              }
            />
            {block.kind === "set" && (
              <div className="expression-row">
                <select
                  aria-label="Assignment variable"
                  value={block.variable}
                  onChange={(event) =>
                    changeBlock(address, block.id, (draft) => {
                      if (draft.kind === "set") {
                        draft.variable = event.target.value;
                        const type = variables.find(
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
                  {variables.map((v) => (
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
                <TargetChoice
                  target={block.target}
                  set={(target) =>
                    changeBlock(address, block.id, (draft) => {
                      if (draft.kind === "property") draft.target = target;
                    })
                  }
                  render={(target) => (
                    <Field label="Entity">
                      {expressions(
                        "Target entity",
                        target,
                        (next) =>
                          changeBlock(address, block.id, (draft) => {
                            if (draft.kind === "property") draft.target = next;
                          }),
                        "entity",
                      )}
                    </Field>
                  )}
                />
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
          {(block.kind === "repeat" || block.kind === "while") && (
            <div className="branch-stack">
              <CardList
                address={{
                  eventId: address.eventId,
                  parentId: block.id,
                  branch: "body",
                }}
                blocks={block.body}
                blueprint={blueprint}
                axes={axes}
                problems={problems}
                signals={signals}
              />
            </div>
          )}
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
                signals={signals}
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
                  signals={signals}
                />
              </div>
            </div>
          )}
        </>
      )}
    </article>
  );
}

type RenderExpression = (
  label: string,
  expr: Expression,
  change: (expr: Expression) => void,
  expected?: ValueType,
) => ReactNode;
type EffectBlock = Extract<Block, { kind: EffectCommand["kind"] }>;

function EffectChoice({
  label,
  value,
  options,
  change,
}: {
  label: string;
  value: string;
  options: readonly { id: string; name: string }[];
  change: (value: string) => void;
}) {
  return (
    <Field label={label}>
      <select
        aria-label={label}
        value={value}
        onChange={(event) => change(event.target.value)}
      >
        {!options.some((item) => item.id === value) && (
          <option value={value} disabled>
            {value === "unassigned" ? "Choose…" : "Unavailable (" + value + ")"}
          </option>
        )}
        {options.map(({ id, name }) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
      </select>
    </Field>
  );
}

function EffectFields({
  block,
  expression,
  replace,
}: {
  block: EffectBlock;
  expression: RenderExpression;
  replace: (block: Block) => void;
}) {
  const entity = useEditor(selectedEntity);
  const timelines = useEditor((state) => selectedScene(state).timelines);
  const sounds = useEditor((state) => state.project.mixer?.sounds);
  const transport = [
    { id: "play", name: "Play" },
    { id: "stop", name: "Stop" },
  ];
  switch (block.kind) {
    case "animationParameter":
      return (
        <>
          <EffectChoice
            label="Animation parameter"
            value={block.parameterId}
            options={entity?.animator?.parameters ?? []}
            change={(parameterId) => replace({ ...block, parameterId })}
          />
          <Field label="Value">
            {expression(
              "Animation parameter value",
              block.value,
              (value) => replace({ ...block, value }),
              "number",
            )}
          </Field>
        </>
      );
    case "timeline":
    case "sound":
      return (
        <>
          {block.kind === "timeline" ? (
            <EffectChoice
              label="Timeline"
              value={block.timelineId}
              options={timelines ?? []}
              change={(timelineId) => replace({ ...block, timelineId })}
            />
          ) : (
            <EffectChoice
              label="Sound"
              value={block.soundId}
              options={sounds ?? []}
              change={(soundId) => replace({ ...block, soundId })}
            />
          )}
          <EffectChoice
            label="Playback"
            value={block.playing ? "play" : "stop"}
            options={transport}
            change={(value) => replace({ ...block, playing: value === "play" })}
          />
        </>
      );
    case "particles":
      return (
        <EffectChoice
          label="Emitter action"
          value={block.operation}
          options={[
            { id: "burst", name: "Burst" },
            { id: "start", name: "Start emission" },
            { id: "stop", name: "Stop emission" },
          ]}
          change={(operation) =>
            replace({
              ...block,
              operation: operation as typeof block.operation,
            })
          }
        />
      );
    case "tween":
      return (
        <>
          <EffectChoice
            label="Tween property"
            value={block.property}
            options={motionPropertySchema.options.map((id) => ({
              id,
              name: id,
            }))}
            change={(property) =>
              replace({
                ...block,
                property: motionPropertySchema.parse(property),
              })
            }
          />
          <Field label="To">
            {expression(
              "Tween destination",
              block.value,
              (value) => replace({ ...block, value }),
              "number",
            )}
          </Field>
          <Field label="Seconds">
            {expression(
              "Tween duration",
              block.seconds,
              (seconds) => replace({ ...block, seconds }),
              "number",
            )}
          </Field>
          <EffectChoice
            label="Tween easing"
            value={block.ease}
            options={easingSchema.options.map((id) => ({ id, name: id }))}
            change={(ease) =>
              replace({ ...block, ease: easingSchema.parse(ease) })
            }
          />
        </>
      );
  }
}

function AdvancedFields({
  block,
  blueprint,
  signals,
  variables,
  entry,
  expression,
  replace,
}: {
  block: Block;
  blueprint: Blueprint;
  signals: readonly Signal[];
  variables: Variable[];
  entry?: Entry;
  expression: RenderExpression;
  replace: (block: Block) => void;
}) {
  switch (block.kind) {
    case "animationParameter":
    case "timeline":
    case "tween":
    case "particles":
    case "sound":
      return (
        <EffectFields block={block} expression={expression} replace={replace} />
      );
    case "let":
      return (
        <>
          <div className="expression-row">
            <TextField
              label="Local name"
              value={block.name}
              onChange={(name) => replace({ ...block, name })}
            />
            <select
              aria-label="Local type"
              value={block.type}
              onChange={(event) => {
                const type = event.target.value as ValueType;
                replace({ ...block, type, value: literal(defaultValue[type]) });
              }}
            >
              <TypeOptions />
            </select>
            <b>=</b>
            {expression(
              "Local value",
              block.value,
              (value) => replace({ ...block, value }),
              block.type,
            )}
          </div>
        </>
      );
    case "repeat":
      return (
        <Field label="Count">
          {expression(
            "Repeat count",
            block.count,
            (count) => replace({ ...block, count }),
            "number",
          )}
        </Field>
      );
    case "while":
      return (
        <Field label="Condition">
          {expression(
            "Loop condition",
            block.condition,
            (condition) => replace({ ...block, condition }),
            "boolean",
          )}
        </Field>
      );
    case "wait":
      return (
        <Field label="Seconds">
          {expression(
            "Wait duration",
            block.seconds,
            (seconds) => replace({ ...block, seconds }),
            "number",
          )}
        </Field>
      );
    case "call": {
      const fn = blueprint.functions?.find((fn) => fn.id === block.functionId);
      const results = variables.filter(
        (variable) => variable.type === fn?.returns,
      );
      return (
        <>
          <Field label="Function">
            <select
              aria-label="Function to call"
              value={block.functionId}
              onChange={(event) => {
                const next = blueprint.functions?.find(
                  (item) => item.id === event.target.value,
                );
                if (!next) return;
                replace({
                  ...block,
                  functionId: next.id,
                  args: Object.fromEntries(
                    next.parameters.map((p) => [
                      p.id,
                      literal(defaultValue[p.type]),
                    ]),
                  ),
                  result: undefined,
                });
              }}
            >
              {!fn && <option value={block.functionId}>Choose function</option>}
              {blueprint.functions?.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
          {fn?.parameters.map((parameter) => {
            const value = Object.hasOwn(block.args, parameter.id)
              ? block.args[parameter.id]
              : undefined;
            const set = (value: Expression) =>
              replace({
                ...block,
                args: { ...block.args, [parameter.id]: value },
              });
            return (
              <Field label={parameter.name} key={parameter.id}>
                {value ? (
                  expression(
                    "Argument " + parameter.name,
                    value,
                    set,
                    parameter.type,
                  )
                ) : (
                  <button
                    onClick={() => set(literal(defaultValue[parameter.type]))}
                  >
                    Set Default
                  </button>
                )}
              </Field>
            );
          })}
          {fn && fn.returns !== "void" && (
            <Field label="Store result">
              <select
                aria-label="Function result variable"
                value={block.result ?? ""}
                onChange={(event) =>
                  replace({ ...block, result: event.target.value || undefined })
                }
              >
                <option value="">Discard</option>
                {block.result &&
                  !results.some((v) => v.id === block.result) && (
                    <option value={block.result}>
                      Missing result variable
                    </option>
                  )}
                {results.map((variable) => (
                  <option key={variable.id} value={variable.id}>
                    {variable.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </>
      );
    }
    case "return": {
      const type = entry && "parameters" in entry ? entry.returns : undefined;
      if (!type || type === "void")
        return (
          block.value && (
            <button onClick={() => replace({ ...block, value: undefined })}>
              Remove Return Value
            </button>
          )
        );
      return (
        <Field label="Value">
          {block.value ? (
            expression(
              "Return value",
              block.value,
              (value) => replace({ ...block, value }),
              type,
            )
          ) : (
            <button
              onClick={() =>
                replace({ ...block, value: literal(defaultValue[type]) })
              }
            >
              Set Return Value
            </button>
          )}
        </Field>
      );
    }
    case "emit": {
      const signal = signals.find((signal) => signal.id === block.signalId);
      const type = signal?.type;
      return (
        <>
          <Field label="Event">
            <select
              aria-label="Event to emit"
              value={block.signalId}
              onChange={(event) => {
                const next = signals.find(
                  (item) => item.id === event.target.value,
                );
                if (next)
                  replace({
                    ...block,
                    signalId: next.id,
                    value:
                      next.type === "void"
                        ? undefined
                        : literal(defaultValue[next.type]),
                  });
              }}
            >
              {!signal && <option value={block.signalId}>Choose event</option>}
              {signals.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
          {type && type !== "void" && (
            <Field label="Payload">
              {block.value ? (
                expression(
                  "Event payload",
                  block.value,
                  (value) => replace({ ...block, value }),
                  type,
                )
              ) : (
                <button
                  onClick={() =>
                    replace({ ...block, value: literal(defaultValue[type]) })
                  }
                >
                  Set Payload
                </button>
              )}
            </Field>
          )}
          {type === "void" && block.value && (
            <button onClick={() => replace({ ...block, value: undefined })}>
              Remove Payload
            </button>
          )}
        </>
      );
    }
    default:
      return null;
  }
}

export function BlueprintWorkspace() {
  const list = useEditor((state) => state.project.blueprints);
  const blueprint = useEditor(selectedBlueprint);
  const axes = useEditor((state) => state.project.input);
  const signals = useEditor((state) => state.project.signals ?? emptySignals);
  const eventId = useEditor((state) => state.eventId);
  const [scale, setScale] = useState(100);
  const compiled = useMemo(
    () =>
      blueprint &&
      compileBlueprint(
        blueprint,
        new Set(axes.map((axis) => axis.id)),
        signals,
      ),
    [axes, blueprint, signals],
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
                <p>{"parameters" in event ? "Function" : "Event"}</p>
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
                {entries(blueprint).map((entry) => (
                  <option value={entry.id} key={entry.id}>
                    {entryName(entry, signals)}
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
              signals={signals}
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
  const signals = useEditor((state) => state.project.signals ?? emptySignals);
  if (!blueprint)
    return (
      <div className="panel-body muted">
        Choose a blueprint to edit its variables.
      </div>
    );
  const block = tile
    ? entries(blueprint)
        .map((entry) => findBlock(entry.blocks, tile))
        .find(Boolean)?.block
    : undefined;
  const diagnostics = compileBlueprint(
    blueprint,
    new Set(axes.map((axis) => axis.id)),
    signals,
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
          <div
            className={`variable-entry ${typeof variable.initial === "object" ? "compound-variable" : ""}`}
            key={variable.id}
          >
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
                  draft.version = 2;
                  value.type = event.target.value as ValueType;
                  value.initial = defaultValue[value.type];
                })
              }
            >
              <TypeOptions />
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
      <EntryInspector
        blueprint={blueprint}
        signals={signals}
        active={activeEvent(blueprint, eventId)}
      />
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
                    entries(blueprint).find(
                      (entry) =>
                        entry.id === d.blockId ||
                        findBlock(entry.blocks, d.blockId),
                    )?.id ?? eventId,
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

export function symbolName(blueprint: Blueprint | undefined, id: string) {
  if (!blueprint) return id;
  const variable = blueprint.variables.find((item) => item.id === id);
  if (variable) return variable.name;
  for (const entry of entries(blueprint)) {
    if ("parameters" in entry) {
      const parameter = entry.parameters.find((item) => item.id === id);
      if (parameter) return parameter.name;
    } else if (entry.id === id && entry.kind === "signal") return "payload";
    const local = findBlock(entry.blocks, id)?.block;
    if (local?.kind === "let") return local.name;
  }
  return id;
}
export function revealBlock(blueprint: Blueprint | undefined, blockId: string) {
  const entry =
    blueprint &&
    entries(blueprint).find(
      (entry) => entry.id === blockId || findBlock(entry.blocks, blockId),
    );
  if (entry)
    useEditor.setState({
      blueprintId: blueprint!.id,
      workspace: "Blueprints",
      eventId: entry.id,
      selectedTile: blockId,
    });
}
function showEntry(entryId: string) {
  useEditor.setState({ eventId: entryId, selectedTile: null });
}
function EntryInspector({
  blueprint,
  signals,
  active,
}: {
  blueprint: Blueprint;
  signals: readonly Signal[];
  active?: Entry;
}) {
  function addEvent(value: string) {
    if (!value) return;
    const id = newId();
    const kind = value === "start" || value === "update" ? value : "signal";
    editBlueprint((draft) => {
      draft.version = 2;
      draft.events.push({
        id,
        kind,
        ...(kind === "signal" ? { signalId: value.slice(7) } : {}),
        blocks: [],
      });
    });
    showEntry(id);
  }
  function addFunction() {
    const id = newId();
    editBlueprint((draft) => {
      draft.version = 2;
      (draft.functions ??= []).push({
        id,
        name: "New Function",
        parameters: [],
        returns: "void",
        blocks: [],
      });
    });
    showEntry(id);
  }
  function updateFunction(id: string, change: (fn: BlueprintFunction) => void) {
    editBlueprint((draft) => {
      const fn = draft.functions?.find((item) => item.id === id);
      if (fn) change(fn);
    });
  }
  const currentFunction = active && "parameters" in active ? active : undefined;
  const currentEvent = active && "kind" in active ? active : undefined;
  return (
    <>
      <Section title="Events">
        {blueprint.events.map((entry) => (
          <button
            key={entry.id}
            className={`tree-row ${active?.id === entry.id ? "selected" : ""}`}
            onClick={() => showEntry(entry.id)}
          >
            <Zap size={15} />
            {entryName(entry, signals)}
          </button>
        ))}
        <select
          aria-label="Add event handler"
          value=""
          disabled={blueprint.events.length >= 80}
          onChange={(event) => addEvent(event.target.value)}
        >
          <option value="">+ Event Handler</option>
          <option value="start">On Start</option>
          <option value="update">Update (Every Frame)</option>
          {signals.map((signal) => (
            <option key={signal.id} value={"signal:" + signal.id}>
              {signal.name}
            </option>
          ))}
        </select>
        {currentEvent && (
          <button
            className="danger"
            onClick={() =>
              editBlueprint((draft) => {
                draft.events = draft.events.filter(
                  (event) => event.id !== currentEvent.id,
                );
              })
            }
          >
            Remove Selected Event
          </button>
        )}
      </Section>
      <Section title="Functions">
        {blueprint.functions?.map((fn) => (
          <button
            key={fn.id}
            className={`tree-row ${active?.id === fn.id ? "selected" : ""}`}
            onClick={() => showEntry(fn.id)}
          >
            <Code2 size={15} />
            {fn.name}
          </button>
        ))}
        <button
          onClick={addFunction}
          disabled={(blueprint.functions?.length ?? 0) >= 100}
        >
          <Plus size={15} /> Function
        </button>
        {currentFunction && (
          <>
            <Field label="Name">
              <TextField
                label="Function name"
                value={currentFunction.name}
                onChange={(name) =>
                  updateFunction(currentFunction.id, (fn) => {
                    fn.name = name;
                  })
                }
              />
            </Field>
            <Field label="Returns">
              <select
                aria-label="Return type"
                value={currentFunction.returns}
                onChange={(event) =>
                  updateFunction(currentFunction.id, (fn) => {
                    fn.returns = event.target
                      .value as BlueprintFunction["returns"];
                  })
                }
              >
                <TypeOptions allowVoid />
              </select>
            </Field>
            {currentFunction.parameters.map((parameter) => (
              <div className="signature-row" key={parameter.id}>
                <TextField
                  label="Parameter name"
                  value={parameter.name}
                  onChange={(name) =>
                    updateFunction(currentFunction.id, (fn) => {
                      fn.parameters.find((p) => p.id === parameter.id)!.name =
                        name;
                    })
                  }
                />
                <select
                  aria-label="Parameter type"
                  value={parameter.type}
                  onChange={(event) =>
                    updateFunction(currentFunction.id, (fn) => {
                      fn.parameters.find((p) => p.id === parameter.id)!.type =
                        event.target.value as ValueType;
                    })
                  }
                >
                  <TypeOptions />
                </select>
                <button
                  aria-label={"Remove parameter " + parameter.name}
                  onClick={() =>
                    updateFunction(currentFunction.id, (fn) => {
                      fn.parameters = fn.parameters.filter(
                        (p) => p.id !== parameter.id,
                      );
                    })
                  }
                >
                  ×
                </button>
              </div>
            ))}
            <button
              disabled={currentFunction.parameters.length >= 32}
              onClick={() =>
                updateFunction(currentFunction.id, (fn) => {
                  fn.parameters.push({
                    id: newId(),
                    name: "parameter" + (fn.parameters.length + 1),
                    type: "number",
                  });
                })
              }
            >
              <Plus size={15} /> Parameter
            </button>
            <button
              className="danger"
              onClick={() =>
                editBlueprint((draft) => {
                  draft.functions = draft.functions?.filter(
                    (fn) => fn.id !== currentFunction.id,
                  );
                })
              }
            >
              Remove Selected Function
            </button>
          </>
        )}
      </Section>
      <Section title="Scene Events" open={false}>
        {signals.map((signal) => (
          <div className="signature-row" key={signal.id}>
            <TextField
              label="Scene event name"
              value={signal.name}
              onChange={(name) =>
                editSignal(signal.id, (draft) => {
                  draft.name = name;
                })
              }
            />
            <select
              aria-label="Event payload type"
              value={signal.type}
              onChange={(event) =>
                editSignal(signal.id, (draft) => {
                  draft.type = event.target.value as Signal["type"];
                })
              }
            >
              <TypeOptions allowVoid />
            </select>
            <button
              aria-label={"Remove event " + signal.name}
              onClick={() =>
                useEditor.getState().edit((project) => {
                  project.signals = project.signals?.filter(
                    (event) => event.id !== signal.id,
                  );
                  clearContactSignal(project, signal.id);
                })
              }
            >
              ×
            </button>
          </div>
        ))}
        <button
          disabled={signals.length >= 256}
          onClick={() =>
            useEditor.getState().edit((project) => {
              (project.signals ??= []).push({
                id: newId(),
                name: "New Event",
                type: "void",
              });
            })
          }
        >
          <Plus size={15} /> Scene Event
        </button>
      </Section>
    </>
  );
}
function editSignal(id: string, change: (signal: Signal) => void) {
  useEditor.getState().edit((project) => {
    const signal = project.signals?.find((item) => item.id === id);
    if (signal) {
      change(signal);
      if (signal.type !== "void" && signal.type !== "entity")
        clearContactSignal(project, signal.id);
    }
  });
}

function clearContactSignal(project: Project, id: string) {
  for (const scene of project.scenes) {
    for (const { body } of scene.entities) {
      if (body?.enterSignal === id) body.enterSignal = null;
      if (body?.exitSignal === id) body.exitSignal = null;
    }
  }
}
