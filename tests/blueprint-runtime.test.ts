import { expect, test } from "vitest";
import {
  compileBlueprint,
  literal,
  runtimeFields,
  runtimeOperations,
  runtimeRecordMembers,
  type Block,
  type Blueprint,
  type Expression,
  type Value,
  type ValueType,
} from "@mosaic/blueprints";
import {
  capturePrefab,
  createBody,
  createEmitter,
  createEntity,
  createLight,
  createProject,
  createWidget,
  entitySchema,
  parseProject,
  serializeProject,
} from "@mosaic/model";
import { Game, STEP } from "@mosaic/runtime";

const image =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jfSYAAAAASUVORK5CYII=";
const getter = (
  member: string,
  args?: Record<string, Expression>,
  target?: Expression,
): Expression => ({ kind: "runtimeRead", member, args, target });
const field = (
  record: Expression,
  key: string,
  type: Exclude<ValueType, "record">,
): Expression => ({ kind: "field", record, key, type });
const ref = (id: string) => literal({ kind: "entity", id });
const asset = (id: string) => literal({ kind: "asset", id });
const write = (
  id: string,
  member: string,
  value: Value,
  target?: Expression,
): Block => ({
  id,
  kind: "runtimeWrite",
  member,
  value: literal(value),
  target,
});
const action = (
  id: string,
  member: string,
  args: Record<string, Expression>,
  target?: Expression,
  result?: string,
): Block => ({ id, kind: "runtimeAction", member, args, target, result });

test("controls live render, body, particle and tile state without mutating the authored project", () => {
  const project = createProject("Runtime workspace");
  project.assets = [
    { id: "image", name: "Fixture", source: image },
    { id: "replacement", name: "New sprite", source: image },
  ];
  const scene = project.scenes[0];
  const actor = createEntity(scene.layers[0].id, "Actor");
  actor.visual = { kind: "sprite", assetId: "image" };
  actor.blueprintId = "test";
  actor.light = createLight();
  actor.body = createBody(4, 4);
  actor.particles = { ...createEmitter(), enabled: false, burst: 2 };
  const target = createEntity(scene.layers[0].id, "Target");
  scene.entities = [actor, target];
  scene.tilemap.layers = [
    {
      id: "ground",
      name: "Ground",
      layerId: scene.layers[0].id,
      visible: true,
      opacity: 1,
      collision: true,
      navigation: true,
      tiles: [],
    },
  ];
  const at = { layer: literal("ground"), x: literal(2), y: literal(2) };
  const blueprint: Blueprint = {
    id: "test",
    name: "Sensors",
    version: 2,
    variables: [
      { id: "sample", name: "Sample", type: "number", initial: 0 },
      { id: "painted", name: "Painted", type: "boolean", initial: false },
      {
        id: "change",
        name: "Changed cell",
        type: "vector",
        initial: { kind: "vector", x: 0, y: 0 },
      },
    ],
    events: [
      {
        id: "start",
        kind: "start",
        blocks: [
          {
            id: "local",
            kind: "let",
            name: "Width",
            type: "number",
            value: literal(45),
          },
          {
            id: "width",
            kind: "runtimeWrite",
            member: "transform.width",
            value: { kind: "variable", id: "local" },
          },
          write("replacement", "sprite.assetId", {
            kind: "asset",
            id: "replacement",
          }),
          write("frame", "sprite.frameX", 32),
          write("light", "light.intensity", 0.2),
          write("velocity", "body.velocityX", 22),
          write("rate", "particles.rate", 2),
          action("burst", "particles.control", { operation: literal("burst") }),
          action("cell", "tile.paint", {
            ...at,
            color: literal("#336699"),
            solid: literal(true),
            cost: literal(2),
          }),
          {
            id: "capture",
            kind: "set",
            variable: "sample",
            value: {
              kind: "binary",
              op: "+",
              left: getter("sprite.frameX"),
              right: getter("transform.width"),
            },
          },
          {
            id: "check",
            kind: "set",
            variable: "painted",
            value: field(getter("tile.get", at), "solid", "boolean"),
          },
          write("target", "entity.visible", false, ref(target.id)),
        ],
      },
      {
        id: "tile-notice",
        kind: "runtime",
        signalId: "tile.changed",
        blocks: [
          {
            id: "notice",
            kind: "set",
            variable: "change",
            value: { kind: "variable", id: "tile-notice" },
          },
        ],
      },
    ],
  };
  project.blueprints = [blueprint];
  const parsed = parseProject(serializeProject(project));
  const game = new Game(parsed);
  game.advance(STEP);
  expect(game.logs).toEqual([]);
  expect(game.getVariables(actor.id)?.get("sample")).toBe(77);
  expect(game.getVariables(actor.id)?.get("painted")).toBe(true);
  expect(game.getVariables(actor.id)?.get("change")).toEqual({
    kind: "vector",
    x: 2,
    y: 2,
  });
  expect(game.getEntity(actor.id)?.visual).toMatchObject({
    kind: "sprite",
    assetId: "replacement",
    frame: { x: 32 },
  });
  expect(game.getEntity(actor.id)?.transform.x).toBeCloseTo(
    actor.transform.x + 22 * STEP,
  );
  expect(game.getEntity(target.id)?.visible).toBe(false);
  expect(game.frame().draws).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ kind: "rect", color: "#336699" }),
      expect.objectContaining({
        kind: "sprite",
        assetId: "replacement",
        width: 45,
      }),
      expect.objectContaining({ kind: "rect", color: actor.particles.color }),
    ]),
  );
  expect(parsed.scenes[0].tilemap.layers?.[0].tiles).toEqual([]);
  expect(parsed.scenes[0].entities[0].visual).toEqual({
    kind: "sprite",
    assetId: "image",
  });
});

