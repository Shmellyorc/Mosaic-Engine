import {
  binaryOperators,
  literal,
  propertySchema,
  type Binary,
  type Expression,
  type Scalar,
  type Value,
  type ValueType,
} from "./model";

type Names = {
  variables: readonly { id: string; name: string }[];
  axes: readonly { id: string; name: string }[];
};
const operators: Record<string, { op: Binary; priority: number }> = {
  "||": { op: "or", priority: 1 },
  "&&": { op: "and", priority: 2 },
  "===": { op: "==", priority: 3 },
  "!==": { op: "!=", priority: 3 },
  "==": { op: "==", priority: 3 },
  "!=": { op: "!=", priority: 3 },
  "<": { op: "<", priority: 4 },
  ">": { op: ">", priority: 4 },
  "<=": { op: "<=", priority: 4 },
  ">=": { op: ">=", priority: 4 },
  "+": { op: "+", priority: 5 },
  "-": { op: "-", priority: 5 },
  "*": { op: "*", priority: 6 },
  "/": { op: "/", priority: 6 },
  "%": { op: "%", priority: 6 },
};
const number = /^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
const identifier = /^[A-Za-z_$][\w$]*$/;
const fieldTypes = new Set<ValueType>([
  "number",
  "boolean",
  "string",
  "vector",
  "asset",
  "entity",
  "enum",
]);

