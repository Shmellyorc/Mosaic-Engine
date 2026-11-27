import { literal, type Blueprint, type Expression } from "@mosaic/blueprints";
import {
  createEmitter,
  createEntity,
  type Entity,
  type Mixer,
  type Scene,
} from "@mosaic/model";

export const SIGNAL_LAB_ID = "signal-lab";

export function signalWav() {
  const sampleRate = 12000;
  const frames = sampleRate * 0.48;
  const wav = new Uint8Array(44 + frames * 2);
  const view = new DataView(wav.buffer);
  view.setUint32(0, 0x52494646);
  view.setUint32(4, wav.length - 8, true);
  view.setUint32(8, 0x57415645);
  view.setUint32(12, 0x666d7420);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  view.setUint32(36, 0x64617461);
  view.setUint32(40, frames * 2, true);
  for (let i = 0; i < frames; i++) {
    const t = i / sampleRate;
    const tick = Math.sin(2 * Math.PI * 523.25 * t) * Math.exp(-t * 12);
    const echo =
      t >= 0.085
        ? Math.sin(2 * Math.PI * 783.99 * (t - 0.085)) *
          Math.exp(-(t - 0.085) * 7)
        : 0;
    const envelope = Math.min(1, t * 100, (0.48 - t) * 40);
    view.setInt16(
      44 + i * 2,
      (tick * 0.34 + echo * 0.22) * envelope * 32767,
      true,
    );
  }
  return wav;
}
export function signalMixer(): Mixer {
  const bytes = signalWav();
  let source = "";
  for (const byte of bytes) source += String.fromCharCode(byte);
  return {
    master: 0.8,
    muted: false,
    buses: [
      { id: "signal-bus", name: "Signal Effects", gain: 0.75, muted: false },
    ],
    sounds: [
      {
        id: "signal-chime",
        name: "Beacon Chime",
        source: "data:audio/wav;base64," + btoa(source),
        bus: "signal-bus",
        gain: 0.9,
        loop: false,
      },
    ],
  };
}

export function signalLabScene(source: Entity): Scene {
  const background = "signal-backdrop",
    lab = "signal-stage",
    hud = "signal-hud";
  function rect(
    id: string,
    name: string,
    x: number,
    y: number,
    width: number,
    height: number,
    color: string,
    layer = lab,
  ): Entity {
    const entity = createEntity(layer, name);
    return {
      ...entity,
      id,
      transform: { ...entity.transform, x, y, width, height },
      visual: { kind: "rect", color },
    };
  }
  function text(
    id: string,
    name: string,
    label: string,
    x: number,
    y: number,
    color: string,
    size: number,
  ): Entity {
    return {
      ...rect(id, name, x, y, 310, size + 2, color, hud),
      visual: { kind: "text", text: label, color, size, screen: true },
    };
  }
  const backdrop = rect(
    "signal-panorama",
    "Night Ridge",
    0,
    0,
    640,
    360,
    "#25223f",
    background,
  );
  backdrop.visual = { kind: "sprite", assetId: "ridge-art" };
  const tint = rect(
    "signal-tint",
    "Evening Tint",
    0,
    0,
    640,
    360,
    "#17132e",
    background,
  );
  tint.transform.alpha = 0.58;
  const keeper = {
    ...rect("signal-keeper", "Signal Keeper", 102, 203, 48, 48, "#f6d19d"),
    visual: source.visual,
    clips: source.clips,
    blueprintId: "signal-keeper-logic",
    animator: {
      entry: "signal-idle",
      parameters: [{ id: "signal-stride", name: "Stride", value: 0 }],
      states: [
        { id: "signal-idle", name: "Idle", clipId: "idle" },
        { id: "signal-walk", name: "Walk", clipId: "walk" },
      ],
      transitions: [
        {
          id: "signal-idle-walk",
          from: "signal-idle",
          to: "signal-walk",
          condition: {
            kind: "parameter" as const,
            parameterId: "signal-stride",
            op: "ne" as const,
            value: 0,
          },
        },
        {
          id: "signal-walk-idle",
          from: "signal-walk",
          to: "signal-idle",
          condition: {
            kind: "parameter" as const,
            parameterId: "signal-stride",
            op: "eq" as const,
            value: 0,
          },
        },
      ],
    },
  };
  const lamp = rect("signal-lamp", "Pulse Lamp", 305, 126, 30, 28, "#ffd38c");
  lamp.blueprintId = "signal-lamp-logic";
  lamp.particles = {
    ...createEmitter(),
    enabled: false,
    burst: 54,
    limit: 200,
    spread: 305,
    color: "#ffe5a4",
    size: 6,
    endSize: 1,
    lifetime: 0.85,
  };
  const ring = rect(
    "signal-ring",
    "Charge Indicator",
    248,
    287,
    144,
    3,
    "#f5bc83",
  );
  ring.transform.scaleX = 0.1;
  const decoration = [
    rect("signal-floor", "Observation Deck", 32, 245, 576, 74, "#19192c"),
    rect("signal-floor-edge", "Deck Edge", 32, 245, 576, 4, "#5f537b"),
    rect("signal-mast", "Beacon Mast", 315, 137, 10, 108, "#635b81"),
    rect("signal-mast-foot", "Beacon Mount", 288, 231, 64, 14, "#85709a"),
    rect("signal-lamp-case", "Lamp Housing", 298, 120, 44, 40, "#443452"),
    rect("signal-track", "Charge Rail", 248, 287, 144, 3, "#463653"),
  ];
  return {
    id: SIGNAL_LAB_ID,
    name: "Lantern Signal Lab",
    background: "#131321",
    camera: { x: 320, y: 180, zoom: 1, follow: null, offsetY: 0 },
    layers: [
      { id: background, name: "Backdrop", visible: true },
      { id: lab, name: "Observation Deck", visible: true },
      { id: hud, name: "HUD", visible: true },
    ],
    entities: [
      backdrop,
      tint,
      ...decoration,
      keeper,
      ring,
      lamp,
      text(
        "signal-title",
        "Lab Title",
        "LANTERN SIGNAL LAB",
        35,
        27,
        "#ffe2ad",
        24,
      ),
      text(
        "signal-controls",
        "Lab Controls",
        "A / D  Move     Space  Send signal",
        36,
        63,
        "#d4c8e6",
        14,
      ),
      text(
        "signal-charge-label",
        "Charge Label",
        "SIGNAL CHARGE",
        265,
        265,
        "#d4c8e6",
        12,
      ),
    ],
    tilemap: { size: 32, width: 20, height: 12, tiles: [] },
    timelines: [
      {
        id: "signal-charge",
        name: "Charge Sweep",
        duration: 0.8,
        loop: false,
        autoplay: false,
        tracks: [
          {
            id: "signal-charge-track",
            entityId: ring.id,
            property: "scaleX",
            keys: [
              { time: 0, value: 0.1, ease: "out" },
              { time: 0.35, value: 1, ease: "in-out" },
              { time: 0.8, value: 0.1, ease: "linear" },
            ],
          },
        ],
      },
    ],
  };
}

