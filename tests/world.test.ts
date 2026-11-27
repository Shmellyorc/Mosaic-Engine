import { describe, expect, it } from "vitest";
import { literal } from "@mosaic/blueprints";
import {
  createBlueprint,
  createBody,
  createEntity,
  createProject,
  parseProject,
  serializeProject,
  type Tile,
} from "@mosaic/model";
import {
  autotileFrame,
  cameraView,
  Game,
  NavigationGrid,
  PhysicsWorld,
  STEP,
  TileGrid,
  TileWorld,
} from "@mosaic/runtime";
import { workshopProject } from "@mosaic/example";

const tile = (x: number, y: number, options: Partial<Tile> = {}): Tile => ({
  x,
  y,
  color: "#667799",
  ...options,
});
const advance = (game: Game, ticks: number) => {
  for (let i = 0; i < ticks; i++) game.advance(STEP);
};

describe("Layered tiles and camera", () => {
  it("looks across chunk boundaries for neighbors and derives atlas frames", () => {
    const center = tile(15, 4, { terrainId: "grass" });
    const grid = new TileGrid(64, 64, 16, [
      center,
      tile(15, 3, { terrainId: "grass" }),
      tile(16, 4, { terrainId: "grass" }),
      tile(14, 4, { terrainId: "sand" }),
      tile(40, 51, { terrainId: "grass" }),
    ]);
    expect(grid.mask(center)).toBe(3);
    expect(
      autotileFrame({ assetId: "atlas", first: 2, columns: 4, size: 12 }, 3),
    ).toEqual({ x: 12, y: 12, w: 12, h: 12 });
    const seen: Tile[] = [];
    grid.forArea({ x: 240, y: 64, width: 16, height: 15 }, (item) =>
      seen.push(item),
    );
    expect(seen.map(({ x, y }) => [x, y])).toEqual([
      [15, 4],
      [16, 4],
    ]);
  });

  it("keeps old project data readable and validates new layer, tile, and body references", () => {
    const project = workshopProject();
    expect(parseProject(serializeProject(project))).toEqual(project);
    const scene = project.scenes.find(
      (item) => item.id === project.startSceneId,
    )!;
    scene.tilemap.layers![0].layerId = "missing";
    expect(() => serializeProject(project)).toThrow(/missing render layer/);
    scene.tilemap.layers![0].layerId = scene.layers[0].id;
    scene.tilemap.layers![0].tiles[0].terrainId = "missing";
    expect(() => serializeProject(project)).toThrow(/missing terrain/);
    scene.tilemap.layers![0].tiles[0].terrainId = undefined;
    scene.entities[1].parentId = scene.entities[0].id;
    expect(() => serializeProject(project)).toThrow(/root entity/);
  });

  it("supports camera offsets, a dead zone, smoothing, and bounds at non-unit zoom", () => {
    const config = {
      x: 100,
      y: 100,
      zoom: 2,
      follow: "player",
      offsetX: 12,
      offsetY: 4,
      damping: Math.log(2),
      deadZone: { width: 20, height: 20 },
      bounds: { x: 0, y: 0, width: 300, height: 180 },
    };
    const previous = { x: 100, y: 100, zoom: 2 };
    expect(cameraView(config, { x: 87, y: 99 }, 120, 100, previous, 1)).toEqual(
      previous,
    );
    const moved = cameraView(config, { x: 103, y: 101 }, 120, 100, previous, 1);
    expect(moved.x).toBeCloseTo(105);
    expect(cameraView(config, { x: 1000, y: -20 }, 120, 100)).toEqual({
      x: 270,
      y: 25,
      zoom: 2,
    });
    expect(
      cameraView(
        { ...config, bounds: { x: 10, y: 10, width: 30, height: 30 } },
        { x: 300, y: 500 },
        120,
        100,
      ),
    ).toEqual({ x: 25, y: 25, zoom: 2 });
  });
});

