import { profileFrame } from "./profiler";
import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import {
  Crosshair,
  Hand,
  Minus,
  MousePointer2,
  Plus,
  Scan,
} from "lucide-react";
import { createRenderer } from "@mosaic/render";
import {
  connectKeyboard,
  fitFrame,
  Game,
  inversePoint,
  mountUiStack,
  pickEntity,
  transformPoint,
  type Camera,
  type RenderFrame,
} from "@mosaic/runtime";
import type { Project, Scene, Tile } from "@mosaic/model";
import {
  chooseEntity,
  editEntity,
  editScene,
  selectedScene,
  useEditor,
} from "./state";
import { playGame } from "./play";

import { type WorldTool } from "./world";
import { WorldOverlay } from "./world-overlay";
export function RenderSurface({
  assets,
  getFrame,
  surface,
  profile = false,
  label,
}: {
  assets: Project["assets"];
  getFrame: () => RenderFrame;
  surface?: React.RefObject<HTMLDivElement | null>;
  label: string;
  profile?: boolean;
}) {
  const mount = useRef<HTMLDivElement>(null);
  const current = useRef(getFrame);
  const currentAssets = useRef(assets);
  const activeRenderer = useRef<Awaited<
    ReturnType<typeof createRenderer>
  > | null>(null);
  useEffect(() => {
    currentAssets.current = assets;
    activeRenderer.current?.updateAssets?.(assets);
  }, [assets]);
  useEffect(() => {
    current.current = getFrame;
  }, [getFrame]);
  const preference = useEditor((state) => state.preference);
  const [backend, setBackend] = useState("Initializing");
  useEffect(() => {
    const root = mount.current!;
    const instance = document.createElement("div");
    instance.className = "render-instance";
    let running = true;
    let frameId = 0;
    let name = "";
    const report = (message: string) => {
      if (running) useEditor.getState().report(message, "error");
    };
    void createRenderer(
      { parent: instance, assets: currentAssets.current, report },
      preference,
      (value) => {
        name = value === "pixi" ? "PixiJS" : "Canvas 2D";
        if (running) setBackend(name);
      },
    )
      .then((renderer) => {
        if (!running) {
          renderer.dispose();
          return;
        }
        renderer.updateAssets?.(currentAssets.current);
        activeRenderer.current = renderer;
        root.replaceChildren(instance);
        let width = 0;
        let height = 0;
        function draw() {
          if (!running) {
            renderer.dispose();
            return;
          }
          try {
            const w = Math.max(1, Math.round(root.clientWidth));
            const h = Math.max(1, Math.round(root.clientHeight));
            if (w !== width || h !== height) {
              width = w;
              height = h;
              renderer.resize(width, height);
            }
            const game =
              profile && useEditor.getState().transport === "playing"
                ? playGame()
                : undefined;
            if (game) {
              const start = performance.now();
              const commands = current.current();
              const built = performance.now();
              renderer.render(commands);
              profileFrame(
                start,
                built,
                performance.now(),
                renderer,
                name,
                commands.draws.length,
                game,
              );
            } else renderer.render(current.current());
            frameId = requestAnimationFrame(draw);
          } catch (error) {
            report(String(error));
            setBackend("Renderer error");
            renderer.dispose();
          }
        }
        draw();
        cleanup = () => renderer.dispose();
      })
      .catch((error) => {
        report(String(error));
        if (running) setBackend("Renderer unavailable");
      });
    let cleanup: (() => void) | undefined;
    return () => {
      running = false;
      cancelAnimationFrame(frameId);
      cleanup?.();
      activeRenderer.current = null;
      instance.remove();
    };
  }, [preference, profile]);
  return (
    <div className="render-surface" aria-label={label} ref={surface}>
      <div className="render-mount" ref={mount} />
      <div
        className="renderer-label"
        data-testid={
          label === "Game preview" ? "preview-backend" : "scene-backend"
        }
      >
        {backend}
      </div>
    </div>
  );
}

