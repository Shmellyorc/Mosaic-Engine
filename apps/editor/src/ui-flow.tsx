import { useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Layers3,
  Monitor,
  Plus,
  Trash2,
} from "lucide-react";
import {
  createUiFlow,
  newId,
  type UiFlow,
  type UiRoute,
  type UiScreen,
  type UiSkin,
  type UiSurfaceStyle,
  type UiTheme,
} from "@mosaic/model";
import { Field, NumberField, Section, TextField } from "./controls";
import { openDocument, selectedScene, useEditor } from "./state";
import { playGame } from "./play";

const actions = ["show", "hide", "push", "pop", "replace", "move"] as const;
const states = ["normal", "hover", "pressed", "focused", "disabled"] as const;
const styles = [
  "container",
  "text",
  "image",
  "button",
  "toggle",
  "slider",
  "input",
  "progress",
];

function change(recipe: (draft: UiFlow) => void) {
  useEditor.getState().edit((project) => {
    recipe((project.uiFlow ??= createUiFlow()));
  });
}
export function newUiScreen() {
  const id = newId();
  change((draft) =>
    draft.screens.push({
      id,
      name: "New Screen",
      document: { widgets: [] },
      layerId: draft.layers[0].id,
      lifetime: "scene",
      modal: false,
      passthrough: true,
      pause: false,
      fade: 0,
    }),
  );
  openDocument({ kind: "uiScreen", id });
}
const setScreen = (id: string, revision: Partial<UiScreen>) =>
  change((draft) => {
    const screen = draft.screens.find((item) => item.id === id);
    if (!screen) return;
    if (revision.lifetime && revision.lifetime !== screen.lifetime)
      draft.entries = draft.entries.filter((entry) => entry.screenId !== id);
    Object.assign(screen, revision);
  });
function reorder(index: number, delta: number) {
  change(({ layers }) => {
    const other = index + delta;
    if (layers[other])
      [layers[index], layers[other]] = [layers[other], layers[index]];
  });
}

