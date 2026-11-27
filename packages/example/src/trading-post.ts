import {
  literal,
  type Block,
  type Blueprint,
  type Expression,
} from "@mosaic/blueprints";
import {
  createCatalog,
  createEntity,
  type Catalog,
  type Entity,
  type Scene,
} from "@mosaic/model";

export const TRADING_POST_ID = "ridge-trading-post";
const coins = "market-coins",
  bottles = "market-bottles",
  slot = "market-checkpoint";
const goods = "market-goods",
  suppliers = "market-suppliers";
const tier = {
  kind: "enum",
  enumId: "market-tier",
  key: "market-standard",
} as const;
const lampOil = "lamp-oil";

export function marketData(): Catalog {
  return {
    ...createCatalog(),
    enums: [
      {
        id: "market-tier",
        name: "Trade Tier",
        members: [
          { id: "market-standard", name: "Standard" },
          { id: "market-seasonal", name: "Seasonal" },
        ],
      },
    ],
    structs: [
      {
        id: "market-item",
        name: "Trade Item",
        fields: [
          { id: "market-price", name: "Price", type: "number", initial: 7 },
          {
            id: "market-supplier",
            name: "Supplier",
            type: "string",
            initial: "",
            relation: suppliers,
          },
          { id: "market-grade", name: "Tier", type: "enum", initial: tier },
        ],
      },
      {
        id: "market-maker",
        name: "Supplier",
        fields: [
          { id: "market-stall", name: "Stall", type: "string", initial: "" },
        ],
      },
      {
        id: "market-rules",
        name: "Trade Rules",
        fields: [
          {
            id: "market-limit",
            name: "Bottle Limit",
            type: "number",
            initial: 4,
          },
        ],
      },
    ],
    sheets: [
      {
        id: goods,
        name: "Trade Goods",
        structId: "market-item",
        rows: [
          {
            id: "market-oil-row",
            key: lampOil,
            values: {
              "market-price": 7,
              "market-supplier": "north-ridge",
              "market-grade": tier,
            },
          },
        ],
      },
      {
        id: suppliers,
        name: "Suppliers",
        structId: "market-maker",
        rows: [
          {
            id: "market-north-row",
            key: "north-ridge",
            values: { "market-stall": "North Ridge Cooperative" },
          },
        ],
      },
    ],
    resources: [
      {
        id: "market-settings",
        name: "Trading Post Rules",
        structId: "market-rules",
        values: { "market-limit": 4 },
      },
    ],
    globals: [
      { id: coins, name: "Crowns", initial: 28, saved: true, constant: false },
      {
        id: bottles,
        name: "Bottles",
        initial: 0,
        saved: true,
        constant: false,
      },
      {
        id: "market-active",
        name: "Market Open",
        initial: true,
        saved: false,
        constant: true,
      },
    ],
    saves: {
      version: 2,
      slots: [{ id: slot, name: "Trading Ledger" }],
      migrations: [
        { from: 1, rename: [{ from: "market-coins-v1", to: coins }], drop: [] },
      ],
    },
    localization: {
      default: "en",
      locales: ["en", "es", "es-MX"],
      entries: [
        {
          id: "market-heading",
          key: "trading-post",
          values: { en: "RIDGE TRADING POST", es: "PUESTO DE LA CUMBRE" },
        },
        {
          id: "market-oil-label",
          key: "lamp-oil",
          values: { en: "Lantern oil", es: "Aceite para farol" },
        },
        {
          id: "market-crowns-label",
          key: "crowns",
          values: { en: "Crowns", es: "Coronas" },
        },
        {
          id: "market-stock-label",
          key: "bottles",
          values: { en: "Bottles", es: "Botellas" },
        },
        {
          id: "market-help",
          key: "controls",
          values: {
            en: "Space  Buy oil     P  Save     L  Load",
            es: "Espacio  Comprar     P  Guardar     L  Cargar",
          },
        },
      ],
    },
  };
}

