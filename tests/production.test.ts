import { afterEach, describe, expect, it, vi } from "vitest";
import { produce } from "immer";
import { literal, parseExtensionManifest } from "@mosaic/blueprints";
import {
  createBlueprint,
  createBody,
  createEntity,
  createProject,
  parseProject,
  serializeProject,
  type Tile,
} from "@mosaic/model";
import { Game, STEP, TileGrid } from "@mosaic/runtime";
import { imageStream } from "../packages/render/src/cache";

describe("Production runtime", () => {
  it("updates the spatial index across cells, retains draw order, and keeps old frames intact", () => {
    const project = createProject("Spatial fixture");
    const scene = project.scenes[0];
    const first = createEntity(scene.layers[0].id, "First");
    const second = createEntity(scene.layers[0].id, "Second");
    const child = createEntity(scene.layers[0].id, "Child");
    first.transform.x = 25;
    second.transform.x = 60;
    child.parentId = first.id;
    child.transform.x = 6;
    child.transform.y = 0;
    child.order = 1;
    scene.entities = [second, first, child];
    for (let index = 0; index < 100; index++) {
      const offscreen = createEntity(scene.layers[0].id);
      offscreen.transform.x = 1200 + index * 25;
      scene.entities.push(offscreen);
    }
    const game = new Game(project);
    const initial = game.frame();
    expect(initial.draws.map(({ entityId }) => entityId)).toEqual([
      second.id,
      first.id,
      child.id,
    ]);
    expect(game.renderMetrics().candidates).toBeLessThan(12);
    game.getEntity(first.id)!.transform.x = -1400;
    expect(game.frame().draws.map(({ entityId }) => entityId)).toEqual([
      second.id,
    ]);
    expect(
      game
        .frame({ x: -1380, y: 180, zoom: 1 })
        .draws.map(({ entityId }) => entityId),
    ).toEqual([first.id, child.id]);
    expect(initial.draws.at(-1)?.matrix.x).toBe(31);
  });

  it("bounds resident tile indexes and rehydrates cells after a long camera traversal", () => {
    const tiles: Tile[] = Array.from({ length: 50 }, (_, index) => ({
      x: (index % 10) * 16,
      y: Math.floor(index / 10) * 16,
      color: "#334455",
      terrainId: "stone",
    }));
    const grid = new TileGrid(256, 256, 8, tiles);
    expect(grid.residentChunks).toBe(0);
    for (const tile of tiles) expect(grid.at(tile.x, tile.y)).toBe(tile);
    expect(grid.residentChunks).toBe(32);
    const visible: Tile[] = [];
    grid.forArea({ x: 0, y: 0, width: 4, height: 4 }, (tile) =>
      visible.push(tile),
    );
    expect(visible).toEqual([tiles[0]]);
    expect(grid.residentChunks).toBe(32);
  });

  it("applies authored fields live and retains in-flight state for unchanged entities", () => {
    const project = createProject("Reload fixture");
    const scene = project.scenes[0];
    scene.gravity = { x: 0, y: 20 };
    const entity = createEntity(scene.layers[0].id, "Runner");
    entity.body = { ...createBody(), kind: "dynamic" };
    const behavior = createBlueprint("Moving");
    behavior.variables.push({
      id: "count",
      name: "Count",
      type: "number",
      initial: 0,
    });
    behavior.events = [
      {
        id: "start",
        kind: "start",
        blocks: [{ kind: "log", id: "on-start", value: literal("started") }],
      },
      {
        id: "update",
        kind: "update",
        blocks: [
          {
            kind: "set",
            id: "increment",
            variable: "count",
            value: {
              kind: "binary",
              op: "+",
              left: { kind: "variable", id: "count" },
              right: literal(1),
            },
          },
        ],
      },
    ];
    project.blueprints.push(behavior);
    entity.blueprintId = behavior.id;
    scene.entities.push(entity);
    const game = new Game(project);
    for (let i = 0; i < 10; i++) game.advance(STEP);
    const time = game.time;
    const y = game.getEntity(entity.id)!.transform.y;
    const added = {
      ...createEntity(scene.layers[0].id, "New runner"),
      blueprintId: behavior.id,
    };
    const next = produce(project, (draft) => {
      const updated = draft.scenes[0];
      updated.background = "#123456";
      updated.entities[0].transform.x = 123;
      updated.entities.push(added);
      updated.tilemap.tiles.push({ x: 1, y: 1, color: "#123456" });
      draft.blueprints[0].name = "Updated runner";
    });
    expect(game.reloadProject(next)).toBe(true);
    expect(game.getEntity(entity.id)!.transform).toMatchObject({ x: 123, y });
    expect(game.getVariables(entity.id)?.get("count")).toBe(10);
    expect(game.frame().background).toBe("#123456");
    expect(game.time).toBe(time);
    game.advance(STEP);
    expect(game.getEntity(entity.id)!.transform.y - y).toBeCloseTo(
      11 * 20 * STEP * STEP,
    );
    expect(game.getVariables(entity.id)?.get("count")).toBe(11);
    expect(
      game.logs
        .filter(({ message }) => message === "started")
        .map(({ entityId }) => entityId),
    ).toEqual([entity.id, added.id]);
    expect(
      game.reloadProject(
        produce(next, (draft) => {
          draft.scenes[0].entities.pop();
        }),
      ),
    ).toBe(true);
    expect(game.getEntity(added.id)).toBeUndefined();
    expect(game.reloadProject(createProject())).toBe(false);
  });

  it("round-trips typed declarative extensions and recompiles updated functions live", () => {
    const manifest = parseExtensionManifest({
      version: 1,
      id: "sample.math",
      name: "Math tools",
      functions: [
        {
          id: "scale",
          name: "Scale value",
          parameters: [{ id: "x", type: "number" }],
          result: "number",
          body: "x * 3",
        },
      ],
    });
    expect(() =>
      parseExtensionManifest(
        produce(manifest, (draft) => {
          draft.functions[0].body = 'property("x")';
        }),
      ),
    ).toThrow(/scalar operators/);
    expect(() =>
      parseExtensionManifest(
        produce(manifest, (draft) => {
          draft.functions[0].body = "x > 2";
        }),
      ),
    ).toThrow(/number/);
    const project = createProject("Extension fixture");
    const scene = project.scenes[0];
    const entity = createEntity(scene.layers[0].id);
    const behavior = createBlueprint();
    behavior.events = [
      {
        id: "update",
        kind: "update",
        blocks: [
          {
            kind: "move",
            id: "move",
            x: {
              kind: "extension",
              extensionId: manifest.id,
              functionId: "scale",
              args: { x: literal(12) },
            },
            y: literal(0),
          },
        ],
      },
    ];
    entity.blueprintId = behavior.id;
    project.blueprints.push(behavior);
    project.extensions = [manifest];
    scene.entities.push(entity);
    const loaded = parseProject(serializeProject(project));
    const game = new Game(loaded);
    game.advance(STEP);
    expect(game.getEntity(entity.id)!.transform.x).toBeCloseTo(320 + 36 * STEP);
    expect(
      game.reloadProject(
        produce(loaded, (draft) => {
          draft.extensions![0].functions[0].body = "x * 6";
        }),
      ),
    ).toBe(true);
    game.advance(STEP);
    expect(game.getEntity(entity.id)!.transform.x).toBeCloseTo(
      320 + 108 * STEP,
    );
    expect(game.logs).toEqual([]);
  });
});

