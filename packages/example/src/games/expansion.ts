import {
  literal,
  type Block,
  type Blueprint,
  type Expression,
  type Value,
} from "@mosaic/blueprints";
import {
  createCatalog,
  createEntity,
  createMixer,
  createPatch,
  createProject,
  createUiFlow,
  createWidget,
  type Scene,
  type UiScreen,
  type Widget,
} from "@mosaic/model";

const binary = (
  op: Extract<Expression, { kind: "binary" }>["op"],
  left: Expression,
  right: Expression,
): Expression => ({ kind: "binary", op, left, right });
const read = (
  id: string,
  type: "number" | "string" = "number",
): Expression => ({ kind: "data", source: "global", id, type });
const colors = {
  relay: {
    deep: "#141a30",
    water: "#24385b",
    sand: "#58678a",
    bright: "#f5ba77",
    cold: "#a0d0ef",
    panel: "#212744",
  },
  tide: {
    deep: "#122822",
    water: "#234944",
    sand: "#5d8272",
    bright: "#f6cf75",
    cold: "#9eeade",
    panel: "#223c36",
  },
};
type Palette = typeof colors.relay;

function widget(
  id: string,
  kind: Widget["kind"],
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  signal?: string,
): Widget {
  const result = createWidget(id, kind);
  result.text = text;
  result.accessibleName = kind === "button" ? text : "";
  result.rect = { ...result.rect, x, y, width, height };
  result.signal = signal;
  return result;
}
function screen(
  id: string,
  name: string,
  widgets: Widget[],
  options: Partial<UiScreen> = {},
): UiScreen {
  return {
    id,
    name,
    document: { widgets },
    layerId: "hud",
    lifetime: "scene",
    modal: false,
    passthrough: true,
    pause: false,
    fade: 0,
    ...options,
  };
}
function bound(
  id: string,
  key: string,
  x: number,
  y: number,
  width: number,
): Widget {
  return {
    ...widget(id, "text", "", x, y, width, 28),
    textBinding: { source: "global", id: key },
  };
}
function box(
  id: string,
  layer: string,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
) {
  const entity = createEntity(layer, id);
  return {
    ...entity,
    id,
    transform: { ...entity.transform, x, y, width, height },
    visual: { kind: "rect" as const, color },
  };
}
function scenery(
  id: string,
  name: string,
  index: number,
  palette: Palette,
): Scene {
  const layer = id + "-world";
  const entities = [
    box(id + "-water", layer, 0, 162, 640, 198, palette.water),
    box(id + "-island", layer, 55, 199, 530, 57, palette.sand),
    box(id + "-deck", layer, 86, 190, 461, 22, palette.cold),
    box(id + "-mast", layer, 280 + index * 54, 101, 10, 95, palette.cold),
    box(id + "-signal", layer, 267 + index * 54, 94, 36, 15, palette.bright),
  ];
  for (let n = 0; n < 18; n++) {
    entities.push(
      box(
        id + "-stars-" + n,
        layer,
        (47 + 71 * n) % 624,
        65 + ((31 * n) % 82),
        2 + (n % 4),
        2,
        palette.cold,
      ),
    );
    entities.push(
      box(
        id + "-ripples-" + n,
        layer,
        (61 + 113 * n) % 620,
        213 + ((13 * n) % 100),
        7 + (n % 4) * 6,
        1,
        palette.cold,
      ),
    );
  }
  return {
    id,
    name,
    background: palette.deep,
    camera: { x: 320, y: 180, zoom: 1, follow: null, offsetY: 0 },
    layers: [{ id: layer, name: "Harbor", visible: true }],
    entities,
    tilemap: { size: 16, width: 40, height: 23, tiles: [] },
  };
}