export function UiFlowWorkspace() {
  const project = useEditor((state) => state.project);
  const scene = useEditor(selectedScene);
  const transport = useEditor((state) => state.transport);
  useEditor((state) => state.snapshot);
  const [screenId, setScreenId] = useState<string>();
  const [routeId, setRouteId] = useState<string>();
  const [themeId, setThemeId] = useState<string>();
  const flow = project.uiFlow;
  const layers = flow?.layers ?? [];
  const screen = flow?.screens.find(({ id }) => id === screenId);
  const route = flow?.routes.find(({ id }) => id === routeId);
  const theme = flow?.themes.find(({ id }) => id === themeId);
  const signal = project.signals?.[0];
  const find = (id?: string | null) =>
    flow?.screens.find((item) => item.id === id)?.name;
  const active = new Set(
    transport === "editing" ? [] : playGame()?.uiScreens.map(({ id }) => id),
  );
  const updateRoute = (revision: Partial<UiRoute>) =>
    change((draft) => {
      const item = draft.routes.find(({ id }) => id === routeId);
      if (item) Object.assign(item, revision);
    });
  return (
    <div className="flow-workspace ui-flow-workspace">
      <div className="flow-board">
        <div className="flow-toolbar">
          <Monitor size={16} />
          <strong>UI Flow</strong>
          <button onClick={newUiScreen}>
            <Plus size={14} /> Screen
          </button>
        </div>
        <div className="flow-scroll">
          <div className="panel-body ui-flow-content">
            <Section title="Layers">
              {layers.map(({ id, name }, index) => (
                <div className="ui-lane" key={id}>
                  <header>
                    <Layers3 size={16} />
                    <TextField
                      label={"Layer name " + (index + 1)}
                      value={name}
                      onChange={(next) =>
                        change(({ layers }) => {
                          layers[index].name = next;
                        })
                      }
                    />
                    <button
                      aria-label={"Move " + name + " down"}
                      disabled={index === layers.length - 1}
                      onClick={() => reorder(index, 1)}
                    >
                      <ArrowDown size={14} />
                    </button>
                    <button
                      aria-label={"Move " + name + " up"}
                      disabled={index === 0}
                      onClick={() => reorder(index, -1)}
                    >
                      <ArrowUp size={14} />
                    </button>
                  </header>
                  <div className="ui-lane-screens">
                    {flow?.screens
                      .filter((item) => item.layerId === id)
                      .map((item) => (
                        <button
                          key={item.id}
                          className="ui-flow-screen"
                          aria-pressed={item.id === screenId}
                          onClick={() => setScreenId(item.id)}
                          onDoubleClick={() =>
                            openDocument({ kind: "uiScreen", id: item.id })
                          }
                        >
                          <Monitor size={15} /> {item.name}{" "}
                          {active.has(item.id) && (
                            <span
                              className="flow-status"
                              aria-label="Visible"
                            />
                          )}
                        </button>
                      ))}
                  </div>
                </div>
              ))}
              <button
                onClick={() =>
                  change((draft) => {
                    if (draft.layers.length < 32)
                      draft.layers.push({ id: newId(), name: "New Layer" });
                  })
                }
              >
                <Plus size={14} /> Layer
              </button>
            </Section>
            <Section title="Transitions">
              {flow?.routes.map((item) => (
                <button
                  key={item.id}
                  className="ui-route-row"
                  aria-pressed={item.id === routeId}
                  onClick={() => setRouteId(item.id)}
                >
                  <span>{find(item.sourceId) ?? "Any screen"}</span>
                  <ArrowRight size={15} />
                  <span>
                    {item.action === "pop"
                      ? "Previous screen"
                      : find(item.screenId)}
                  </span>
                  <small>
                    {item.name} · {item.action}
                  </small>
                </button>
              ))}
              <button
                disabled={!signal || !flow?.screens.length}
                onClick={() => {
                  if (!signal || !flow?.screens.length) return;
                  const id = newId();
                  const screenId = flow.screens[0].id;
                  change((draft) =>
                    draft.routes.push({
                      id,
                      name: "New Transition",
                      sourceId: null,
                      signalId: signal.id,
                      action: "show",
                      screenId,
                    }),
                  );
                  setRouteId(id);
                }}
              >
                <Plus size={14} /> Transition
              </button>
            </Section>
            <Section title="Themes">
              <Field label="Project default">
                <select
                  aria-label="Default UI theme"
                  value={flow?.themeId ?? ""}
                  onChange={(event) =>
                    change((draft) => {
                      draft.themeId = event.target.value || undefined;
                    })
                  }
                >
                  <option value="">Widget styles</option>
                  {flow?.themes.map(({ id, name }) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </select>
              </Field>
              {flow?.themes.map((item) => (
                <button
                  key={item.id}
                  className="tree-row"
                  aria-pressed={item.id === themeId}
                  onClick={() => setThemeId(item.id)}
                >
                  {item.name}
                </button>
              ))}
              <button
                onClick={() => {
                  const id = newId();
                  change((draft) =>
                    draft.themes.push({
                      id,
                      name: "New Theme",
                      parent: null,
                      styles: {},
                    }),
                  );
                  setThemeId(id);
                }}
              >
                <Plus size={14} /> Theme
              </button>
            </Section>
          </div>
        </div>
      </div>
      <aside className="flow-inspector panel-body">
        {screen && (
          <Section title="Screen">
            <Field label="Name">
              <TextField
                label="Screen name"
                value={screen.name}
                onChange={(name) => setScreen(screen.id, { name })}
              />
            </Field>
            <Field label="Layer">
              <select
                aria-label="Screen layer"
                value={screen.layerId}
                onChange={(event) =>
                  setScreen(screen.id, { layerId: event.target.value })
                }
              >
                {layers.map(({ id, name }) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Lifetime">
              <select
                aria-label="Screen lifetime"
                value={screen.lifetime}
                onChange={(event) =>
                  setScreen(screen.id, {
                    lifetime:
                      event.target.value === "global" ? "global" : "scene",
                  })
                }
              >
                <option value="scene">Scene</option>
                <option value="global">Global</option>
              </select>
            </Field>
            {(["modal", "passthrough", "pause"] as const).map((key) => (
              <Field
                key={key}
                label={
                  {
                    modal: "Modal",
                    passthrough: "Pointer pass-through",
                    pause: "Pause gameplay",
                  }[key]
                }
              >
                <input
                  type="checkbox"
                  aria-label={
                    {
                      modal: "Modal screen",
                      passthrough: "Pointer pass-through",
                      pause: "Pause gameplay",
                    }[key]
                  }
                  checked={screen[key]}
                  disabled={key === "pause" && !screen.modal}
                  onChange={(event) =>
                    setScreen(screen.id, { [key]: event.target.checked })
                  }
                />
              </Field>
            ))}
            <Field label="Fade seconds">
              <NumberField
                label="Screen fade seconds"
                value={screen.fade}
                min={0}
                max={2}
                step={0.05}
                onChange={(fade) => setScreen(screen.id, { fade })}
              />
            </Field>
            <Field label="Theme">
              <select
                aria-label="Screen theme"
                value={screen.themeId ?? ""}
                onChange={(event) =>
                  setScreen(screen.id, {
                    themeId: event.target.value || undefined,
                  })
                }
              >
                <option value="">Project default</option>
                {flow?.themes.map(({ id, name }) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </Field>
            {(screen.lifetime === "global"
              ? [{ id: null, name: "Project start" }]
              : project.scenes
            ).map(({ id, name }) => (
              <Field key={id ?? "global"} label={name}>
                <input
                  aria-label={"Show at " + name}
                  type="checkbox"
                  checked={
                    !!flow?.entries.some(
                      (entry) =>
                        entry.screenId === screen.id && entry.sceneId === id,
                    )
                  }
                  onChange={(event) =>
                    change((draft) => {
                      draft.entries = draft.entries.filter(
                        (entry) =>
                          entry.screenId !== screen.id || entry.sceneId !== id,
                      );
                      if (event.target.checked)
                        draft.entries.push({
                          sceneId: id,
                          screenId: screen.id,
                        });
                    })
                  }
                />
              </Field>
            ))}
            <div className="inline-actions">
              <button
                onClick={() =>
                  openDocument({ kind: "uiScreen", id: screen.id })
                }
              >
                Edit screen
              </button>
              <button
                disabled={transport !== "playing"}
                onClick={() =>
                  playGame()?.controlUi({
                    action: active.has(screen.id) ? "hide" : "show",
                    screenId: screen.id,
                  })
                }
              >
                {active.has(screen.id) ? "Hide preview" : "Show preview"}
              </button>
              <button
                aria-label="Remove screen"
                onClick={() =>
                  change((draft) => {
                    draft.screens = draft.screens.filter(
                      ({ id }) => id !== screen.id,
                    );
                    draft.entries = draft.entries.filter(
                      ({ screenId }) => screenId !== screen.id,
                    );
                    draft.routes = draft.routes.filter(
                      (item) =>
                        item.sourceId !== screen.id &&
                        item.screenId !== screen.id,
                    );
                  })
                }
              >
                <Trash2 size={14} />
              </button>
            </div>
          </Section>
        )}
        {route && (
          <Section title="Transition">
            <Field label="Name">
              <TextField
                label="UI transition name"
                value={route.name}
                onChange={(name) => updateRoute({ name })}
              />
            </Field>
            <Field label="Source">
              <select
                aria-label="UI transition source"
                value={route.sourceId ?? ""}
                onChange={(event) =>
                  updateRoute({ sourceId: event.target.value || null })
                }
              >
                <option value="">Any screen</option>
                {flow?.screens.map(({ id, name }) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Signal">
              <select
                aria-label="UI transition signal"
                value={route.signalId}
                onChange={(event) =>
                  updateRoute({ signalId: event.target.value })
                }
              >
                {project.signals?.map(({ id, name }) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Action">
              <select
                aria-label="UI transition action"
                value={route.action}
                onChange={(event) => {
                  const action = actions.find(
                    (item) => item === event.target.value,
                  );
                  if (action)
                    updateRoute({
                      action,
                      layerId: action === "move" ? layers[0]?.id : undefined,
                    });
                }}
              >
                {actions.map((action) => (
                  <option key={action}>{action}</option>
                ))}
              </select>
            </Field>
            {route.action !== "pop" && (
              <Field label="Target">
                <select
                  aria-label="UI transition target"
                  value={route.screenId}
                  onChange={(event) =>
                    updateRoute({ screenId: event.target.value })
                  }
                >
                  {flow?.screens.map(({ id, name }) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {route.action === "move" && (
              <Field label="Layer">
                <select
                  aria-label="UI transition layer"
                  value={route.layerId}
                  onChange={(event) =>
                    updateRoute({ layerId: event.target.value })
                  }
                >
                  {layers.map(({ id, name }) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <button
              onClick={() =>
                change((draft) => {
                  draft.routes = draft.routes.filter(
                    ({ id }) => id !== route.id,
                  );
                })
              }
            >
              Remove transition
            </button>
          </Section>
        )}
        {theme && (
          <ThemeEditor
            key={theme.id}
            theme={theme}
            themes={flow?.themes ?? []}
            assets={project.assets}
          />
        )}
        {!screen && !route && !theme && (
          <small className="muted">
            Choose a screen, transition, or theme for {scene.name}.
          </small>
        )}
      </aside>
    </div>
  );
}

function ThemeEditor({
  theme,
  themes,
  assets,
}: {
  theme: UiTheme;
  themes: UiTheme[];
  assets: { id: string; name: string }[];
}) {
  const [name, setName] = useState("button");
  const [state, setState] = useState<keyof UiSkin>("normal");
  const current = theme.styles[name]?.[state];
  const editTheme = (recipe: (draft: UiTheme) => void) =>
    change((draft) => recipe(draft.themes.find(({ id }) => id === theme.id)!));
  const editStyle = (revision: Partial<UiSurfaceStyle>) => {
    if (!name.trim()) return;
    editTheme((draft) => {
      const key = name.trim();
      if (["__proto__", "constructor", "prototype"].includes(key)) return;
      const skin = (draft.styles[key] ??= { normal: {} });
      skin[state] ??= {};
      Object.assign(skin[state]!, revision);
    });
  };
  const ancestry = (id: string) => {
    const seen = new Set<string>();
    let current: string | null = id;
    while (current && !seen.has(current)) {
      seen.add(current);
      current = themes.find((item) => item.id === current)?.parent ?? null;
    }
    return seen;
  };
  return (
    <Section title="Theme style">
      <Field label="Name">
        <TextField
          label="Theme name"
          value={theme.name}
          onChange={(value) =>
            editTheme((draft) => {
              draft.name = value;
            })
          }
        />
      </Field>
      <Field label="Parent">
        <select
          aria-label="Theme parent"
          value={theme.parent ?? ""}
          onChange={(event) =>
            editTheme((draft) => {
              draft.parent = event.target.value || null;
            })
          }
        >
          <option value="">Base theme</option>
          {themes
            .filter(({ id }) => !ancestry(id).has(theme.id))
            .map(({ id, name }) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
        </select>
      </Field>
      <Field label="Style">
        <input
          aria-label="Theme style key"
          list="ui-theme-styles"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <datalist id="ui-theme-styles">
          {[...new Set([...styles, ...Object.keys(theme.styles)])].map(
            (key) => (
              <option key={key} value={key} />
            ),
          )}
        </datalist>
      </Field>
      <Field label="State">
        <select
          aria-label="Theme state"
          value={state}
          onChange={(event) =>
            setState(
              states.find((value) => value === event.target.value) ?? "normal",
            )
          }
        >
          {states.map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
      </Field>
      {(["background", "color", "border", "accent"] as const).map((key) => (
        <Field key={key} label={key}>
          <div className="inline-actions">
            <input
              aria-label={"Theme " + key}
              type="color"
              value={current?.[key] ?? "#757a92"}
              onChange={(event) => editStyle({ [key]: event.target.value })}
            />
            <button
              disabled={current?.[key] === undefined}
              onClick={() => editStyle({ [key]: undefined })}
            >
              Inherit
            </button>
          </div>
        </Field>
      ))}
      <Field label="Font">
        <select
          aria-label="Theme font"
          value={current?.font ?? ""}
          onChange={(event) => {
            const font = (["system", "serif", "mono"] as const).find(
              (value) => value === event.target.value,
            );
            editStyle({ font });
          }}
        >
          <option value="">Inherit</option>
          <option>system</option>
          <option>serif</option>
          <option>mono</option>
        </select>
      </Field>
      <Field label="Weight">
        <select
          aria-label="Theme font weight"
          value={current?.weight ?? ""}
          onChange={(event) =>
            editStyle({
              weight:
                event.target.value === "bold"
                  ? "bold"
                  : event.target.value === "normal"
                    ? "normal"
                    : undefined,
            })
          }
        >
          <option value="">Inherit</option>
          <option>normal</option>
          <option>bold</option>
        </select>
      </Field>
      <Field label="Font size">
        <NumberField
          label="Theme font size"
          min={6}
          max={192}
          value={current?.fontSize ?? 15}
          onChange={(fontSize) => editStyle({ fontSize })}
        />
      </Field>
      <Field label="Nine-slice">
        <select
          aria-label="Theme nine-slice image"
          value={current?.nineSlice?.assetId ?? ""}
          onChange={(event) =>
            editStyle({
              nineSlice: event.target.value
                ? { assetId: event.target.value, slice: 8, width: 8 }
                : undefined,
            })
          }
        >
          <option value="">Inherit</option>
          {assets.map(({ id, name }) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </Field>
      {current?.nineSlice && (
        <>
          <Field label="Source slice">
            <NumberField
              label="Nine-slice source pixels"
              min={1}
              max={256}
              value={current.nineSlice.slice}
              onChange={(slice) =>
                editStyle({
                  nineSlice: {
                    ...current.nineSlice!,
                    slice: Math.round(slice),
                  },
                })
              }
            />
          </Field>
          <Field label="Border size">
            <NumberField
              label="Nine-slice border pixels"
              min={1}
              max={256}
              value={current.nineSlice.width}
              onChange={(width) =>
                editStyle({ nineSlice: { ...current.nineSlice!, width } })
              }
            />
          </Field>
        </>
      )}
      <button
        disabled={!current}
        onClick={() =>
          editTheme((draft) => {
            const skin = draft.styles[name];
            if (!skin) return;
            if (state === "normal") skin.normal = {};
            else delete skin[state];
          })
        }
      >
        Clear state overrides
      </button>
    </Section>
  );
}