const direction: Expression = { kind: "input", id: "horizontal" };
const pulse: Expression = { kind: "input", id: "signal-pulse" };
export const labSignal = {
  id: "signal-fired",
  name: "Beacon Fired",
  type: "void" as const,
};
export const signalBlueprints: Blueprint[] = [
  {
    id: "signal-keeper-logic",
    version: 2,
    name: "Signal Keeper",
    variables: [
      {
        id: "signal-pressed",
        name: "Signal Held",
        type: "boolean",
        initial: false,
      },
    ],
    events: [
      {
        id: "signal-keeper-update",
        kind: "update",
        blocks: [
          {
            id: "signal-stride-update",
            kind: "animationParameter",
            parameterId: "signal-stride",
            value: direction,
          },
          {
            id: "signal-walk-move",
            kind: "if",
            condition: {
              kind: "binary",
              op: "and",
              left: {
                kind: "binary",
                op: ">",
                left: {
                  kind: "binary",
                  op: "+",
                  left: { kind: "property", property: "x" },
                  right: direction,
                },
                right: literal(40),
              },
              right: {
                kind: "binary",
                op: "<",
                left: {
                  kind: "binary",
                  op: "+",
                  left: { kind: "property", property: "x" },
                  right: direction,
                },
                right: literal(554),
              },
            },
            then: [
              {
                id: "signal-walk-apply",
                kind: "move",
                x: {
                  kind: "binary",
                  op: "*",
                  left: direction,
                  right: literal(115),
                },
                y: literal(0),
              },
            ],
            else: [],
          },
          {
            id: "signal-key-down",
            kind: "if",
            condition: {
              kind: "binary",
              op: ">",
              left: pulse,
              right: literal(0),
            },
            then: [
              {
                id: "signal-key-edge",
                kind: "if",
                condition: {
                  kind: "binary",
                  op: "==",
                  left: { kind: "variable", id: "signal-pressed" },
                  right: literal(false),
                },
                then: [
                  {
                    id: "signal-key-lock",
                    kind: "set",
                    variable: "signal-pressed",
                    value: literal(true),
                  },
                  {
                    id: "signal-key-emit",
                    kind: "emit",
                    signalId: "signal-fired",
                  },
                ],
                else: [],
              },
            ],
            else: [
              {
                id: "signal-key-release",
                kind: "set",
                variable: "signal-pressed",
                value: literal(false),
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "signal-lamp-logic",
    version: 2,
    name: "Signal Beacon",
    variables: [],
    events: [
      {
        id: "signal-lamp-event",
        kind: "signal",
        signalId: "signal-fired",
        blocks: [
          {
            id: "signal-trigger-timeline",
            kind: "timeline",
            timelineId: "signal-charge",
            playing: true,
          },
          {
            id: "signal-trigger-sparks",
            kind: "particles",
            operation: "burst",
          },
          {
            id: "signal-trigger-sound",
            kind: "sound",
            soundId: "signal-chime",
            playing: true,
          },
          {
            id: "signal-grow",
            kind: "tween",
            property: "scaleY",
            value: literal(1.45),
            seconds: literal(0.16),
            ease: "out",
          },
          { id: "signal-flash-wait", kind: "wait", seconds: literal(0.16) },
          {
            id: "signal-shrink",
            kind: "tween",
            property: "scaleY",
            value: literal(1),
            seconds: literal(0.45),
            ease: "in-out",
          },
        ],
      },
    ],
  },
];
