import {
  interactiveWidget,
  widgetRange,
  type Asset,
  type Direction,
  type Widget,
} from "@mosaic/model";
import type { UiWorld } from "./ui";

type SurfaceOptions = {
  assets: Asset[];
  width: number;
  height: number;
  editing?: boolean;
  report?: (message: string) => void;
};
type View = ReturnType<UiWorld["view"]>;
type Entry = {
  widget: Widget;
  box: HTMLElement;
  control?: HTMLButtonElement | HTMLInputElement;
  label?: HTMLElement;
  image?: HTMLImageElement;
  progress?: HTMLProgressElement;
  last?: View;
};
const arrow: Record<string, Direction> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
};
const px = (value: number) => value + "px";
const cssAnchor = (anchor: number, offset: number) =>
  `calc(${anchor * 100}% + ${offset}px)`;

function placement(
  widget: Widget,
  layout?: Widget["layout"],
): Partial<CSSStyleDeclaration> {
  const r = widget.rect;
  if (layout && layout.mode !== "free")
    return {
      position: "relative",
      width:
        layout.align === "stretch" && layout.mode === "column"
          ? "auto"
          : px(r.width),
      height:
        layout.align === "stretch" && layout.mode === "row"
          ? "auto"
          : px(r.height),
      flexGrow: String(r.grow),
      flexShrink: "1",
    };
  const stretchX = r.left !== r.right,
    stretchY = r.top !== r.bottom;
  return {
    position: "absolute",
    left: cssAnchor(r.left, r.x),
    top: cssAnchor(r.top, r.y),
    ...(stretchX
      ? { right: cssAnchor(1 - r.right, r.endX) }
      : { width: px(r.width) }),
    ...(stretchY
      ? { bottom: cssAnchor(1 - r.bottom, r.endY) }
      : { height: px(r.height) }),
    transform: `translate(${stretchX ? 0 : -r.pivotX * 100}%, ${stretchY ? 0 : -r.pivotY * 100}%)`,
  };
}

