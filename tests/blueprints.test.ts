import { describe, expect, it } from "vitest";
import {
  compileBlueprint,
  literal,
  parseExpression,
  type Block,
  type Expression,
  type Signal,
} from "@mosaic/blueprints";
import {
  createBlueprint,
  createEntity,
  createProject,
  parseProject,
  serializeProject,
} from "@mosaic/model";
import { Game, STEP } from "@mosaic/runtime";

function fixture() {
  const project = createProject("Signal Relay");
  const scene = project.scenes[0];
  const sender = createEntity(scene.layers[0].id, "Sender");
  const receiver = createEntity(scene.layers[0].id, "Receiver");
  receiver.visual = {
    kind: "text",
    text: "Waiting",
    size: 18,
    color: "#ffffff",
    screen: true,
  };
  const source = createBlueprint("Send");
  const target = createBlueprint("Receive");
  sender.blueprintId = source.id;
  receiver.blueprintId = target.id;
  const signal: Signal = { id: "relay", name: "Relay", type: "string" };
  project.signals = [signal];
  project.blueprints = [source, target];
  scene.entities.push(sender, receiver);
  return { project, sender, receiver, source, target, signal };
}
const variable = (id: string) => ({ kind: "variable" as const, id });
const set = (id: string, variable: string, value: Expression): Block => ({
  id,
  kind: "set",
  variable,
  value,
});

