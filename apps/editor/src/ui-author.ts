import {
  createWidget,
  newId,
  validateUi,
  type UiDocument,
  type Widget,
  type WidgetKind,
} from "@mosaic/model";
import { activeDocument, editScene, selectedScene, useEditor } from "./state";

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
type Editor = ReturnType<typeof useEditor.getState>;
export const activeUiScreen = (state: Editor) => {
  const ref = activeDocument(state);
  return ref?.kind === "uiScreen"
    ? state.project.uiFlow?.screens.find(({ id }) => id === ref.id)
    : undefined;
};
export const uiDocument = (state: Editor) =>
  activeUiScreen(state)?.document ?? selectedScene(state).ui;
export const selectedWidget = (state: Editor) =>
  uiDocument(state)?.widgets.find(({ id }) => id === state.widgetId);

export function editUi(change: (document: UiDocument) => void) {
  const state = useEditor.getState();
  const screen = activeUiScreen(state);
  if (screen)
    state.edit((draft) => {
      const doc = draft.uiFlow?.screens.find(
        ({ id }) => id === screen.id,
      )?.document;
      if (doc) change(doc);
    });
  else editScene((scene) => change((scene.ui ??= { widgets: [] })));
}

export function addWidget(kind: WidgetKind, panel = false) {
  const state = useEditor.getState();
  const widgets = uiDocument(state)?.widgets ?? noWidgets;
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
  if (kind === "container") {
    item.panel = panel;
    if (panel) {
      item.style.background = "#252836";
      item.style.borderWidth = 1;
    }
  }
  const label = panel ? "Panel" : widgetLabels[kind];
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
  editUi((doc) => doc.widgets.push(item));
  useEditor.setState({ widgetId: id });
}

export function editWidget(id: string, change: (widget: Widget) => void) {
  editUi((doc) => {
    const widget = doc.widgets.find((widget) => widget.id === id);
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
  editUi((doc) => {
    const ids = descendants(doc.widgets, id);
    doc.widgets = doc.widgets.filter((widget) => !ids.has(widget.id));
    if (doc.initialFocus && ids.has(doc.initialFocus)) delete doc.initialFocus;
    for (const widget of doc.widgets)
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
  editUi(({ widgets }) => {
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

export function widgetLocked(widgets: Widget[], id: string) {
  for (let widget = widgets.find((item) => item.id === id); widget;) {
    if (widget.locked) return true;
    const parent = widget.parent;
    widget = widgets.find(({ id }) => id === parent);
  }
  return false;
}

export function reparentWidgets(
  ids: string[],
  parent: string | null,
  before?: string,
) {
  const state = useEditor.getState();
  const current = uiDocument(state);
  if (!current) return;
  const list = current.widgets;
  const roots = ids.filter(
    (id) =>
      !ids.some((other) => other !== id && descendants(list, other).has(id)),
  );
  if (
    roots.some(
      (id) =>
        widgetLocked(list, id) || (parent && descendants(list, id).has(parent)),
    )
  )
    return;
  if (parent && widgetLocked(list, parent)) return;
  const source = list.filter(({ id }) => roots.includes(id));
  const remaining = list.filter(({ id }) => !roots.includes(id));
  const index = before ? remaining.findIndex(({ id }) => id === before) : -1;
  remaining.splice(
    index < 0 ? remaining.length : index,
    0,
    ...source.map((widget) => ({ ...widget, parent })),
  );
  try {
    validateUi(
      { ...current, widgets: remaining },
      new Set(state.project.assets.map(({ id }) => id)),
    );
    editUi((doc) => {
      doc.widgets = remaining;
    });
  } catch (error) {
    state.report(String(error), "error");
  }
}

export function duplicateWidgets(ids: string[]) {
  const state = useEditor.getState();
  const items = uiDocument(state)?.widgets ?? noWidgets;
  const selected = new Set(
    ids.flatMap((id) =>
      widgetLocked(items, id) ? [] : [...descendants(items, id)],
    ),
  );
  const copies = items.filter(({ id }) => selected.has(id));
  if (!copies.length || items.length + copies.length > 1000) return;
  const names = new Map(copies.map(({ id }) => [id, newId()]));
  editUi((doc) => {
    for (const widget of copies) {
      const copy = structuredClone(widget);
      copy.id = names.get(widget.id)!;
      copy.name = widget.name.slice(0, 94) + " Copy";
      copy.parent = (copy.parent && names.get(copy.parent)) || copy.parent;
      if (copy.navigation)
        for (const direction of Object.keys(
          copy.navigation,
        ) as (keyof typeof copy.navigation)[]) {
          const target = copy.navigation[direction];
          if (target && names.has(target))
            copy.navigation[direction] = names.get(target);
        }
      doc.widgets.push(copy);
    }
  });
  const primary = names.get(ids[0]);
  if (primary) useEditor.setState({ widgetId: primary });
}