function GameUiPreview({
  author,
  transport,
}: {
  author: Game;
  transport: "editing" | "playing" | "paused";
}) {
  const host = useRef<HTMLDivElement>(null);
  const mode = useRef(transport);
  useEffect(() => {
    mode.current = transport;
  }, [transport]);
  useEffect(() => {
    let sources: Project["assets"] | undefined;
    let width = 0,
      height = 0;
    let overlay: ReturnType<typeof mountUiStack> | undefined;
    let frame = 0;
    const tick = () => {
      const game = mode.current === "editing" ? author : (playGame() ?? author);
      if (
        sources !== game.project.assets ||
        width !== game.project.width ||
        height !== game.project.height
      ) {
        sources = game.project.assets;
        width = game.project.width;
        height = game.project.height;
        overlay?.destroy();
        overlay = mountUiStack(host.current!, {
          width: game.project.width,
          height: game.project.height,
          assets: game.project.assets,
          report: (message) => useEditor.getState().report(message, "error"),
        });
      }
      overlay?.update(game.uiScreens, mode.current === "playing");
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelAnimationFrame(frame);
      overlay?.destroy();
    };
  }, [author]);
  return <div className="ui-live-preview" ref={host} />;
}

// The editor and game preview share the current authored scene. Live play owns a
// separate Game, and history snapshots do not retain their compiled preview.
let authored: { project: Project; sceneId: string; game: Game } | undefined;
function authoringGame(project: Project, sceneId: string) {
  if (authored?.project === project && authored.sceneId === sceneId)
    return authored.game;
  const game =
    authored?.sceneId === sceneId && authored.game.reloadProject(project)
      ? authored.game
      : new Game(project, sceneId);
  authored = { project, sceneId, game };
  return game;
}

export function GamePreview() {
  const project = useEditor((state) => state.project);
  const scene = useEditor(selectedScene);
  const playing = useEditor((state) => state.transport);
  const view = useRef<HTMLDivElement>(null);
  const { author, authorFrame } = useMemo(() => {
    const game = authoringGame(project, scene.id);
    return { author: game, authorFrame: game.frame() };
  }, [project, scene.id]);
  useEffect(() => {
    if (playing !== "playing") {
      playGame()?.input.clear();
      return;
    }
    const target = view.current!;
    const attach = requestAnimationFrame(() => {
      const game = playGame();
      if (game && !release) release = connectKeyboard(target, game.input);
    });
    let release: (() => void) | undefined;
    let current = playGame();
    const check = useEditor.subscribe(() => {
      const game = playGame();
      if (!game || game === current) return;
      current = game;
      release?.();
      release = connectKeyboard(target, game.input);
    });
    return () => {
      cancelAnimationFrame(attach);
      release?.();
      check();
    };
  }, [playing]);
  return (
    <div className="preview">
      <div
        className="preview-canvas"
        tabIndex={0}
        aria-label="Focus game controls"
        ref={view}
        onPointerDown={(event) => {
          if (!(event.target as HTMLElement).closest("[data-widget-id]"))
            event.currentTarget.focus();
        }}
      >
        <RenderSurface
          label="Game preview"
          profile
          assets={project.assets}
          getFrame={() => playGame()?.frame() ?? authorFrame}
        />
        <GameUiPreview author={author} transport={playing} />
      </div>
      <div className="panel-foot">
        <span className={`dot ${playing}`} />
        {playing === "editing"
          ? "Scene preview"
          : playing === "playing"
            ? "Running • click preview for keyboard"
            : "Paused"}
      </div>
    </div>
  );
}

type Drag = {
  pointer: number;
  x: number;
  y: number;
  camera: Camera;
  entityId?: string;
  parent?: NonNullable<ReturnType<typeof findDraw>>["matrix"];
};
const findDraw = (frame: RenderFrame, id: string | null) =>
  frame.draws.find((draw) => draw.entityId === id);
function viewCamera({ x, y, zoom }: Scene["camera"]) {
  return { x, y, zoom };
}

export function SceneViewport({
  worldTool,
  ui = false,
}: {
  worldTool?: WorldTool;
  ui?: boolean;
}) {
  const scene = useEditor(selectedScene);
  return (
    <SceneViewportContent
      key={`${scene.id}-${worldTool}-${ui}`}
      worldTool={worldTool}
      ui={ui}
      scene={scene}
    />
  );
}

