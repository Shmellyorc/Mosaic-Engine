import {
  createWidget,
  newId,
  type Widget,
  type WidgetKind,
} from "@mosaic/model";
import { editScene, selectedScene, useEditor } from "./state";

export const widgetLabels: Record<WidgetKind, string> = {
  container: "Container",
  text: "Text",
  image: "Image",
  button: "Button",
  toggle: "Toggle",
  slider: "Slider",
  input: "Text Input",
  progress: "Progress",
};
export const noWidgets: Widget[] = [];
export const selectedWidget = (state: ReturnType<typeof useEditor.getState>) =>
  selectedScene(state).ui?.widgets.find(
    (widget) => widget.id === state.widgetId,
  );

export function addWidget(kind: WidgetKind) {
  const state = useEditor.getState();
  const widgets = selectedScene(state).ui?.widgets ?? noWidgets;
  if (widgets.length >= 1000) {
    state.report("The scene already has 1,000 UI widgets.", "error");
    return;
  }
  const selection = selectedWidget(state);
  const id = newId();
  const parent =
    selection?.kind === "container"
      ? selection.id
      : (selection?.parent ?? null);
  let ancestor = parent;
  let depth = 0;
  while (ancestor) {
    depth++;
    ancestor = widgets.find(({ id }) => id === ancestor)?.parent ?? null;
  }
  if (depth > 32) {
    state.report("UI hierarchies support up to 32 levels.", "error");
    return;
  }
  const item = createWidget(id, kind, parent);
  const label = widgetLabels[kind];
  let suffix = 1;
  while (
    widgets.some(
      ({ name }) => name === (suffix === 1 ? label : label + " " + suffix),
    )
  )
    suffix++;
  item.name = suffix === 1 ? label : label + " " + suffix;
  const count = widgets.filter((entry) => entry.parent === parent).length;
  item.rect.x = item.rect.y = (parent ? 10 : 28) + 14 * (count % 9);
  if (kind === "image") item.image = state.project.assets[0]?.id;
  editScene((scene) => {
    (scene.ui ??= { widgets: [] }).widgets.push(item);
  });
  useEditor.setState({ widgetId: id });
}

export function editWidget(id: string, change: (widget: Widget) => void) {
  editScene((scene) => {
    const widget = scene.ui?.widgets.find((widget) => widget.id === id);
    if (widget) change(widget);
  });
}

export function descendants(widgets: Widget[], id: string) {
  const children = new Map<string, string[]>();
  for (const widget of widgets) {
    if (!widget.parent) continue;
    const items = children.get(widget.parent) ?? [];
    items.push(widget.id);
    children.set(widget.parent, items);
  }
  const ids = new Set([id]);
  const visit = [id];
  while (visit.length) {
    for (const child of children.get(visit.pop()!) ?? []) {
      if (ids.has(child)) continue;
      ids.add(child);
      visit.push(child);
    }
  }
  return ids;
}

export function deleteWidget(id: string) {
  editScene((scene) => {
    if (!scene.ui) return;
    const ids = descendants(scene.ui.widgets, id);
    scene.ui.widgets = scene.ui.widgets.filter((widget) => !ids.has(widget.id));
    if (scene.ui.initialFocus && ids.has(scene.ui.initialFocus))
      delete scene.ui.initialFocus;
    for (const widget of scene.ui.widgets)
      if (widget.navigation)
        for (const direction of Object.keys(widget.navigation) as Array<
          keyof typeof widget.navigation
        >) {
          const target = widget.navigation[direction];
          if (target && ids.has(target)) delete widget.navigation[direction];
        }
  });
  useEditor.setState({ widgetId: null });
}

export function moveWidget(id: string, direction: number) {
  editScene((scene) => {
    const widgets = scene.ui?.widgets;
    if (!widgets) return;
    const index = widgets.findIndex((widget) => widget.id === id);
    if (index < 0) return;
    const other =
      direction < 0
        ? widgets.findLastIndex(
            (widget, i) => i < index && widget.parent === widgets[index].parent,
          )
        : widgets.findIndex(
            (widget, i) => i > index && widget.parent === widgets[index].parent,
          );
    if (other < 0) return;
    [widgets[index], widgets[other]] = [widgets[other], widgets[index]];
  });
}
