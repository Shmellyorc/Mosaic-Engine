import { describe, expect, it } from "vitest";
import {
  playableExamples,
  lanternCourierProject,
  beaconCircuitProject,
} from "@mosaic/example";
import { parseProject, serializeProject, type Project } from "@mosaic/model";
import { Game, memorySlotStorage, STEP } from "@mosaic/runtime";

function open(create: () => Project, slots = memorySlotStorage()) {
  const project = parseProject(serializeProject(create()));
  const game = new Game(project, project.startSceneId, false, slots);
  game.advance(STEP);
  return game;
}
function tick(game: Game, count: number) {
  for (let i = 0; i < count; i++) game.advance(STEP);
}
function click(game: Game, id: string) {
  game.ui.interact(id);
  game.advance(STEP);
}

describe("Playable examples", () => {
  for (const example of playableExamples) {
    it(`round-trips ${example.name} and starts without Blueprint diagnostics`, () => {
      const game = open(example.create);
      expect(game.project.id).toBe(example.id);
      expect(game.project.name).toBe(example.name);
      expect(game.logs).toEqual([]);
      expect(game.frame().draws.length).toBeGreaterThan(0);
    });
  }

  it("closes an expired dispatch, retries, delivers all stamps, and reloads a record", () => {
    const slots = memorySlotStorage();
    const game = open(lanternCourierProject, slots);
    click(game, "start");
    tick(game, 1440);
    expect(game.ui.view("result").text).toBe("The route closed");
    expect(game.ui.available("start")).toBe(true);
    expect(game.data.read("slot", "records")).toBe(false);
    click(game, "start");
    const move = (key: string, count: number) => {
      game.input.press(key);
      tick(game, count);
      game.input.release(key);
    };
    move("ArrowUp", 40);
    move("ArrowRight", 35);
    expect(game.ui.view("stamps").text).toBe("Stamps 1 / 3");
    move("ArrowDown", 65);
    move("ArrowRight", 63);
    expect(game.ui.view("stamps").text).toBe("Stamps 2 / 3");
    move("ArrowUp", 65);
    move("ArrowRight", 98);
    expect(game.ui.view("stamps").text).toBe("Stamps 3 / 3");
    expect(game.ui.view("result").text).toBe("Delivery complete!");
    expect(game.data.read("slot", "records")).toBe(true);
    const best = game.data.read("global", "best");
    expect(best).toBeGreaterThan(280);
    expect(best).toBeLessThan(380);
    expect(game.logs).toEqual([]);
    const reopened = open(lanternCourierProject, slots);
    expect(reopened.data.read("global", "best")).toBe(best);
    expect(reopened.ui.view("best").text).toMatch(/^Best \d/);
  });

  it("requires all three stamps and responds to patrol contact", () => {
    const game = open(lanternCourierProject);
    click(game, "start");
    const courier = game.getEntity("courier")!;
    courier.transform.x = 568;
    courier.transform.y = 110;
    tick(game, 3);
    expect(game.ui.view("status").text).toBe("The gate needs all three stamps");
    expect(game.ui.view("dispatch-card").visible).toBe(false);
    const patrol = game.getEntity("south-patrol")!;
    courier.transform.x = patrol.transform.x;
    courier.transform.y = patrol.transform.y;
    tick(game, 3);
    expect(game.ui.view("result").text).toBe("A patrol intercepted you");
    expect(game.ui.available("start")).toBe(true);
    expect(game.logs).toEqual([]);
  });

  it("plays three circuits, resets a board, and restores the best score", () => {
    const slots = memorySlotStorage();
    const game = open(beaconCircuitProject, slots);
    expect(game.ui.view("lit").value).toBe(4);
    click(game, "beacon-1");
    click(game, "reset");
    expect(game.ui.view("lit").value).toBe(4);
    expect(game.ui.view("moves").text).toBe("Moves 1");
    click(game, "beacon-5");
    expect(game.ui.view("lit").value).toBe(9);
    expect(game.ui.view("status").text).toBe("Circuit restored");
    click(game, "next");
    click(game, "beacon-1");
    click(game, "beacon-9");
    expect(game.ui.view("stage").text).toContain("Circuit 2 / 3");
    click(game, "next");
    for (const id of ["beacon-2", "beacon-4", "beacon-9"]) click(game, id);
    expect(game.ui.view("status").text).toBe("All circuits restored!");
    expect(game.ui.view("best").text).toBe("Best 7");
    click(game, "next");
    expect(game.ui.view("stage").text).toContain("Circuit 1 / 3");
    expect(game.ui.view("moves").text).toBe("Moves 0");
    expect(game.logs).toEqual([]);
    expect(open(beaconCircuitProject, slots).ui.view("best").text).toBe(
      "Best 7",
    );
  });
});