describe("World play runtime", () => {
  it("sweeps a Blueprint-driven body against solid tiles so it cannot tunnel through them", () => {
    const project = createProject("Sweep");
    const scene = project.scenes[0];
    scene.tilemap.size = 16;
    scene.tilemap.tiles = [tile(3, 0, { solid: true })];
    const entity = createEntity(scene.layers[0].id);
    Object.assign(entity.transform, { x: 0, y: 1 });
    entity.body = createBody(12, 10);
    const blueprint = createBlueprint();
    blueprint.events[1].blocks.push({
      id: "fast",
      kind: "move",
      x: literal(5000),
      y: literal(0),
    });
    scene.entities.push(entity);
    entity.blueprintId = blueprint.id;
    project.blueprints.push(blueprint);
    const game = new Game(project);
    advance(game, 6);
    expect(game.getEntity(entity.id)?.transform.x).toBe(36);
  });

  it("reports sensor enter and exit for a crossing in one step without stopping the actor", () => {
    const project = createProject("Sensor");
    const scene = project.scenes[0];
    const moving = createEntity(scene.layers[0].id, "Actor");
    const sensor = createEntity(scene.layers[0].id, "Sensor");
    Object.assign(moving.transform, { x: 0, y: 8 });
    Object.assign(sensor.transform, { x: 150, y: 8 });
    moving.body = { ...createBody(12, 12), velocityX: 10000 };
    sensor.body = {
      ...createBody(18, 18),
      kind: "sensor",
      enterSignal: "enter",
      exitSignal: "exit",
    };
    const physics = new PhysicsWorld(
      [sensor, moving],
      new TileWorld(scene.tilemap),
      undefined,
    );
    const events: string[] = [];
    const record = (event: {
      phase: string;
      entityId: string;
      otherId: string | null;
    }) => {
      expect(event.entityId).toBe(sensor.id);
      expect(event.otherId).toBe(moving.id);
      events.push(event.phase);
    };
    physics.step(0.04, record);
    expect(moving.transform.x).toBe(400);
    physics.step(0.04, record);
    expect(events).toEqual(["enter", "exit"]);
  });

  it("finds a lower-cost route and rejects a wide body at a one-cell choke", () => {
    const { tilemap } = createProject().scenes[0];
    tilemap.width = 5;
    tilemap.height = 4;
    tilemap.size = 16;
    tilemap.tiles = [
      tile(1, 1, { cost: 20 }),
      tile(2, 1, { cost: 20 }),
      tile(3, 1, { cost: 20 }),
    ];
    const route = new NavigationGrid(new TileWorld(tilemap)).path(
      { x: 8, y: 24 },
      { x: 72, y: 24 },
    );
    expect(route.at(-1)).toEqual({ x: 72, y: 24 });
    expect(route.slice(1, -1).some((point) => point.y !== 24)).toBe(true);
    expect(route.filter((point) => point.y === 24)).toEqual([
      { x: 8, y: 24 },
      { x: 72, y: 24 },
    ]);
    tilemap.tiles = [
      tile(2, 0, { solid: true }),
      tile(2, 2, { solid: true }),
      tile(2, 3, { solid: true }),
    ];
    const grid = new NavigationGrid(new TileWorld(tilemap));
    expect(grid.path({ x: 8, y: 24 }, { x: 72, y: 24 })).toHaveLength(5);
    expect(
      grid.path({ x: 24, y: 24 }, { x: 56, y: 24 }, { width: 12, height: 24 }),
    ).toEqual([]);
  });

  it("runs the workshop navigation, gravity, Blueprint contact, camera and lighting together", () => {
    const project = parseProject(serializeProject(workshopProject()));
    const game = new Game(project);
    const initial = game.frame();
    expect(initial.lighting?.ambient).toBe("#7883a1");
    expect(initial.draws.at(-1)).toMatchObject({
      kind: "text",
      entityId: "workshop-status",
    });
    expect(initial.draws.length - initial.lighting!.worldDraws).toBe(2);
    advance(game, 500);
    expect(game.getEntity("workshop-ranger")?.transform).toMatchObject({
      x: expect.closeTo(488, 1),
      y: expect.closeTo(72, 1),
    });
    expect(game.getEntity("workshop-crate")?.transform.y).toBeCloseTo(206, 1);
    expect(game.getEntity("workshop-status")?.visual).toMatchObject({
      text: "Pad reached · Contact event received",
    });
    game.input.press("ArrowDown");
    advance(game, 48);
    expect(game.view().y).toBeGreaterThan(145);
    expect(game.logs.filter((entry) => entry.level === "error")).toEqual([]);
  });
});
