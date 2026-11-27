import { useMemo, useState } from "react";
import { FileUp, Plus, Save } from "lucide-react";
import { languageTag, newId, type Catalog } from "@mosaic/model";
import { Field, TextField } from "./controls";
import {
  dataError,
  editCatalog,
  NameBar,
  Registry,
  Remove,
  SelectData,
} from "./data-controls";
import { playGame } from "./play";
import { useEditor } from "./state";

export function Saves({ data }: { data: Catalog }) {
  const { saves } = data;
  const transport = useEditor((state) => state.transport);
  const [status, setStatus] = useState("");
  const saved = data.globals.filter(({ saved }) => saved);
  const newVersion = () =>
    editCatalog((draft) => {
      const current = draft.saves;
      current.migrations.push({ from: current.version, rename: [], drop: [] });
      current.version++;
    });
  return (
    <>
      <div className="data-settings-title">
        <div>
          <strong>Save format {saves.version}</strong>
          <p>Save slots capture marked globals and the active language.</p>
        </div>
        <button
          disabled={saves.version >= 1000 || saves.migrations.length >= 128}
          onClick={newVersion}
        >
          <Plus size={14} /> New save version
        </button>
      </div>
      <Registry
        items={saves.slots}
        label="Slot"
        add={() => {
          if (saves.slots.length >= 32) {
            dataError("The project already has 32 save slots.");
            return "";
          }
          const id = newId();
          editCatalog((draft) => {
            draft.saves.slots.push({
              id,
              name: "Slot " + (draft.saves.slots.length + 1),
            });
          });
          setStatus("");
          return id;
        }}
      >
        {(slot) => {
          const apply = (operation: "save" | "load") => {
            const play = playGame();
            if (!play) return;
            try {
              if (operation === "save") {
                play.data.save(slot.id);
                setStatus(slot.name + " saved from the preview.");
              } else
                setStatus(
                  play.data.load(slot.id)
                    ? slot.name + " loaded into the preview."
                    : slot.name + " is empty.",
                );
            } catch (failure) {
              setStatus(
                failure instanceof Error ? failure.message : String(failure),
              );
            }
          };
          return (
            <>
              <NameBar
                label="Slot"
                name={slot.name}
                change={(name) =>
                  editCatalog((draft) => {
                    draft.saves.slots.find(({ id }) => id === slot.id)!.name =
                      name;
                  })
                }
                remove={() =>
                  editCatalog((draft) => {
                    draft.saves.slots = draft.saves.slots.filter(
                      ({ id }) => id !== slot.id,
                    );
                  })
                }
              />
              <div className="effect-row">
                <button
                  disabled={transport === "editing"}
                  onClick={() => apply("save")}
                >
                  <Save size={14} /> Save Preview
                </button>
                <button
                  disabled={transport === "editing"}
                  onClick={() => apply("load")}
                >
                  <FileUp size={14} /> Load Preview
                </button>
              </div>
              {status && <output role="status">{status}</output>}
            </>
          );
        }}
      </Registry>
      <section className="data-migrations" aria-label="Save migrations">
        <h3>Migrations</h3>
        {saves.migrations.length === 0 && (
          <p className="subtle-copy">
            Create a save version when stored keys change.
          </p>
        )}
        {saves.migrations.map((migration) => {
          const update = (recipe: (next: typeof migration) => void) =>
            editCatalog((draft) =>
              recipe(
                draft.saves.migrations.find(
                  ({ from }) => from === migration.from,
                )!,
              ),
            );
          const sourceUsed = (key: string) =>
            migration.drop.includes(key) ||
            migration.rename.some(({ from, to }) => from === key || to === key);
          return (
            <details
              className="section"
              key={migration.from}
              open={migration.from === saves.version - 1}
            >
              <summary>
                Version {migration.from} → {migration.from + 1}
              </summary>
              <div className="section-content data-form">
                <div className="effect-row">
                  <button
                    disabled={
                      !saved.some(({ id }) => !sourceUsed(id)) ||
                      migration.rename.length >= 512
                    }
                    onClick={() => {
                      const target = saved.find(({ id }) => !sourceUsed(id));
                      if (target)
                        update((draft) => {
                          draft.rename.push({
                            from: "old-" + newId(),
                            to: target.id,
                          });
                        });
                    }}
                  >
                    <Plus size={14} /> Map Saved Key
                  </button>
                  <button
                    disabled={migration.drop.length >= 512}
                    onClick={() =>
                      update((draft) => {
                        draft.drop.push("old-" + newId());
                      })
                    }
                  >
                    <Plus size={14} /> Drop Saved Key
                  </button>
                </div>
                {migration.rename.map((rule, index) => (
                  <div className="effect-row data-entry" key={index}>
                    <TextField
                      label="Previous global ID"
                      value={rule.from}
                      onChange={(from) => {
                        if (from !== rule.from && sourceUsed(from)) {
                          dataError(
                            "This key is already used in the migration.",
                          );
                          return;
                        }
                        update((draft) => {
                          draft.rename[index].from = from;
                        });
                      }}
                    />
                    <span aria-hidden="true">→</span>
                    <SelectData
                      label="Save destination global"
                      value={rule.to}
                      items={saved.filter(
                        ({ id }) => id === rule.to || !sourceUsed(id),
                      )}
                      change={(to) =>
                        update((draft) => {
                          draft.rename[index].to = to;
                        })
                      }
                    />
                    <Remove
                      label="Remove mapping"
                      remove={() =>
                        update((draft) => {
                          draft.rename.splice(index, 1);
                        })
                      }
                    />
                  </div>
                ))}
                {migration.drop.map((key, index) => (
                  <div className="effect-row data-entry" key={key}>
                    <TextField
                      label="Dropped global ID"
                      value={key}
                      onChange={(id) => {
                        if (id !== key && sourceUsed(id)) {
                          dataError(
                            "This key is already used in the migration.",
                          );
                          return;
                        }
                        update((draft) => {
                          draft.drop[index] = id;
                        });
                      }}
                    />
                    <Remove
                      label="Remove dropped key"
                      remove={() =>
                        update((draft) => {
                          draft.drop.splice(index, 1);
                        })
                      }
                    />
                  </div>
                ))}
              </div>
            </details>
          );
        })}
      </section>
    </>
  );
}

