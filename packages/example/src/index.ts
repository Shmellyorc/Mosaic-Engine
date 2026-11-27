import {
  addWatchData,
  lanternWatchScene,
  LANTERN_WATCH_ID,
  watchBlueprint,
  watchSignals,
} from "./lantern-watch";
import {
  marketBlueprint,
  marketData,
  marketInputs,
  TRADING_POST_ID,
  tradingPostScene,
} from "./trading-post";
import {
  SIGNAL_LAB_ID,
  labSignal,
  signalBlueprints,
  signalLabScene,
  signalMixer,
} from "./signal-lab";
import {
  WORKSHOP_ID,
  workshopBlueprints,
  workshopScene,
  workshopSignal,
} from "./workshop";
import { literal, type Block, type Expression } from "@mosaic/blueprints";
import { createEntity, type Entity, type Project } from "@mosaic/model";
import landscape from "../assets/ridge.png?inline";
import sheet from "../assets/lantern.png?inline";

export function exampleProject(): Project {
  const tileSize = 20;
  const back = "environment";
  const actors = "characters";
  const hud = "overlay";
  const object = (
    id: string,
    name: string,
    layer: string,
    values: Partial<Entity["transform"]>,
  ): Entity => {
    const entity = createEntity(layer, name);
    return { ...entity, id, transform: { ...entity.transform, ...values } };
  };
  const world = {
    ...object("ridge", "Ridge Panorama", back, {
      x: 0,
      y: 0,
      width: 800,
      height: 400,
    }),
    visual: { kind: "sprite" as const, assetId: "ridge-art" },
  };
  const player = object("player", "Lantern Keeper", actors, {
    x: 385,
    y: 271,
    width: 48,
    height: 48,
  });
  const frame = (index: number) => ({ x: index * 24, y: 0, w: 24, h: 24 });
  player.visual = { kind: "sprite", assetId: "keeper-art", frame: frame(0) };
  player.blueprintId = "movement";
  player.clips = [
    {
      id: "idle",
      name: "Idle",
      fps: 2,
      loop: true,
      frames: [frame(0), frame(1)],
    },
    {
      id: "walk",
      name: "Walk",
      fps: 8,
      loop: true,
      frames: [frame(1), frame(2), frame(3), frame(2)],
    },
  ];
  const label = object("title", "Ridge Title", hud, {
    x: 25,
    y: 22,
    width: 300,
    height: 28,
  });
  label.visual = {
    kind: "text",
    text: "LANTERN RIDGE",
    color: "#ffdc9e",
    size: 24,
    screen: true,
  };
  const controls = object("controls", "Controls Hint", hud, {
    x: 25,
    y: 54,
    width: 240,
    height: 18,
  });
  controls.visual = {
    kind: "text",
    text: "A / D or arrow keys to explore",
    color: "#f1cfbf",
    size: 14,
    screen: true,
  };
  const direction: Expression = { kind: "variable", id: "direction" };
  const speed: Expression = { kind: "variable", id: "speed" };
  const blocks: Block[] = [
    {
      id: "read-input",
      kind: "set",
      variable: "direction",
      value: { kind: "input", id: "horizontal" },
    },
    {
      id: "when-moving",
      kind: "if",
      condition: {
        kind: "binary",
        op: "!=",
        left: direction,
        right: literal(0),
      },
      then: [
        {
          id: "move-player",
          kind: "move",
          x: { kind: "binary", op: "*", left: direction, right: speed },
          y: literal(0),
        },
        { id: "walk-animation", kind: "animate", clip: "Walk" },
      ],
      else: [{ id: "idle-animation", kind: "animate", clip: "Idle" }],
    },
  ];
  const beacon = object("beacon", "Lookout Lamp", actors, {
    x: 626,
    y: 280,
    width: 8,
    height: 8,
    alpha: 0.35,
  });
  beacon.visual = { kind: "rect", color: "#ffd28c" };
  beacon.blueprintId = "beacon-behaviour";
  return {
    version: 1,
    id: "lantern-ridge",
    name: "Lantern Ridge",
    width: 640,
    height: 360,
    startSceneId: "ridge-scene",
    signals: [
      { id: "beacon-glow", name: "Beacon Glow", type: "boolean" },
      workshopSignal,
      labSignal,
      ...watchSignals,
    ],
    mixer: signalMixer(),
    data: addWatchData(marketData()),
    assets: [
      { id: "ridge-art", name: "Ridge panorama", source: landscape },
      { id: "keeper-art", name: "Lantern spritesheet", source: sheet },
    ],
    input: [
      ...marketInputs,
      {
        id: "signal-pulse",
        name: "Signal Pulse",
        negative: [],
        positive: ["Space"],
      },
      {
        id: "horizontal",
        name: "Horizontal",
        negative: ["ArrowLeft", "KeyA"],
        positive: ["ArrowRight", "KeyD"],
      },
      {
        id: "vertical",
        name: "Vertical",
        negative: ["ArrowUp", "KeyW"],
        positive: ["ArrowDown", "KeyS"],
      },
    ],
    scenes: [
      {
        id: "ridge-scene",
        name: "Lantern Ridge",
        background: "#26304d",
        camera: { x: 400, y: 180, zoom: 1, follow: "player", offsetY: -91 },
        layers: [
          { id: back, name: "Environment", visible: true },
          { id: actors, name: "Characters", visible: true },
          { id: hud, name: "HUD", visible: true },
        ],
        entities: [world, player, beacon, label, controls],
        tilemap: { width: 40, height: 20, size: tileSize, tiles: [] },
      },
      workshopScene(player),
      signalLabScene(player),
      tradingPostScene(player),
      lanternWatchScene(),
    ],
    blueprints: [
      {
        version: 1,
        id: "movement",
        name: "Player Movement",
        variables: [
          { id: "direction", name: "direction", type: "number", initial: 0 },
          { id: "speed", name: "speed", type: "number", initial: 150 },
        ],
        events: [
          { id: "update-event", kind: "update", blocks },
          {
            id: "start-event",
            kind: "start",
            blocks: [
              {
                id: "start-log",
                kind: "log",
                value: literal("Lantern Ridge is ready."),
              },
            ],
          },
        ],
      },
      {
        version: 2,
        id: "beacon-behaviour",
        name: "Lookout Lamp",
        variables: [],
        functions: [
          {
            id: "light-function",
            name: "Set Glow",
            parameters: [{ id: "glow", name: "glow", type: "boolean" }],
            returns: "void",
            blocks: [
              {
                id: "glow-condition",
                kind: "if",
                condition: { kind: "variable", id: "glow" },
                then: [
                  {
                    id: "bright",
                    kind: "property",
                    property: "alpha",
                    value: literal(1),
                  },
                ],
                else: [
                  {
                    id: "dim",
                    kind: "property",
                    property: "alpha",
                    value: literal(0.35),
                  },
                ],
              },
            ],
          },
        ],
        events: [
          {
            id: "blink-start",
            kind: "start",
            blocks: [
              {
                id: "blink-repeat",
                kind: "repeat",
                count: literal(4),
                body: [
                  {
                    id: "emit-on",
                    kind: "emit",
                    signalId: "beacon-glow",
                    value: literal(true),
                  },
                  { id: "wait-on", kind: "wait", seconds: literal(0.5) },
                  {
                    id: "emit-off",
                    kind: "emit",
                    signalId: "beacon-glow",
                    value: literal(false),
                  },
                  { id: "wait-off", kind: "wait", seconds: literal(0.5) },
                ],
              },
            ],
          },
          {
            id: "on-glow",
            kind: "signal",
            signalId: "beacon-glow",
            blocks: [
              {
                id: "call-glow",
                kind: "call",
                functionId: "light-function",
                args: { glow: { kind: "variable", id: "on-glow" } },
              },
            ],
          },
        ],
      },
      ...workshopBlueprints,
      ...signalBlueprints,
      marketBlueprint,
      watchBlueprint,
    ],
  };
}

export function workshopProject(): Project {
  return {
    ...exampleProject(),
    name: "Ridge Workshop",
    startSceneId: WORKSHOP_ID,
  };
}

export function signalLabProject(): Project {
  return {
    ...exampleProject(),
    name: "Lantern Signal Lab",
    startSceneId: SIGNAL_LAB_ID,
  };
}

export function tradingPostProject(): Project {
  return {
    ...exampleProject(),
    name: "Ridge Trading Post",
    startSceneId: TRADING_POST_ID,
  };
}

export function lanternWatchProject(): Project {
  return {
    ...exampleProject(),
    name: "Lantern Watch",
    startSceneId: LANTERN_WATCH_ID,
  };
}
