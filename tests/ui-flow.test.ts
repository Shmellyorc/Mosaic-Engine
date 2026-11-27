import { expect, test } from "vitest";
import { literal } from "@mosaic/blueprints";
import {
  createEntity,
  createProject,
  createScene,
  createUiFlow,
  createWidget,
  parseProject,
  resolveUiStyle,
  serializeProject,
  type UiScreen,
} from "@mosaic/model";
import { Game, STEP } from "@mosaic/runtime";

function setup() {
  const project = createProject();
  const initial = project.scenes[0];
  const next = createScene("Far Shore");
  project.scenes.push(next);
  const hud: UiScreen = {
    id: "hud",
    name: "HUD",
    document: { widgets: [createWidget("score", "text")] },
    layerId: "hud",
    fade: 0,
    lifetime: "global",
    modal: false,
    passthrough: true,
    pause: false,
  };
  const local: UiScreen = {
    ...hud,
    id: "local",
    name: "Scene marker",
    lifetime: "scene",
    document: { widgets: [createWidget("marker", "text")] },
  };
  const dialog: UiScreen = {
    ...hud,
    id: "dialog",
    name: "Pause",
    layerId: "modal",
    modal: true,
    pause: true,
    document: {
      widgets: [{ ...createWidget("dismiss", "button"), signal: "resume" }],
      initialFocus: "dismiss",
    },
  };
  project.uiFlow = {
    ...createUiFlow(),
    entries: [
      { screenId: "hud", sceneId: null },
      { screenId: "local", sceneId: initial.id },
    ],
    screens: [hud, local, dialog],
  };
  project.signals = [{ id: "resume", name: "Resume", type: "void" }];
  const actor = createEntity(initial.layers[0].id, "Controller");
  actor.persistent = true;
  actor.blueprintId = "logic";
  initial.entities.push(actor);
  project.blueprints.push({
    id: "logic",
    name: "Logic",
    version: 2,
    variables: [],
    events: [
      {
        id: "resume",
        kind: "signal",
        signalId: "resume",
        blocks: [
          { id: "dismiss", kind: "screen", action: "pop", target: literal("") },
        ],
      },
    ],
  });
  return { project, initial, next };
}
test("keeps global screens alive, resets scene-local UI and pauses while a modal owns focus", () => {
  const { project, initial, next } = setup();
  const game = new Game(parseProject(serializeProject(project)));
  game.advance(STEP);
  const hud = game.uiScreens[0].world;
  hud.set("score", "text", "14");
  game.controlUi({ action: "push", screenId: "dialog" });
  const modal = game.uiScreens.at(-1)!;
  expect(modal).toMatchObject({
    id: "dialog",
    modal: true,
    active: true,
    block: true,
  });
  expect(game.uiScreens[0].active).toBe(false);
  const time = game.time;
  game.advance(STEP);
  expect(game.time).toBe(time);
  modal.world.interact("dismiss");
  game.advance(STEP);
  expect(game.time).toBeGreaterThan(time);
  expect(game.uiScreens.map(({ id }) => id)).toEqual(["hud", "local"]);
  game.controlScene({ operation: "change", sceneId: next.id });
  game.advance(0);
  expect(game.uiScreens.map(({ id }) => id)).toEqual(["hud"]);
  expect(game.uiScreens[0].world.view("score").text).toBe("14");
  game.controlScene({ operation: "change", sceneId: initial.id });
  game.advance(0);
  expect(game.uiScreens.map(({ id }) => id)).toEqual(["hud", "local"]);
});
test("orders moved screens and resolves theme inheritance, widget states and runtime changes", () => {
  const { project } = setup();
  const flow = project.uiFlow!;
  flow.themes = [
    {
      id: "base",
      name: "Base",
      parent: null,
      styles: {
        text: {
          normal: { color: "#123456", font: "mono" },
          focused: { accent: "#ff0000" },
        },
      },
    },
    {
      id: "child",
      name: "Child",
      parent: "base",
      styles: {
        text: { normal: { color: "#bada55" }, disabled: { opacity: 0.5 } },
      },
    },
  ];
  flow.themeId = "child";
  expect(resolveUiStyle(flow.themes, "child", "text")).toEqual({
    normal: { color: "#bada55", font: "mono" },
    focused: { accent: "#ff0000" },
    disabled: { opacity: 0.5 },
  });
  const game = new Game(project);
  game.controlUi({ action: "move", screenId: "hud", layerId: "overlay" });
  expect(game.uiScreens.map(({ id }) => id)).toEqual(["local", "hud"]);
  const first = game.uiScreens.at(-1)!;
  expect(first.skin?.("text")?.normal.color).toBe("#bada55");
  game.controlUi({ action: "theme", themeId: "base" });
  const second = game.uiScreens.at(-1)!;
  expect(second.skin?.("text")?.normal.color).toBe("#123456");
  expect(second.skinVersion).toBeGreaterThan(first.skinVersion!);
  flow.themes[0].parent = "child";
  expect(() => serializeProject(project)).toThrow(/inheritance/);
});