test("spawns and removes prefab trees at tick boundaries and publishes typed lifecycle events", () => {
  const project = createProject();
  const scene = project.scenes[0];
  const controller = createEntity(scene.layers[0].id, "Controller");
  controller.blueprintId = "controller";
  const template = createEntity(scene.layers[0].id, "Template");
  const child = createEntity(scene.layers[0].id, "Child");
  child.parentId = template.id;
  project.prefabs = [
    capturePrefab({ ...scene, entities: [template, child] }, template.id),
  ];
  scene.entities = [controller];
  const empty = { kind: "entity" as const, id: "" };
  project.blueprints = [
    {
      id: "controller",
      name: "Director",
      version: 2,
      variables: [
        { id: "spawned", name: "Spawned", type: "entity", initial: empty },
        { id: "removed", name: "Removed", type: "entity", initial: empty },
      ],
      events: [
        {
          id: "start",
          kind: "start",
          blocks: [
            action(
              "make",
              "entity.spawn",
              {
                prefab: asset(project.prefabs[0].id),
                x: literal(54),
                y: literal(85),
              },
              undefined,
              "spawned",
            ),
          ],
        },
        {
          id: "spawn",
          kind: "runtime",
          signalId: "entity.spawned",
          blocks: [
            { id: "wait", kind: "wait", seconds: literal(STEP) },
            action(
              "destroy",
              "entity.destroy",
              {},
              { kind: "variable", id: "spawn" },
            ),
          ],
        },
        {
          id: "removed-event",
          kind: "runtime",
          signalId: "entity.destroyed",
          blocks: [
            {
              id: "remember",
              kind: "set",
              variable: "removed",
              value: { kind: "variable", id: "removed-event" },
            },
          ],
        },
      ],
    },
  ];
  const game = new Game(parseProject(serializeProject(project)));
  game.advance(0);
  expect(game.queryEntities("transform")).toHaveLength(3);
  const spawned = game.getVariables(controller.id)?.get("spawned") as {
    id: string;
  };
  const handle = game.getEntityHandle(spawned.id)!;
  expect(game.getEntity(spawned.id)?.transform.x).toBe(54);
  for (let n = 0; n < 4; n++) game.advance(STEP);
  expect(game.resolveEntity(handle)).toBeUndefined();
  expect(game.queryEntities("transform")).toHaveLength(1);
  expect(game.getVariables(controller.id)?.get("removed")).toEqual(spawned);
  expect(game.logs).toEqual([]);
});