/** Parse the supported expression subset into ordinary serializable Blueprint nodes. */
export function parseExpression(input: string, names: Names): Expression {
  const source = input.trim();
  if (!source || source.length > 4096)
    throw new Error("Enter an expression up to 4096 characters.");
  const pattern =
    /\s*(?:"(?:[^"\\]|\\.)*"|(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?|[A-Za-z_$][\w$]*|===|!==|==|!=|<=|>=|&&|\|\||[+*/%<>()!.,{}:\-])/iy;
  const tokens: { text: string; column: number }[] = [];
  while (pattern.lastIndex < source.length) {
    const column = pattern.lastIndex + 1;
    const token = pattern.exec(source);
    if (!token) throw new Error("Unsupported token at column " + column + ".");
    tokens.push({ text: token[0].trimStart(), column });
  }
  let cursor = 0;
  const peek = () => tokens[cursor]?.text;
  function fail(message: string): never {
    throw new Error(
      message +
        " (column " +
        (tokens[cursor]?.column ?? source.length + 1) +
        ")",
    );
  }
  function accept(text: string) {
    if (peek() !== text) return false;
    cursor++;
    return true;
  }
  function expect(text: string) {
    if (!accept(text)) fail('Expected "' + text + '".');
  }
  function nameId(collection: Names["axes"], name: string) {
    const matches = collection.filter(
      (item) => item.name === name || item.id === name,
    );
    if (matches.length !== 1)
      fail(
        matches.length
          ? 'Name "' + name + '" is ambiguous.'
          : 'Unknown name "' + name + '".',
      );
    return matches[0].id;
  }
  function value(expr: Expression): Value {
    if (expr.kind === "literal") return expr.value;
    if (
      expr.kind === "unary" &&
      expr.op === "negate" &&
      expr.value.kind === "literal" &&
      typeof expr.value.value === "number"
    )
      return -expr.value.value;
    if (expr.kind === "vector") {
      const x = value(expr.x),
        y = value(expr.y);
      if (typeof x === "number" && typeof y === "number")
        return { kind: "vector", x, y };
    }
    return fail("Expected a literal value.");
  }
  function str(expr: Expression) {
    const text = value(expr);
    if (typeof text !== "string") fail("Expected a quoted string.");
    return text;
  }
  function args(depth: number) {
    const result: Expression[] = [];
    if (accept(")")) return result;
    do {
      if (result.length >= 3) fail("Too many arguments.");
      result.push(read(1, depth + 1));
    } while (accept(","));
    expect(")");
    return result;
  }
  function call(name: string, depth: number): Expression {
    const a = args(depth);
    if (name === "axis" && a.length === 1)
      return { kind: "input", id: nameId(names.axes, str(a[0])) };
    if (name === "variable" && a.length === 1)
      return { kind: "variable", id: nameId(names.variables, str(a[0])) };
    if (name === "vector" && a.length === 2)
      return { kind: "vector", x: a[0], y: a[1] };
    if ((name === "entity" || name === "asset") && a.length === 1)
      return literal({ kind: name, id: str(a[0]) });
    if (name === "enumValue" && a.length === 2)
      return literal({ kind: "enum", enumId: str(a[0]), key: str(a[1]) });
    if (name === "record" && a.length === 2) {
      const fields = value(a[1]);
      if (typeof fields === "object" && fields.kind === "record")
        return literal({ ...fields, schema: str(a[0]) });
      return fail("Expected a record literal as the second argument.");
    }
    if (name === "exists" && a.length === 1)
      return { kind: "exists", reference: a[0] };
    if (name === "property" && (a.length === 1 || a.length === 2)) {
      const property = propertySchema.safeParse(str(a[0]));
      if (!property.success) fail("Unknown entity property.");
      return { kind: "property", property: property.data, target: a[1] };
    }
    if (name === "field" && a.length === 3) {
      const type = str(a[2]) as Exclude<ValueType, "record">;
      if (!fieldTypes.has(type)) fail("Unknown record field type.");
      return { kind: "field", record: a[0], key: str(a[1]), type };
    }
    if (
      a.length === 1 &&
      (name === "Math.abs" ||
        name === "Math.floor" ||
        name === "Math.round" ||
        name === "Math.sqrt")
    ) {
      return {
        kind: "unary",
        op: name.slice(5) as "abs" | "floor" | "round" | "sqrt",
        value: a[0],
      };
    }
    return fail('Unknown function or wrong argument count for "' + name + '".');
  }
  function primary(depth: number): Expression {
    if (depth > 48) fail("Expression is nested too deeply.");
    if (accept("(")) {
      const expr = read(1, depth + 1);
      expect(")");
      return expr;
    }
    if (accept("{")) {
      const fields = new Map<string, Scalar>();
      if (!accept("}")) {
        do {
          const key = peek();
          if (
            !key ||
            !identifier.test(key) ||
            fields.has(key) ||
            key === "__proto__"
          )
            fail("Expected a unique record field name.");
          cursor++;
          expect(":");
          const entry = value(read(1, depth + 1));
          if (typeof entry === "object" && entry.kind === "record")
            fail("Records contain scalar, vector, and reference values.");
          fields.set(key, entry);
          if (fields.size > 64) fail("A record can contain at most 64 fields.");
        } while (accept(","));
        expect("}");
      }
      return literal({
        kind: "record",
        schema: "",
        fields: Object.fromEntries(fields),
      });
    }
    const token = peek();
    if (!token) fail("Expected a value.");
    cursor++;
    if (number.test(token)) {
      const n = Number(token);
      if (!Number.isFinite(n)) fail("Expected a finite number.");
      return literal(n);
    }
    if (token.startsWith('"')) {
      let text: string;
      try {
        text = JSON.parse(token) as string;
      } catch {
        return fail("Invalid string escape.");
      }
      if (text.length > 300)
        fail("A string literal can contain at most 300 characters.");
      return literal(text);
    }
    if (token === "true" || token === "false") return literal(token === "true");
    if (!identifier.test(token)) fail("Expected a value.");
    if (token === "Math" && accept(".")) {
      const member = peek();
      cursor++;
      expect("(");
      return call("Math." + member, depth);
    }
    if (accept("(")) return call(token, depth);
    if (token === "self" || token === "parent" || token === "scene")
      return { kind: "query", query: token };
    return { kind: "variable", id: nameId(names.variables, token) };
  }
  function prefix(depth: number): Expression {
    if (depth > 48) fail("Expression is nested too deeply.");
    if (accept("-"))
      return { kind: "unary", op: "negate", value: prefix(depth + 1) };
    if (accept("!"))
      return { kind: "unary", op: "not", value: prefix(depth + 1) };
    let left = primary(depth);
    if (accept(".")) {
      const axis = peek();
      if (axis !== "x" && axis !== "y") fail("Vector components are x and y.");
      cursor++;
      left = { kind: "component", vector: left, axis };
    }
    return left;
  }
  function read(min: number, depth: number): Expression {
    let left = prefix(depth);
    while (true) {
      const next = peek();
      const operation =
        next && Object.hasOwn(operators, next) ? operators[next] : undefined;
      if (!operation || operation.priority < min) return left;
      cursor++;
      left = {
        kind: "binary",
        op: binaryOperators.parse(operation.op),
        left,
        right: read(operation.priority + 1, depth + 1),
      };
    }
  }
  const expression = read(1, 0);
  if (cursor < tokens.length) fail("Unexpected token.");
  return expression;
}