function basics(
  id: string,
  name: string,
  title: string,
  palette: Palette,
  scenes: Scene[],
) {
  const project = createProject(name);
  Object.assign(project, {
    id,
    version: 2,
    scenes,
    startSceneId: scenes[0].id,
  });
  project.data = createCatalog();
  project.data.globals = [
    { id: "round", name: "Station", initial: 0, saved: false, constant: false },
    {
      id: "progress",
      name: "Progress",
      initial: title,
      saved: false,
      constant: false,
    },
    {
      id: "message",
      name: "Message",
      initial: "",
      saved: false,
      constant: false,
    },
    {
      id: "score",
      name: "Signal mistakes",
      initial: 0,
      saved: false,
      constant: false,
    },
    {
      id: "pressure",
      name: "Gauge",
      initial: 3,
      saved: false,
      constant: false,
    },
  ];
  project.mixer = createMixer();
  project.mixer.buses = [
    { id: "score-bus", name: "Music", gain: 0.65, muted: false },
    { id: "signal-bus", name: "Effects", gain: 0.8, muted: false },
  ];
  const tone = { ...createPatch("switch", "Relay Chime"), bus: "signal-bus" };
  const bass = {
    ...createPatch("bass", "Harbor Bass", "Circuit Blip"),
    duration: 0.42,
    gain: 0.48,
  };
  const song = {
    id: "music",
    name: "Harbor Theme",
    bus: "score-bus",
    gain: 0.55,
    loop: true,
    tempo: 104,
    rowsPerBeat: 4,
    tracks: [
      {
        id: "lead",
        name: "Glass lead",
        instrumentId: tone.id,
        gain: 0.56,
        pan: 0.24,
        muted: false,
      },
      {
        id: "low",
        name: "Harbor bass",
        instrumentId: bass.id,
        gain: 0.33,
        pan: -0.4,
        muted: false,
      },
    ],
    patterns: [
      {
        id: "intro",
        name: "Harbor phrase",
        rows: 24,
        notes: [0, 3, 7, 12, 16, 19].map((row, n) => ({
          row,
          track: n % 2 ? "low" : "lead",
          cell: {
            note: [72, 43, 74, 48, 67, 46][n],
            velocity: 0.8,
            effect: "none" as const,
            amount: 0,
          },
        })),
      },
    ],
    order: ["intro", "intro"],
  };
  project.audioCreation = { patches: [tone, bass], songs: [song] };
  const master = (project.uiFlow = createUiFlow());
  const mast = widget("logo", "text", name.toUpperCase(), 18, 10, 260, 31);
  mast.style.fontSize = 24;
  mast.style.color = palette.bright;
  mast.styleOverride = true;
  const hud = screen(
    "global-hud",
    "Harbor HUD",
    [
      mast,
      bound("progress", "progress", 20, 45, 330),
      bound("message", "message", 21, 234, 600),
      widget("help", "button", "Instructions", 482, 17, 136, 34, "open-help"),
    ],
    { lifetime: "global" },
  );
  const paper = widget("paper", "container", "", 121, 70, 398, 210);
  paper.panel = true;
  paper.style.background = palette.panel;
  paper.style.radius = 12;
  paper.style.borderWidth = 1;
  const lead = widget("details", "text", title, 145, 106, 350, 93);
  const dismiss = widget(
    "resume",
    "button",
    "Continue voyage",
    220,
    212,
    200,
    36,
    "close-help",
  );
  const dialog = screen(
    "instructions",
    "Instructions",
    [paper, lead, dismiss],
    {
      layerId: "modal",
      modal: true,
      pause: true,
      passthrough: false,
      lifetime: "global",
      fade: 0.12,
    },
  );
  dialog.document.initialFocus = dismiss.id;
  master.screens.push(hud, dialog);
  master.entries.push({ screenId: hud.id, sceneId: null });
  master.routes.push(
    {
      id: "show-instructions",
      name: "Open instructions",
      sourceId: hud.id,
      signalId: "open-help",
      action: "push",
      screenId: dialog.id,
    },
    {
      id: "hide-instructions",
      name: "Close instructions",
      sourceId: dialog.id,
      signalId: "close-help",
      action: "pop",
    },
  );
  master.themes.push(
    {
      id: "harbor",
      name: "Harbor controls",
      parent: null,
      styles: {
        button: {
          normal: {
            background: palette.panel,
            color: palette.cold,
            border: palette.cold,
            borderWidth: 1,
            radius: 8,
            weight: "bold",
          },
          hover: { background: palette.sand, color: "#ffffff" },
          focused: { accent: palette.bright },
          pressed: { background: palette.deep },
        },
        text: { normal: { color: palette.cold } },
      },
    },
    {
      id: "night",
      name: "Night controls",
      parent: "harbor",
      styles: { button: { normal: { color: palette.bright } } },
    },
  );
  master.themeId = "harbor";
  project.signals = [
    "open-help",
    "close-help",
    "left",
    "right",
    "confirm",
    "stream",
    "next-1",
    "next-2",
    "restart",
  ].map((id) => ({ id, name: id.split("-").join(" "), type: "void" }));
  project.sceneFlow = { routes: [] };
  project.sceneFlow.routes.push(
    ...scenes.slice(1).map((scene, index) => ({
      id: "voyage-" + index,
      name: "Sail to " + scene.name,
      from: scenes[index].id,
      to: scene.id,
      operation: "change" as const,
      fade: 0.24,
      signalId: "next-" + (index + 1),
    })),
  );
  const player = box(
    "harbor-beacon",
    scenes[0].layers[0].id,
    309,
    151,
    22,
    29,
    palette.bright,
  );
  const lantern = box(
    "harbor-glow",
    scenes[0].layers[0].id,
    5,
    -11,
    12,
    12,
    palette.cold,
  );
  lantern.parentId = player.id;
  player.persistent = true;
  player.behaviorTree = "beacon-pulse";
  player.blueprintId = "rules";
  const prefab = {
    id: "beacon-prefab",
    name: "Signal Lantern",
    entities: [
      {
        ...player,
        id: "template-beacon",
        blueprintId: null,
        persistent: undefined,
      },
      { ...lantern, id: "template-glow", parentId: "template-beacon" },
    ],
  };
  project.prefabs = [prefab];
  for (const [source, entity] of prefab.entities.map(
    (template, index) => [template, [player, lantern][index]] as const,
  ))
    Object.assign(entity, {
      prefab: {
        assetId: prefab.id,
        instanceId: "beacon-placed",
        sourceId: source.id,
      },
    });
  scenes[0].entities.push(player, lantern);
  project.behaviorTrees = [
    {
      id: "beacon-pulse",
      name: "Signal Pulse",
      blackboard: [{ id: "bright", name: "Beacon lit", initial: true }],
      root: {
        id: "cycle",
        name: "Signal cycle",
        kind: "sequence",
        children: [
          { id: "tick", name: "Hold signal", kind: "wait", seconds: 0.35 },
          {
            id: "pulse",
            name: "Toggle beacon",
            kind: "call",
            blueprintId: "rules",
            functionId: "pulse",
            args: { lit: { kind: "key", key: "bright" } },
            result: "bright",
          },
        ],
      },
    },
  ];
  let serial = 0;
  const fresh = () => "instruction-" + ++serial;
  const write = (
    globalId: string,
    value: number | string | Expression,
  ): Block => ({
    id: fresh(),
    kind: "writeGlobal",
    globalId,
    value: typeof value === "object" ? value : literal(value),
  });
  const set = (id: string, value: Expression): Block => ({
    id: fresh(),
    kind: "property",
    property: "alpha",
    target: literal({ kind: "entity", id }),
    value,
  });
  const audio = (soundId: string): Block => ({
    id: fresh(),
    kind: "sound",
    soundId,
    playing: true,
  });
  const emit = (signalId: string): Block => ({
    id: fresh(),
    kind: "emit",
    signalId,
  });
  const ui = (action: "show" | "hide" | "theme", id: string): Block => ({
    id: fresh(),
    kind: "screen",
    action,
    target: literal(id),
  });
  const when = (
    condition: Expression,
    then: Block[],
    otherwise: Block[] = [],
  ): Block => ({ id: fresh(), kind: "if", condition, then, else: otherwise });
  const functionReturn = (value: Value): Block => ({
    id: fresh(),
    kind: "return",
    value: literal(value),
  });
  const bp: Blueprint = {
    id: "rules",
    name: name + " Rules",
    version: 2,
    variables: [],
    events: [],
    functions: [
      {
        id: "pulse",
        name: "Toggle beacon",
        returns: "boolean",
        parameters: [{ id: "lit", name: "Lit", type: "boolean" }],
        blocks: [
          when(
            { kind: "variable", id: "lit" },
            [set(lantern.id, literal(0.28)), functionReturn(false)],
            [set(lantern.id, literal(1)), functionReturn(true)],
          ),
        ],
      },
    ],
  };
  project.blueprints.push(bp);
  const on = (signal: string, blocks: Block[]) =>
    bp.events.push({
      id: "on-" + signal,
      kind: "signal",
      signalId: signal,
      blocks,
    });
  const sceneScreen = (scene: Scene, widgets: Widget[]) => {
    const asset = screen(
      scene.id + "-controls",
      scene.name + " controls",
      widgets,
    );
    master.screens.push(asset);
    master.entries.push({ screenId: asset.id, sceneId: scene.id });
    return asset.id;
  };
  return { project, bp, on, write, audio, emit, ui, when, sceneScreen };
}
const equal = (value: Expression, wanted: Value) =>
  binary("==", value, literal(wanted));

