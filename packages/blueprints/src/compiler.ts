import {
  extensionBody,
  extensionSchema,
  type ExtensionManifest,
} from "./extensions";
import {
  displayValue,
  propertyTypes,
  typeOf,
  type Block,
  type Blueprint,
  type Diagnostic,
  type DataSource,
  type DataSymbols,
  type Expression,
  type EffectCommand,
  type Property,
  type Signal,
  type Value,
  type ValueType,
  type UiProperty,
} from "./model";

const MAX_ITERATIONS = 1024;
const MAX_CALL_DEPTH = 32;
export const MAX_OPERATIONS = 4096;
export type BlueprintContext = {
  axis(id: string): number;
  variables: Map<string, Value>;
  move(x: number, y: number): void;
  set(property: Property, value: Value, target?: string): void;
  get(property: Property, target?: string): Value;
  query(query: "self" | "parent" | "scene"): Value;
  exists(reference: Value): boolean;
  animate(clip: string): void;
  data?: {
    read(source: DataSource, id: string, key?: string): Value;
    write(id: string, value: Value): void;
    slot(id: string, operation: "save" | "load"): void;
    language(locale: string): void;
  };
  effect?(command: EffectCommand): void;
  ui?(id: string, property: UiProperty, value?: Value): void;
  log(blockId: string, value: Value): void;
  fault(diagnostic: Diagnostic): void;
  emit(signalId: string, value?: Value): void;
};
function dispatchEffect(ctx: BlueprintContext, command: EffectCommand) {
  if (!ctx.effect) throw new Error("This runtime does not provide effects.");
  ctx.effect(command);
}
type Locals = Map<string, Value>;
type Scope = { locals: Locals; parent?: Scope };
type Frame = { entryId: string; name: string; parent?: Frame; depth: number };
export type BlockVisit = {
  kind: "block";
  blockId: string;
  entryId: string;
  frame: Frame;
  scope: Scope;
};
export type Yield = BlockVisit | { kind: "wait"; seconds: number };
type Flow = { kind: "break" | "continue" } | { kind: "return"; value?: Value };
export type Execution = Generator<Yield, Flow | void>;
type ScopeTypes = Map<string, ValueType>;
type CompileScope = {
  types: ScopeTypes;
  loop: boolean;
  returns?: ValueType | "void";
};
type Read = (ctx: BlueprintContext, scope: Scope) => Value;
type Instruction = {
  id: string;
  run(ctx: BlueprintContext, scope: Scope, frame: Frame): Execution;
};
type Typed = { type: ValueType; read: Read };

