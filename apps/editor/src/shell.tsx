import {
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type FunctionComponent,
  type ReactNode,
} from "react";
import {
  DockviewReact,
  type DockviewApi,
  type DockviewReadyEvent,
  type IDockviewPanelHeaderProps,
  type SerializedDockview,
} from "dockview-react";
import {
  AudioLines,
  Box,
  Clock3,
  Sparkles,
  Braces,
  Bug,
  Code2,
  Download,
  Film,
  FolderOpen,
  Gamepad2,
  Image,
  Layers3,
  LayoutPanelLeft,
  Monitor,
  Pause,
  Play,
  Plus,
  Redo2,
  RotateCcw,
  Save,
  Square,
  Terminal,
  Undo2,
  X,
} from "lucide-react";
import { createProject } from "@mosaic/model";
import { exampleProject } from "@mosaic/example";
import type { Preference } from "@mosaic/render";
import { BlueprintWorkspace, LibraryPanel } from "./blueprint";
import {
  AssetPanel,
  ConsolePanel,
  DebugPanel,
  HierarchyPanel,
  InspectorPanel,
  ProjectPanel,
  SceneSettings,
  addEntity,
} from "./panels";
import { AnimatorWorkspace, InputWorkspace } from "./systems";
import { TimelineWorkspace } from "./timeline";
import { ParticlesWorkspace } from "./particles";
import { AudioWorkspace } from "./audio";
import { GamePreview, SceneViewport } from "./viewport";
import { worldTools } from "./world";
import {
  exportGame,
  importImage,
  interrupted,
  openProject,
  resetProjectHandle,
  saveProject,
} from "./files";
import {
  chooseEntity,
  selectedScene,
  useEditor,
  workspaces,
  type Workspace,
} from "./state";

const icons = {
  Scene: Layers3,
  Blueprints: Braces,
  ...worldTools,
  Animator: Film,
  Timeline: Clock3,
  Particles: Sparkles,
  Audio: AudioLines,
  UI: Monitor,
  Input: Gamepad2,
};
const activeLayoutKey = "mosaic-layout-v1";
const namedLayoutKey = "mosaic-named-layouts-v1";
let busy = false;

async function action(operation: () => Promise<boolean>, message: string) {
  if (busy) return;
  busy = true;
  try {
    if (await operation()) useEditor.getState().report(message);
  } catch (failure) {
    if (!interrupted(failure))
      useEditor
        .getState()
        .report(
          failure instanceof Error ? failure.message : String(failure),
          "error",
        );
  } finally {
    busy = false;
  }
}
const open = () => {
  if (discard()) void action(openProject, "Project opened.");
};
const save = (as = false) =>
  void action(() => saveProject(as), "Project saved.");
const image = () => void action(importImage, "Image imported.");
const game = () => void action(exportGame, "Standalone game exported.");
function discard() {
  const state = useEditor.getState();
  return (
    state.project === state.saved ||
    window.confirm("Replace the current project? Unsaved edits will be lost.")
  );
}
function loadExample() {
  if (!discard()) return;
  resetProjectHandle();
  useEditor.getState().load(exampleProject());
  useEditor.setState({ workspace: "Blueprints", eventId: "update-event" });
}
function Assets() {
  return <AssetPanel onImport={image} />;
}
function WorkspacePanel() {
  const workspace = useEditor((state) => state.workspace);
  return (
    <>
      {workspace === "Blueprints" && <BlueprintWorkspace />}
      {workspace === "Scene" && (
        <div className="workspace scene-wrap">
          <div className="context-actions">
            <button onClick={() => addEntity()}>
              <Plus size={14} /> Entity
            </button>
            <button onClick={() => addEntity("sprite")}>
              <Image size={14} /> Sprite
            </button>
            <button onClick={() => chooseEntity(undefined)}>
              Scene Settings
            </button>
          </div>
          <SceneViewport />
        </div>
      )}
      {workspace === "Tilemap" && <SceneViewport worldTool="Tilemap" />}
      {workspace === "Physics" && <SceneViewport worldTool="Physics" />}
      {workspace === "Cameras" && <SceneViewport worldTool="Cameras" />}
      {workspace === "Navigation" && <SceneViewport worldTool="Navigation" />}
      {workspace === "Lighting" && <SceneViewport worldTool="Lighting" />}
      {workspace === "Animator" && <AnimatorWorkspace />}
      {workspace === "Timeline" && <TimelineWorkspace />}
      {workspace === "Particles" && <ParticlesWorkspace />}
      {workspace === "Audio" && <AudioWorkspace />}
      {workspace === "UI" && (
        <div className="workspace scene-wrap">
          <div className="context-actions">
            <button onClick={() => addEntity("text")}>
              <Plus size={14} /> Label
            </button>
          </div>
          <SceneViewport ui />
        </div>
      )}
      {workspace === "Input" && <InputWorkspace />}
    </>
  );
}

