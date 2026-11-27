import { literal, type Blueprint, type Expression } from "@mosaic/blueprints";
import { createBody, type Entity, type Scene, type Tile } from "@mosaic/model";

export const WORKSHOP_ID = "ridge-workshop";
export const workshopSignal = {
  id: "workshop-contact",
  name: "Workshop Pad Contact",
  type: "entity" as const,
};

export function workshopScene(source: Entity): Scene {
  const size = 32;
  const width = 20;
  const height = 12;
  const terrain = (x: number, y: number, terrainId: string): Tile => ({
    x,
    y,
    terrainId,
    color: "#455775",
  });
  const floor: Tile[] = [];
  const walls: Tile[] = [];
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      floor.push(
        terrain(
          x,
          y,
          (x <= 7 && y === 4) || (x > 13 && y === 3)
            ? "workshop-moss"
            : "workshop-floor",
        ),
      );
      const border = y === 0 || y === height - 1 || x === 0 || x === width - 1;
      const divider = x === 9 && y >= 1 && y <= 7;
      const bar = y === 7 && x >= 13 && x <= 17;
      if (border || divider || bar) walls.push(terrain(x, y, "workshop-wall"));
    }
  const entity = (
    id: string,
    name: string,
    x: number,
    y: number,
    width: number,
    height: number,
    color: string,
  ): Entity => ({
    id,
    name,
    parentId: null,
    visible: true,
    layerId: "workshop-objects",
    order: 0,
    transform: {
      x,
      y,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      width,
      height,
      alpha: 1,
    },
    visual: { kind: "rect", color },
    blueprintId: null,
    clips: [],
  });
  const keeper = entity(
    "workshop-player",
    "Workshop Keeper",
    80,
    67,
    48,
    48,
    "#b08bc5",
  );
  keeper.visual = source.visual;
  keeper.clips = source.clips;
  keeper.body = { ...createBody(20, 20), offsetX: 13, offsetY: 20 };
  keeper.blueprintId = "workshop-movement";
  keeper.light = {
    enabled: true,
    color: "#a3deff",
    intensity: 0.66,
    radius: 136,
  };

  const ranger = entity(
    "workshop-ranger",
    "Pathfinder",
    144,
    136,
    16,
    16,
    "#f4c98c",
  );
  ranger.body = createBody(16, 16);
  ranger.navigation = {
    enabled: true,
    x: 496,
    y: 80,
    speed: 104,
    target: null,
  };
  ranger.light = {
    enabled: true,
    color: "#f8bb62",
    intensity: 0.43,
    radius: 92,
  };

  const sensor = entity(
    "workshop-pad",
    "Pressure Pad",
    329,
    264,
    46,
    48,
    "#739e8c",
  );
  sensor.body = {
    ...createBody(46, 48),
    kind: "sensor",
    enterSignal: workshopSignal.id,
  };
  sensor.blueprintId = "workshop-switch";
  sensor.light = {
    enabled: true,
    color: "#a4ecb2",
    intensity: 0.54,
    radius: 108,
  };
  sensor.order = -1;

  const crate = entity(
    "workshop-crate",
    "Falling Crate",
    489,
    104,
    19,
    18,
    "#c5916f",
  );
  crate.body = { ...createBody(19, 18), kind: "dynamic", bounce: 0.22 };
  const text = entity(
    "workshop-title",
    "Workshop title",
    17,
    14,
    300,
    20,
    "#ffffff",
  );
  text.layerId = "workshop-hud";
  text.visual = {
    kind: "text",
    text: "RIDGE WORKSHOP",
    size: 19,
    color: "#ffe1bd",
    screen: true,
  };
  const hint = entity(
    "workshop-status",
    "Workshop status",
    17,
    39,
    400,
    16,
    "#ffffff",
  );
  hint.layerId = "workshop-hud";
  hint.visual = {
    kind: "text",
    text: "Arrow keys / WASD · Reach the green pad",
    size: 13,
    color: "#e4d8eb",
    screen: true,
  };

  return {
    id: WORKSHOP_ID,
    name: "Ridge Workshop",
    background: "#272b45",
    layers: [
      { id: "workshop-ground", name: "Ground", visible: true },
      { id: "workshop-objects", name: "Objects", visible: true },
      { id: "workshop-hud", name: "HUD", visible: true },
    ],
    entities: [sensor, keeper, ranger, crate, text, hint],
    camera: {
      x: 320,
      y: 192,
      follow: keeper.id,
      offsetX: 24,
      offsetY: 24,
      zoom: 1.24,
      damping: 7,
      deadZone: { width: 100, height: 76 },
      bounds: { x: 0, y: 0, width: width * size, height: height * size },
    },
    gravity: { x: 0, y: 240 },
    lighting: { enabled: true, ambient: "#7883a1" },
    tilemap: {
      size,
      width,
      height,
      tiles: [],
      terrains: [
        {
          id: "workshop-floor",
          name: "Slate",
          color: "#455775",
          edge: "#667692",
          solid: false,
          cost: 1,
        },
        {
          id: "workshop-wall",
          name: "Raised Stone",
          color: "#786e88",
          edge: "#b09eb6",
          solid: true,
          cost: 1,
        },
        {
          id: "workshop-moss",
          name: "Moss",
          color: "#526e69",
          edge: "#779382",
          solid: false,
          cost: 5,
        },
      ],
      layers: [
        {
          id: "workshop-floor-layer",
          name: "Slate and Moss",
          layerId: "workshop-ground",
          tiles: floor,
          visible: true,
          opacity: 1,
          collision: false,
          navigation: true,
        },
        {
          id: "workshop-wall-layer",
          name: "Stone Walls",
          layerId: "workshop-objects",
          tiles: walls,
          visible: true,
          opacity: 1,
          collision: true,
          navigation: true,
        },
      ],
    },
  };
}

const speed = (id: string): Expression => ({
  kind: "binary",
  op: "*",
  left: { kind: "input", id },
  right: literal(144),
});
export const workshopBlueprints: Blueprint[] = [
  {
    version: 2,
    id: "workshop-movement",
    name: "Workshop Walk",
    variables: [],
    events: [
      {
        id: "workshop-update",
        kind: "update",
        blocks: [
          {
            id: "workshop-move",
            kind: "move",
            x: speed("horizontal"),
            y: speed("vertical"),
          },
        ],
      },
    ],
  },
  {
    version: 2,
    id: "workshop-switch",
    name: "Pressure Pad",
    variables: [],
    events: [
      {
        id: "workshop-on-contact",
        kind: "signal",
        signalId: workshopSignal.id,
        blocks: [
          {
            id: "workshop-label",
            kind: "property",
            property: "text",
            value: literal("Pad reached · Contact event received"),
            target: literal({ kind: "entity", id: "workshop-status" }),
          },
        ],
      },
    ],
  },
];