export function tradingPostScene(keeper: Entity): Scene {
  const back = "market-back",
    scene = "market-scene",
    overlay = "market-overlay";
  function entity(
    id: string,
    name: string,
    x: number,
    y: number,
    width: number,
    height: number,
    layer = scene,
  ) {
    const item = createEntity(layer, name);
    return {
      ...item,
      id,
      transform: { ...item.transform, x, y, width, height },
    };
  }
  function rect(
    id: string,
    x: number,
    y: number,
    w: number,
    h: number,
    color: string,
    layer = scene,
  ): Entity {
    return {
      ...entity(id, id, x, y, w, h, layer),
      visual: { kind: "rect", color },
    };
  }
  function text(
    id: string,
    name: string,
    value: string,
    x: number,
    y: number,
    size: number,
    color: string,
  ): Entity {
    return {
      ...entity(id, name, x, y, 360, size + 4, overlay),
      visual: { kind: "text", text: value, size, color, screen: true },
    };
  }
  const panorama = {
    ...entity("market-backdrop", "Ridge Backdrop", 0, 0, 640, 360, back),
    visual: { kind: "sprite" as const, assetId: "ridge-art" },
  };
  const tint = rect("Dusk", 0, 0, 640, 360, "#131226", back);
  tint.transform.alpha = 0.42;
  const hud = [
    text(
      "market-title",
      "Market Title",
      "RIDGE TRADING POST",
      42,
      41,
      25,
      "#ffe2af",
    ),
    text(
      "market-sale",
      "Trade Offering",
      "Lantern oil",
      250,
      117,
      20,
      "#fff1d5",
    ),
    text("market-price-text", "Price", "", 252, 153, 16, "#ffd49c"),
    text("market-supplier-text", "Supplier", "", 252, 179, 13, "#bdb0d3"),
    text("market-coins-text", "Crowns", "", 250, 238, 16, "#f6d198"),
    text("market-stock-text", "Bottles", "", 428, 238, 16, "#cfbbef"),
    text(
      "market-help-text",
      "Controls",
      "Space  Buy oil     P  Save     L  Load",
      42,
      310,
      14,
      "#e7d7f4",
    ),
  ];
  hud[0].blueprintId = "market-behaviour";
  return {
    id: TRADING_POST_ID,
    name: "Ridge Trading Post",
    background: "#171526",
    camera: { x: 320, y: 180, zoom: 1, follow: null, offsetY: 0 },
    layers: [
      { id: back, name: "Landscape", visible: true },
      { id: scene, name: "Counter", visible: true },
      { id: overlay, name: "Ledger", visible: true },
    ],
    entities: [
      panorama,
      tint,
      rect("Counter Outline", 224, 96, 358, 174, "#8c6475"),
      rect("Counter", 225, 97, 356, 172, "#242034"),
      rect("Ledger Row", 225, 224, 356, 43, "#342943"),
      rect("Deck", 49, 248, 166, 21, "#30213a"),
      rect("Deck Trim", 49, 246, 166, 3, "#ba7e73"),
      {
        ...entity("market-keeper", "Trading Post Keeper", 102, 182, 68, 68),
        visual: keeper.visual,
      },
      ...hud,
    ],
    tilemap: { size: 32, width: 20, height: 12, tiles: [] },
  };
}

