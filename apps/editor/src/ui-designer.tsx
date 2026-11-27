import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { Monitor, Plus, Square, Type, PanelTop, Layers3 } from "lucide-react";
import { Game, mountGameUi } from "@mosaic/runtime";
import { widgetKind, type Widget } from "@mosaic/model";
import {
  addWidget,
  editWidget,
  noWidgets,
  selectedWidget,
  widgetLabels,
} from "./ui-author";
import { addEntity } from "./panels";
import { chooseEntity, selectedScene, useEditor } from "./state";
import { RenderSurface } from "./viewport";

const sizes = { game: "Project", wide: "Wide", portrait: "Portrait" } as const;
type Size = keyof typeof sizes;
type Drag = {
  id: string;
  node: HTMLElement;
  pointer: number;
  startX: number;
  startY: number;
  scale: number;
  x: number;
  y: number;
  width: number;
  height: number;
  resize: boolean;
  endX: number;
  endY: number;
};
const within = (value: number, min = -8192, max = 8192) =>
  Math.max(min, Math.min(max, Math.round(value)));

export function UiDesigner() {
  const project = useEditor((state) => state.project);
  const scene = useEditor(selectedScene);
  const selected = useEditor(selectedWidget);
  const widgets = scene.ui?.widgets ?? noWidgets;
  const game = useMemo(() => new Game(project, scene.id), [project, scene.id]);
  const [size, setSize] = useState<Size>("game");
  const [showScene, setShowScene] = useState(true);
  const [space, setSpace] = useState({ width: 1, height: 1 });
  const stage = useRef<HTMLDivElement>(null);
  const board = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDetailsElement>(null);
  const surface = useRef<ReturnType<typeof mountGameUi> | null>(null);
  const drag = useRef<Drag | null>(null);
  useEffect(() => {
    const node = stage.current!;
    const measure = () =>
      setSpace({ width: node.clientWidth, height: node.clientHeight });
    const observe = new ResizeObserver(measure);
    observe.observe(node);
    return () => observe.disconnect();
  }, []);
  useEffect(() => {
    const node = board.current!;
    const layer = mountGameUi(node, game.ui, {
      assets: project.assets,
      width: project.width,
      height: project.height,
      editing: true,
    });
    surface.current = layer;
    layer.update();
    return () => {
      layer.destroy();
      surface.current = null;
    };
  }, [game, project.assets, project.width, project.height]);
  useEffect(() => {
    const node = selected && surface.current?.element(selected.id);
    node?.classList.add("ui-selected-widget");
    return () => node?.classList.remove("ui-selected-widget");
  }, [game, selected]);

  const dims =
    size === "wide"
      ? { width: 960, height: 420 }
      : size === "portrait"
        ? { width: 360, height: 640 }
        : project;
  const fit = Math.max(
    0.01,
    Math.min(
      (space.width - 26) / dims.width,
      (space.height - 26) / dims.height,
    ),
  );
  const free = (widget: Widget) => {
    const parent = widgets.find(({ id }) => id === widget.parent);
    return !parent?.layout || parent.layout.mode === "free";
  };
  function track(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const node = (event.target as HTMLElement).closest<HTMLElement>(
      "[data-widget-id]",
    );
    const widget = widgets.find(({ id }) => id === node?.dataset.widgetId);
    useEditor.setState({ widgetId: widget?.id ?? null });
    if (!widget || !node || !free(widget) || !surface.current) return;
    const r = widget.rect;
    const resize =
      (event.target as HTMLElement).closest("[data-ui-resize]") !== null;
    if (resize && (r.left !== r.right || r.top !== r.bottom)) return;
    if (document.activeElement !== board.current) board.current?.focus();
    drag.current = {
      id: widget.id,
      node,
      pointer: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      scale: surface.current.scale,
      x: r.x,
      y: r.y,
      width: r.width,
      height: r.height,
      resize,
      endX: r.endX,
      endY: r.endY,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }
  function gesture(event: PointerEvent<HTMLDivElement>, commit = false) {
    const active = drag.current;
    if (!active || active.pointer !== event.pointerId) return;
    const dx = (event.clientX - active.startX) / active.scale,
      dy = (event.clientY - active.startY) / active.scale;
    if (!commit) {
      if (active.resize) {
        active.node.style.width = within(active.width + dx, 1) + "px";
        active.node.style.height = within(active.height + dy, 1) + "px";
      } else active.node.style.translate = `${dx}px ${dy}px`;
      return;
    }
    drag.current = null;
    active.node.style.translate = "";
    if (active.resize) {
      active.node.style.width = active.width + "px";
      active.node.style.height = active.height + "px";
    }
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
    editWidget(active.id, (widget) => {
      if (active.resize) {
        widget.rect.width = within(active.width + dx, 1);
        widget.rect.height = within(active.height + dy, 1);
      } else {
        widget.rect.x = within(active.x + dx);
        widget.rect.y = within(active.y + dy);
        if (widget.rect.left !== widget.rect.right)
          widget.rect.endX = within(active.endX - dx);
        if (widget.rect.top !== widget.rect.bottom)
          widget.rect.endY = within(active.endY - dy);
      }
    });
  }
  useEffect(() => {
    if (
      !selected ||
      !surface.current ||
      (selected.parent &&
        widgets.find((widget) => widget.id === selected.parent)?.layout
          ?.mode !== "free") ||
      selected.rect.left !== selected.rect.right ||
      selected.rect.top !== selected.rect.bottom
    )
      return;
    const node = surface.current.element(selected.id);
    const handle = document.createElement("span");
    handle.dataset.uiResize = "";
    handle.title = "Resize widget";
    node?.append(handle);
    return () => handle.remove();
  }, [game, selected, widgets]);
  return (
    <div className="workspace ui-workspace">
      <div className="workspace-bar ui-toolbar">
        <Monitor size={17} />
        <strong>UI Designer</strong>
        <details ref={menu} className="ui-add-menu">
          <summary>
            <Plus size={14} /> Widget
          </summary>
          <div>
            {widgetKind.options.map((kind) => (
              <button
                key={kind}
                onClick={() => {
                  addWidget(kind);
                  if (menu.current) menu.current.open = false;
                }}
              >
                Add {widgetLabels[kind]}
              </button>
            ))}
          </div>
        </details>
        <button
          title="Add a screen-space scene label"
          onClick={() => {
            useEditor.setState({ widgetId: null });
            addEntity("text");
          }}
        >
          <Type size={14} /> Label
        </button>
        <select
          aria-label="UI preview size"
          value={size}
          onChange={(event) => setSize(event.target.value as Size)}
        >
          {Object.entries(sizes).map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
        <button
          title="Show scene behind interface"
          aria-label="Show scene behind UI"
          aria-pressed={showScene}
          onClick={() => setShowScene(!showScene)}
        >
          <Layers3 size={14} />
        </button>
      </div>
      <div className="ui-stage" ref={stage}>
        <div
          aria-label="UI design canvas"
          className="ui-board"
          tabIndex={0}
          ref={board}
          style={{ width: dims.width * fit, height: dims.height * fit }}
          onPointerDown={track}
          onPointerMove={(event) => gesture(event)}
          onPointerUp={(event) => gesture(event, true)}
          onPointerCancel={() => {
            const active = drag.current;
            if (!active) return;
            active.node.style.translate = "";
            if (active.resize) {
              active.node.style.width = active.width + "px";
              active.node.style.height = active.height + "px";
            }
            drag.current = null;
          }}
          onKeyDown={(event) => {
            if (!selected || !free(selected)) return;
            const delta = {
              ArrowLeft: [-1, 0],
              ArrowRight: [1, 0],
              ArrowUp: [0, -1],
              ArrowDown: [0, 1],
            }[event.key];
            if (!delta) return;
            event.preventDefault();
            const amount = event.shiftKey ? 10 : 1;
            editWidget(selected.id, ({ rect }) => {
              const x = delta[0] * amount,
                y = delta[1] * amount;
              rect.x = within(rect.x + x);
              rect.y = within(rect.y + y);
              if (rect.left !== rect.right) rect.endX = within(rect.endX - x);
              if (rect.top !== rect.bottom) rect.endY = within(rect.endY - y);
            });
          }}
        >
          {showScene && (
            <RenderSurface
              assets={project.assets}
              getFrame={() => game.frame()}
              label="UI scene background"
            />
          )}
        </div>
      </div>
      <div className="panel-foot ui-board-status">
        <Square size={12} /> {dims.width} × {dims.height}
        {selected && <span>{selected.name}</span>}
      </div>
    </div>
  );
}

export function UiHierarchy() {
  const scene = useEditor(selectedScene);
  const active = useEditor((state) => state.widgetId);
  const activeEntity = useEditor((state) => state.entityId);
  const widgets = scene.ui?.widgets ?? noWidgets;
  const groups = useMemo(() => {
    const index = new Map<string | null, Widget[]>();
    for (const widget of widgets) {
      const siblings = index.get(widget.parent) ?? [];
      siblings.push(widget);
      index.set(widget.parent, siblings);
    }
    return index;
  }, [widgets]);
  const legacy = scene.entities.filter(
    ({ visual }) => visual?.kind === "text" && visual.screen,
  );
  function rows(parent: string | null, depth = 0): React.ReactNode {
    return groups.get(parent)?.map((widget) => (
      <div key={widget.id}>
        <button
          className="tree-row"
          aria-pressed={widget.id === active}
          style={{ paddingLeft: 8 + 14 * depth }}
          onClick={() => useEditor.setState({ widgetId: widget.id })}
        >
          {widget.kind === "container" ? (
            <PanelTop size={14} />
          ) : (
            <Square size={14} />
          )}
          <span>{widget.name}</span>
        </button>
        {rows(widget.id, depth + 1)}
      </div>
    ));
  }
  return (
    <div className="panel-body ui-hierarchy">
      {rows(null)}
      {!widgets.length && (
        <small className="tree-empty">Add a widget in UI Designer.</small>
      )}
      {!!legacy.length && (
        <div className="ui-legacy">
          <strong>Scene Labels</strong>
          {legacy.map((entity) => (
            <button
              className="tree-row"
              key={entity.id}
              aria-pressed={!active && entity.id === activeEntity}
              onClick={() => {
                useEditor.setState({ widgetId: null });
                chooseEntity(entity);
              }}
            >
              <Type size={14} />
              <span>{entity.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