describe("Texture streaming", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("loads only demanded textures, bounds decodes and residency, and invalidates changed sources", () => {
    class FakeImage {
      static created: FakeImage[] = [];
      src = "";
      naturalWidth = 4;
      naturalHeight = 4;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor() {
        FakeImage.created.push(this);
      }
      removeAttribute() {
        this.src = "";
      }
    }
    vi.stubGlobal("Image", FakeImage);
    const sources = ["a", "b", "c"].map((id) => ({ id, name: id, source: id }));
    const report = vi.fn();
    const evict = vi.fn();
    const stream = imageStream(sources, report, evict, {
      bytes: 64,
      count: 1,
      concurrent: 1,
    });
    const sprite = (assetId: string) => ({
      kind: "sprite" as const,
      assetId,
      width: 4,
      height: 4,
      alpha: 1,
      matrix: { a: 1, b: 0, c: 0, d: 1, x: 0, y: 0 },
    });
    expect(FakeImage.created).toHaveLength(0);
    stream.prepare([sprite("a"), sprite("b")]);
    expect(FakeImage.created.map(({ src }) => src)).toEqual(["a"]);
    FakeImage.created[0].onload?.();
    expect(FakeImage.created.map(({ src }) => src)).toEqual(["a", "b"]);
    FakeImage.created[1].onload?.();
    expect(stream.metrics()).toMatchObject({
      resident: 1,
      decoding: 0,
      bytes: 64,
      requested: 2,
    });
    stream.prepare([sprite("c")]);
    FakeImage.created[2].onload?.();
    expect(evict).toHaveBeenCalledWith("a");
    expect(stream.get("c")).toBe(FakeImage.created[2]);
    stream.replace([
      ...sources.slice(0, 2),
      { ...sources[2], source: "changed" },
    ]);
    expect(stream.get("c")).toBeUndefined();
    expect(FakeImage.created[3].src).toBe("changed");
    FakeImage.created[3].onerror?.();
    expect(report).toHaveBeenCalledWith('Could not decode "c".');
    stream.dispose();
  });
});
