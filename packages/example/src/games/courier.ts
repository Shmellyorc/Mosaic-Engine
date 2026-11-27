import { createBody, createEmitter, createLight } from "@mosaic/model";
import { literal, type Expression } from "@mosaic/blueprints";
import {
  axis,
  binary,
  builder,
  centered,
  entityRef,
  gameProject,
  globalNumber,
  keeperAsset,
  keeperSprite,
  math,
  rectangle,
  text,
  variable,
  widget,
} from "./shared";

const spawn = { x: 45, y: 164 };
const route = [
  { id: "seal-1", x: 145, y: 97, name: "West lantern" },
  { id: "seal-2", x: 322, y: 257, name: "Bridge lantern" },
  { id: "seal-3", x: 467, y: 97, name: "East lantern" },
];
const seconds = 24;
const ticks = seconds * 60;

const secondsText = (count: Expression) =>
  binary(
    "+",
    text(binary("/", math("round", binary("/", count, 6)), 10)),
    " s",
  );

export function lanternCourierProject() {
  const { project, scene } = gameProject(
    "lantern-courier",
    "Lantern Courier",
    "Fastest run in ticks",
  );
  project.assets.push(keeperAsset);
  project.signals = [
    { id: "dispatch", name: "Dispatch Courier", type: "void" },
    { id: "contact", name: "Route Contact", type: "entity" },
  ];
  const player = keeperSprite([spawn.x, spawn.y, 32, 32]);
  player.order = 4;
  player.blueprintId = "courier-control";
  player.body = {
    ...createBody(22, 24),
    offsetX: 5,
    offsetY: 4,
    enterSignal: "contact",
  };
  player.light = {
    ...createLight(),
    color: "#ffc86d",
    radius: 92,
    intensity: 1,
  };
  player.particles = {
    ...createEmitter(),
    enabled: false,
    burst: 22,
    color: "#ffd989",
    lifetime: 0.65,
  };
  scene.lighting = { enabled: true, ambient: "#9cabc4" };
  scene.tilemap = {
    size: 16,
    width: 40,
    height: 22,
    tiles: [],
    terrains: [
      {
        id: "road",
        name: "Slate",
        color: "#3d5265",
        edge: "#455d70",
        solid: false,
        cost: 1,
      },
      {
        id: "wall",
        name: "Basalt",
        color: "#253247",
        edge: "#566477",
        solid: true,
        cost: 1,
      },
      {
        id: "lane",
        name: "Delivery lane",
        color: "#4f5c58",
        edge: "#5c695b",
        solid: false,
        cost: 1,
      },
    ],
    layers: [
      {
        id: "route-grid",
        name: "Courier trail",
        layerId: "ground",
        visible: true,
        opacity: 1,
        collision: true,
        navigation: true,
        tiles: Array.from({ length: 40 * 14 }, (_, i) => {
          const x = i % 40,
            y = 5 + Math.floor(i / 40);
          const pillar = (x === 13 && y <= 8) || (x === 23 && y >= 14);
          const terrainId =
            x === 0 || x === 39 || y === 5 || y === 18 || pillar
              ? "wall"
              : y === 6 || y === 17
                ? "lane"
                : "road";
          return { x, y, color: "#3d5265", terrainId };
        }),
      },
    ],
  };

  const seals = route.flatMap(({ id, x, y, name }, index) => {
    const plate = rectangle(id, name, [x, y, 20, 24], "#f8be64");
    plate.body = { ...createBody(20, 24), kind: "sensor" };
    plate.light = {
      ...createLight(),
      color: "#fbc471",
      radius: 42,
      intensity: 0.7,
    };
    const label = rectangle(
      id + "-label",
      name + " sign",
      [x + 5, y + (index === 1 ? -28 : 29), 26, 21],
      "#e2ce97",
    );
    label.visual = {
      kind: "text",
      text: String(index + 1),
      size: 17,
      color: "#fff1c1",
      screen: false,
    };
    return [plate, label];
  });
  const door = rectangle("exit", "Dispatch gate", [568, 95, 35, 63], "#62dcb3");
  door.light = {
    ...createLight(),
    color: "#73f6d5",
    radius: 85,
    intensity: 0.8,
  };
  door.body = { ...createBody(35, 63), kind: "sensor" };
  const doorSign = rectangle(
    "exit-label",
    "Dispatch gate sign",
    [566, 70, 55, 22],
    "#b7fff1",
  );
  doorSign.visual = {
    kind: "text",
    text: "GATE",
    size: 14,
    color: "#b7fff1",
    screen: false,
  };

  const patrols = [
    { id: "north-patrol", x: 265, min: 99, max: 130, color: "#e8957d" },
    { id: "south-patrol", x: 415, min: 227, max: 259, color: "#ed9b82" },
  ];
  for (const { id, x, min, max, color } of patrols) {
    const track = rectangle(
      id + "-track",
      "Patrol track",
      [x + 12, min - 4, 5, max - min + 36],
      "#b27776",
      "ground",
    );
    track.transform.alpha = 0.6;
    track.order = 3;
    const sentry = rectangle(id, "Patrol", [x, min, 28, 28], color);
    sentry.body = { ...createBody(28, 28), kind: "sensor" };
    sentry.light = { ...createLight(), color, radius: 54, intensity: 0.7 };
    scene.entities.push(track, sentry);
  }
  scene.entities.push(...seals, door, doorSign, player);
  scene.timelines = [
    {
      id: "patrol-paths",
      name: "Patrol sweeps",
      duration: 2,
      loop: true,
      autoplay: true,
      tracks: patrols.map(({ id, min, max }) => ({
        id: id + "-track",
        entityId: id,
        property: "y",
        keys: [
          { time: 0, value: min, ease: "in-out" },
          { time: 1, value: max, ease: "in-out" },
          { time: 2, value: min, ease: "linear" },
        ],
      })),
    },
  ];

  const banner = centered(
    widget("hud", "container", "Courier status", [0, 10, 532, 54]),
    0,
  );
  Object.assign(banner.style, { background: "#172638", border: "#637e83" });
  const title = widget(
    "header",
    "text",
    "LANTERN COURIER",
    [15, 4, 205, 24],
    banner.id,
  );
  Object.assign(title.style, { fontSize: 18, color: "#ffe1a0" });
  const hud = [
    banner,
    title,
    widget("status", "text", "Awaiting dispatch", [15, 28, 310, 18], banner.id),
    widget("stamps", "text", "Stamps 0 / 3", [313, 5, 119, 24], banner.id),
    widget("clock", "text", "24 s", [449, 5, 69, 24], banner.id),
    widget("best", "text", "Best —", [313, 28, 205, 18], banner.id),
  ];
  hud.at(-1)!.style.color = "#9ae7c9";

  const menu = centered(
    widget("dispatch-card", "container", "Dispatch", [0, 18, 388, 188]),
  );
  Object.assign(menu.style, {
    background: "#162634",
    border: "#dcb575",
    borderWidth: 2,
  });
  const message = widget(
    "result",
    "text",
    "Race the lantern route",
    [23, 15, 342, 37],
    menu.id,
  );
  Object.assign(message.style, {
    color: "#ffe1a0",
    align: "center",
    fontSize: 24,
  });
  const help = widget(
    "help",
    "text",
    "WASD / arrows to move · Collect stamps 1, 2, 3",
    [19, 65, 350, 23],
    menu.id,
  );
  const hazard = widget(
    "hazard",
    "text",
    "Follow the numbered lanterns to the green gate.",
    [19, 91, 350, 23],
    menu.id,
  );
  for (const label of [help, hazard]) label.style.align = "center";
  const start = widget(
    "start",
    "button",
    "Start delivery",
    [104, 129, 180, 41],
    menu.id,
  );
  start.signal = "dispatch";
  Object.assign(start.style, {
    background: "#315851",
    border: "#83dcb8",
    color: "#f7fff0",
  });
  scene.ui = {
    widgets: [...hud, menu, message, help, hazard, start],
    initialFocus: start.id,
  };

  const { blueprint, block, event, fn, when, set, property, ui, call, chime } =
    builder("courier-control", "Lantern Courier Rules");
  blueprint.variables = [
    { id: "active", name: "Delivery active", type: "boolean", initial: false },
    {
      id: "remaining",
      name: "Ticks remaining",
      type: "number",
      initial: ticks,
    },
    { id: "collected", name: "Stamps collected", type: "number", initial: 0 },
  ];
  const running = variable("active"),
    remaining = variable("remaining");
  const collected = variable("collected"),
    best = globalNumber("best");
  const elapsed = binary("-", ticks, remaining);
  const canSave: Expression = {
    kind: "data",
    source: "slot",
    id: "records",
    type: "boolean",
  };
  const activeStampText = binary(
    "+",
    binary("+", "Stamps ", text(collected)),
    " / 3",
  );

  fn("show-best", "Show Best Time", [
    when(binary(">", best, 0), [
      ui("best", "text", binary("+", "Best ", secondsText(best))),
    ]),
  ]);
  fn(
    "finish",
    "Finish Delivery",
    [
      set("active", false),
      ui("dispatch-card", "visible", true),
      ui("result", "text", variable("message")),
      ui("status", "text", variable("message")),
      ui("start", "text", "Run again"),
      ui("start", "focus"),
    ],
    [{ id: "message", name: "Message", type: "string" }],
  );
  fn("win", "Record Successful Delivery", [
    when(binary("or", binary("==", best, 0), binary("<", elapsed, best)), [
      block({ kind: "writeGlobal", globalId: "best", value: elapsed }),
      call("show-best"),
      block({ kind: "saveSlot", slotId: "records", operation: "save" }),
    ]),
    call("finish", { message: literal("Delivery complete!") }),
    block({ kind: "particles", operation: "burst" }),
    chime(),
  ]);
  event("start", [
    when(canSave, [
      block({ kind: "saveSlot", slotId: "records", operation: "load" }),
    ]),
    call("show-best"),
  ]);
  event(
    "signal",
    [
      property("x", spawn.x),
      property("y", spawn.y),
      set("remaining", ticks),
      set("collected", 0),
      set("active", true),
      ...route.flatMap(({ id }) => [
        property("visible", true, id),
        property("visible", true, id + "-label"),
      ]),
      ui("clock", "text", seconds + " s"),
      ui("stamps", "text", activeStampText),
      ui("status", "text", "Collect stamp 1"),
      ui("dispatch-card", "visible", false),
    ],
    "dispatch",
  );

  const horizontal = axis("horizontal"),
    vertical = axis("vertical");
  const movingX = binary("!=", horizontal, 0),
    movingY = binary("!=", vertical, 0);
  const move = (speed: number) =>
    block({
      kind: "move",
      x: binary("*", horizontal, speed),
      y: binary("*", vertical, speed),
    });
  event("update", [
    when(running, [
      set("remaining", binary("-", remaining, 1)),
      when(binary("==", binary("%", remaining, 60), 0), [
        ui("clock", "text", secondsText(remaining)),
      ]),
      when(
        binary(">", remaining, 0),
        [
          when(
            binary("and", movingX, movingY),
            [move(170 / Math.SQRT2)],
            [move(170)],
          ),
          when(
            binary("or", movingX, movingY),
            [block({ kind: "animate", clip: "Walk" })],
            [block({ kind: "animate", clip: "Idle" })],
          ),
        ],
        [call("finish", { message: literal("The route closed") })],
      ),
    ]),
  ]);

  const target = variable("on-contact");
  const touches = (id: string) => binary("==", target, entityRef(id));
  event(
    "signal",
    [
      when(running, [
        ...route.map(({ id }, index) =>
          when(binary("and", touches(id), binary("==", collected, index)), [
            set("collected", index + 1),
            property("visible", false, id),
            property("visible", false, id + "-label"),
            ui("stamps", "text", activeStampText),
            ui(
              "status",
              "text",
              index < route.length - 1
                ? "Collect stamp " + (index + 2)
                : "Reach the dispatch gate",
            ),
            chime(),
          ]),
        ),
        when(touches("exit"), [
          when(
            binary("==", collected, route.length),
            [call("win")],
            [ui("status", "text", "The gate needs all three stamps")],
          ),
        ]),
        when(binary("or", touches("north-patrol"), touches("south-patrol")), [
          call("finish", { message: literal("A patrol intercepted you") }),
        ]),
      ]),
    ],
    "contact",
  );

  project.blueprints = [blueprint];
  return project;
}