test("reads live UI, input, audio and camera properties and compiles typed record access", () => {
  const project = createProject();
  const scene = project.scenes[0];
  const actor = createEntity(scene.layers[0].id, "Actor");
  actor.blueprintId = "actor";
  scene.entities = [actor];
  const widget = createWidget("indicator", "text");
  widget.text = "Status";
  scene.ui = { widgets: [widget] };
  project.blueprints = [
    {
      id: "actor",
      name: "Reader",
      version: 2,
      variables: [
        { id: "key", name: "Key", type: "string", initial: "" },
        { id: "status", name: "Status", type: "string", initial: "" },
        { id: "zoom", name: "Zoom", type: "number", initial: 0 },
        { id: "gain", name: "Gain", type: "number", initial: 0 },
      ],
      events: [
        {
          id: "boot",
          kind: "start",
          blocks: [
            action("camera", "camera.set", {
              x: literal(200),
              y: literal(125),
              zoom: literal(2),
            }),
            action("mix", "audio.mix", {
              bus: literal("master"),
              gain: literal(0.5),
              muted: literal(false),
            }),
            {
              id: "read-ui",
              kind: "set",
              variable: "status",
              value: field(
                getter("ui.get", {
                  screen: literal(""),
                  widget: literal("indicator"),
                }),
                "text",
                "string",
              ),
            },
            {
              id: "read-camera",
              kind: "set",
              variable: "zoom",
              value: field(getter("camera.settings"), "zoom", "number"),
            },
            {
              id: "read-mixer",
              kind: "set",
              variable: "gain",
              value: field(
                getter("audio.bus", { bus: literal("master") }),
                "gain",
                "number",
              ),
            },
          ],
        },
        {
          id: "pressed",
          kind: "runtime",
          signalId: "input.pressed",
          blocks: [
            {
              id: "key-read",
              kind: "set",
              variable: "key",
              value: { kind: "variable", id: "pressed" },
            },
          ],
        },
      ],
    },
  ];
  const game = new Game(project);
  game.start();
  game.input.press("KeyW");
  game.advance(STEP);
  expect(Object.fromEntries(game.getVariables(actor.id)!)).toEqual({
    key: "KeyW",
    status: "Status",
    zoom: 2,
    gain: 0.5,
  });
  const audio: unknown[] = [];
  game.consumeAudio((command) => audio.push(command));
  expect(audio).toEqual([
    { soundId: "master", playing: false, mix: { gain: 0.5, muted: false } },
  ]);
  expect(game.logs).toEqual([]);
});

test("enforces runtime field access, operation signatures and catalog coverage", () => {
  const ids = [...runtimeFields, ...runtimeOperations].map(({ id }) => id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(
    Object.keys(runtimeRecordMembers).every((id) =>
      runtimeOperations.some(
        (operation) => operation.id === id && operation.result === "record",
      ),
    ),
  ).toBe(true);
  for (const key of Object.keys(entitySchema.shape.transform.shape))
    expect(
      runtimeFields.find(({ id }) => id === "transform." + key),
    ).toMatchObject({ writable: true, type: "number" });
  const blueprint: Blueprint = {
    id: "invalid",
    name: "Invalid",
    version: 2,
    variables: [],
    events: [
      {
        id: "start",
        kind: "start",
        blocks: [
          write("readonly", "entity.id", "changed"),
          write("type", "sprite.assetId", "image"),
          action(
            "args",
            "tile.paint",
            { layer: literal("ground"), x: literal("bad") },
            ref("unwanted"),
          ),
          {
            id: "record",
            kind: "log",
            value: field(getter("sprite.frame"), "width", "string"),
          },
        ],
      },
    ],
  };
  const issues = compileBlueprint(blueprint, new Set()).diagnostics.map(
    ({ blockId }) => blockId,
  );
  expect(issues).toEqual(
    expect.arrayContaining(["readonly", "type", "args", "record"]),
  );
});