function createEntry(
  widget: Widget,
  layout: Widget["layout"],
  asset: string | undefined,
  editing: boolean,
): Entry {
  const box = document.createElement("div");
  box.dataset.widgetId = widget.id;
  box.dataset.widgetKind = widget.kind;
  const s = widget.style;
  Object.assign(box.style, placement(widget, layout), {
    boxSizing: "border-box",
    minWidth: "0",
    minHeight: "0",
    maxWidth: layout && layout.mode !== "free" ? "100%" : "",
    border: `${s.borderWidth}px solid ${s.border}`,
    borderRadius: px(s.radius),
    color: s.color,
    background: s.background ?? "transparent",
    fontSize: px(s.fontSize),
    textAlign: s.align,
    accentColor: s.accent,
    fontFamily: "system-ui, sans-serif",
    overflow:
      widget.layout?.clip || widget.kind === "image" ? "hidden" : "visible",
    pointerEvents: editing || interactiveWidget(widget.kind) ? "auto" : "none",
  });
  box.style.setProperty("--ui-focus", s.accent);
  const entry: Entry = { widget, box };
  const fill = { width: "100%", height: "100%", boxSizing: "border-box" };
  if (widget.kind === "container") {
    const layout = widget.layout;
    if (layout && layout.mode !== "free")
      Object.assign(box.style, {
        display: "flex",
        flexDirection: layout.mode,
        alignItems: layout.align,
        justifyContent: layout.justify,
        gap: px(layout.gap),
        padding: px(layout.padding),
      });
    return entry;
  }
  if (widget.kind === "image") {
    const image = document.createElement("img");
    if (asset) image.src = asset;
    Object.assign(image.style, fill, {
      display: "block",
      objectFit: widget.fit ?? "contain",
      borderRadius: "inherit",
    });
    box.append(image);
    return { ...entry, image };
  }
  if (widget.kind === "button") {
    const control = document.createElement("button");
    control.type = "button";
    Object.assign(control.style, fill, {
      display: "block",
      minHeight: "0",
      minWidth: "0",
      color: "inherit",
      font: "inherit",
      textAlign: "inherit",
      border: "0",
      borderRadius: "inherit",
      padding: "3px 8px",
      background: "transparent",
      whiteSpace: "normal",
      cursor: "pointer",
    });
    box.append(control);
    return { ...entry, control, label: control };
  }
  if (widget.kind === "text") {
    const label = document.createElement("span");
    Object.assign(label.style, fill, {
      display: "flex",
      alignItems: "center",
      justifyContent:
        s.align === "left" ? "start" : s.align === "right" ? "end" : "center",
      whiteSpace: "pre-wrap",
      overflowWrap: "anywhere",
    });
    box.append(label);
    return { ...entry, label };
  }
  const line = document.createElement("label");
  Object.assign(line.style, fill, {
    display: "flex",
    gap: "8px",
    alignItems: "center",
    padding: "3px 8px",
  });
  const label = document.createElement("span");
  Object.assign(label.style, { flex: "0 1 auto", overflowWrap: "anywhere" });
  line.append(label);
  box.append(line);
  if (widget.kind === "progress") {
    const progress = document.createElement("progress");
    progress.max = widgetRange(widget).max - widgetRange(widget).min;
    Object.assign(progress.style, { flex: 1, minWidth: "0" });
    line.append(progress);
    return { ...entry, label, progress };
  }
  const control = document.createElement("input");
  control.type =
    widget.kind === "toggle"
      ? "checkbox"
      : widget.kind === "slider"
        ? "range"
        : "text";
  if (widget.kind === "slider") {
    const { min, max, step } = widgetRange(widget);
    control.min = String(min);
    control.max = String(max);
    control.step = String(step);
  } else if (widget.kind === "input") control.maxLength = 300;
  if (widget.kind !== "toggle")
    Object.assign(control.style, {
      flex: 1,
      minWidth: "0",
      width: "100%",
      font: "inherit",
    });
  if (widget.kind === "input")
    Object.assign(control.style, {
      color: "inherit",
      background: "#171322",
      border: "1px solid currentColor",
      borderRadius: "3px",
      padding: "3px 4px",
    });
  line.append(control);
  return { ...entry, label, control };
}

