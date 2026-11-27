import {
  literal,
  type Block,
  type Blueprint,
  type Expression,
  type Signal,
  type UiProperty,
} from "@mosaic/blueprints";
import {
  createEntity,
  createWidget,
  type Catalog,
  type Scene,
  type Widget,
  type WidgetKind,
} from "@mosaic/model";

export const LANTERN_WATCH_ID = "lantern-watch";

export const watchSignals: Signal[] = [
  { id: "watch-open", name: "Watch Settings Opened", type: "void" },
  { id: "watch-back", name: "Watch Settings Closed", type: "void" },
  { id: "watch-start", name: "Beacon Deployed", type: "void" },
  {
    id: "watch-strength-event",
    name: "Beacon Strength Changed",
    type: "number",
  },
  { id: "watch-patrol-event", name: "Night Patrol Changed", type: "boolean" },
  { id: "watch-call-event", name: "Call Sign Changed", type: "string" },
  { id: "watch-en", name: "Watch English Selected", type: "void" },
  { id: "watch-es", name: "Watch Spanish Selected", type: "void" },
];

export function addWatchData(data: Catalog): Catalog {
  data.globals.push(
    {
      id: "watch-strength",
      name: "Beacon Strength",
      constant: false,
      saved: true,
      initial: 45,
    },
    {
      id: "watch-patrol",
      name: "Night Patrol",
      constant: false,
      saved: true,
      initial: false,
    },
    {
      id: "watch-call",
      name: "Watch Call Sign",
      constant: false,
      saved: false,
      initial: "Ridge",
    },
  );
  for (const [id, key, en, es] of [
    ["title", "lantern-watch", "LANTERN WATCH", "VIGILIA DEL FAROL"],
    [
      "caption",
      "watch-caption",
      "Keep the ridge beacons on through the night.",
      "Mantén encendidas las torres de la cumbre.",
    ],
    ["launch", "watch-deploy", "Deploy Beacon", "Encender farol"],
    ["settings", "watch-controls", "Controls", "Controles"],
    ["strength", "watch-strength", "Beacon strength", "Potencia del farol"],
    ["signal", "watch-signal-meter", "Signal", "Señal"],
    ["patrol", "watch-night-patrol", "Night patrol", "Vigilancia nocturna"],
    ["call", "watch-sign", "Call sign", "Indicativo"],
    ["back", "watch-back", "Back", "Volver"],
    ["online", "watch-online", "Beacon online", "Farol encendido"],
  ])
    data.localization.entries.push({
      id: "watch-local-" + id,
      key,
      values: { en, es },
    });
  return data;
}

function node(
  id: string,
  kind: WidgetKind,
  parent: string | null,
  text = "",
  height = 32,
  width = 152,
): Widget {
  const item = createWidget(id, kind, parent);
  item.name = text || id;
  item.text = text;
  item.rect.width = width;
  item.rect.height = height;
  return item;
}
function local(item: Widget, id: string) {
  item.textBinding = { source: "translation", id: "watch-local-" + id };
  return item;
}
function shell(id: string, name: string, height: number) {
  const item = node(id, "container", null, name, height, 360);
  Object.assign(item.rect, {
    left: 0.5,
    top: 0.5,
    right: 0.5,
    bottom: 0.5,
    pivotX: 0.5,
    pivotY: 0.5,
    x: 0,
    y: 0,
  });
  Object.assign(item.layout!, {
    mode: "column",
    gap: 9,
    padding: 17,
    align: "stretch",
  });
  Object.assign(item.style, {
    background: "#20182f",
    border: "#a681c7",
    borderWidth: 1.5,
    radius: 13,
  });
  return item;
}
function row(id: string, parent: string, height: number) {
  const item = node(id, "container", parent, "", height);
  Object.assign(item.layout!, {
    mode: "row",
    gap: 8,
    padding: 0,
    align: "stretch",
  });
  Object.assign(item.style, { background: null, borderWidth: 0 });
  return item;
}
function button(
  id: string,
  parent: string,
  name: string,
  signal: string,
  translation?: string,
) {
  const item = node(id, "button", parent, name, 34);
  item.signal = signal;
  item.rect.grow = 1;
  if (translation) local(item, translation);
  return item;
}
function title(id: string, parent: string, name: string, translation: string) {
  const item = local(node(id, "text", parent, name, 32), translation);
  Object.assign(item.style, {
    fontSize: 25,
    color: "#ffe0a6",
    align: "center",
  });
  return item;
}
function control(
  id: string,
  kind: "toggle" | "slider" | "input",
  name: string,
  translation: string,
  global: string,
  signal: string,
) {
  const item = local(node(id, kind, "watch-options", name, 36), translation);
  item.valueBinding = { source: "global", id: global };
  item.signal = signal;
  item.writeBack = true;
  return item;
}