describe("Blueprint version 2 programs", () => {
  it("round trips functions and typed signals, then resumes through a nested wait and updates another entity", () => {
    const { project, sender, receiver, source, target, signal } = fixture();
    source.variables.push({
      id: "answer",
      name: "answer",
      type: "number",
      initial: 0,
    });
    source.functions = [
      {
        id: "calculate",
        name: "Calculate",
        parameters: [{ id: "arg", name: "amount", type: "number" }],
        returns: "number",
        blocks: [
          {
            id: "subtotal",
            kind: "let",
            name: "subtotal",
            type: "number",
            value: variable("arg"),
          },
          {
            id: "loop",
            kind: "repeat",
            count: literal(3),
            body: [
              set("increment", "subtotal", {
                kind: "binary",
                op: "+",
                left: variable("subtotal"),
                right: literal(2),
              }),
              { id: "timer", kind: "wait", seconds: literal(STEP) },
            ],
          },
          { id: "returned", kind: "return", value: variable("subtotal") },
        ],
      },
    ];
    source.events[0].blocks.push(
      {
        id: "call",
        kind: "call",
        functionId: "calculate",
        args: { arg: literal(4) },
        result: "answer",
      },
      {
        id: "emit",
        kind: "emit",
        signalId: signal.id,
        value: literal("Relay finished"),
      },
    );
    target.events.push({
      id: "on-relay",
      kind: "signal",
      signalId: signal.id,
      blocks: [
        {
          id: "display",
          kind: "property",
          property: "text",
          value: variable("on-relay"),
        },
      ],
    });
    const saved = parseProject(serializeProject(project));
    expect(saved).toEqual(project);
    const game = new Game(saved);
    game.start();
    expect(game.getVariables(sender.id)?.get("answer")).toBe(0);
    game.advance(STEP * 2);
    expect(game.getEntity(receiver.id)?.visual).toMatchObject({
      text: "Waiting",
    });
    game.advance(STEP);
    expect(game.getVariables(sender.id)?.get("answer")).toBe(10);
    expect(game.getEntity(receiver.id)?.visual).toMatchObject({
      text: "Relay finished",
    });
    expect(game.logs).toEqual([]);
  });

  it("pauses before a block, steps into a function, examines arguments, and resumes exactly once", () => {
    const { project, sender, source } = fixture();
    source.variables.push({
      id: "answer",
      name: "answer",
      type: "number",
      initial: 0,
    });
    source.functions = [
      {
        id: "double",
        name: "Double",
        parameters: [{ id: "arg", name: "n", type: "number" }],
        returns: "number",
        blocks: [
          {
            id: "return",
            kind: "return",
            value: {
              kind: "binary",
              op: "*",
              left: variable("arg"),
              right: literal(2),
            },
          },
        ],
      },
    ];
    source.events[0].blocks.push(
      {
        id: "call",
        kind: "call",
        functionId: "double",
        args: { arg: literal(21) },
        result: "answer",
      },
      { id: "logged", kind: "log", value: variable("answer") },
    );
    const debug = new Game(project, undefined, true);
    debug.setBreakpoints(new Map([[source.id, new Set(["call"])]]));
    debug.start();
    expect(debug.blueprintPause?.blockId).toBe("call");
    expect(debug.getVariables(sender.id)?.get("answer")).toBe(0);
    debug.advance(STEP * 3);
    expect(debug.time).toBe(0);
    debug.stepBlueprint();
    expect(debug.blueprintPause?.blockId).toBe("return");
    expect(debug.blueprintPause?.locals.get("arg")).toBe(21);
    expect(debug.blueprintPause?.stack.map((frame) => frame.name)).toEqual([
      "Double",
      "On Start",
    ]);
    debug.stepBlueprint();
    expect(debug.blueprintPause?.blockId).toBe("logged");
    expect(debug.getVariables(sender.id)?.get("answer")).toBe(42);
    debug.resumeBlueprints();
    expect(debug.blueprintPause).toBeUndefined();
    expect(debug.logs.map(({ message }) => message)).toEqual(["42"]);
    const exported = new Game(project);
    exported.setBreakpoints(new Map([[source.id, new Set(["call"])]]));
    exported.start();
    expect(exported.logs).toEqual(debug.logs);
  });

  it("preserves compatible state across reload, clears changed continuations, and keeps other entities running", () => {
    const { project, sender, source, target, receiver } = fixture();
    source.variables.push({
      id: "counter",
      name: "counter",
      type: "number",
      initial: 0,
    });
    source.events[0].blocks.push(
      set("initialize", "counter", literal(7)),
      { id: "sleep", kind: "wait", seconds: literal(STEP * 2) },
      { id: "old-work", kind: "log", value: literal("Old work") },
    );
    target.events[0].blocks.push(
      { id: "other-sleep", kind: "wait", seconds: literal(STEP * 2) },
      { id: "survives", kind: "log", value: literal("Survives") },
    );
    const game = new Game(project);
    game.start();
    const revised = structuredClone(source);
    revised.events[1].blocks = [
      set("update", "counter", {
        kind: "binary",
        op: "+",
        left: variable("counter"),
        right: literal(1),
      }),
    ];
    game.reloadBlueprints([revised, target]);
    game.advance(STEP * 2);
    expect(game.getVariables(sender.id)?.get("counter")).toBe(9);
    expect(game.logs).toEqual([
      {
        level: "info",
        entityId: receiver.id,
        blockId: "survives",
        message: "Survives",
      },
    ]);
  });

  it("checks lexical scope, flow placement, function return paths, and payload types", () => {
    const { project, source, signal } = fixture();
    source.functions = [
      {
        id: "incomplete",
        name: "Incomplete",
        returns: "number",
        parameters: [],
        blocks: [],
      },
    ];
    source.events[0].blocks = [
      { id: "bad-break", kind: "break" },
      {
        id: "conditional",
        kind: "if",
        condition: literal(true),
        then: [
          {
            id: "private",
            kind: "let",
            name: "private",
            type: "number",
            value: literal(1),
          },
        ],
        else: [],
      },
      { id: "leak", kind: "log", value: variable("private") },
      {
        id: "payload",
        kind: "emit",
        signalId: signal.id,
        value: literal(false),
      },
    ];
    expect(
      compileBlueprint(source, new Set(), project.signals).diagnostics,
    ).toEqual([
      { blockId: "incomplete", message: expect.stringContaining("Every path") },
      {
        blockId: "bad-break",
        message: expect.stringContaining("inside a loop"),
      },
      { blockId: "leak", message: expect.stringContaining("in scope") },
      { blockId: "payload", message: "Expected string, received boolean." },
    ]);
  });

  it("bounds runaway loops and feedback while other program work finishes", () => {
    const { project, source } = fixture();
    project.signals = [{ id: "echo", name: "Echo", type: "void" }];
    source.variables.push({
      id: "counter",
      name: "counter",
      type: "number",
      initial: 0,
    });
    source.events[0].blocks = [
      {
        id: "forever",
        kind: "while",
        condition: literal(true),
        body: [{ id: "spin", kind: "continue" }],
      },
      { id: "echo", kind: "emit", signalId: "echo" },
      set("done", "counter", literal(1)),
    ];
    source.events.push({
      id: "handle-echo",
      kind: "signal",
      signalId: "echo",
      blocks: [{ id: "feedback", kind: "emit", signalId: "echo" }],
    });
    const game = new Game(project);
    game.start();
    expect(game.logs.map(({ blockId, message }) => [blockId, message])).toEqual(
      [
        ["forever", expect.stringContaining("1024")],
        ["feedback", expect.stringContaining("event limit")],
      ],
    );
    expect(
      game.getVariables(project.scenes[0].entities[0].id)?.get("counter"),
    ).toBe(1);
  });

  it("parses scoped names, scene queries, vectors, and typed record fields into executable ASTs", () => {
    const { project, source, sender, receiver } = fixture();
    const names = { variables: [], axes: project.input };
    source.events[0].blocks = [
      {
        id: "query",
        kind: "property",
        property: "x",
        value: parseExpression(
          'field(record("Score", { points: 3 }), "points", "number") * 2 + vector(7, 9).x',
          names,
        ),
      },
      {
        id: "target",
        kind: "property",
        property: "text",
        target: parseExpression('entity("' + receiver.id + '")', names),
        value: parseExpression('scene + " ready"', names),
      },
    ];
    const game = new Game(project);
    game.start();
    expect(game.getEntity(sender.id)?.transform.x).toBe(13);
    expect(game.getEntity(receiver.id)?.visual).toMatchObject({
      text: "Main ready",
    });
    expect(parseExpression('axis("Horizontal")', names)).toEqual({
      kind: "input",
      id: "horizontal",
    });
    expect(() => parseExpression("Date.now()", names)).toThrow();
    expect(() => parseExpression("x = 1", names)).toThrow();
    expect(() => parseExpression("1e999", names)).toThrow(/finite/);
  });
});