export function relayIslesProject() {
  const palette = colors.relay;
  const scenes = [
    scenery("channel", "Near Channel", 0, palette),
    scenery("tower", "High Tower", 1, palette),
    scenery("battery", "West Battery", 2, palette),
  ];
  const game = basics(
    "relay-isles",
    "Relay Isles",
    "Follow the tide chart. Bridge → High tower → West battery.",
    palette,
    scenes,
  );
  const labels = [
    ["Bridge", "Warehouse"],
    ["Low tower", "High tower"],
    ["West battery", "East battery"],
  ];
  const correct = ["left", "right", "left"];
  const panels = scenes.map((scene, index) =>
    game.sceneScreen(
      scene,
      labels[index].map((name, n) =>
        widget(
          "relay-" + n,
          "button",
          name,
          98 + 236 * n,
          280,
          207,
          42,
          n ? "right" : "left",
        ),
      ),
    ),
  );
  const { project, bp, write, audio, ui, when, emit, on } = game;
  const shoal = scenery("shoal", "Tidal Shoal", 3, palette);
  shoal.entities = [];
  shoal.tilemap = {
    size: 8,
    width: 14,
    height: 6,
    tiles: Array.from({ length: 36 }, (_, n) => ({
      x: n % 12,
      y: Math.floor(n / 12),
      color: n % 2 ? palette.bright : palette.water,
    })),
  };
  project.scenes = [...project.scenes, shoal];
  project.sceneFlow!.routes.push({
    id: "stream-shoal",
    name: "Stream the shoal",
    from: null,
    to: shoal.id,
    operation: "add",
    fade: 0,
    signalId: "stream",
    offset: { x: 350, y: 132 },
  });
  bp.events.push({
    id: "boot",
    kind: "start",
    blocks: [
      write("progress", "Relays 0 / 3"),
      write("message", "Tide chart · Bridge → High tower → West battery"),
      {
        id: "prewarm-shoal",
        kind: "sceneFlow",
        operation: "preload",
        target: literal(shoal.id),
        route: false,
      },
      emit("stream"),
      audio("music"),
    ],
  });
  for (const side of ["left", "right"]) {
    const attempts = scenes.reduceRight<Block[]>(
      (next, _, n) => [
        when(
          equal(read("round"), n),
          side === correct[n]
            ? [
                write("round", n + 1),
                write("progress", "Relays " + (n + 1) + " / 3"),
                audio("switch"),
                ui("hide", panels[n]),
                ...(n < scenes.length - 1
                  ? [
                      write(
                        "message",
                        "Relay found. Sailing to " + scenes[n + 1].name + ".",
                      ),
                      emit("next-" + (n + 1)),
                    ]
                  : [
                      ui("theme", "night"),
                      write("message", "All relays restored!"),
                    ]),
              ]
            : [
                write("score", binary("+", read("score"), literal(1))),
                write(
                  "message",
                  "Wrong relay. Read the tide chart and try again.",
                ),
              ],
          next,
        ),
      ],
      [],
    );
    on(side, attempts);
  }
  return project;
}

