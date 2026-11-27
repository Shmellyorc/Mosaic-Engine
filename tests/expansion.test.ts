import { expect, test } from "vitest";
import { literal } from "@mosaic/blueprints";
import {
  createProject,
  createWidget,
  parseProject,
  serializeProject,
} from "@mosaic/model";
import { Game, STEP } from "@mosaic/runtime";
import { relayIslesProject, tideglassProject } from "@mosaic/example";

for (const create of [relayIslesProject, tideglassProject]) {
  test(`integrates scene residency, reusable assets, audio and tree state in ${create.name}`, () => {
    const source = serializeProject(create());
    const game = new Game(parseProject(source));
    expect(serializeProject(parseProject(source))).toBe(source);
    const handle = game.getEntityHandle("harbor-beacon")!;
    for (let n = 0; n < 30; n++) game.advance(STEP);
    expect(game.logs).toEqual([]);
    expect(game.resolveEntity(handle)?.prefab?.assetId).toBe("beacon-prefab");
    expect(game.getBehaviorTree("harbor-beacon")?.blackboard.bright).toBe(
      false,
    );
    const played: string[] = [];
    game.consumeAudio(({ soundId }) => played.push(soundId));
    expect(played).toContain("music");
    const initial = game.scene.id;
    const hud = game.uiScreens.find(({ id }) => id === "global-hud")!.world;
    hud.interact("help");
    const time = game.time;
    game.advance(STEP);
    expect(game.time).toBe(time);
    game.uiScreens.at(-1)!.world.interact("resume");
    game.advance(STEP);
    expect(game.time).toBeGreaterThan(time);
    const panel = game.uiScreens.find(
      ({ id }) => id === initial + "-controls",
    )!.world;
    if (initial === "channel") panel.interact("relay-0");
    else {
      panel.interact("increase");
      game.advance(STEP);
      panel.interact("seal");
    }
    for (let n = 0; n < 20; n++) game.advance(STEP);
    expect(game.scene.id).not.toBe(initial);
    expect(game.resolveEntity(handle)?.id).toBe("harbor-beacon");
    expect(game.uiScreens.find(({ id }) => id === "global-hud")?.world).toBe(
      hud,
    );
    expect(game.logs).toEqual([]);
  });
}

test("keeps legacy project data usable and upgrades documents containing nested flow actions", () => {
  const legacy = createProject();
  const scene = legacy.scenes[0];
  scene.ui = { widgets: [createWidget("panel", "container")] };
  const v1 = parseProject(serializeProject(legacy));
  expect(v1.version).toBe(1);
  expect(new Game(v1).ui.has("panel")).toBe(true);
  legacy.blueprints.push({
    id: "flow",
    name: "Flow",
    version: 2,
    variables: [],
    events: [
      {
        id: "update",
        kind: "update",
        blocks: [
          {
            id: "condition",
            kind: "if",
            condition: literal(true),
            else: [],
            then: [
              {
                id: "preload",
                kind: "sceneFlow",
                operation: "preload",
                target: literal(scene.id),
                route: false,
              },
            ],
          },
        ],
      },
    ],
  });
  const upgraded = parseProject(serializeProject(legacy));
  expect(upgraded.version).toBe(2);
  expect(upgraded.scenes).toEqual(v1.scenes);
  expect(upgraded.blueprints).toEqual(legacy.blueprints);
});
