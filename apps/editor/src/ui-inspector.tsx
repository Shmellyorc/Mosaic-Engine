import { ArrowDown, ArrowUp, PanelTop, Trash2 } from "lucide-react";
import { typeOf } from "@mosaic/blueprints";
import {
  directions,
  emptySignals,
  interactiveWidget,
  normalizeWidgetValue,
  widgetRange,
  widgetSignalType,
  widgetValueType,
  type Catalog,
  type Widget,
  type WidgetBinding,
} from "@mosaic/model";
import { emptyCatalog, SelectData } from "./data-controls";
import { Field, NumberField, Section, TextField } from "./controls";
import { editScene, selectedScene, useEditor } from "./state";
import {
  deleteWidget,
  descendants,
  editWidget,
  moveWidget,
  selectedWidget,
  widgetLabels,
} from "./ui-author";

const anchors = {
  "Top left": [0, 0, 0, 0, 0, 0],
  "Top right": [1, 0, 1, 0, 1, 0],
  "Bottom left": [0, 1, 0, 1, 0, 1],
  "Bottom right": [1, 1, 1, 1, 1, 1],
  Center: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
  "Stretch width": [0, 0, 1, 0, 0, 0],
  Fill: [0, 0, 1, 1, 0, 0],
} as const;

function bindings(
  data: Catalog,
  source: WidgetBinding["source"],
  expected?: string,
) {
  const allowed = (value: string) => !expected || value === expected;
  switch (source) {
    case "global":
      return data.globals.filter(({ initial }) => allowed(typeOf(initial)));
    case "translation":
      return allowed("string")
        ? data.localization.entries.map(({ id, key }) => ({ id, name: key }))
        : [];
    case "resource":
      return data.resources.filter((item) =>
        data.structs
          .find(({ id }) => id === item.structId)
          ?.fields.some(({ type }) => allowed(type)),
      );
    case "sheet":
      return data.sheets.filter(
        (item) =>
          item.rows.length &&
          data.structs
            .find(({ id }) => id === item.structId)
            ?.fields.some(({ type }) => allowed(type)),
      );
  }
}
function schemaFields(
  data: Catalog,
  item: WidgetBinding | undefined,
  expected?: string,
) {
  if (!item || !("field" in item)) return [];
  const items = item.source === "resource" ? data.resources : data.sheets;
  const definition = items.find(({ id }) => id === item.id);
  return (
    data.structs
      .find(({ id }) => id === definition?.structId)
      ?.fields.filter(({ type }) => !expected || type === expected) ?? []
  );
}
const bindingLabels = {
  global: "Global",
  translation: "Translation",
  resource: "Resource field",
  sheet: "Sheet field",
} as const;

function BindingControls({
  label,
  value,
  data,
  expected,
  change,
}: {
  label: string;
  value?: WidgetBinding;
  data: Catalog;
  expected?: string;
  change: (binding?: WidgetBinding) => void;
}) {
  function make(source: WidgetBinding["source"], id: string) {
    if (source === "global" || source === "translation") return { source, id };
    if (source === "resource") {
      const next: WidgetBinding = { source, id, field: "" };
      next.field = schemaFields(data, next, expected)[0]?.id ?? "";
      return next.field ? next : undefined;
    }
    const rowId = data.sheets.find((item) => item.id === id)?.rows[0]?.id;
    if (!rowId) return;
    const next: WidgetBinding = { source, id, rowId, field: "" };
    next.field = schemaFields(data, next, expected)[0]?.id ?? "";
    return next.field ? next : undefined;
  }
  const sources = Object.keys(bindingLabels) as WidgetBinding["source"][];
  return (
    <div className="ui-binding">
      <Field label={label + " source"}>
        <select
          aria-label={label + " source"}
          value={value?.source ?? ""}
          onChange={(event) => {
            const source = event.target.value as WidgetBinding["source"] | "";
            if (!source) change();
            else {
              const first = bindings(data, source, expected)[0];
              if (first) change(make(source, first.id));
            }
          }}
        >
          <option value="">Authored value</option>
          {sources.map((source) => (
            <option
              key={source}
              value={source}
              disabled={!bindings(data, source, expected).length}
            >
              {bindingLabels[source]}
            </option>
          ))}
        </select>
      </Field>
      {value && (
        <>
          <Field label="Entry">
            <SelectData
              label={label + " entry"}
              value={value.id}
              items={bindings(data, value.source, expected)}
              change={(id) => change(make(value.source, id))}
            />
          </Field>
          {value.source === "sheet" && (
            <Field label="Row key">
              <TextField
                label={label + " row key"}
                value={
                  data.sheets
                    .find(({ id }) => id === value.id)
                    ?.rows.find(({ id }) => id === value.rowId)?.key ?? ""
                }
                onChange={(key) => {
                  const row = data.sheets
                    .find(({ id }) => id === value.id)
                    ?.rows.find((row) => row.key === key);
                  if (row) change({ ...value, rowId: row.id });
                  else
                    useEditor
                      .getState()
                      .report("Enter an existing UI binding row key.", "error");
                }}
              />
            </Field>
          )}
          {"field" in value && (
            <Field label="Field">
              <SelectData
                label={label + " field"}
                value={value.field}
                items={schemaFields(data, value, expected)}
                change={(field) => change({ ...value, field })}
              />
            </Field>
          )}
        </>
      )}
    </div>
  );
}