export function tideglassProject() {
  const palette = colors.tide;
  const scenes = [
    scenery("intake", "Intake Station", 0, palette),
    scenery("sluice", "Sluice Station", 1, palette),
    scenery("reservoir", "Reservoir Station", 2, palette),
  ];
  const targets = [5, 2, 6];
  const init = [3, 5, 2];
  const game = basics(
    "tideglass",
    "Tideglass",
    "Set each gauge to its target. Open adds 2, vent removes 1, and seal checks the result.",
    palette,
    scenes,
  );
  const panels = scenes.map((scene, index) =>
    game.sceneScreen(scene, [
      widget("target", "text", "Target " + targets[index], 24, 83, 125, 26),
      bound("gauge", "pressure", 24, 109, 100),
      widget("increase", "button", "Open +2", 34, 277, 169, 45, "left"),
      widget("decrease", "button", "Vent −1", 235, 277, 169, 45, "right"),
      widget("seal", "button", "Seal station", 436, 277, 169, 45, "confirm"),
    ]),
  );
  const { project, bp, write, audio, ui, when, on, emit } = game;
  bp.events.push({
    id: "boot",
    kind: "start",
    blocks: [
      write("progress", "Stations 0 / 3"),
      write("message", "Adjust the gauge, then seal the station."),
      audio("music"),
    ],
  });
  on("left", [
    when(binary("<", read("pressure"), literal(8)), [
      write("pressure", binary("+", read("pressure"), literal(2))),
    ]),
  ]);
  on("right", [
    when(binary(">", read("pressure"), literal(0)), [
      write("pressure", binary("-", read("pressure"), literal(1))),
    ]),
  ]);
  on(
    "confirm",
    scenes.reduceRight<Block[]>(
      (next, _, n) => [
        when(
          equal(read("round"), n),
          [
            when(
              equal(read("pressure"), targets[n]),
              [
                write("round", n + 1),
                write("progress", "Stations " + (n + 1) + " / 3"),
                audio("switch"),
                ui("hide", panels[n]),
                ...(n < scenes.length - 1
                  ? [
                      write("pressure", init[n + 1]),
                      write(
                        "message",
                        "Pressure balanced. Continue to " +
                          scenes[n + 1].name +
                          ".",
                      ),
                      emit("next-" + (n + 1)),
                    ]
                  : [
                      ui("theme", "night"),
                      write("message", "Tidegate stabilized!"),
                    ]),
              ],
              [write("message", "Gauge off target. Adjust and try again.")],
            ),
          ],
          next,
        ),
      ],
      [],
    ),
  );
  return project;
}