export function mountGameUi(
  host: HTMLElement,
  world: UiWorld,
  options: SurfaceOptions,
) {
  const editing = Boolean(options.editing);
  const root = document.createElement("div");
  root.dataset.gameUi = "";
  Object.assign(root.style, {
    position: "absolute",
    left: "0",
    top: "0",
    transformOrigin: "0 0",
    pointerEvents: "none",
    zIndex: "2",
    overflow: "hidden",
    colorScheme: "dark",
  });
  if (editing) root.setAttribute("aria-hidden", "true");
  const style = document.createElement("style");
  style.textContent = `[data-game-ui] [data-ui-control]:focus-visible {outline:2px solid var(--ui-focus, #d9b9ff);outline-offset:-3px}
    [data-game-ui] button[data-ui-control]:hover:not(:disabled) {background:rgba(255,255,255,.14)!important}
    [data-game-ui] button[data-ui-control]:active:not(:disabled) {background:rgba(0,0,0,.2)!important}
    [data-game-ui] [data-ui-control]:disabled {opacity:.55;cursor:default!important}
    [data-game-ui][aria-hidden=true] [data-ui-control] {pointer-events:none}`;
  root.append(style);
  const entries = new Map<string, Entry>();
  const assets = new Map(
    options.assets.map((asset) => [asset.id, asset.source]),
  );
  const widgets = world.document.widgets;
  const definitions = new Map(widgets.map((widget) => [widget.id, widget]));
  for (const widget of widgets) {
    const layout = widget.parent
      ? definitions.get(widget.parent)?.layout
      : undefined;
    const entry = createEntry(
      widget,
      layout,
      (widget.image && assets.get(widget.image)) || undefined,
      editing,
    );
    entries.set(widget.id, entry);
  }
  for (const { widget, box, control } of entries.values()) {
    (widget.parent ? (entries.get(widget.parent)?.box ?? root) : root).append(
      box,
    );
    if (!control) continue;
    control.dataset.uiControl = widget.id;
    if (editing) {
      control.tabIndex = -1;
      continue;
    }
    const activate = (event: Event) => {
      if (!interactive || (event as InputEvent).isComposing) return;
      try {
        if (widget.kind === "button") world.interact(widget.id);
        else if (control instanceof HTMLInputElement)
          world.interact(
            widget.id,
            widget.kind === "toggle"
              ? control.checked
              : widget.kind === "slider"
                ? control.valueAsNumber
                : control.value,
          );
      } catch (failure) {
        options.report?.(
          failure instanceof Error ? failure.message : String(failure),
        );
        const entry = entries.get(widget.id);
        if (entry) entry.last = undefined;
        lastRevision = -1;
      }
    };
    control.addEventListener(
      widget.kind === "button" ? "click" : "input",
      activate,
    );
    if (widget.kind === "input")
      control.addEventListener("compositionend", activate);
  }
  function focus(id: string) {
    const element = entries.get(id)?.control;
    if (element && world.available(id) && !element.disabled) {
      element.focus({ preventScroll: true });
      return element === document.activeElement;
    }
    return false;
  }
  const navigate = (event: KeyboardEvent) => {
    const direction = arrow[event.key];
    const source = (event.target as HTMLElement).dataset.uiControl;
    if (!direction || !source || !interactive) return;
    const entry = entries.get(source)!;
    const target = entry.widget.navigation?.[direction];
    if (target && focus(target)) {
      event.preventDefault();
      event.stopPropagation();
    }
  };
  root.addEventListener("keydown", navigate);
  let scale = 1;
  const resize = () => {
    const w = host.clientWidth,
      h = host.clientHeight;
    if (!w || !h) return;
    scale = Math.min(w / options.width, h / options.height);
    root.style.width = px(w / scale);
    root.style.height = px(h / scale);
    root.style.transform = `scale(${scale})`;
  };
  host.append(root);
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();
  let lastRevision = -1;
  let interactive = false;
  let requested: UiWorld["focusRequest"];
  function update(active = true) {
    active = active && !editing;
    if (lastRevision === world.revision && interactive === active) return;
    interactive = active;
    lastRevision = world.revision;
    const inert = !editing && !active;
    if (root.inert !== inert) root.inert = inert;
    for (const entry of entries.values()) {
      const { widget, box, label, control, progress, image } = entry;
      const current = world.view(widget.id);
      const previous = entry.last;
      if (previous?.visible !== current.visible) {
        box.hidden = !current.visible;
        if (widget.layout?.mode && widget.layout.mode !== "free")
          box.style.display = current.visible ? "flex" : "none";
      }
      if (control) {
        const disabled = editing
          ? !current.enabled
          : !active || !world.available(widget.id);
        if (control.disabled !== disabled) control.disabled = disabled;
      }
      if (previous?.text !== current.text) {
        if (label) label.textContent = current.text;
        const name = widget.accessibleName || current.text || widget.name;
        control?.setAttribute("aria-label", name);
        progress?.setAttribute("aria-label", name);
        if (image) image.alt = widget.accessibleName || current.text;
      }
      if (previous?.value !== current.value) {
        const value = current.value;
        if (control instanceof HTMLInputElement) {
          if (control.type === "checkbox") control.checked = Boolean(value);
          else if (value !== undefined && control.value !== String(value))
            control.value = String(value);
        }
        if (progress)
          progress.value = Number(value ?? 0) - widgetRange(widget).min;
      }
      entry.last = current;
    }
    if (active && requested !== world.focusRequest && world.focusRequest) {
      requested = world.focusRequest;
      focus(requested.id);
    }
  }
  return {
    update,
    get scale() {
      return scale;
    },
    element: (id: string) => entries.get(id)?.box,
    destroy() {
      observer.disconnect();
      root.remove();
    },
  };
}