export function Localization({ data }: { data: Catalog }) {
  const config = data.localization;
  const [tag, setTag] = useState("");
  const [current, setCurrent] = useState("");
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(0);
  const locale = config.locales.includes(current) ? current : config.default;
  const options = config.locales.map((tag) => ({ id: tag, name: tag }));
  const change = (recipe: (next: typeof config) => void) =>
    editCatalog((draft) => recipe(draft.localization));
  const shown = useMemo(
    () =>
      config.entries.filter(({ key }) =>
        key.toLowerCase().includes(filter.toLowerCase()),
      ),
    [config.entries, filter],
  );
  const last = Math.max(0, Math.ceil(shown.length / 36) - 1);
  const cursor = Math.min(page, last);
  const translated = config.entries.filter((entry) =>
    Object.hasOwn(entry.values, locale),
  ).length;
  return (
    <div className="data-record data-languages">
      <div className="effect-row data-tools">
        <Field label="Editing">
          <SelectData
            label="Translation language"
            value={locale}
            items={options}
            change={setCurrent}
          />
        </Field>
        <Field label="Default">
          <SelectData
            label="Default language"
            value={config.default}
            items={options}
            change={(id) =>
              change((draft) => {
                draft.default = id;
              })
            }
          />
        </Field>
        <Remove
          label={"Remove language " + locale}
          disabled={config.locales.length === 1}
          remove={() =>
            change((draft) => {
              draft.locales = draft.locales.filter((tag) => tag !== locale);
              if (draft.default === locale) draft.default = draft.locales[0];
              for (const entry of draft.entries) delete entry.values[locale];
            })
          }
        />
        <output>
          {translated} / {config.entries.length} translated
        </output>
      </div>
      <form
        className="effect-row data-tools"
        onSubmit={(event) => {
          event.preventDefault();
          const canonical = languageTag(tag.trim());
          if (
            !canonical ||
            canonical.length > 35 ||
            config.locales.includes(canonical)
          ) {
            dataError("Enter a new language tag such as es or fr-CA.");
            return;
          }
          change((draft) => {
            draft.locales.push(canonical);
          });
          setCurrent(canonical);
          setTag("");
        }}
      >
        <input
          aria-label="New language tag"
          placeholder="e.g. fr-CA"
          value={tag}
          maxLength={35}
          onChange={(event) => setTag(event.target.value)}
        />
        <button disabled={!tag.trim() || config.locales.length >= 24}>
          <Plus size={14} /> Language
        </button>
      </form>
      <div className="effect-row data-tools">
        <input
          type="search"
          aria-label="Find translation keys"
          placeholder="Find translation key…"
          value={filter}
          onChange={(event) => {
            setFilter(event.target.value);
            setPage(0);
          }}
        />
        <button
          disabled={config.entries.length >= 4096}
          onClick={() => {
            let index = config.entries.length + 1;
            const keys = new Set(config.entries.map(({ key }) => key));
            while (keys.has("text-" + index)) index++;
            const key = "text-" + index;
            change((draft) => {
              draft.entries.push({ id: newId(), key, values: {} });
            });
            setFilter("");
            setPage(Math.floor(config.entries.length / 36));
          }}
        >
          <Plus size={14} /> Translation
        </button>
      </div>
      <div className="data-grid">
        <table className="system-table" aria-label="Translations">
          <thead>
            <tr>
              <th scope="col">Key</th>
              {locale !== config.default && (
                <th scope="col">{config.default} fallback</th>
              )}
              <th scope="col">{locale}</th>
              <th scope="col">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.slice(cursor * 36, (cursor + 1) * 36).map((item) => {
              const update = (recipe: (entry: typeof item) => void) =>
                change((draft) =>
                  recipe(draft.entries.find(({ id }) => id === item.id)!),
                );
              return (
                <tr key={item.id}>
                  <td>
                    <TextField
                      label={"Translation key " + item.key}
                      value={item.key}
                      onChange={(key) => {
                        if (
                          config.entries.some(
                            (other) =>
                              other.id !== item.id && other.key === key,
                          )
                        ) {
                          dataError("Translation keys must be unique.");
                          return;
                        }
                        update((entry) => {
                          entry.key = key;
                        });
                      }}
                    />
                  </td>
                  {locale !== config.default && (
                    <td>{item.values[config.default] ?? item.key}</td>
                  )}
                  <td>
                    <TextField
                      label={item.key + " " + locale + " translation"}
                      value={item.values[locale] ?? ""}
                      allowEmpty
                      maxLength={300}
                      onChange={(text) =>
                        update((entry) => {
                          if (text) entry.values[locale] = text;
                          else delete entry.values[locale];
                        })
                      }
                    />
                  </td>
                  <td>
                    <Remove
                      label={"Delete translation " + item.key}
                      remove={() =>
                        change((draft) => {
                          draft.entries = draft.entries.filter(
                            ({ id }) => id !== item.id,
                          );
                        })
                      }
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="effect-row data-pagination">
        <button disabled={cursor === 0} onClick={() => setPage(cursor - 1)}>
          Previous keys
        </button>
        <span>
          {cursor + 1} / {last + 1}
        </span>
        <button disabled={cursor === last} onClick={() => setPage(cursor + 1)}>
          Next keys
        </button>
      </div>
    </div>
  );
}
