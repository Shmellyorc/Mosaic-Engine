import { createEmitter, createLight } from "@mosaic/model";
import { type Expression } from "@mosaic/blueprints";
import {
  binary,
  builder,
  centered,
  gameProject,
  globalNumber,
  math,
  rectangle,
  text,
  variable,
  widget,
} from "./shared";

const boards = [
  { name: "Crossing", switches: [4] },
  { name: "Twin relays", switches: [0, 8] },
  { name: "North circuit", switches: [1, 3, 8] },
];
const cells = Array.from({ length: 9 }, (_, i) => i);
const beacon = (i: number) => "beacon-" + (i + 1);
const neighbors = (i: number) => {
  const x = i % 3,
    y = Math.floor(i / 3);
  return cells.filter(
    (j) => Math.abs((j % 3) - x) + Math.abs(Math.floor(j / 3) - y) <= 1,
  );
};
export function beaconCircuitProject() {
  const { project, scene } = gameProject(
    "beacon-circuit",
    "Beacon Circuit",
    "Fewest moves",
  );
  project.input = [];
  project.signals = [
    ...cells.map((i) => ({
      id: beacon(i),
      name: "Flip Beacon " + (i + 1),
      type: "void" as const,
    })),
    { id: "reset-circuit", name: "Reset current circuit", type: "void" },
    { id: "continue-circuit", name: "Continue to next circuit", type: "void" },
  ];
  const core = rectangle(
    "circuit-core",
    "Relay core",
    [454, 311, 18, 18],
    "#b7abf7",
  );
  core.blueprintId = "circuit-rules";
  core.light = {
    ...createLight(),
    radius: 103,
    intensity: 0.92,
    color: "#b39aff",
  };
  core.particles = {
    ...createEmitter(),
    enabled: false,
    burst: 30,
    angle: -90,
    spread: 102,
    color: "#d6d2ff",
  };
  scene.entities.push(core);
  scene.lighting = { enabled: true, ambient: "#9c9cce" };
  scene.timelines = [
    {
      id: "confirm-pulse",
      name: "Relay confirmation pulse",
      duration: 0.5,
      loop: false,
      autoplay: false,
      tracks: [
        {
          id: "pulse-track",
          entityId: core.id,
          property: "scaleX",
          keys: [
            { time: 0, value: 1, ease: "out" },
            { time: 0.15, value: 2, ease: "in-out" },
            { time: 0.5, value: 1, ease: "linear" },
          ],
        },
      ],
    },
  ];

  const frame = centered(
    widget("layout", "container", "Circuit console", [0, 0, 588, 312]),
  );
  Object.assign(frame.style, { background: null, borderWidth: 0 });
  const board = widget(
    "board",
    "container",
    "Relay switches",
    [0, 0, 308, 312],
    frame.id,
  );
  Object.assign(board.style, {
    background: "#25213f",
    border: "#8273bc",
    borderWidth: 2,
  });
  const header = widget(
    "header",
    "text",
    "BEACON CIRCUIT",
    [21, 11, 266, 27],
    board.id,
  );
  Object.assign(header.style, { color: "#e9dbff", fontSize: 21 });
  const switches = cells.map((i) => {
    const x = i % 3,
      y = Math.floor(i / 3);
    const item = widget(
      beacon(i),
      "button",
      i + 1 + "  ○",
      [20 + 92 * x, 52 + 79 * y, 83, 67],
      board.id,
    );
    item.accessibleName = "Beacon " + (i + 1);
    item.signal = beacon(i);
    item.navigation = {
      left: x > 0 ? beacon(i - 1) : undefined,
      right: x < 2 ? beacon(i + 1) : "reset",
      up: y > 0 ? beacon(i - 3) : undefined,
      down: y < 2 ? beacon(i + 3) : undefined,
    };
    Object.assign(item.style, {
      background: "#39325d",
      border: "#7967af",
      fontSize: 21,
      color: "#f1e0ff",
    });
    return item;
  });

  const panel = widget(
    "console",
    "container",
    "Circuit status",
    [324, 0, 264, 279],
    frame.id,
  );
  Object.assign(panel.style, {
    background: "#1f2239",
    border: "#69679a",
    borderWidth: 2,
  });
  const stageLabel = widget(
    "stage",
    "text",
    "Circuit 1 / 3 · Crossing",
    [16, 12, 233, 29],
    panel.id,
  );
  Object.assign(stageLabel.style, { color: "#e7ddff", fontSize: 17 });
  const instructionA = widget(
    "hint-1",
    "text",
    "Each switch flips itself and",
    [16, 49, 235, 21],
    panel.id,
  );
  const instructionB = widget(
    "hint-2",
    "text",
    "its north, east, south and west neighbors.",
    [16, 70, 236, 21],
    panel.id,
  );
  instructionB.style.fontSize = 11;
  const goal = widget(
    "hint-3",
    "text",
    "Light all nine beacons.",
    [16, 99, 235, 21],
    panel.id,
  );
  goal.style.color = "#c8b2ff";
  const score = widget(
    "lit",
    "progress",
    "Beacons lit",
    [16, 129, 231, 25],
    panel.id,
  );
  score.range = { min: 0, max: 9, step: 1 };
  score.value = 4;
  const moves = widget(
    "moves",
    "text",
    "Moves 0",
    [16, 165, 106, 24],
    panel.id,
  );
  const best = widget("best", "text", "Best —", [122, 165, 124, 24], panel.id);
  best.style.color = "#c8b2ff";
  const status = widget(
    "status",
    "text",
    "Circuit ready",
    [16, 198, 235, 24],
    panel.id,
  );
  const reset = widget(
    "reset",
    "button",
    "Reset board",
    [16, 233, 105, 33],
    panel.id,
  );
  reset.signal = "reset-circuit";
  reset.navigation = { left: beacon(2), right: "next" };
  const next = widget(
    "next",
    "button",
    "Next circuit",
    [129, 233, 118, 33],
    panel.id,
  );
  next.visible = false;
  next.signal = "continue-circuit";
  next.navigation = { left: "reset" };
  next.style.accent = "#e9d6ff";
  scene.ui = {
    widgets: [
      frame,
      board,
      header,
      ...switches,
      panel,
      stageLabel,
      instructionA,
      instructionB,
      goal,
      score,
      moves,
      best,
      status,
      reset,
      next,
    ],
    initialFocus: beacon(0),
  };

  const { blueprint, block, event, fn, when, set, ui, call, chime } = builder(
    "circuit-rules",
    "Beacon Circuit Rules",
  );
  blueprint.variables = [
    ...cells.map((i) => ({
      id: beacon(i),
      name: "Beacon " + (i + 1),
      type: "boolean" as const,
      initial: false,
    })),
    { id: "stage", name: "Circuit index", type: "number", initial: 0 },
    { id: "moves", name: "Total moves", type: "number", initial: 0 },
    { id: "lit", name: "Lit beacons", type: "number", initial: 0 },
    { id: "active", name: "Board active", type: "boolean", initial: true },
  ];
  const stage = variable("stage"),
    moveCount = variable("moves"),
    lit = variable("lit");
  const record = globalNumber("best");
  const hasRecord: Expression = {
    kind: "data",
    source: "slot",
    id: "records",
    type: "boolean",
  };
  fn("show-best", "Show Best Score", [
    when(binary(">", record, 0), [
      ui("best", "text", binary("+", "Best ", text(record))),
    ]),
  ]);
  fn("render", "Show Current Switches", [
    set("lit", 0),
    ...cells.map((i) => {
      const id = beacon(i);
      return when(
        variable(id),
        [set("lit", binary("+", lit, 1)), ui(id, "text", i + 1 + "  ●")],
        [ui(id, "text", i + 1 + "  ○")],
      );
    }),
    block({
      kind: "ui",
      widgetId: "lit",
      property: "value",
      valueType: "number",
      value: lit,
    }),
    ui("moves", "text", binary("+", "Moves ", text(moveCount))),
  ]);
  fn("setup", "Restore Board Pattern", [
    ...boards.map(({ name, switches }, index) => {
      const affected = switches.map(neighbors);
      return when(binary("==", stage, index), [
        ...cells.map((i) =>
          set(
            beacon(i),
            affected.filter((list) => list.includes(i)).length % 2 === 0,
          ),
        ),
        ui(
          "stage",
          "text",
          `Circuit ${index + 1} / ${boards.length} · ${name}`,
        ),
      ]);
    }),
    set("active", true),
    ui("status", "text", "Circuit ready"),
    ui("next", "visible", false),
    ui("reset", "enabled", true),
    ui(beacon(0), "focus"),
    call("render"),
  ]);
  fn("solved", "Confirm Lit Circuit", [
    set("active", false),
    ui("reset", "enabled", false),
    ui("next", "visible", true),
    ui("next", "focus"),
    chime(),
    block({ kind: "particles", operation: "burst" }),
    block({ kind: "timeline", timelineId: "confirm-pulse", playing: true }),
    when(
      binary("==", stage, boards.length - 1),
      [
        ui("status", "text", "All circuits restored!"),
        ui("next", "text", "Play again"),
        when(
          binary("or", binary("==", record, 0), binary("<", moveCount, record)),
          [
            block({ kind: "writeGlobal", globalId: "best", value: moveCount }),
            call("show-best"),
            block({ kind: "saveSlot", slotId: "records", operation: "save" }),
          ],
        ),
      ],
      [
        ui("status", "text", "Circuit restored"),
        ui("next", "text", "Next circuit"),
      ],
    ),
  ]);
  event("start", [
    when(hasRecord, [
      block({ kind: "saveSlot", slotId: "records", operation: "load" }),
    ]),
    call("show-best"),
    call("setup"),
  ]);
  for (const i of cells) {
    event(
      "signal",
      [
        when(variable("active"), [
          ...neighbors(i).map((j) =>
            set(beacon(j), math("not", variable(beacon(j)))),
          ),
          set("moves", binary("+", moveCount, 1)),
          call("render"),
          when(binary("==", lit, 9), [call("solved")]),
        ]),
      ],
      beacon(i),
    );
  }
  event("signal", [when(variable("active"), [call("setup")])], "reset-circuit");
  event(
    "signal",
    [
      when(math("not", variable("active")), [
        when(
          binary("<", stage, boards.length - 1),
          [set("stage", binary("+", stage, 1))],
          [set("stage", 0), set("moves", 0)],
        ),
        call("setup"),
      ]),
    ],
    "continue-circuit",
  );

  project.blueprints = [blueprint];
  return project;
}