export function lanternWatchScene(): Scene {
  const layer = "watch-scene-world";
  const backdrop = createEntity(layer, "Night Ridge");
  backdrop.id = "watch-backdrop";
  Object.assign(backdrop.transform, { x: 0, y: 0, width: 640, height: 360 });
  backdrop.visual = { kind: "sprite", assetId: "ridge-art" };
  const tint = createEntity(layer, "Twilight");
  tint.id = "watch-tint";
  Object.assign(tint.transform, {
    x: 0,
    y: 0,
    width: 640,
    height: 360,
    alpha: 0.52,
  });
  tint.visual = { kind: "rect", color: "#141124" };
  tint.blueprintId = "lantern-watch-ui";
  const home = shell("watch-home", "Watch Menu", 220);
  const options = shell("watch-options", "Watch Controls", 308);
  options.visible = false;
  const crest = node("watch-header-image", "image", home.id, "", 44);
  crest.name = "Ridge Banner";
  crest.image = "ridge-art";
  crest.fit = "cover";
  const caption = local(
    node("watch-caption-label", "text", home.id, "", 26),
    "caption",
  );
  caption.name = "Watch Caption";
  caption.style.align = "center";
  const actionRow = row("watch-actions", home.id, 40);
  actionRow.name = "Menu Actions";
  const launch = button(
    "watch-deploy-button",
    actionRow.id,
    "Deploy Beacon",
    "watch-start",
    "launch",
  );
  const settings = button(
    "watch-settings-button",
    actionRow.id,
    "Controls",
    "watch-open",
    "settings",
  );
  launch.navigation = { right: settings.id };
  settings.navigation = { left: launch.id };
  const status = local(
    node("watch-status-label", "text", home.id, "", 22),
    "online",
  );
  status.name = "Beacon Status";
  status.visible = false;
  Object.assign(status.style, {
    color: "#a6e5c2",
    fontSize: 15,
    align: "center",
  });
  const meter = local(
    node("watch-meter", "progress", options.id, "Signal", 25),
    "signal",
  );
  meter.valueBinding = { source: "global", id: "watch-strength" };
  const telemetry = node("watch-telemetry", "text", options.id, "45%", 20);
  telemetry.name = "Control Feedback";
  telemetry.style.color = "#e5c4ff";
  const footer = row("watch-footer", options.id, 35);
  footer.name = "Language and Back";
  const back = button(
    "watch-back-button",
    footer.id,
    "Back",
    "watch-back",
    "back",
  );
  const en = button("watch-english", footer.id, "English", "watch-en");
  const es = button("watch-spanish", footer.id, "Español", "watch-es");
  back.navigation = { right: en.id };
  en.navigation = { left: back.id, right: es.id };
  es.navigation = { left: en.id };
  return {
    id: LANTERN_WATCH_ID,
    name: "Lantern Watch",
    background: "#151220",
    layers: [{ id: layer, name: "Ridge", visible: true }],
    entities: [backdrop, tint],
    camera: { x: 320, y: 180, zoom: 1, follow: null, offsetY: 0 },
    tilemap: { size: 32, width: 20, height: 12, tiles: [] },
    ui: {
      initialFocus: launch.id,
      widgets: [
        home,
        crest,
        title("watch-title", home.id, "Lantern Watch", "title"),
        caption,
        actionRow,
        launch,
        settings,
        status,
        options,
        title("watch-settings-title", options.id, "Controls", "settings"),
        control(
          "watch-strength-slider",
          "slider",
          "Beacon strength",
          "strength",
          "watch-strength",
          "watch-strength-event",
        ),
        meter,
        telemetry,
        control(
          "watch-patrol-toggle",
          "toggle",
          "Night patrol",
          "patrol",
          "watch-patrol",
          "watch-patrol-event",
        ),
        control(
          "watch-call-input",
          "input",
          "Call sign",
          "call",
          "watch-call",
          "watch-call-event",
        ),
        footer,
        back,
        en,
        es,
      ],
    },
  };
}