const registry: Record<
  string,
  {
    title: string;
    component: FunctionComponent;
    icon: ComponentType<{ size?: number }>;
    width: number;
    height: number;
  }
> = {
  workspace: {
    title: "Workspace",
    component: WorkspacePanel,
    icon: Layers3,
    width: 365,
    height: 245,
  },
  project: {
    title: "Project",
    component: ProjectPanel,
    icon: FolderOpen,
    width: 165,
    height: 110,
  },
  hierarchy: {
    title: "Hierarchy",
    component: HierarchyPanel,
    icon: Layers3,
    width: 165,
    height: 100,
  },
  assets: {
    title: "Assets",
    component: Assets,
    icon: Image,
    width: 155,
    height: 100,
  },
  library: {
    title: "Block Library",
    component: LibraryPanel,
    icon: Code2,
    width: 150,
    height: 100,
  },
  inspector: {
    title: "Inspector",
    component: InspectorPanel,
    icon: LayoutPanelLeft,
    width: 212,
    height: 120,
  },
  settings: {
    title: "Scene Settings",
    component: SceneSettings,
    icon: Layers3,
    width: 205,
    height: 120,
  },
  preview: {
    title: "Game Preview",
    component: GamePreview,
    icon: Monitor,
    width: 190,
    height: 128,
  },
  console: {
    title: "Console",
    component: ConsolePanel,
    icon: Terminal,
    width: 175,
    height: 95,
  },
  debug: {
    title: "Debug",
    component: DebugPanel,
    icon: Bug,
    width: 195,
    height: 95,
  },
};
const components = Object.fromEntries(
  Object.entries(registry).map(([id, panel]) => [id, panel.component]),
);
function DockTab({ api }: IDockviewPanelHeaderProps) {
  const Icon = registry[api.id]?.icon ?? Box;
  return (
    <div className="dock-tab">
      <Icon size={15} />
      <span>{api.title}</span>
      <button
        aria-label={`Close ${api.title}`}
        title={`Close ${api.title}`}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          api.close();
        }}
      >
        <X size={13} />
      </button>
    </div>
  );
}
function addPanel(
  api: DockviewApi,
  id: string,
  position?: Parameters<DockviewApi["addPanel"]>[0]["position"],
  size?: { initialWidth?: number; initialHeight?: number },
  inactive = false,
) {
  const info = registry[id];
  return api.addPanel({
    id,
    component: id,
    title: info.title,
    minimumWidth: info.width,
    minimumHeight: info.height,
    renderer: "onlyWhenVisible",
    position,
    ...size,
    inactive,
  });
}
function lockWorkspace(api: DockviewApi) {
  const central = api.getPanel("workspace");
  if (!central) throw new Error("The workspace is missing.");
  central.group.api.locked = true;
  central.group.header.hidden = true;
}
function reset(api: DockviewApi) {
  api.clear();
  addPanel(api, "workspace");
  addPanel(
    api,
    "project",
    { referencePanel: "workspace", direction: "left" },
    { initialWidth: 235 },
  );
  addPanel(api, "hierarchy", { referencePanel: "project" }, undefined, true);
  addPanel(api, "assets", { referencePanel: "project" }, undefined, true);
  addPanel(
    api,
    "library",
    { referencePanel: "project", direction: "below" },
    { initialHeight: 255 },
  );
  addPanel(
    api,
    "inspector",
    { referencePanel: "workspace", direction: "right" },
    { initialWidth: 292 },
  );
  addPanel(api, "settings", { referencePanel: "inspector" }, undefined, true);
  addPanel(
    api,
    "preview",
    { referencePanel: "inspector", direction: "below" },
    { initialHeight: 236 },
  );
  addPanel(
    api,
    "debug",
    { referencePanel: "workspace", direction: "below" },
    { initialHeight: 170 },
  );
  addPanel(api, "console", { referencePanel: "debug" }, undefined, true);
  lockWorkspace(api);
}
function restore(api: DockviewApi, value: SerializedDockview) {
  api.fromJSON(value);
  lockWorkspace(api);
}
function namedLayouts() {
  try {
    return JSON.parse(localStorage.getItem(namedLayoutKey) ?? "{}") as Record<
      string,
      SerializedDockview
    >;
  } catch {
    return {};
  }
}