function SceneViewportContent({
  worldTool,
  ui,
  scene,
}: {
  worldTool?: WorldTool;
  ui: boolean;
  scene: Scene;
}) {
  const tilemap = worldTool === "Tilemap";
  const project = useEditor((state) => state.project);
  const entityId = useEditor((state) => state.entityId);
  const [orientation, setOrientation] = useState<Camera | null>(null);
  const [framing, setFraming] = useState(false);
  const [picking, setPicking] = useState(false);
  const activeTileLayer = useEditor((state) => state.activeTileLayer);
  const activeTerrain = useEditor((state) => state.activeTerrain);
  const layer = scene.tilemap.layers?.find(
    (item) => item.id === activeTileLayer,
  );
  const terrain = scene.tilemap.terrains?.find(
    (item) => item.id === activeTerrain,
  );
  const focused = scene.entities.find((item) => item.id === entityId);
  const previousCell = useRef<{ x: number; y: number } | undefined>(undefined);
  const [tool, setTool] = useState<"select" | "pan">("select");
  const [brush, setBrush] = useState("#859c72");
  const [erase, setErase] = useState(false);
  const [pending, setPending] = useState<Tile[]>([]);
  const [dimensions, setDimensions] = useState({ width: 1, height: 1 });
  const [elapsedDrag, setElapsedDrag] = useState<{
    x: number;
    y: number;
    entityId: string;
  } | null>(null);
  const drag = useRef<Drag | null>(null);
  const strokes = useRef(new Map<number, Tile>());
  const surface = useRef<HTMLDivElement>(null);
  const { author, camera, frame } = useMemo(() => {
    const game = authoringGame(project, scene.id);
    const view =
      orientation ?? (framing ? game.view() : viewCamera(scene.camera));
    return { author: game, camera: view, frame: game.frame(view) };
  }, [project, scene.id, scene.camera, orientation, framing]);
  const selected = findDraw(frame, entityId);
  const fit = fitFrame(
    project.width,
    project.height,
    dimensions.width,
    dimensions.height,
  );
  useEffect(() => {
    const root = surface.current!;
    const observer = new ResizeObserver(() =>
      setDimensions({ width: root.clientWidth, height: root.clientHeight }),
    );
    observer.observe(root);
    return () => observer.disconnect();
  }, []);
  const coordinates = (clientX: number, clientY: number) => {
    const rect = surface.current!.getBoundingClientRect();
    return {
      x: (clientX - rect.left - fit.x) / fit.scale,
      y: (clientY - rect.top - fit.y) / fit.scale,
    };
  };
  function paint(event: PointerEvent) {
    const point = coordinates(event.clientX, event.clientY);
    if (
      point.x < 0 ||
      point.x > project.width ||
      point.y < 0 ||
      point.y > project.height
    )
      return;
    const x = Math.floor(
      ((point.x - project.width / 2) / camera.zoom + camera.x) /
        scene.tilemap.size,
    );
    const y = Math.floor(
      ((point.y - project.height / 2) / camera.zoom + camera.y) /
        scene.tilemap.size,
    );
    if (
      x < 0 ||
      y < 0 ||
      x >= scene.tilemap.width ||
      y >= scene.tilemap.height
    ) {
      previousCell.current = undefined;
      return;
    }
    let { x: prevX, y: prevY } = previousCell.current ?? { x, y };
    const dx = Math.abs(x - prevX),
      dy = -Math.abs(y - prevY);
    let error = dx + dy;
    while (true) {
      strokes.current.set(prevY * scene.tilemap.width + prevX, {
        x: prevX,
        y: prevY,
        color: terrain?.color ?? brush,
        ...(terrain ? { terrainId: terrain.id } : {}),
      });
      if (prevX === x && prevY === y) break;
      const twice = 2 * error;
      if (twice >= dy) {
        error += dy;
        prevX += Math.sign(x - prevX);
      }
      if (twice <= dx) {
        error += dx;
        prevY += Math.sign(y - prevY);
      }
    }
    previousCell.current = { x, y };
    setPending([...strokes.current.values()]);
  }
  function begin(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 && event.button !== 1) return;
    if (tilemap && tool === "select" && event.button === 0 && !event.altKey) {
      strokes.current.clear();
      previousCell.current = undefined;
      event.currentTarget.setPointerCapture(event.pointerId);
      paint(event);
      return;
    }
    if (tool === "pan" || event.button === 1 || event.altKey) {
      drag.current = {
        pointer: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        camera,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    const point = coordinates(event.clientX, event.clientY);
    if (worldTool === "Navigation" && picking && focused?.navigation) {
      const x = (point.x - project.width / 2) / camera.zoom + camera.x;
      const y = (point.y - project.height / 2) / camera.zoom + camera.y;
      editEntity((draft) => {
        if (draft.navigation) {
          draft.navigation.x = Math.round(x);
          draft.navigation.y = Math.round(y);
          draft.navigation.target = null;
        }
      });
      setPicking(false);
      return;
    }
    const match = pickEntity(frame, point.x, point.y);
    const entity = scene.entities.find(
      (item) => item.id === match && (!ui || item.visual?.kind === "text"),
    );
    chooseEntity(entity);
    if (entity) {
      const parent = entity.parentId
        ? findDraw(frame, entity.parentId)?.matrix
        : undefined;
      drag.current = {
        pointer: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        camera,
        entityId: entity.id,
        parent,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    if (
      tilemap &&
      !drag.current &&
      event.currentTarget.hasPointerCapture(event.pointerId)
    ) {
      paint(event);
      return;
    }
    const start = drag.current;
    if (!start || start.pointer !== event.pointerId) return;
    const x = (event.clientX - start.x) / fit.scale;
    const y = (event.clientY - start.y) / fit.scale;
    if (start.entityId) setElapsedDrag({ x, y, entityId: start.entityId });
    else
      setOrientation({
        ...start.camera,
        x: start.camera.x - x / start.camera.zoom,
        y: start.camera.y - y / start.camera.zoom,
      });
  }
  function finish(event: PointerEvent<HTMLDivElement>, cancel = false) {
    const start = drag.current;
    drag.current = null;
    setElapsedDrag(null);
    if (strokes.current.size) {
      const painted = new Map(strokes.current);
      strokes.current.clear();
      setPending([]);
      if (!cancel)
        editScene((draft) => {
          const target =
            draft.tilemap.layers?.find((item) => item.id === layer?.id) ??
            draft.tilemap;
          const existing = new Map(
            target.tiles.map((tile) => [
              tile.y * draft.tilemap.width + tile.x,
              tile,
            ]),
          );
          for (const [index, cell] of painted) {
            if (erase) existing.delete(index);
            else existing.set(index, cell);
          }
          target.tiles = [...existing.values()];
        });
      return;
    }
    if (cancel || !start?.entityId) return;
    const x = (event.clientX - start.x) / fit.scale;
    const y = (event.clientY - start.y) / fit.scale;
    if (Math.abs(x) + Math.abs(y) < 3) return;
    editScene((draft) => {
      const entity = draft.entities.find((item) => item.id === start.entityId);
      if (!entity) return;
      const zoom =
        entity.visual?.kind === "text" && entity.visual.screen
          ? 1
          : start.camera.zoom;
      const parent = start.parent;
      const d = parent
        ? inversePoint(parent, parent.x + x, parent.y + y)
        : { x: x / zoom, y: y / zoom };
      if (!d) return;
      entity.transform.x = Math.max(
        -1e7,
        Math.min(1e7, entity.transform.x + d.x),
      );
      entity.transform.y = Math.max(
        -1e7,
        Math.min(1e7, entity.transform.y + d.y),
      );
    });
  }
  function zoomBy(factor: number) {
    setOrientation({
      ...camera,
      zoom: Math.max(0.05, Math.min(8, camera.zoom * factor)),
    });
  }
  const drawn = useMemo(
    () =>
      elapsedDrag
        ? {
            ...frame,
            draws: frame.draws.map((draw) =>
              draw.entityId === elapsedDrag.entityId
                ? {
                    ...draw,
                    matrix: {
                      ...draw.matrix,
                      x: draw.matrix.x + elapsedDrag.x,
                      y: draw.matrix.y + elapsedDrag.y,
                    },
                  }
                : draw,
            ),
          }
        : frame,
    [frame, elapsedDrag],
  );
  const activeDraw = elapsedDrag ? findDraw(drawn, entityId) : selected;
  const gridSize = scene.tilemap.size * camera.zoom;
  return (
    <div className="workspace scene-workspace">
      <div className="workspace-bar">
        <strong>{ui ? "UI Canvas" : (worldTool ?? scene.name)}</strong>
        <div className="bar-group">
          <button
            aria-label={
              tilemap ? "Paint or erase tiles" : "Select and move entities"
            }
            title={tilemap ? "Tile brush" : "Select / move"}
            className={tool === "select" ? "selected" : ""}
            onClick={() => setTool("select")}
          >
            <MousePointer2 size={16} />
          </button>
          <button
            aria-label="Pan viewport"
            title="Pan"
            className={tool === "pan" ? "selected" : ""}
            onClick={() => setTool("pan")}
          >
            <Hand size={16} />
          </button>
        </div>
        {tilemap && (
          <div className="bar-group">
            <input
              aria-label="Tile brush color"
              type="color"
              disabled={!!terrain}
              value={terrain?.color ?? brush}
              onChange={(event) => setBrush(event.target.value)}
            />
            <button
              onClick={() => {
                setErase(!erase);
                setTool("select");
              }}
              aria-pressed={erase}
            >
              {erase ? "Eraser" : "Paint"}
            </button>
          </div>
        )}
        {worldTool === "Cameras" && (
          <button
            aria-pressed={framing}
            onClick={() => {
              setFraming(!framing);
              setOrientation(null);
            }}
          >
            Preview Game Camera
          </button>
        )}
        {worldTool === "Navigation" && (
          <button
            disabled={!focused?.navigation}
            aria-pressed={picking}
            onClick={() => {
              setPicking(!picking);
              setTool("select");
            }}
          >
            {picking ? "Click Destination" : "Pick Destination"}
          </button>
        )}
        <div className="bar-group push">
          <button aria-label="Zoom out" onClick={() => zoomBy(0.8)}>
            <Minus size={15} />
          </button>
          <span>{Math.round(camera.zoom * 100)}%</span>
          <button aria-label="Zoom in" onClick={() => zoomBy(1.25)}>
            <Plus size={15} />
          </button>
          <button
            aria-label="Reset viewport"
            onClick={() => setOrientation(null)}
          >
            <Scan size={15} />
          </button>
        </div>
      </div>
      <div
        className={`scene-content ${tool}`}
        onPointerDown={begin}
        onPointerMove={move}
        onPointerUp={finish}
        onPointerCancel={(event) => finish(event, true)}
        onWheel={(event) => zoomBy(event.deltaY < 0 ? 1.12 : 0.89)}
      >
        <RenderSurface
          assets={project.assets}
          getFrame={() => drawn}
          surface={surface}
          label={worldTool ? worldTool + " viewport" : "Scene viewport"}
        />
        <svg
          className="viewport-overlay"
          viewBox={`0 0 ${project.width} ${project.height}`}
          aria-hidden="true"
          preserveAspectRatio="xMidYMid meet"
        >
          {worldTool && (
            <WorldOverlay
              tool={worldTool}
              scene={scene}
              selected={focused}
              width={project.width}
              height={project.height}
              camera={camera}
              game={author}
            />
          )}
          {tilemap && (
            <>
              <defs>
                <pattern
                  id="tile-grid"
                  patternUnits="userSpaceOnUse"
                  width={gridSize}
                  height={gridSize}
                  x={project.width / 2 - camera.x * camera.zoom}
                  y={project.height / 2 - camera.y * camera.zoom}
                >
                  <path
                    d={`M ${gridSize} 0 L 0 0 0 ${gridSize}`}
                    fill="none"
                    stroke="#d1e6ff"
                    opacity=".52"
                    strokeWidth=".7"
                  />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#tile-grid)" />
              {pending.map((cell) => (
                <rect
                  key={`${cell.x},${cell.y}`}
                  x={
                    project.width / 2 +
                    (cell.x * scene.tilemap.size - camera.x) * camera.zoom
                  }
                  y={
                    project.height / 2 +
                    (cell.y * scene.tilemap.size - camera.y) * camera.zoom
                  }
                  width={gridSize}
                  height={gridSize}
                  fill={erase ? "#f97b99" : cell.color}
                  fillOpacity=".67"
                />
              ))}
            </>
          )}
          {activeDraw && !tilemap && (
            <g>
              <polygon
                points={[
                  [0, 0],
                  [activeDraw.width, 0],
                  [activeDraw.width, activeDraw.height],
                  [0, activeDraw.height],
                ]
                  .map(([x, y]) => {
                    const p = transformPoint(activeDraw.matrix, x, y);
                    return `${p.x},${p.y}`;
                  })
                  .join(" ")}
                fill="none"
                stroke="#dab7ff"
                strokeWidth="1"
              />
              <circle
                cx={activeDraw.matrix.x}
                cy={activeDraw.matrix.y}
                r="3"
                fill="#d5aafb"
              />
            </g>
          )}
        </svg>
      </div>
      <div className="panel-foot">
        <Crosshair size={13} />{" "}
        {tilemap
          ? `${layer?.name ?? "Base layer"} • ${terrain?.name ?? "Flat color"} • ${scene.tilemap.width} × ${scene.tilemap.height} cells`
          : `${project.width} × ${project.height} • Drag to move · Alt-drag to pan`}
      </div>
    </div>
  );
}
