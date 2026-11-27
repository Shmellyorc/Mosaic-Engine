import { expect, test } from "vitest";
import { literal } from "@mosaic/blueprints";
import {
  createEntity,
  createProject,
  createScene,
  createWidget,
  parseProject,
  serializeProject,
} from "@mosaic/model";
import { Game, STEP } from "@mosaic/runtime";
import { marketData } from "../packages/example/src/trading-post";

function world() {
  const project = createProject("Routes");
  const main = project.scenes[0];
  main.name = "Docks";
  main.tilemap = { size: 16, width: 20, height: 12, tiles: [] };
  const region = createScene("Workshop");
  region.tilemap = {
    size: 8,
    width: 16,
    height: 16,
    tiles: [{ x: 2, y: 2, color: "#484471", solid: true }],
  };
  project.scenes.push(region);
  project.data = marketData();
  const keeper = createEntity(main.layers[0].id, "Keeper");
  const local = createEntity(main.layers[0].id, "Local");
  const child = createEntity(main.layers[0].id, "Lamp");
  child.parentId = keeper.id;
  child.persistent = true;
  main.entities.push(keeper, local, child);
  const incoming = createEntity(region.layers[0].id, "Visitor");
  incoming.id = local.id;
  incoming.blueprintId = "visitor";
  region.entities.push(incoming);
  project.blueprints.push({
    id: "visitor",
    name: "Visitor",
    version: 2,
    variables: [],
    events: [
      {
        id: "start",
        kind: "start",
        blocks: [
          { id: "log", kind: "log", value: { kind: "query", query: "scene" } },
          {
            id: "local",
            kind: "property",
            property: "x",
            target: literal({ kind: "entity", id: local.id }),
            value: literal(108),
          },
        ],
      },
    ],
  });
  const panel = createWidget("panel", "text");
  region.ui = { widgets: [{ ...panel, text: "Workshop" }] };
  main.ui = { widgets: [{ ...panel, text: "Docks" }] };
  project.signals = [{ id: "arrive", name: "Arrive", type: "void" }];
  project.sceneFlow = {
    routes: [
      {
        id: "travel",
        name: "Travel to workshop",
        from: main.id,
        to: region.id,
        operation: "change",
        fade: 0.2,
        signalId: "arrive",
      },
    ],
  };
  return { project, main, region, keeper, local, child, panel };
}

test("preloads and composes scenes with separate tile grids and scoped entity identities", () => {
  const { project, main, region, keeper, local, child } = world();
  const game = new Game(parseProject(serializeProject(project)));
  const initial = game.getEntityHandle(local.id)!;
  game.controlScene({
    operation: "preload",
    sceneId: region.id,
    offset: { x: 128, y: 16 },
  });
  game.advance(0);
  expect(game.sceneStatus).toEqual({
    primary: main.id,
    loaded: [main.id],
    preloaded: [region.id],
  });
  game.controlScene({
    operation: "add",
    sceneId: region.id,
    offset: { x: 128, y: 16 },
  });
  game.advance(0);
  game.advance(STEP);
  expect(game.sceneStatus).toEqual({
    primary: main.id,
    loaded: [main.id, region.id],
    preloaded: [],
  });
  const visitor = game.getSceneEntityId(region.id, local.id)!;
  expect(visitor).not.toBe(local.id);
  expect(game.logs).toContainEqual(
    expect.objectContaining({ message: "Workshop", entityId: visitor }),
  );
  expect(game.getEntity(visitor)?.transform.x).toBe(108);
  expect(game.getEntity(local.id)?.transform.x).not.toBe(108);
  expect(game.frame({ x: 160, y: 90, zoom: 1 }).draws).toContainEqual(
    expect.objectContaining({ color: "#484471", width: 8 }),
  );
  game.controlScene({ operation: "unload", sceneId: region.id });
  game.advance(0);
  expect(game.getEntity(visitor)).toBeUndefined();
  expect(game.resolveEntity(initial)?.id).toBe(local.id);
  const carried = game.getEntityHandle(keeper.id)!;
  game.getEntity(keeper.id)!.transform.x = 55;
  game.data.write("market-coins", 123);
  game.controlScene({ operation: "change", sceneId: region.id });
  game.advance(0);
  expect(game.resolveEntity(carried)?.transform.x).toBe(55);
  expect(game.getEntity(child.id)?.parentId).toBe(keeper.id);
  expect(game.resolveEntity(initial)).toBeUndefined();
  expect(game.data.read("global", "market-coins")).toBe(123);
  game.controlScene({ operation: "change", sceneId: main.id });
  game.advance(0);
  expect(game.getEntity(keeper.id)?.transform.x).toBe(55);
  expect(
    game.scene.entities.filter(({ name }) => name === "Keeper"),
  ).toHaveLength(1);
});

test("follows a Blueprint route at the fade midpoint and restores authored screen state on reload", () => {
  const { project, main, region, local, panel } = world();
  project.blueprints.push({
    id: "switch",
    name: "Switch",
    version: 2,
    variables: [],
    events: [
      {
        id: "start",
        kind: "start",
        blocks: [{ id: "travel", kind: "emit", signalId: "arrive" }],
      },
    ],
  });
  local.blueprintId = "switch";
  const game = new Game(project);
  game.ui.set(panel.id, "text", "Temporary");
  game.advance(STEP);
  expect(game.scene.id).toBe(main.id);
  expect(game.frame().draws.at(-1)).toMatchObject({ color: "#000000" });
  for (let n = 0; n < 7; n++) game.advance(STEP);
  expect(game.scene.id).toBe(region.id);
  expect(game.ui.view(panel.id).text).toBe("Workshop");
  for (let n = 0; n < 15; n++) game.advance(STEP);
  const visitor = game.getSceneEntityId(region.id, local.id)!;
  const before = game.getEntityHandle(visitor)!;
  game.ui.set(panel.id, "text", "Temporary");
  game.controlScene({ operation: "reload", sceneId: region.id });
  game.advance(STEP);
  expect(game.resolveEntity(before)).toBeUndefined();
  expect(game.ui.view(panel.id).text).toBe("Workshop");
  expect(
    game.logs.filter(({ message }) => message === "Workshop"),
  ).toHaveLength(2);
  expect(() =>
    game.controlScene({ operation: "unload", sceneId: region.id }),
  ).toThrow(/primary/);
});