function Menu({ label, children }: { label: string; children: ReactNode }) {
  const details = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (event: PointerEvent | KeyboardEvent) => {
      if (
        event instanceof KeyboardEvent
          ? event.key === "Escape"
          : !details.current?.contains(event.target as Node)
      ) {
        details.current?.removeAttribute("open");
      }
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, []);
  return (
    <details className="menu" ref={details}>
      <summary>{label}</summary>
      <div
        className="menu-items"
        onClick={(event) => {
          if ((event.target as HTMLElement).closest("button[data-menu-close]"))
            details.current?.removeAttribute("open");
        }}
      >
        {children}
      </div>
    </details>
  );
}

export function App() {
  const workspace = useEditor((state) => state.workspace);
  const scene = useEditor(selectedScene);
  const projectName = useEditor((state) => state.project.name);
  const dirt = useEditor((state) => state.project !== state.saved);
  const location = useEditor((state) => state.location?.folder);
  const transport = useEditor((state) => state.transport);
  const preference = useEditor((state) => state.preference);
  const canUndo = useEditor((state) => state.past.length > 0);
  const canRedo = useEditor((state) => state.future.length > 0);
  const last = useEditor((state) => state.messages.at(-1));
  const [api, setApi] = useState<DockviewApi>();
  const [opened, setOpened] = useState<string[]>([]);
  const [layouts, setLayouts] = useState(namedLayouts);
  const [layoutName, setLayoutName] = useState("");
  const [projectTitle, setProjectTitle] = useState("");
  const modal = useRef<HTMLDialogElement>(null);
  function newProject() {
    if (!discard()) return;
    setProjectTitle("");
    modal.current?.showModal();
  }
  function onReady(event: DockviewReadyEvent) {
    const dock = event.api;
    try {
      const raw = localStorage.getItem(activeLayoutKey);
      if (raw) restore(dock, JSON.parse(raw));
      else reset(dock);
    } catch {
      reset(dock);
    }
    setOpened(dock.panels.map((panel) => panel.id));
    setApi(dock);
  }
  useEffect(() => {
    if (!api) return;
    const save = () => {
      const next = api.panels.map((panel) => panel.id);
      setOpened(next);
      if (next.includes("workspace"))
        localStorage.setItem(activeLayoutKey, JSON.stringify(api.toJSON()));
    };
    const listener = api.onDidLayoutChange(save);
    return () => listener.dispose();
  }, [api]);
  useEffect(() => {
    if (!api) return;
    const show = () => {
      const assets =
        api.getPanel("assets") ??
        addPanel(api, "assets", {
          referencePanel: api.getPanel("project") ? "project" : "workspace",
          direction: api.getPanel("project") ? "within" : "left",
        });
      assets.api.setActive();
    };
    window.addEventListener("mosaic:show-assets", show);
    return () => window.removeEventListener("mosaic:show-assets", show);
  }, [api]);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (!event.metaKey && !event.ctrlKey) return;
      const key = event.key.toLowerCase();
      const editable =
        event.target instanceof HTMLElement &&
        !!event.target.closest("input, textarea, select, [contenteditable]");
      if (key === "s") {
        event.preventDefault();
        save(event.shiftKey);
      }
      if (key === "z" && !editable) {
        event.preventDefault();
        if (event.shiftKey) useEditor.getState().redo();
        else useEditor.getState().undo();
      }
      if (key === "y" && !editable) {
        event.preventDefault();
        useEditor.getState().redo();
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);
  function togglePanel(id: string) {
    if (!api) return;
    const existing = api.getPanel(id);
    if (existing) {
      existing.api.close();
      return;
    }
    const left = ["project", "hierarchy", "assets", "library"].includes(id);
    const bottom = ["preview", "console", "debug"].includes(id);
    addPanel(
      api,
      id,
      {
        referencePanel: "workspace",
        direction: left ? "left" : bottom ? "below" : "right",
      },
      bottom ? { initialHeight: 175 } : { initialWidth: 245 },
    );
  }
  const menuButton = (
    label: string,
    callback: () => void,
    shortcut?: string,
  ) => (
    <button data-menu-close onClick={callback}>
      {label}
      {shortcut && <kbd>{shortcut}</kbd>}
    </button>
  );
  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="mosaic-mark" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </div>
          <strong>Mosaic Engine</strong>
          <span>0.1.0</span>
        </div>
        <nav className="main-menu" aria-label="Application menus">
          <Menu label="File">
            {menuButton("New Project", newProject)}
            {menuButton("Open Project", open)}
            {menuButton("Save Project", () => save(), "Ctrl+S")}
            {menuButton("Save Project As…", () => save(true))}
            <hr />
            {menuButton("Import Image", image)}
            {menuButton("Export Web Game", game)}
            <hr />
            {menuButton("Open Lantern Ridge Sample", loadExample)}
          </Menu>
          <Menu label="Edit">
            <button
              data-menu-close
              disabled={!canUndo}
              onClick={() => useEditor.getState().undo()}
            >
              Undo<kbd>Ctrl+Z</kbd>
            </button>
            <button
              data-menu-close
              disabled={!canRedo}
              onClick={() => useEditor.getState().redo()}
            >
              Redo<kbd>Ctrl+Y</kbd>
            </button>
          </Menu>
          <Menu label="Window">
            {Object.entries(registry)
              .filter(([id]) => id !== "workspace")
              .map(([id, panel]) => (
                <button
                  key={id}
                  onClick={() => togglePanel(id)}
                  role="menuitemcheckbox"
                  aria-checked={opened.includes(id)}
                >
                  <span>{panel.title}</span>
                  <span>{opened.includes(id) ? "✓" : "＋"}</span>
                </button>
              ))}
            <hr />
            {menuButton("Reset Layout", () => api && reset(api))}
            <form
              className="layout-form"
              onSubmit={(event) => {
                event.preventDefault();
                const name = layoutName.trim();
                if (!name || !api) return;
                const next = { ...layouts, [name]: api.toJSON() };
                localStorage.setItem(namedLayoutKey, JSON.stringify(next));
                setLayouts(next);
                setLayoutName("");
              }}
            >
              <input
                aria-label="Layout name"
                placeholder="Layout name"
                value={layoutName}
                maxLength={50}
                onChange={(event) => setLayoutName(event.target.value)}
              />
              <button aria-label="Save named layout" type="submit">
                <Save size={14} />
              </button>
            </form>
            {Object.keys(layouts).map((name) => (
              <div className="layout-entry" key={name}>
                {menuButton(name, () => {
                  try {
                    if (api) restore(api, layouts[name]);
                  } catch {
                    if (api) reset(api);
                    useEditor
                      .getState()
                      .report("Named layout could not be restored.", "error");
                  }
                })}
                <button
                  aria-label={`Delete layout ${name}`}
                  onClick={() => {
                    const next = { ...layouts };
                    delete next[name];
                    localStorage.setItem(namedLayoutKey, JSON.stringify(next));
                    setLayouts(next);
                  }}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </Menu>
        </nav>
        <div className="transport" aria-label="Game controls">
          <button
            aria-label="Play"
            title="Play"
            className={transport === "playing" ? "active" : ""}
            onClick={() => useEditor.getState().play()}
          >
            <Play size={15} fill="currentColor" />
          </button>
          <button
            aria-label="Pause"
            title="Pause"
            disabled={transport !== "playing"}
            onClick={() => useEditor.getState().pause()}
          >
            <Pause size={15} fill="currentColor" />
          </button>
          <button
            aria-label="Stop"
            title="Stop"
            disabled={transport === "editing"}
            onClick={() => useEditor.getState().stop()}
          >
            <Square size={13} fill="currentColor" />
          </button>
          <button
            aria-label="Restart"
            title="Restart"
            onClick={() => useEditor.getState().restart()}
          >
            <RotateCcw size={15} />
          </button>
        </div>
        <div className="top-actions">
          <label className="backend-menu">
            <Monitor size={15} />
            <select
              aria-label="Renderer preference"
              value={preference}
              onChange={(event) => {
                const value = event.target.value as Preference;
                localStorage.setItem("mosaic-renderer", value);
                useEditor.setState({ preference: value });
              }}
            >
              <option value="auto">Auto Renderer</option>
              <option value="pixi">PixiJS</option>
              <option value="canvas">Canvas 2D</option>
            </select>
          </label>
          <button
            title="Save project"
            aria-label="Save project"
            onClick={() => save()}
          >
            <Save size={17} />
          </button>
          <button className="export-button" onClick={game}>
            <Download size={15} /> Export
          </button>
        </div>
      </header>
      <nav className="workspace-tabs" aria-label="Engine workspaces">
        {workspaces.map((name: Workspace) => {
          const Icon = icons[name];
          return (
            <button
              key={name}
              aria-current={workspace === name ? "page" : undefined}
              onClick={() => useEditor.setState({ workspace: name })}
            >
              <Icon size={17} />
              {name}
            </button>
          );
        })}
        <div className="push history-actions">
          <button
            aria-label="Undo"
            title="Undo"
            disabled={!canUndo}
            onClick={() => useEditor.getState().undo()}
          >
            <Undo2 size={16} />
          </button>
          <button
            aria-label="Redo"
            title="Redo"
            disabled={!canRedo}
            onClick={() => useEditor.getState().redo()}
          >
            <Redo2 size={16} />
          </button>
        </div>
      </nav>
      <div className="dock-frame">
        <DockviewReact
          className="dockview-theme-dark"
          onReady={onReady}
          components={components}
          defaultTabComponent={DockTab}
          autoHideEdgeGroups={{ right: true }}
          getTabContextMenuItems={({ panel, group, api }) => {
            if (panel.id === "workspace") return [];
            const location = group.api.location;
            const destinations = ["project", "inspector", "preview"].flatMap(
              (id) => {
                const destination = api.getPanel(id);
                if (!destination || destination.group === group) return [];
                return [
                  {
                    label: `Dock with ${registry[id].title}`,
                    action: () =>
                      panel.api.moveTo({
                        group: destination.group,
                        position: "center",
                      }),
                  },
                ];
              },
            );
            return [
              location.type === "edge"
                ? {
                    label: "Pin Sidebar",
                    action: () => api.pinEdgeGroup(location.position),
                  }
                : {
                    label: "Collapse to Sidebar",
                    action: () => {
                      api.revealEdgeGroupWithData(
                        "right",
                        {
                          groupId: group.id,
                          panelId: panel.id,
                        },
                        { autoHide: true },
                      );
                      api.autoHideEdgeGroup("right");
                    },
                  },
              ...destinations,
              "close",
            ];
          }}
        />
      </div>
      <footer className="statusbar">
        <span>
          <Box size={14} />
          {projectName}
          {dirt && " •"}
        </span>
        <span>
          <Layers3 size={14} />
          {scene.name}
        </span>
        <span
          title={location ?? "Local workspace autosave"}
          className="path-status"
        >
          {location ?? "Local workspace"}
        </span>
        {last && (
          <span className={`latest ${last.level}`} role="status">
            {last.message}
          </span>
        )}
        <span className="push">
          <i className={`dot ${transport}`} />
          {transport === "editing"
            ? "Editing"
            : transport === "playing"
              ? "Running"
              : "Paused"}
        </span>
      </footer>
      <dialog ref={modal} className="project-modal">
        <form
          method="dialog"
          onSubmit={(event) => {
            event.preventDefault();
            if (!projectTitle.trim()) return;
            resetProjectHandle();
            useEditor.getState().load(createProject(projectTitle.trim()));
            useEditor.setState({ workspace: "Scene" });
            modal.current?.close();
          }}
        >
          <h2>New Project</h2>
          <label>
            Project Name
            <input
              autoFocus
              aria-label="Project name"
              value={projectTitle}
              onChange={(event) => setProjectTitle(event.target.value)}
              maxLength={100}
              required
            />
          </label>
          <div>
            <button type="button" onClick={() => modal.current?.close()}>
              Cancel
            </button>
            <button
              className="export-button"
              type="submit"
              disabled={!projectTitle.trim()}
            >
              Create Project
            </button>
          </div>
        </form>
      </dialog>
    </main>
  );
}