export function UiInspector() {
  const widget = useEditor(selectedWidget);
  return widget ? <WidgetInspector key={widget.id} widget={widget} /> : null;
}

function WidgetInspector({ widget }: { widget: Widget }) {
  const scene = useEditor(selectedScene);
  const assets = useEditor((state) => state.project.assets);
  const signals = useEditor((state) => state.project.signals ?? emptySignals);
  const data = useEditor((state) => state.project.data) ?? emptyCatalog;
  const all = scene.ui!.widgets;
  const children = descendants(all, widget.id);
  const parent = all.find(({ id }) => id === widget.parent);
  const inStack = Boolean(parent?.layout && parent.layout.mode !== "free");
  const members = all.filter((item) => item.parent === widget.parent);
  const position = members.findIndex(({ id }) => id === widget.id);
  const change = (recipe: (draft: Widget) => void) =>
    editWidget(widget.id, recipe);
  const r = widget.rect;
  const selectedPreset =
    Object.entries(anchors).find(([, values]) =>
      values.every(
        (value, index) =>
          value ===
          [r.left, r.top, r.right, r.bottom, r.pivotX, r.pivotY][index],
      ),
    )?.[0] ?? "";
  const valueType = widgetValueType(widget.kind);
  const eventType = widgetSignalType(widget.kind);
  const canFocus = interactiveWidget(widget.kind);
  const canWriteBack =
    widget.valueBinding?.source === "global" &&
    canFocus &&
    data.globals.some(
      (entry) =>
        entry.id === widget.valueBinding?.id &&
        !entry.constant &&
        typeOf(entry.initial) === valueType,
    );
  const currentRange = widgetRange(widget);
  const field = (
    key: keyof Widget["rect"],
    label: string,
    min: number,
    max: number,
    step = 1,
  ) => (
    <Field key={key} label={label}>
      <NumberField
        label={label}
        value={r[key]}
        min={min}
        max={max}
        step={step}
        onChange={(value) =>
          change(({ rect }) => {
            rect[key] = value;
          })
        }
      />
    </Field>
  );

  return (
    <div className="panel-body inspector widget-inspector">
      <div className="inspector-title">
        <div className="object-icon purple">
          <PanelTop size={20} />
        </div>
        <div>
          <strong>{widget.name}</strong>
          <small>{widgetLabels[widget.kind]}</small>
        </div>
        <button
          title="Delete widget and descendants"
          aria-label="Delete widget"
          className="push"
          onClick={() => deleteWidget(widget.id)}
        >
          <Trash2 size={14} />
        </button>
      </div>
      <Section title="Widget">
        <Field label="Name">
          <TextField
            label="Widget name"
            value={widget.name}
            onChange={(name) =>
              change((draft) => {
                draft.name = name;
              })
            }
          />
        </Field>
        <Field label="Parent">
          <SelectData
            label="Widget parent"
            value={widget.parent ?? ""}
            items={all.filter(
              (item) => item.kind === "container" && !children.has(item.id),
            )}
            none="UI root"
            change={(id) => {
              let parent = id || null,
                depth = 0;
              while (parent) {
                depth++;
                parent = all.find((item) => item.id === parent)?.parent ?? null;
              }
              let childDepth = 0;
              for (const child of all.filter(({ id }) => children.has(id))) {
                let ancestor = child.parent,
                  count = 0;
                while (
                  child.id !== widget.id &&
                  ancestor &&
                  children.has(ancestor)
                ) {
                  count++;
                  ancestor =
                    all.find((item) => item.id === ancestor)?.parent ?? null;
                }
                childDepth = Math.max(childDepth, count);
              }
              if (depth + childDepth <= 32)
                change((draft) => {
                  draft.parent = id || null;
                });
              else
                useEditor
                  .getState()
                  .report("UI hierarchies support up to 32 levels.", "error");
            }}
          />
        </Field>
        <Field label="Visible">
          <input
            type="checkbox"
            aria-label="Widget visible"
            checked={widget.visible}
            onChange={(event) =>
              change((draft) => {
                draft.visible = event.target.checked;
              })
            }
          />
        </Field>
        <Field label="Enabled">
          <input
            type="checkbox"
            aria-label="Widget enabled"
            checked={widget.enabled}
            onChange={(event) =>
              change((draft) => {
                draft.enabled = event.target.checked;
              })
            }
          />
        </Field>
        <div className="effect-row">
          <button
            disabled={position <= 0}
            aria-label="Move widget earlier"
            onClick={() => moveWidget(widget.id, -1)}
          >
            <ArrowUp size={14} />
          </button>
          <button
            disabled={position === members.length - 1}
            aria-label="Move widget later"
            onClick={() => moveWidget(widget.id, 1)}
          >
            <ArrowDown size={14} />
          </button>
        </div>
      </Section>
      <Section title="Rect Transform">
        {!inStack && (
          <>
            <Field label="Anchor preset">
              <select
                aria-label="Widget anchor preset"
                value={selectedPreset}
                onChange={(event) => {
                  const preset = event.target.value as keyof typeof anchors;
                  if (!anchors[preset]) return;
                  const [left, top, right, bottom, pivotX, pivotY] =
                    anchors[preset];
                  change(({ rect }) => {
                    Object.assign(rect, {
                      left,
                      top,
                      right,
                      bottom,
                      pivotX,
                      pivotY,
                      x: left === 1 ? -20 : left === 0.5 ? 0 : 20,
                      y: top === 1 ? -20 : top === 0.5 ? 0 : 20,
                      endX: 20,
                      endY: 20,
                    });
                  });
                }}
              >
                <option value="" disabled>
                  Custom
                </option>
                {Object.keys(anchors).map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </Field>
            <div className="numeric-grid">
              {field("x", "Widget X", -8192, 8192)}
              {field("y", "Widget Y", -8192, 8192)}
              {field("left", "Anchor left", 0, r.right, 0.01)}
              {field("top", "Anchor top", 0, r.bottom, 0.01)}
              {field("right", "Anchor right", r.left, 1, 0.01)}
              {field("bottom", "Anchor bottom", r.top, 1, 0.01)}
              {r.left === r.right
                ? field("pivotX", "Pivot X", 0, 1, 0.01)
                : field("endX", "Right inset", -8192, 8192)}
              {r.top === r.bottom
                ? field("pivotY", "Pivot Y", 0, 1, 0.01)
                : field("endY", "Bottom inset", -8192, 8192)}
            </div>
          </>
        )}
        <div className="numeric-grid">
          {(inStack || r.left === r.right) &&
            field("width", "Widget width", 1, 8192)}
          {(inStack || r.top === r.bottom) &&
            field("height", "Widget height", 1, 8192)}
          {inStack && field("grow", "Flex grow", 0, 10, 0.1)}
        </div>
      </Section>
      {widget.layout && (
        <Section title="Container Layout">
          <Field label="Mode">
            <select
              aria-label="Container layout"
              value={widget.layout.mode}
              onChange={(event) => {
                const mode = event.target.value as NonNullable<
                  Widget["layout"]
                >["mode"];
                change((draft) => {
                  draft.layout!.mode = mode;
                });
              }}
            >
              <option value="free">Anchored</option>
              <option value="row">Horizontal</option>
              <option value="column">Vertical</option>
            </select>
          </Field>
          {widget.layout.mode !== "free" && (
            <>
              {(["gap", "padding"] as const).map((key) => (
                <Field key={key} label={key === "gap" ? "Gap" : "Padding"}>
                  <NumberField
                    label={"Container " + key}
                    value={widget.layout![key]}
                    min={0}
                    max={256}
                    onChange={(value) =>
                      change((draft) => {
                        draft.layout![key] = value;
                      })
                    }
                  />
                </Field>
              ))}
              {(["align", "justify"] as const).map((key) => (
                <Field
                  key={key}
                  label={
                    key === "align" ? "Cross-axis align" : "Main-axis align"
                  }
                >
                  <select
                    aria-label={"Container " + key}
                    value={widget.layout![key]}
                    onChange={(event) =>
                      change((draft) => {
                        Object.assign(draft.layout!, {
                          [key]: event.target.value,
                        });
                      })
                    }
                  >
                    {[
                      "start",
                      "center",
                      "end",
                      key === "align" ? "stretch" : "space-between",
                    ].map((option) => (
                      <option key={option}>{option}</option>
                    ))}
                  </select>
                </Field>
              ))}
            </>
          )}
          <Field label="Clip children">
            <input
              type="checkbox"
              aria-label="Clip UI children"
              checked={widget.layout.clip}
              onChange={(event) =>
                change((draft) => {
                  draft.layout!.clip = event.target.checked;
                })
              }
            />
          </Field>
        </Section>
      )}
      <Section title="Appearance">
        {widget.kind !== "container" && (
          <>
            <Field label={widget.kind === "image" ? "Alt text" : "Text"}>
              <TextField
                label="Widget text"
                value={widget.text}
                maxLength={300}
                allowEmpty
                onChange={(text) =>
                  change((draft) => {
                    draft.text = text;
                  })
                }
              />
            </Field>
            {widget.kind === "image" && (
              <>
                <Field label="Image">
                  <SelectData
                    label="Widget image"
                    value={widget.image ?? ""}
                    items={assets}
                    none="None"
                    change={(id) =>
                      change((draft) => {
                        draft.image = id || undefined;
                      })
                    }
                  />
                </Field>
                <Field label="Fit">
                  <select
                    aria-label="Widget image fit"
                    value={widget.fit ?? "contain"}
                    onChange={(event) => {
                      const fit = event.target.value as Widget["fit"];
                      change((draft) => {
                        draft.fit = fit;
                      });
                    }}
                  >
                    {["contain", "cover", "fill"].map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </Field>
              </>
            )}
            <Field label="Alignment">
              <select
                aria-label="Widget text alignment"
                value={widget.style.align}
                onChange={(event) => {
                  const align = event.target.value as Widget["style"]["align"];
                  change((draft) => {
                    draft.style.align = align;
                  });
                }}
              >
                {["left", "center", "right"].map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </Field>
          </>
        )}
        <Field label="Fill">
          <input
            type="checkbox"
            aria-label="Widget has background"
            checked={widget.style.background !== null}
            onChange={(event) =>
              change(({ style }) => {
                style.background = event.target.checked ? "#302547" : null;
              })
            }
          />
        </Field>
        <div className="numeric-grid">
          {(["background", "color", "border", "accent"] as const)
            .filter((key) => widget.style[key] !== null)
            .map((key) => (
              <Field
                label={
                  key === "color"
                    ? "Text color"
                    : key.charAt(0).toUpperCase() + key.slice(1)
                }
                key={key}
              >
                <input
                  type="color"
                  aria-label={"Widget " + key}
                  value={widget.style[key] ?? "#302547"}
                  onChange={(event) =>
                    change(({ style }) => {
                      style[key] = event.target.value;
                    })
                  }
                />
              </Field>
            ))}
          {(
            [
              ["fontSize", "Font size", 6, 192],
              ["radius", "Corner radius", 0, 256],
              ["borderWidth", "Border width", 0, 16],
            ] as const
          ).map(([key, label, min, max]) => (
            <Field label={label} key={key}>
              <NumberField
                label={"Widget " + label.toLowerCase()}
                value={widget.style[key]}
                min={min}
                max={max}
                onChange={(value) =>
                  change(({ style }) => {
                    style[key] = value;
                  })
                }
              />
            </Field>
          ))}
        </div>
      </Section>
      {valueType && (
        <Section title="Control Value">
          {valueType === "boolean" ? (
            <Field label="Checked">
              <input
                type="checkbox"
                aria-label="Widget checked"
                checked={Boolean(widget.value)}
                onChange={(event) =>
                  change((draft) => {
                    draft.value = event.target.checked;
                  })
                }
              />
            </Field>
          ) : valueType === "string" ? (
            <Field label="Initial text">
              <TextField
                label="Widget initial value"
                value={String(widget.value ?? "")}
                allowEmpty
                maxLength={300}
                onChange={(value) =>
                  change((draft) => {
                    draft.value = value;
                  })
                }
              />
            </Field>
          ) : (
            <>
              <Field label="Value">
                <NumberField
                  label="Widget initial value"
                  value={Number(widget.value ?? currentRange.min)}
                  min={currentRange.min}
                  max={currentRange.max}
                  step={0.1}
                  onChange={(value) =>
                    change((draft) => {
                      draft.value = normalizeWidgetValue(draft, value);
                    })
                  }
                />
              </Field>
              {(["min", "max", "step"] as const).map((key) => (
                <Field
                  key={key}
                  label={key.charAt(0).toUpperCase() + key.slice(1)}
                >
                  <NumberField
                    label={"Widget range " + key}
                    value={currentRange[key]}
                    min={
                      key === "step"
                        ? 0.001
                        : key === "max"
                          ? currentRange.min + 0.001
                          : -1e6
                    }
                    max={key === "min" ? currentRange.max - 0.001 : 1e6}
                    step={0.001}
                    onChange={(value) =>
                      change((draft) => {
                        draft.range = { ...currentRange, [key]: value };
                        draft.value = normalizeWidgetValue(
                          draft,
                          Number(draft.value ?? currentRange.min),
                        );
                      })
                    }
                  />
                </Field>
              ))}
            </>
          )}
        </Section>
      )}
      {(widget.kind !== "container" || valueType) && (
        <Section title="Data Binding" open={false}>
          <BindingControls
            label="Text binding"
            value={widget.textBinding}
            data={data}
            change={(binding) =>
              change((draft) => {
                draft.textBinding = binding;
              })
            }
          />
          {valueType && (
            <BindingControls
              label="Value binding"
              value={widget.valueBinding}
              data={data}
              expected={valueType}
              change={(binding) =>
                change((draft) => {
                  draft.valueBinding = binding;
                  if (
                    binding?.source !== "global" ||
                    binding.id !== widget.valueBinding?.id
                  )
                    draft.writeBack = false;
                })
              }
            />
          )}
          {canWriteBack && (
            <Field label="Write changes back">
              <input
                type="checkbox"
                aria-label="Write UI value back to global"
                checked={Boolean(widget.writeBack)}
                onChange={(event) =>
                  change((draft) => {
                    draft.writeBack = event.target.checked;
                  })
                }
              />
            </Field>
          )}
        </Section>
      )}
      {(canFocus || widget.kind === "image" || widget.kind === "progress") && (
        <Section title="Interaction and Accessibility" open={false}>
          <Field label="Accessible name">
            <TextField
              label="Widget accessible name"
              value={widget.accessibleName}
              maxLength={160}
              allowEmpty
              onChange={(name) =>
                change((draft) => {
                  draft.accessibleName = name;
                })
              }
            />
          </Field>
          {eventType && (
            <Field
              label={widget.kind === "button" ? "On click" : "On value changed"}
            >
              <SelectData
                label="Widget event"
                value={widget.signal ?? ""}
                none="No event"
                items={signals.filter(({ type }) => type === eventType)}
                change={(id) =>
                  change((draft) => {
                    draft.signal = id || undefined;
                  })
                }
              />
            </Field>
          )}
          {canFocus && (
            <>
              <Field label="Initial focus">
                <input
                  type="checkbox"
                  aria-label="Initial UI focus"
                  checked={scene.ui?.initialFocus === widget.id}
                  onChange={(event) =>
                    editScene((draft) => {
                      if (event.target.checked)
                        draft.ui!.initialFocus = widget.id;
                      else delete draft.ui!.initialFocus;
                    })
                  }
                />
              </Field>
              {directions.map((direction) => (
                <Field key={direction} label={"Focus " + direction}>
                  <SelectData
                    label={"Widget focus " + direction}
                    value={widget.navigation?.[direction] ?? ""}
                    none="Default"
                    items={all.filter(
                      (item) =>
                        item.id !== widget.id && interactiveWidget(item.kind),
                    )}
                    change={(id) =>
                      change((draft) => {
                        (draft.navigation ??= {})[direction] = id || undefined;
                      })
                    }
                  />
                </Field>
              ))}
            </>
          )}
        </Section>
      )}
    </div>
  );
}
