import { describe, expect, test } from "vitest";
import { lanternWatchProject } from "@mosaic/example";
import {
  createProject,
  createWidget,
  normalizeWidgetValue,
  parseProject,
  serializeProject,
} from "@mosaic/model";
import { Game, STEP } from "@mosaic/runtime";

describe("scene UI", () => {
  test("layouts and legacy scenes survive the project format round trip", () => {
    const project = lanternWatchProject();
    const saved = parseProject(serializeProject(project));
    const scene = saved.scenes.find(({ id }) => id === saved.startSceneId)!;
    expect(scene.ui?.initialFocus).toBe("watch-deploy-button");
    expect(
      scene.ui?.widgets.find(({ id }) => id === "watch-telemetry")?.parent,
    ).toBe("watch-options");
    expect(
      parseProject(serializeProject(createProject())).scenes[0].ui,
    ).toBeUndefined();
  });

  test("UI events deliver declared payloads on a tick and update bound widgets", () => {
    const project = lanternWatchProject();
    const game = new Game(project);
    expect(game.ui.available("watch-strength-slider")).toBe(false);
    game.ui.interact("watch-strength-slider", 80);
    expect(game.data.read("global", "watch-strength")).toBe(45);

    game.ui.interact("watch-settings-button");
    expect(game.ui.view("watch-options").visible).toBe(false);
    game.advance(STEP);
    expect(game.ui.view("watch-options").visible).toBe(true);
    expect(game.ui.focusRequest?.id).toBe("watch-strength-slider");

    game.ui.interact("watch-strength-slider", 69);
    expect(game.ui.view("watch-meter").value).toBe(69);
    game.advance(STEP);
    expect(game.ui.view("watch-telemetry").text).toBe("69%");
    game.ui.interact("watch-patrol-toggle", true);
    game.advance(STEP);
    expect(game.ui.view("watch-telemetry").text).toBe("Night patrol active");
    game.ui.interact("watch-call-input", "North");
    game.advance(STEP);
    expect(game.ui.view("watch-telemetry").text).toBe("Call sign • North");

    game.ui.interact("watch-spanish");
    game.advance(STEP);
    expect(game.ui.view("watch-title").text).toBe("VIGILIA DEL FAROL");
    game.ui.interact("watch-back-button");
    game.advance(STEP);
    expect(game.ui.view("watch-home").visible).toBe(true);
    expect(game.ui.focusRequest?.id).toBe("watch-settings-button");

    game.ui.interact("watch-deploy-button");
    game.advance(STEP);
    expect(game.ui.view("watch-status-label").visible).toBe(true);
    expect(game.ui.available("watch-deploy-button")).toBe(false);
    expect(game.logs).toHaveLength(0);
  });

  test("sheet bindings follow a stable row through a key rename", () => {
    const project = lanternWatchProject();
    const scene = project.scenes.find(({ id }) => id === project.startSceneId)!;
    const price = createWidget("price", "text");
    price.textBinding = {
      source: "sheet",
      id: "market-goods",
      rowId: "market-oil-row",
      field: "market-price",
    };
    scene.ui!.widgets.push(price);
    project.data!.sheets.find(({ id }) => id === "market-goods")!.rows[0].key =
      "oil-restocked";
    const game = new Game(parseProject(serializeProject(project)));
    expect(game.ui.view(price.id).text).toBe("7");
  });

  test("invalid hierarchy, anchors, and focus configuration are rejected", () => {
    const p = createProject();
    const panel = createWidget("panel", "container");
    const button = createWidget("button", "button", panel.id);
    p.scenes[0].ui = { widgets: [panel, button] };
    panel.parent = panel.id;
    expect(() => serializeProject(p)).toThrow(/cycle/);
    panel.parent = null;
    button.rect.left = 1;
    expect(() => serializeProject(p)).toThrow(/Anchor start/);
    button.rect.left = 0;
    p.scenes[0].ui.initialFocus = panel.id;
    expect(() => serializeProject(p)).toThrow(/interactive widget/);
  });

  test("controls validate, clamp, and quantize to their authored range", () => {
    const slider = createWidget("power", "slider");
    slider.range = { min: 2, max: 19, step: 5 };
    expect(normalizeWidgetValue(slider, 100)).toBe(17);
    expect(normalizeWidgetValue(slider, -35)).toBe(2);
    expect(normalizeWidgetValue(slider, 9.5)).toBe(12);
    expect(() => normalizeWidgetValue(slider, "9.5")).toThrow(
      /requires a number/,
    );
  });
});
