import { describe, expect, test } from "vitest";
import { literal, type Blueprint } from "@mosaic/blueprints";
import {
  createCatalog,
  createEntity,
  createProject,
  parseProject,
  serializeProject,
  validateCatalog,
} from "@mosaic/model";
import { Game, GameData, memorySlotStorage, STEP } from "@mosaic/runtime";
import { tradingPostProject } from "@mosaic/example";
import { marketData } from "../packages/example/src/trading-post";

const score = (data: GameData) => data.read("global", "market-coins");

describe("project data and game saves", () => {
  test("embedded relations, enum membership and typed resources survive project round-trip", () => {
    const project = createProject();
    project.data = marketData();
    const reopened = parseProject(serializeProject(project));
    const game = new Game(reopened);
    expect(game.data.read("sheet", "market-goods", "lamp-oil")).toMatchObject({
      kind: "record",
      schema: "market-item",
      fields: { "market-price": 7, "market-supplier": "north-ridge" },
    });
    expect(game.data.read("resource", "market-settings")).toMatchObject({
      fields: { "market-limit": 4 },
    });
    const item = game.data.read("sheet", "market-goods", "lamp-oil");
    expect(Object.isFrozen(item)).toBe(true);
    if (typeof item === "object" && item.kind === "record")
      expect(Object.isFrozen(item.fields)).toBe(true);
    expect(() => game.data.read("sheet", "market-goods", "missing")).toThrow(
      /Row "missing"/,
    );
    expect(() => game.data.write("market-active", false)).toThrow(/constant/);
    expect(() => game.data.write("market-coins", "nine")).toThrow(
      /does not match/,
    );
    project.data.sheets[0].rows[0].values["market-supplier"] = "absent";
    expect(() => serializeProject(project)).toThrow(
      /does not match its struct/,
    );
    project.data.sheets[0].rows[0].values["market-supplier"] = "north-ridge";
    project.data.sheets[0].rows[0].values["market-grade"] = {
      kind: "enum",
      enumId: "market-tier",
      key: "unknown",
    };
    expect(() => serializeProject(project)).toThrow(
      /does not match its struct/,
    );
  });

  test("the playable data sample reads the row and saves to a slot shared between instances", () => {
    const project = tradingPostProject();
    const sceneId = project.startSceneId;
    const stored = memorySlotStorage();
    const game = new Game(
      parseProject(serializeProject(project)),
      sceneId,
      false,
      stored,
    );
    const key = (code: string) => {
      game.input.press(code);
      game.advance(STEP);
      game.input.release(code);
      game.advance(STEP);
    };
    key("Space");
    expect(score(game.data)).toBe(21);
    key("KeyP");
    key("Space");
    expect(score(game.data)).toBe(14);
    key("KeyL");
    expect(score(game.data)).toBe(21);
    const restarted = new Game(project, sceneId, false, stored);
    expect(restarted.data.read("slot", "market-checkpoint")).toBe(true);
    expect(restarted.data.load("market-checkpoint")).toBe(true);
    expect(score(restarted.data)).toBe(21);
    game.data.setLanguage("es-mx");
    game.advance(STEP);
    const title = game.getEntity("market-title")?.visual;
    expect(title).toMatchObject({ text: "PUESTO DE LA CUMBRE" });
    expect(game.logs).toHaveLength(0);
  });

  test("migrations rename keys, fill new defaults and leave runtime unchanged on invalid data", () => {
    const config = marketData();
    config.globals.push({
      id: "receipt",
      name: "Receipt",
      constant: false,
      saved: true,
      initial: {
        kind: "record",
        schema: "receipt-data",
        fields: { total: 0, signed: false },
      },
    });
    config.structs.push({
      id: "receipt-data",
      name: "Receipt",
      fields: [
        { id: "total", name: "Total", type: "number", initial: 0 },
        { id: "signed", name: "Signed", type: "boolean", initial: false },
      ],
    });
    validateCatalog(config);
    const game = new GameData("merchant", config);
    const fixture = {
      format: "mosaic-save",
      project: "merchant",
      version: 1,
      locale: "es-MX",
      globals: {
        "market-coins-v1": 16,
        receipt: {
          kind: "record",
          schema: "receipt-data",
          fields: { total: 12, cleared: true },
        },
      },
    };
    game.restore(JSON.stringify(fixture));
    expect(JSON.parse(game.encode())).toMatchObject({
      version: 2,
      globals: { "market-coins": 16, "market-bottles": 0 },
    });
    expect(game.read("global", "receipt")).toMatchObject({
      fields: { total: 12, signed: false },
    });
    expect(game.read("global", "market-active")).toBe(true);
    expect(game.read("translation", "market-heading")).toBe(
      "PUESTO DE LA CUMBRE",
    );
    const before = game.encode();
    expect(() =>
      game.restore(JSON.stringify({ ...fixture, project: "another" })),
    ).toThrow(/does not belong/);
    expect(() =>
      game.restore(JSON.stringify({ ...fixture, version: 3 })),
    ).toThrow(/newer project/);
    expect(() =>
      game.restore(
        JSON.stringify({ ...fixture, globals: { "market-coins-v1": "bad" } }),
      ),
    ).toThrow(/needs a migration/);
    expect(game.encode()).toBe(before);
    expect(() =>
      new GameData("merchant", {
        ...config,
        saves: { ...config.saves, migrations: [] },
      }).restore(JSON.stringify(fixture)),
    ).toThrow(/Missing save migration/);
  });

  test("language changes from Blueprint tiles and invalid references include the block ID", () => {
    const project = createProject();
    project.data = marketData();
    const scene = project.scenes[0];
    const e = createEntity(scene.layers[0].id);
    e.blueprintId = "rules";
    scene.entities.push(e);
    const blueprint: Blueprint = {
      id: "rules",
      name: "Rules",
      version: 2,
      variables: [],
      events: [
        {
          id: "init",
          kind: "start",
          blocks: [
            { id: "locale", kind: "language", locale: "es-MX" },
            {
              id: "log",
              kind: "log",
              value: {
                kind: "data",
                source: "translation",
                id: "market-heading",
                type: "string",
              },
            },
          ],
        },
      ],
    };
    project.blueprints = [blueprint];
    const game = new Game(project);
    game.advance(STEP);
    expect(game.logs).toEqual([
      expect.objectContaining({
        message: "PUESTO DE LA CUMBRE",
        blockId: "log",
      }),
    ]);
    blueprint.events[0].blocks.push({
      id: "invalid-write",
      kind: "writeGlobal",
      globalId: "market-active",
      value: literal(false),
    });
    const invalid = new Game(project);
    invalid.advance(STEP);
    expect(invalid.logs).toContainEqual(
      expect.objectContaining({ level: "error", blockId: "invalid-write" }),
    );
  });

  test("legacy projects remain valid without a data extension", () => {
    const project = createProject();
    expect(parseProject(serializeProject(project)).data).toBeUndefined();
    expect(new GameData(project.id, createCatalog()).read("locale", "")).toBe(
      "en",
    );
  });
});