const data = (
  source: Extract<Expression, { kind: "data" }>["source"],
  id: string,
  type: Extract<Expression, { kind: "data" }>["type"],
  key?: Expression,
): Expression => ({ kind: "data", source, id, type, ...(key ? { key } : {}) });
const global = (id: string) => data("global", id, "number");
const translated = (id: string) => data("translation", id, "string");
const text = (value: Expression): Expression => ({ kind: "toText", value });
const item = data("sheet", goods, "record", literal(lampOil));
const field = (
  record: Expression,
  key: string,
  type: "number" | "string" | "enum",
): Expression => ({ kind: "field", record, key, type });
const price = field(item, "market-price", "number");
const limit = field(
  data("resource", "market-settings", "record"),
  "market-limit",
  "number",
);
const supplier = data(
  "sheet",
  suppliers,
  "record",
  field(item, "market-supplier", "string"),
);
const labeled = (label: string, value: Expression): Expression => ({
  kind: "binary",
  op: "+",
  left: {
    kind: "binary",
    op: "+",
    left: translated(label),
    right: literal("  "),
  },
  right: text(value),
});
const op = (
  op: Extract<Expression, { kind: "binary" }>["op"],
  left: Expression,
  right: Expression,
): Expression => ({ kind: "binary", op, left, right });
const show = (id: string, value: Expression): Block => ({
  id: id + "-write",
  kind: "property",
  property: "text",
  target: literal({ kind: "entity", id }),
  value,
});
function onKey(name: string, then: Block[]): Block {
  const variable = "market-key-held-" + name;
  return {
    id: "market-on-" + name,
    kind: "if",
    condition: op(">", { kind: "input", id: "market-key-" + name }, literal(0)),
    then: [
      {
        id: "market-edge-" + name,
        kind: "if",
        condition: op("==", { kind: "variable", id: variable }, literal(false)),
        then: [
          {
            id: "market-set-" + name,
            kind: "set",
            variable,
            value: literal(true),
          },
          ...then,
        ],
        else: [],
      },
    ],
    else: [
      {
        id: "market-reset-" + name,
        kind: "set",
        variable,
        value: literal(false),
      },
    ],
  };
}

export const marketInputs = [
  { id: "market-key-buy", name: "Buy Oil", positive: ["Space"], negative: [] },
  {
    id: "market-key-save",
    name: "Save Ledger",
    positive: ["KeyP"],
    negative: [],
  },
  {
    id: "market-key-load",
    name: "Load Ledger",
    positive: ["KeyL"],
    negative: [],
  },
];

export const marketBlueprint: Blueprint = {
  id: "market-behaviour",
  name: "Trading Ledger",
  version: 2,
  variables: ["buy", "save", "load"].map((name) => ({
    id: "market-key-held-" + name,
    name: name + " held",
    type: "boolean",
    initial: false,
  })),
  events: [
    {
      id: "market-update",
      kind: "update",
      blocks: [
        onKey("buy", [
          {
            id: "market-can-buy",
            kind: "if",
            condition: op(
              "and",
              data("global", "market-active", "boolean"),
              op(
                "and",
                op(">=", global(coins), price),
                op(
                  "and",
                  op("<", global(bottles), limit),
                  op("==", field(item, "market-grade", "enum"), literal(tier)),
                ),
              ),
            ),
            then: [
              {
                id: "market-spend",
                kind: "writeGlobal",
                globalId: coins,
                value: op("-", global(coins), price),
              },
              {
                id: "market-add-bottle",
                kind: "writeGlobal",
                globalId: bottles,
                value: op("+", global(bottles), literal(1)),
              },
            ],
            else: [],
          },
        ]),
        onKey("save", [
          {
            id: "market-save-ledger",
            kind: "saveSlot",
            slotId: slot,
            operation: "save",
          },
        ]),
        onKey("load", [
          {
            id: "market-load-ledger",
            kind: "saveSlot",
            slotId: slot,
            operation: "load",
          },
        ]),
        show("market-title", translated("market-heading")),
        show("market-sale", translated("market-oil-label")),
        show("market-price-text", labeled("market-crowns-label", price)),
        show("market-supplier-text", field(supplier, "market-stall", "string")),
        show(
          "market-coins-text",
          labeled("market-crowns-label", global(coins)),
        ),
        show(
          "market-stock-text",
          labeled("market-stock-label", global(bottles)),
        ),
        show("market-help-text", translated("market-help")),
      ],
    },
  ],
};
