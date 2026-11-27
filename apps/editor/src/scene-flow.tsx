import { useRef, useState } from "react";
import { ArrowRight, Flag, Layers3, Plus, Trash2 } from "lucide-react";
import { sceneOperationSchema } from "@mosaic/blueprints";
import { newId, type SceneFlow, type SceneRoute } from "@mosaic/model";
import { Field, NumberField, Section, TextField } from "./controls";
import { playGame } from "./play";
import { chooseScene, useEditor } from "./state";

const CARD_WIDTH = 178;
const CARD_HEIGHT = 46;
const ANY = "";

export function SceneFlowWorkspace() {
  const project = useEditor((state) => state.project);
  const running = useEditor((state) => state.transport);
  useEditor((state) => state.snapshot.time);
  const flow = project.sceneFlow;
  const [selection, setSelection] = useState<string>();
  const [source, setSource] = useState(project.startSceneId);
  const [dragPos, setDragPos] = useState<{
    id: string;
    x: number;
    y: number;
  }>();
  const drag = useRef<{
    x: number;
    y: number;
    left: number;
    top: number;
    moved: boolean;
  } | null>(null);
  const status = running === "editing" ? undefined : playGame()?.sceneStatus;
  const route = flow?.routes.find(({ id }) => id === selection);
  const edit = (recipe: (draft: SceneFlow) => void) =>
    useEditor.getState().edit((draft) => {
      recipe((draft.sceneFlow ??= { routes: [] }));
    });
  const revise = (revision: Partial<SceneRoute>) =>
    edit((draft) => {
      const current = draft.routes.find(({ id }) => id === selection);
      if (current) Object.assign(current, revision);
    });
  const nodes = [undefined, ...project.scenes].map((scene, index) => {
    const id = scene?.id ?? ANY;
    const pos = (dragPos?.id === id ? dragPos : undefined) ??
      (scene && flow?.positions && Object.hasOwn(flow.positions, id)
        ? flow.positions[id]
        : undefined) ?? {
        x: 28 + (index % 3) * 232,
        y: 28 + Math.floor(index / 3) * 124,
      };
    return { id, scene, ...pos };
  });
  const positions = new Map(nodes.map((node) => [node.id, node]));
  const maxX = Math.max(700, ...nodes.map(({ x }) => x + CARD_WIDTH + 60));
  const maxY = Math.max(400, ...nodes.map(({ y }) => y + CARD_HEIGHT + 65));
  function add() {
    const from = project.scenes.some(({ id }) => id === source)
      ? source
      : project.startSceneId;
    const to = project.scenes.find(({ id }) => id !== from)?.id ?? from;
    const id = newId();
    edit((draft) => {
      draft.routes.push({
        id,
        name: "New Route",
        from,
        to,
        operation: "change",
        fade: 0,
      });
    });
    setSelection(id);
  }
  const sceneOptions = project.scenes.map(({ id, name }) => (
    <option key={id} value={id}>
      {name}
    </option>
  ));
  return (
    <div className="flow-workspace">
      <div className="flow-board" aria-label="Scene route graph">
        <div className="flow-toolbar">
          <strong>Scene Flow</strong>
          <button onClick={add}>
            <Plus size={14} /> Route
          </button>
          {status && (
            <span aria-live="polite">
              Active:{" "}
              {project.scenes.find(({ id }) => id === status.primary)?.name}
            </span>
          )}
        </div>
        <div className="flow-scroll">
          <div className="flow-map" style={{ width: maxX, height: maxY }}>
            <svg
              width={maxX}
              height={maxY}
              className="flow-links"
              aria-hidden="true"
            >
              <defs>
                <marker
                  id="flow-link-head"
                  markerWidth="8"
                  markerHeight="8"
                  refX="7"
                  refY="4"
                  orient="auto"
                >
                  <path d="M0 0L8 4L0 8z" />
                </marker>
              </defs>
              {flow?.routes.map((edge) => {
                const from = positions.get(edge.from ?? ANY),
                  to = positions.get(edge.to);
                if (!from || !to) return null;
                const a = from.x + CARD_WIDTH / 2,
                  b = from.y + CARD_HEIGHT,
                  c = to.x + CARD_WIDTH / 2,
                  d = to.y;
                const path =
                  edge.from === edge.to
                    ? `M${a},${b} C${a + 200},${b + 68} ${a + 200},${d - 62} ${a},${d}`
                    : `M${a},${b} C${a},${b + 60} ${c},${d - 58} ${c},${d}`;
                return (
                  <path
                    key={edge.id}
                    d={path}
                    markerEnd="url(#flow-link-head)"
                    data-active={selection === edge.id}
                    onClick={() => setSelection(edge.id)}
                  />
                );
              })}
            </svg>
            {nodes.map(({ id, scene, x, y }) => (
              <button
                key={id}
                className="flow-node"
                data-selected={id === source}
                style={{
                  left: x,
                  top: y,
                  width: CARD_WIDTH,
                  height: CARD_HEIGHT,
                }}
                onClick={() => {
                  if (!drag.current?.moved) setSource(id);
                  drag.current = null;
                }}
                onDoubleClick={() => scene && chooseScene(id)}
                onPointerDown={(event) => {
                  if (!scene || event.button !== 0) return;
                  drag.current = {
                    x: event.clientX,
                    y: event.clientY,
                    left: x,
                    top: y,
                    moved: false,
                  };
                  event.currentTarget.setPointerCapture(event.pointerId);
                }}
                onPointerMove={(event) => {
                  const saved = drag.current;
                  if (
                    !saved ||
                    !event.currentTarget.hasPointerCapture(event.pointerId)
                  )
                    return;
                  const dx = event.clientX - saved.x,
                    dy = event.clientY - saved.y;
                  if (Math.abs(dx) + Math.abs(dy) >= 5) saved.moved = true;
                  if (saved.moved)
                    setDragPos({
                      id,
                      x: Math.max(0, Math.min(24000, saved.left + dx)),
                      y: Math.max(0, Math.min(24000, saved.top + dy)),
                    });
                }}
                onPointerUp={() => {
                  if (drag.current?.moved && dragPos?.id === id)
                    edit((draft) => {
                      (draft.positions ??= {})[id] = {
                        x: dragPos.x,
                        y: dragPos.y,
                      };
                    });
                  setDragPos(undefined);
                }}
                onPointerCancel={() => {
                  drag.current = null;
                  setDragPos(undefined);
                }}
              >
                {id === project.startSceneId ? (
                  <Flag size={15} />
                ) : (
                  <Layers3 size={15} />
                )}
                <span>{scene?.name ?? "Any scene"}</span>
                {status?.loaded.includes(id) && (
                  <span className="flow-status" aria-label="Loaded" />
                )}
                {status?.preloaded.includes(id) && (
                  <span className="flow-status warm" aria-label="Preloaded" />
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
      <aside className="flow-inspector panel-body">
        <Section title="Routes">
          {flow?.routes.map((item) => (
            <button
              className={
                selection === item.id ? "tree-row selected" : "tree-row"
              }
              key={item.id}
              onClick={() => setSelection(item.id)}
            >
              <ArrowRight size={14} /> <span>{item.name}</span>
              <small className="push">{item.operation}</small>
            </button>
          ))}
        </Section>
        {route && (
          <Section title="Transition">
            <Field label="Name">
              <TextField
                label="Route name"
                value={route.name}
                onChange={(name) => revise({ name })}
              />
            </Field>
            <Field label="From">
              <select
                aria-label="Route source"
                value={route.from ?? ANY}
                onChange={(event) =>
                  revise({ from: event.target.value || null })
                }
              >
                <option value={ANY}>Any scene</option>
                {sceneOptions}
              </select>
            </Field>
            <Field label="To">
              <select
                aria-label="Route target"
                value={route.to}
                onChange={(event) => revise({ to: event.target.value })}
              >
                {sceneOptions}
              </select>
            </Field>
            <Field label="Operation">
              <select
                aria-label="Route operation"
                value={route.operation}
                onChange={(event) =>
                  revise({
                    operation: sceneOperationSchema.parse(event.target.value),
                  })
                }
              >
                {sceneOperationSchema.options.map((operation) => (
                  <option key={operation}>{operation}</option>
                ))}
              </select>
            </Field>
            <Field label="Signal">
              <select
                aria-label="Route signal"
                value={route.signalId ?? ""}
                onChange={(event) =>
                  revise({ signalId: event.target.value || undefined })
                }
              >
                <option value="">Blueprint or preview</option>
                {project.signals
                  ?.filter(
                    (signal) =>
                      signal.id === route.signalId ||
                      !flow?.routes.some(
                        (other) =>
                          other.id !== route.id &&
                          other.from === route.from &&
                          other.signalId === signal.id,
                      ),
                  )
                  .map((signal) => (
                    <option key={signal.id} value={signal.id}>
                      {signal.name}
                    </option>
                  ))}
              </select>
            </Field>
            {route.operation !== "preload" && (
              <Field label="Fade seconds">
                <NumberField
                  label="Fade seconds"
                  value={route.fade}
                  min={0}
                  max={5}
                  step={0.1}
                  onChange={(fade) => revise({ fade })}
                />
              </Field>
            )}
            {route.operation === "add" && (
              <>
                <Field label="Offset X">
                  <NumberField
                    label="Scene offset X"
                    value={route.offset?.x ?? 0}
                    min={0}
                    max={16384}
                    onChange={(x) =>
                      revise({
                        offset: { x: Math.round(x), y: route.offset?.y ?? 0 },
                      })
                    }
                  />
                </Field>
                <Field label="Offset Y">
                  <NumberField
                    label="Scene offset Y"
                    value={route.offset?.y ?? 0}
                    min={0}
                    max={16384}
                    onChange={(y) =>
                      revise({
                        offset: { y: Math.round(y), x: route.offset?.x ?? 0 },
                      })
                    }
                  />
                </Field>
              </>
            )}
            <div className="inline-actions">
              <button
                disabled={
                  running !== "playing" ||
                  !status ||
                  (!!route.from && !status.loaded.includes(route.from))
                }
                onClick={() => {
                  try {
                    playGame()?.controlScene({
                      sceneId: route.to,
                      operation: route.operation,
                      offset: route.offset,
                      fade: route.fade,
                    });
                  } catch (error) {
                    useEditor.getState().report(String(error), "error");
                  }
                }}
              >
                Run route
              </button>
              <button
                onClick={() =>
                  edit((draft) => {
                    draft.routes = draft.routes.filter(
                      ({ id }) => id !== route.id,
                    );
                  })
                }
              >
                <Trash2 size={14} /> Remove
              </button>
            </div>
          </Section>
        )}
      </aside>
    </div>
  );
}
