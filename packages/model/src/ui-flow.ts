import { z } from "zod";
import type { ValueType } from "@mosaic/blueprints";
import { uiSchema, validateUi } from "./ui";

const id = z.string().min(1).max(100);
const name = z.string().trim().min(1).max(100);
const hex = z.string().regex(/^#[0-9a-f]{6}$/i);
export const uiSurfaceStyleSchema = z.object({
  background: hex.nullable().optional(),
  color: hex.optional(),
  border: hex.optional(),
  borderWidth: z.number().min(0).max(16).optional(),
  radius: z.number().min(0).max(256).optional(),
  fontSize: z.number().min(6).max(192).optional(),
  accent: hex.optional(),
  font: z.enum(["system", "serif", "mono"]).optional(),
  weight: z.enum(["normal", "bold"]).optional(),
  opacity: z.number().min(0).max(1).optional(),
  nineSlice: z
    .object({
      assetId: id,
      slice: z.number().int().min(1).max(256),
      width: z.number().min(1).max(256),
    })
    .optional(),
});
export const uiSkinSchema = z.object({
  normal: uiSurfaceStyleSchema,
  hover: uiSurfaceStyleSchema.optional(),
  pressed: uiSurfaceStyleSchema.optional(),
  focused: uiSurfaceStyleSchema.optional(),
  disabled: uiSurfaceStyleSchema.optional(),
});
export const uiThemeSchema = z.object({
  id,
  name,
  parent: id.nullable(),
  styles: z.record(id, uiSkinSchema),
});
export const uiLayerSchema = z.object({ id, name });
export const uiScreenSchema = z.object({
  id,
  name,
  document: uiSchema,
  layerId: id,
  lifetime: z.enum(["global", "scene"]),
  modal: z.boolean(),
  passthrough: z.boolean(),
  pause: z.boolean(),
  fade: z.number().min(0).max(2),
  themeId: id.optional(),
});
export const uiFlowSchema = z.object({
  layers: z.array(uiLayerSchema).min(1).max(32),
  screens: z.array(uiScreenSchema).max(256),
  entries: z.array(z.object({ screenId: id, sceneId: id.nullable() })).max(512),
  routes: z
    .array(
      z.object({
        id,
        name,
        sourceId: id.nullable(),
        signalId: id,
        action: z.enum(["show", "hide", "push", "pop", "replace", "move"]),
        screenId: id.optional(),
        layerId: id.optional(),
      }),
    )
    .max(512),
  themes: z.array(uiThemeSchema).max(64),
  themeId: id.optional(),
});
export type UiFlow = z.infer<typeof uiFlowSchema>;
export type UiScreen = z.infer<typeof uiScreenSchema>;
export type UiTheme = z.infer<typeof uiThemeSchema>;
export type UiSkin = z.infer<typeof uiSkinSchema>;
export type UiSurfaceStyle = z.infer<typeof uiSurfaceStyleSchema>;
export type UiAction = UiFlow["routes"][number]["action"];
export type UiRoute = UiFlow["routes"][number];

export const createUiFlow = (): UiFlow => ({
  layers: [
    { id: "hud", name: "HUD" },
    { id: "overlay", name: "Overlay" },
    { id: "modal", name: "Modal" },
  ],
  entries: [],
  screens: [],
  routes: [],
  themes: [],
});

export function resolveUiStyle(
  themes: UiTheme[],
  themeId: string | undefined,
  style: string,
): UiSkin | undefined {
  let theme = themes.find(({ id }) => id === themeId);
  const chain: UiSkin[] = [];
  const seen = new Set<string>();
  while (theme && !seen.has(theme.id)) {
    seen.add(theme.id);
    if (Object.hasOwn(theme.styles, style)) chain.unshift(theme.styles[style]);
    const parent = theme.parent;
    theme = themes.find(({ id }) => id === parent);
  }
  if (!chain.length) return;
  const result: UiSkin = { normal: {} };
  for (const source of chain)
    for (const state of Object.keys(source) as (keyof UiSkin)[])
      result[state] = {
        ...result[state],
        ...Object.fromEntries(
          Object.entries(source[state] ?? {}).filter(
            ([, value]) => value !== undefined,
          ),
        ),
      };
  return result;
}

export function validateUiFlow(
  flow: UiFlow,
  scenes: ReadonlySet<string>,
  images: ReadonlySet<string>,
  signals: ReadonlyMap<string, ValueType | "void">,
) {
  const ids = (items: { id: string }[], kind: string) => {
    const result = new Set(items.map(({ id }) => id));
    if (result.size !== items.length)
      throw new Error("Duplicate UI " + kind + " ID.");
    return result;
  };
  const layers = ids(flow.layers, "layer");
  const screens = ids(flow.screens, "screen");
  const themes = ids(flow.themes, "theme");
  ids(flow.routes, "route");
  if (flow.themeId && !themes.has(flow.themeId))
    throw new Error("The default UI theme is missing.");
  for (const screen of flow.screens) {
    validateUi(screen.document, images);
    if (
      !layers.has(screen.layerId) ||
      (screen.themeId && !themes.has(screen.themeId))
    )
      throw new Error(`Screen "${screen.name}" has a missing layer or theme.`);
  }
  const entries = new Set<string>();
  for (const { screenId, sceneId } of flow.entries) {
    const key = JSON.stringify([screenId, sceneId]);
    const screen = flow.screens.find(({ id }) => id === screenId);
    if (
      entries.has(key) ||
      !screen ||
      (screen.lifetime === "global"
        ? sceneId !== null
        : !sceneId || !scenes.has(sceneId))
    )
      throw new Error(
        "UI Flow contains an invalid or duplicate startup screen.",
      );
    entries.add(key);
  }
  const triggers = new Set<string>();
  for (const route of flow.routes) {
    const key = JSON.stringify([route.sourceId, route.signalId]);
    if (
      triggers.has(key) ||
      !signals.has(route.signalId) ||
      (route.sourceId && !screens.has(route.sourceId)) ||
      (route.action !== "pop" &&
        (!route.screenId || !screens.has(route.screenId))) ||
      (route.action === "move" && !route.layerId) ||
      (route.layerId && !layers.has(route.layerId))
    )
      throw new Error(
        `UI route "${route.name}" has an invalid or duplicate binding.`,
      );
    triggers.add(key);
  }
  for (const theme of flow.themes) {
    const visited = new Set([theme.id]);
    let parent = theme.parent;
    while (parent) {
      if (visited.has(parent) || !themes.has(parent))
        throw new Error(
          `UI theme "${theme.name}" has an invalid inheritance chain.`,
        );
      visited.add(parent);
      parent = flow.themes.find(({ id }) => id === parent)!.parent;
    }
    for (const [style, skin] of Object.entries(theme.styles)) {
      if (!style.trim()) throw new Error("UI style keys cannot be blank.");
      for (const state of Object.values(skin))
        if (state.nineSlice && !images.has(state.nineSlice.assetId))
          throw new Error(
            `UI style "${style}" has a missing nine-slice image.`,
          );
    }
  }
}