const set = (
  id: string,
  widgetId: string,
  property: UiProperty,
  value?: Expression,
): Block => ({
  id,
  kind: "ui",
  widgetId,
  property,
  ...(value ? { value } : {}),
});
const show = (id: string, widget: string, visible: boolean) =>
  set(id, widget, "visible", literal(visible));
const payload = (id: string): Expression => ({ kind: "variable", id });
const toText = (value: Expression): Expression => ({ kind: "toText", value });
const join = (left: Expression, right: Expression): Expression => ({
  kind: "binary",
  op: "+",
  left,
  right,
});
function handler(
  id: string,
  signalId: string,
  blocks: Block[],
): Blueprint["events"][number] {
  return { id, kind: "signal", signalId, blocks };
}
export const watchBlueprint: Blueprint = {
  id: "lantern-watch-ui",
  name: "Watch Interface",
  version: 2,
  variables: [],
  events: [
    handler("watch-open-handler", "watch-open", [
      show("watch-hide-home", "watch-home", false),
      show("watch-show-options", "watch-options", true),
      set("watch-focus-strength", "watch-strength-slider", "focus"),
    ]),
    handler("watch-back-handler", "watch-back", [
      show("watch-hide-options", "watch-options", false),
      show("watch-show-home", "watch-home", true),
      set("watch-focus-controls", "watch-settings-button", "focus"),
    ]),
    handler("watch-deploy-handler", "watch-start", [
      show("watch-show-status", "watch-status-label", true),
      set(
        "watch-disable-deploy",
        "watch-deploy-button",
        "enabled",
        literal(false),
      ),
    ]),
    handler("watch-strength-handler", "watch-strength-event", [
      set(
        "watch-show-strength",
        "watch-telemetry",
        "text",
        join(toText(payload("watch-strength-handler")), literal("%")),
      ),
    ]),
    handler("watch-patrol-handler", "watch-patrol-event", [
      {
        id: "watch-patrol-if",
        kind: "if",
        condition: payload("watch-patrol-handler"),
        then: [
          set(
            "watch-patrol-on",
            "watch-telemetry",
            "text",
            literal("Night patrol active"),
          ),
        ],
        else: [
          set(
            "watch-patrol-off",
            "watch-telemetry",
            "text",
            literal("Night patrol off"),
          ),
        ],
      },
    ]),
    handler("watch-call-handler", "watch-call-event", [
      set(
        "watch-call-feedback",
        "watch-telemetry",
        "text",
        join(literal("Call sign • "), payload("watch-call-handler")),
      ),
    ]),
    handler("watch-en-handler", "watch-en", [
      { id: "watch-set-en", kind: "language", locale: "en" },
    ]),
    handler("watch-es-handler", "watch-es", [
      { id: "watch-set-es", kind: "language", locale: "es" },
    ]),
  ],
};