function lookup(scope: Scope, id: string): Locals | undefined {
  for (let at: Scope | undefined = scope; at; at = at.parent)
    if (at.locals.has(id)) return at.locals;
}
function local(parent?: Scope): Scope {
  return { locals: new Map(), parent };
}
export function inspectVisit(visit: BlockVisit) {
  const locals = new Map<string, Value>();
  for (let at: Scope | undefined = visit.scope; at; at = at.parent) {
    for (const [id, value] of at.locals)
      if (!locals.has(id)) locals.set(id, value);
  }
  const stack: { entryId: string; name: string }[] = [];
  for (let at: Frame | undefined = visit.frame; at; at = at.parent)
    stack.push({ entryId: at.entryId, name: at.name });
  return { locals, stack };
}
function finite(value: number) {
  if (!Number.isFinite(value))
    throw new Error("Expression produced a non-finite number.");
  return value;
}
function entityId(value: Value) {
  if (typeof value !== "object" || value.kind !== "entity" || !value.id)
    throw new Error("Choose an existing target entity.");
  return value.id;
}
function equal(a: Value, b: Value): boolean {
  if (typeof a !== "object" || typeof b !== "object") return a === b;
  switch (a.kind) {
    case "vector":
      return b.kind === a.kind && a.x === b.x && a.y === b.y;
    case "asset":
    case "entity":
      return b.kind === a.kind && a.id === b.id;
    case "enum":
      return b.kind === a.kind && a.enumId === b.enumId && a.key === b.key;
    case "record":
      return (
        b.kind === a.kind &&
        a.schema === b.schema &&
        Object.keys(a.fields).length === Object.keys(b.fields).length &&
        Object.entries(a.fields).every(
          ([key, item]) =>
            Object.hasOwn(b.fields, key) && equal(item, b.fields[key]),
        )
      );
  }
}
function* execute(
  instructions: Instruction[],
  ctx: BlueprintContext,
  scope: Scope,
  frame: Frame,
): Execution {
  for (const instruction of instructions) {
    yield {
      kind: "block",
      blockId: instruction.id,
      entryId: frame.entryId,
      frame,
      scope,
    };
    try {
      const flow = yield* instruction.run(ctx, scope, frame);
      if (flow) return flow;
    } catch (error) {
      ctx.fault({
        blockId: instruction.id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
function guaranteedReturn(blocks: Block[]): boolean {
  return blocks.some(
    (block) =>
      block.kind === "return" ||
      (block.kind === "if" &&
        guaranteedReturn(block.then) &&
        guaranteedReturn(block.else)),
  );
}
function fault(message: string): never {
  throw new Error(message);
}

export function compileBlueprint(
  blueprint: Blueprint,
  axes: ReadonlySet<string>,
  signals: readonly Signal[] = [],
  data?: DataSymbols,
  extensions: readonly ExtensionManifest[] = [],
) {
  const diagnostics: Diagnostic[] = [];
  const report = (blockId: string, message: string) =>
    diagnostics.push({ blockId, message });
  const ids = new Set<string>();
  function register(id: string) {
    if (ids.has(id)) report(id, "Duplicate ID in blueprint.");
    ids.add(id);
  }
  const variables = new Map<string, ValueType>();
  const functions = new Map(
    (blueprint.functions ?? []).map((fn) => [fn.id, fn]),
  );
  const signalsById = new Map(signals.map((signal) => [signal.id, signal]));
  const extensionFunctions = new Map(
    extensions.map((manifest) => [
      manifest.id,
      new Map(manifest.functions.map((fn) => [fn.id, fn])),
    ]),
  );
  const compiledFunctions = new Map<string, Instruction[]>();
  for (const variable of blueprint.variables) {
    register(variable.id);
    variables.set(variable.id, variable.type);
    if (typeOf(variable.initial) !== variable.type)
      report(variable.id, "Initial value has the wrong type.");
  }

  function expression(
    node: Expression,
    id: string,
    scope: CompileScope,
  ): Typed {
    switch (node.kind) {
      case "literal":
        return { type: typeOf(node.value), read: () => node.value };
      case "extension": {
        const fn = extensionFunctions
          .get(node.extensionId)
          ?.get(node.functionId);
        if (!fn) {
          report(id, "Choose an available extension function.");
          return {
            type: "number",
            read: () => fault("Missing extension function."),
          };
        }
        const types = new Map<string, ValueType>(
          fn.parameters.map(({ id, type }) => [id, type]),
        );
        if (Object.keys(node.args).some((key) => !types.has(key)))
          report(id, "Extension call contains an unknown argument.");
        const args = fn.parameters.map(({ id: key, type }) => {
          const arg = Object.hasOwn(node.args, key)
            ? node.args[key]
            : undefined;
          if (!arg) report(id, 'Missing extension argument "' + key + '".');
          return [key, arg && field(arg, id, scope, type)] as const;
        });
        let body: Read;
        try {
          body = field(
            extensionBody(fn),
            id,
            { types, loop: false },
            fn.result,
          );
        } catch (error) {
          report(id, error instanceof Error ? error.message : String(error));
          body = () => fault("Invalid extension function.");
        }
        return {
          type: fn.result,
          read(ctx, locals) {
            const parameters = new Map<string, Value>();
            for (const [key, read] of args)
              parameters.set(
                key,
                read ? read(ctx, locals) : fault("Missing extension argument."),
              );
            return body(ctx, { locals: parameters });
          },
        };
      }
      case "data": {
        const type = data ? data.readType(node.source, node.id) : node.type;
        if (!type || (node.source !== "locale" && !node.id))
          report(id, "Choose a valid data source.");
        if (node.source === "sheet" && !node.key)
          report(id, "Enter the sheet row key.");
        const key = node.key && field(node.key, id, scope, "string");
        return {
          type: type ?? node.type,
          read(ctx, locals) {
            if (!ctx.data)
              return fault("This runtime does not provide project data.");
            return ctx.data.read(
              node.source,
              node.id,
              key && String(key(ctx, locals)),
            );
          },
        };
      }
      case "variable": {
        const type = scope.types.get(node.id);
        if (!type) report(id, "Choose a declared variable in scope.");
        return {
          type: type ?? "number",
          read: (ctx, scope) =>
            (lookup(scope, node.id) ?? ctx.variables).get(node.id) ?? 0,
        };
      }
      case "input":
        if (!axes.has(node.id)) report(id, "Choose an existing input axis.");
        return { type: "number", read: (ctx) => ctx.axis(node.id) };
      case "query":
        return {
          type: node.query === "scene" ? "string" : "entity",
          read: (ctx) => ctx.query(node.query),
        };
      case "property": {
        const target = node.target && field(node.target, id, scope, "entity");
        return {
          type: propertyTypes[node.property],
          read: (ctx, locals) =>
            ctx.get(node.property, target && entityId(target(ctx, locals))),
        };
      }
      case "exists": {
        const reference = expression(node.reference, id, scope);
        if (reference.type !== "entity" && reference.type !== "asset")
          report(id, "Choose an entity or asset to check.");
        return {
          type: "boolean",
          read: (ctx, locals) => ctx.exists(reference.read(ctx, locals)),
        };
      }
      case "vector": {
        const x = field(node.x, id, scope, "number");
        const y = field(node.y, id, scope, "number");
        return {
          type: "vector",
          read: (ctx, locals) => ({
            kind: "vector",
            x: Number(x(ctx, locals)),
            y: Number(y(ctx, locals)),
          }),
        };
      }
      case "component": {
        const vector = field(node.vector, id, scope, "vector");
        return {
          type: "number",
          read: (ctx, locals) => {
            const value = vector(ctx, locals);
            if (typeof value === "object" && value.kind === "vector")
              return value[node.axis];
            return fault("Expected a vector.");
          },
        };
      }
      case "toText": {
        const value = field(node.value, id, scope);
        return {
          type: "string",
          read: (ctx, locals) => displayValue(value(ctx, locals)),
        };
      }
      case "field": {
        const record = field(node.record, id, scope, "record");
        if (!node.key.trim()) report(id, "Enter the name of a record field.");
        if (node.record.kind === "data") {
          const columns = data?.fields(node.record.source, node.record.id);
          if (columns && columns.get(node.key) !== node.type)
            report(id, "Choose a field of the declared record type.");
        }
        if (
          node.record.kind === "literal" &&
          typeof node.record.value === "object" &&
          node.record.value.kind === "record"
        ) {
          const fields = node.record.value.fields;
          if (
            !Object.hasOwn(fields, node.key) ||
            typeOf(fields[node.key]) !== node.type
          )
            report(
              id,
              "The literal record has no field of that name and type.",
            );
        }
        return {
          type: node.type,
          read: (ctx, locals) => {
            const value = record(ctx, locals);
            if (
              typeof value !== "object" ||
              value.kind !== "record" ||
              !Object.hasOwn(value.fields, node.key)
            )
              return fault("Record field is missing.");
            const entry = value.fields[node.key];
            return typeOf(entry) === node.type
              ? entry
              : fault("Record field has the wrong type.");
          },
        };
      }
      case "unary": {
        const type = node.op === "not" ? "boolean" : "number";
        const read = field(node.value, id, scope, type);
        return {
          type,
          read: (ctx, locals) => {
            const value = read(ctx, locals);
            switch (node.op) {
              case "not":
                return !value;
              case "negate":
                return -Number(value);
              case "abs":
                return Math.abs(Number(value));
              case "floor":
                return Math.floor(Number(value));
              case "round":
                return Math.round(Number(value));
              case "sqrt":
                return finite(Math.sqrt(Number(value)));
            }
          },
        };
      }
      case "binary":
        return binary(node, id, scope);
    }
  }

  function binary(
    node: Extract<Expression, { kind: "binary" }>,
    id: string,
    scope: CompileScope,
  ): Typed {
    const left = expression(node.left, id, scope);
    const right = expression(node.right, id, scope);
    const equality = node.op === "==" || node.op === "!=";
    const logical = node.op === "and" || node.op === "or";
    const relation = ["<", ">", "<=", ">="].includes(node.op);
    const concatenate =
      node.op === "+" && left.type === "string" && right.type === "string";
    const expected = logical ? "boolean" : "number";
    if (
      equality
        ? left.type !== right.type
        : !concatenate && (left.type !== expected || right.type !== expected)
    ) {
      report(
        id,
        'Operands for "' +
          node.op +
          '" must ' +
          (equality ? "have the same type" : "both be " + expected) +
          ".",
      );
    }
    return {
      type:
        equality || logical || relation
          ? "boolean"
          : concatenate
            ? "string"
            : "number",
      read: (ctx, locals) => {
        const a = left.read(ctx, locals);
        if (node.op === "and")
          return Boolean(a) && Boolean(right.read(ctx, locals));
        if (node.op === "or")
          return Boolean(a) || Boolean(right.read(ctx, locals));
        const b = right.read(ctx, locals);
        const x = Number(a);
        const y = Number(b);
        switch (node.op) {
          case "+":
            return concatenate
              ? (String(a) + String(b)).slice(0, 4096)
              : finite(x + y);
          case "-":
            return finite(x - y);
          case "*":
            return finite(x * y);
          case "/":
            return finite(x / y);
          case "%":
            return finite(x % y);
          case "==":
            return equal(a, b);
          case "!=":
            return !equal(a, b);
          case "<":
            return x < y;
          case ">":
            return x > y;
          case "<=":
            return x <= y;
          case ">=":
            return x >= y;
        }
      },
    };
  }

  function field(
    node: Expression,
    id: string,
    scope: CompileScope,
    expected?: ValueType,
  ): Read {
    const { type, read } = expression(node, id, scope);
    if (expected && type !== expected)
      report(id, "Expected " + expected + ", received " + type + ".");
    return read;
  }
  function list(blocks: Block[], scope: CompileScope) {
    const lexical = { ...scope, types: new Map(scope.types) };
    return blocks.map((block) => {
      register(block.id);
      const run = instruction(block, lexical);
      if (block.kind === "let") lexical.types.set(block.id, block.type);
      return { id: block.id, run };
    });
  }

  function instruction(block: Block, scope: CompileScope): Instruction["run"] {
    const read = (node: Expression, type?: ValueType) =>
      field(node, block.id, scope, type);
    const error = (message: string) => report(block.id, message);
    switch (block.kind) {
      case "if": {
        const condition = read(block.condition, "boolean");
        const yes = list(block.then, scope);
        const no = list(block.else, scope);
        return function* (ctx, locals, frame) {
          return yield* execute(
            condition(ctx, locals) ? yes : no,
            ctx,
            local(locals),
            frame,
          );
        };
      }
      case "repeat":
      case "while": {
        const count =
          block.kind === "repeat" ? read(block.count, "number") : undefined;
        const condition =
          block.kind === "while" ? read(block.condition, "boolean") : undefined;
        const body = list(block.body, { ...scope, loop: true });
        return function* (ctx, locals, frame) {
          const remaining = count
            ? Number(count(ctx, locals))
            : MAX_ITERATIONS + 1;
          if (
            count &&
            (!Number.isInteger(remaining) ||
              remaining < 0 ||
              remaining > MAX_ITERATIONS)
          )
            fault("Repeat count must be an integer from 0 to 1024.");
          for (
            let i = 0;
            i < remaining && (!condition || condition(ctx, locals));
            i++
          ) {
            if (i === MAX_ITERATIONS)
              fault("While loop exceeded 1024 iterations.");
            const flow = yield* execute(body, ctx, local(locals), frame);
            if (flow?.kind === "return") return flow;
            if (flow?.kind === "break") break;
          }
        };
      }
      case "break":
      case "continue":
        if (!scope.loop) error("Use this block inside a loop.");
        return function* () {
          return { kind: block.kind };
        };
      case "let": {
        const value = read(block.value, block.type);
        return function* (ctx, locals) {
          locals.locals.set(block.id, value(ctx, locals));
        };
      }
      case "set": {
        const type = scope.types.get(block.variable);
        if (!type) error("Choose a variable to assign.");
        const value = read(block.value, type);
        return function* (ctx, locals) {
          (lookup(locals, block.variable) ?? ctx.variables).set(
            block.variable,
            value(ctx, locals),
          );
        };
      }
      case "call": {
        const fn = functions.get(block.functionId);
        if (!fn) {
          error("Choose an existing function.");
          return function* () {};
        }
        const args = fn.parameters.map((parameter) => {
          const value = Object.hasOwn(block.args, parameter.id)
            ? block.args[parameter.id]
            : undefined;
          if (!value) error('Missing argument "' + parameter.name + '".');
          return {
            id: parameter.id,
            read: value && read(value, parameter.type),
          };
        });
        if (
          block.result &&
          (fn.returns === "void" ||
            scope.types.get(block.result) !== fn.returns)
        )
          error("Choose a result variable of the function’s return type.");
        return function* (ctx, locals, frame) {
          if (frame.depth >= MAX_CALL_DEPTH)
            fault("Function call depth exceeded 32.");
          const callScope = local();
          for (const arg of args)
            if (arg.read) callScope.locals.set(arg.id, arg.read(ctx, locals));
          const flow = yield* execute(
            compiledFunctions.get(fn.id)!,
            ctx,
            callScope,
            {
              entryId: fn.id,
              name: fn.name,
              parent: frame,
              depth: frame.depth + 1,
            },
          );
          if (
            block.result &&
            flow?.kind === "return" &&
            flow.value !== undefined
          ) {
            (lookup(locals, block.result) ?? ctx.variables).set(
              block.result,
              flow.value,
            );
          }
        };
      }
      case "return": {
        if (!scope.returns) error("Return belongs inside a function.");
        if (scope.returns === "void" && block.value)
          error("This function returns no value.");
        if (scope.returns && scope.returns !== "void" && !block.value)
          error("Enter a return value.");
        const value =
          block.value &&
          read(
            block.value,
            scope.returns === "void" ? undefined : scope.returns,
          );
        return function* (ctx, locals) {
          return { kind: "return", value: value && value(ctx, locals) };
        };
      }
      case "emit": {
        const signal = signalsById.get(block.signalId);
        if (!signal) error("Choose an existing scene event.");
        if (signal?.type === "void" && block.value)
          error("This event has no payload.");
        if (signal && signal.type !== "void" && !block.value)
          error("Enter a payload for this event.");
        const value =
          block.value &&
          read(block.value, signal?.type === "void" ? undefined : signal?.type);
        return function* (ctx, locals) {
          ctx.emit(block.signalId, value && value(ctx, locals));
        };
      }
      case "wait": {
        const seconds = read(block.seconds, "number");
        return function* (ctx, locals) {
          const duration = Number(seconds(ctx, locals));
          if (duration < 0 || duration > 3600)
            fault("Wait duration must be between 0 and 3600 seconds.");
          yield { kind: "wait", seconds: duration };
        };
      }
      case "move": {
        const x = read(block.x, "number");
        const y = read(block.y, "number");
        return function* (ctx, locals) {
          ctx.move(Number(x(ctx, locals)), Number(y(ctx, locals)));
        };
      }
      case "property": {
        const value = read(block.value, propertyTypes[block.property]);
        const target = block.target && read(block.target, "entity");
        return function* (ctx, locals) {
          ctx.set(
            block.property,
            value(ctx, locals),
            target && entityId(target(ctx, locals)),
          );
        };
      }
      case "animate":
        if (!block.clip.trim()) error("Enter an animation clip name.");
        return function* (ctx) {
          ctx.animate(block.clip);
        };
      case "animationParameter": {
        if (block.parameterId === "unassigned")
          error("Choose an animation parameter.");
        const value = read(block.value, "number");
        return function* (ctx, locals) {
          dispatchEffect(ctx, {
            kind: block.kind,
            parameterId: block.parameterId,
            value: Number(value(ctx, locals)),
          });
        };
      }
      case "tween": {
        const value = read(block.value, "number");
        const seconds = read(block.seconds, "number");
        return function* (ctx, locals) {
          dispatchEffect(ctx, {
            kind: block.kind,
            property: block.property,
            value: Number(value(ctx, locals)),
            seconds: Number(seconds(ctx, locals)),
            ease: block.ease,
          });
        };
      }
      case "timeline":
      case "particles":
      case "sound":
        if (block.kind === "timeline" && block.timelineId === "unassigned")
          error("Choose a timeline.");
        if (block.kind === "sound" && block.soundId === "unassigned")
          error("Choose a sound.");
        return function* (ctx) {
          dispatchEffect(ctx, block);
        };
      case "writeGlobal": {
        const type = data?.writeType(block.globalId);
        if (block.globalId === "unassigned" || (data && !type))
          error("Choose a writable global.");
        const value = read(block.value, type);
        return function* (ctx, locals) {
          if (!ctx.data)
            return fault("This runtime does not provide project data.");
          ctx.data.write(block.globalId, value(ctx, locals));
        };
      }
      case "saveSlot":
        if (
          block.slotId === "unassigned" ||
          (data && !data.hasSlot(block.slotId))
        )
          error("Choose a save slot.");
        return function* (ctx) {
          if (!ctx.data)
            return fault("This runtime does not provide save slots.");
          ctx.data.slot(block.slotId, block.operation);
        };
      case "language":
        if (!block.locale || (data && !data.hasLocale(block.locale)))
          error("Choose a project language.");
        return function* (ctx) {
          if (!ctx.data)
            return fault("This runtime does not provide localization.");
          ctx.data.language(block.locale);
        };
      case "ui": {
        if (block.widgetId === "unassigned") error("Choose a UI widget.");
        const type =
          block.property === "value"
            ? block.valueType
            : block.property === "text"
              ? "string"
              : "boolean";
        if (block.property !== "focus" && (!block.value || !type))
          error("Choose a typed widget value.");
        const value =
          block.property !== "focus" && block.value
            ? read(block.value, type)
            : undefined;
        return function* (ctx, locals) {
          if (!ctx.ui)
            return fault("This runtime does not provide UI widgets.");
          ctx.ui(block.widgetId, block.property, value?.(ctx, locals));
        };
      }
      case "log": {
        const value = read(block.value);
        return function* (ctx, locals) {
          ctx.log(block.id, displayValue(value(ctx, locals)));
        };
      }
    }
  }

  for (const fn of blueprint.functions ?? []) {
    register(fn.id);
    const types = new Map(variables);
    for (const parameter of fn.parameters) {
      register(parameter.id);
      types.set(parameter.id, parameter.type);
    }
    if (fn.returns !== "void" && !guaranteedReturn(fn.blocks))
      report(fn.id, "Every path through this function must return a value.");
    compiledFunctions.set(
      fn.id,
      list(fn.blocks, { types, loop: false, returns: fn.returns }),
    );
  }
  const entries = blueprint.events.map((event) => {
    register(event.id);
    const signal = event.signalId ? signalsById.get(event.signalId) : undefined;
    const name =
      event.kind === "start"
        ? "On Start"
        : event.kind === "update"
          ? "Update"
          : (signal?.name ?? "Missing event");
    const types = new Map(variables);
    if (event.kind === "signal") {
      if (!signal)
        report(event.id, "Choose an existing scene event to listen for.");
      if (signal && signal.type !== "void") types.set(event.id, signal.type);
    }
    const instructions = list(event.blocks, { types, loop: false });
    return {
      id: event.id,
      kind: event.kind,
      signalId: event.signalId,
      begin(ctx: BlueprintContext, value?: Value) {
        const scope = local();
        if (value !== undefined && event.kind === "signal")
          scope.locals.set(event.id, value);
        return execute(diagnostics.length ? [] : instructions, ctx, scope, {
          entryId: event.id,
          name,
          depth: 0,
        });
      },
    };
  });
  return {
    diagnostics,
    entries,
    createVariables: () =>
      new Map(
        blueprint.variables.map((variable) => [variable.id, variable.initial]),
      ),
  };
}

/** Validate every declaration using the same type checker that builds calls in games. */
export function parseExtensionManifest(input: unknown): ExtensionManifest {
  const manifest = extensionSchema.parse(input);
  const ids = new Set<string>();
  for (const fn of manifest.functions) {
    if (ids.has(fn.id))
      throw new Error("Duplicate extension function " + fn.id + ".");
    ids.add(fn.id);
    const probe: Blueprint = {
      version: 2,
      id: "extension",
      name: manifest.name,
      variables: [],
      events: [
        {
          id: "probe",
          kind: "start",
          blocks: [
            {
              kind: "log",
              id: "expression",
              value: {
                kind: "extension",
                extensionId: manifest.id,
                functionId: fn.id,
                args: Object.fromEntries(
                  fn.parameters.map(({ id, type }) => [
                    id,
                    {
                      kind: "literal",
                      value:
                        type === "number" ? 0 : type === "boolean" ? false : "",
                    },
                  ]),
                ),
              },
            },
          ],
        },
      ],
    };
    const [failure] = compileBlueprint(probe, new Set(), [], undefined, [
      manifest,
    ]).diagnostics;
    if (failure) throw new Error(fn.name + " · " + failure.message);
  }
  return manifest;
}
