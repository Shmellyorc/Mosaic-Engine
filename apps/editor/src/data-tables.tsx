import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { typeOf, type Scalar } from "@mosaic/blueprints";
import {
  newId,
  type Catalog,
  type DataField,
  type DataSheet,
  type DataStruct,
} from "@mosaic/model";
import { Field, TextField } from "./controls";
import {
  cloneScalar,
  dataError,
  dataLabels,
  dataTypes,
  defaultRecord,
  defaultScalar,
  editCatalog,
  GlobalInitial,
  NameBar,
  RecordFields,
  Registry,
  Remove,
  ScalarInput,
  SelectData,
} from "./data-controls";

const PAGE_SIZE = 32;

function findStruct(data: Catalog, id: string) {
  return data.structs.find((item) => item.id === id)!;
}
function valuesFor(
  data: Catalog,
  schemaId: string,
  update: (values: Record<string, Scalar>) => void,
) {
  for (const sheet of data.sheets) {
    if (sheet.structId === schemaId)
      for (const row of sheet.rows) update(row.values);
  }
  for (const resource of data.resources) {
    if (resource.structId === schemaId) update(resource.values);
  }
  for (const global of data.globals) {
    const value = global.initial;
    if (
      typeof value === "object" &&
      value.kind === "record" &&
      value.schema === schemaId
    )
      update(value.fields);
  }
}

function enumReferenced(data: Catalog, enumId: string, memberId?: string) {
  const matches = (value: Scalar) =>
    typeof value === "object" &&
    value.kind === "enum" &&
    value.enumId === enumId &&
    (memberId === undefined || value.key === memberId);
  for (const schema of data.structs) {
    if (schema.fields.some((field) => matches(field.initial))) return true;
    let used = false;
    valuesFor(data, schema.id, (values) => {
      if (Object.values(values).some(matches)) used = true;
    });
    if (used) return true;
  }
  return data.globals.some(
    ({ initial }) => typeOf(initial) === "enum" && matches(initial as Scalar),
  );
}

function related(data: Catalog, sheetId: string, old: string, next: string) {
  for (const schema of data.structs) {
    const fields = schema.fields.filter((field) => field.relation === sheetId);
    if (!fields.length) continue;
    for (const field of fields) if (field.initial === old) field.initial = next;
    valuesFor(data, schema.id, (values) => {
      for (const field of fields)
        if (values[field.id] === old) values[field.id] = next;
    });
  }
}

export function Sheets({ data }: { data: Catalog }) {
  return (
    <Registry
      items={data.sheets}
      label="Sheet"
      add={() => {
        if (data.sheets.length >= 128) {
          dataError("The project already has 128 sheets.");
          return "";
        }
        const id = newId();
        const schema = data.structs[0] ?? {
          id: newId(),
          name: "Sheet Schema",
          fields: [],
        };
        editCatalog((draft) => {
          if (!draft.structs.length) draft.structs.push(schema);
          draft.sheets.push({
            id,
            name: "Sheet " + (draft.sheets.length + 1),
            structId: schema.id,
            rows: [],
          });
        });
        return id;
      }}
    >
      {(sheet) => <SheetEditor data={data} sheet={sheet} />}
    </Registry>
  );
}

function SheetEditor({ data, sheet }: { data: Catalog; sheet: DataSheet }) {
  const schema = findStruct(data, sheet.structId);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase();
    return search
      ? sheet.rows.filter((row) => row.key.toLowerCase().includes(search))
      : sheet.rows;
  }, [sheet.rows, query]);
  const last = Math.max(0, Math.ceil(filtered.length / PAGE_SIZE) - 1);
  const shown = Math.min(last, page);
  const change = (recipe: (draft: DataSheet, catalog: Catalog) => void) =>
    editCatalog((draft) =>
      recipe(
        draft.sheets.find(({ id }) => id === sheet.id)!,
        draft,
      ),
    );
  const remove = () => {
    if (
      data.structs.some(({ fields }) =>
        fields.some((field) => field.relation === sheet.id),
      )
    ) {
      dataError(
        "Remove the sheet relations in Structs before deleting this sheet.",
      );
      return;
    }
    editCatalog((draft) => {
      draft.sheets = draft.sheets.filter(({ id }) => id !== sheet.id);
    });
  };
  return (
    <>
      <NameBar
        label="Sheet"
        name={sheet.name}
        change={(name) =>
          change((draft) => {
            draft.name = name;
          })
        }
        remove={remove}
      />
      <div className="effect-row data-tools">
        <Field label="Struct">
          <SelectData
            label="Sheet struct"
            items={data.structs}
            value={schema.id}
            change={(id) =>
              change((draft) => {
                const next = findStruct(data, id);
                draft.structId = id;
                for (const row of draft.rows) row.values = defaultRecord(next);
              })
            }
          />
        </Field>
        <input
          type="search"
          aria-label="Find rows"
          placeholder="Find row key…"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(0);
          }}
        />
        <button
          disabled={sheet.rows.length >= 10000}
          onClick={() => {
            const keys = new Set(sheet.rows.map(({ key }) => key));
            let number = sheet.rows.length + 1;
            while (keys.has("row-" + number)) number++;
            const row = {
              id: newId(),
              key: "row-" + number,
              values: defaultRecord(schema),
            };
            change((draft) => {
              draft.rows.push(row);
            });
            setQuery("");
            setPage(Math.floor(sheet.rows.length / PAGE_SIZE));
          }}
        >
          <Plus size={14} /> Row
        </button>
      </div>
      <div className="data-grid">
        <table className="system-table" aria-label={sheet.name + " data"}>
          <thead>
            <tr>
              <th scope="col">Row Key</th>
              {schema.fields.map((field) => (
                <th scope="col" key={field.id}>
                  {field.name}
                  <small>
                    {field.relation ? "Relation" : dataLabels[field.type]}
                  </small>
                </th>
              ))}
              <th scope="col">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered
              .slice(shown * PAGE_SIZE, (shown + 1) * PAGE_SIZE)
              .map((row) => (
                <tr key={row.id}>
                  <td>
                    <TextField
                      label={"Row key " + row.key}
                      value={row.key}
                      onChange={(key) => {
                        if (
                          sheet.rows.some(
                            (candidate) =>
                              candidate.id !== row.id && candidate.key === key,
                          )
                        ) {
                          dataError("Row keys must be unique within a sheet.");
                          return;
                        }
                        change((draft, catalog) => {
                          draft.rows.find(({ id }) => id === row.id)!.key = key;
                          related(catalog, draft.id, row.key, key);
                        });
                      }}
                    />
                  </td>
                  {schema.fields.map((field) => (
                    <td key={field.id}>
                      <ScalarInput
                        catalog={data}
                        field={field}
                        label={row.key + " " + field.name}
                        value={row.values[field.id]}
                        change={(value) =>
                          change((draft) => {
                            draft.rows.find(({ id }) => id === row.id)!.values[
                              field.id
                            ] = value;
                          })
                        }
                      />
                    </td>
                  ))}
                  <td>
                    <Remove
                      label={"Delete row " + row.key}
                      remove={() =>
                        change((draft, catalog) => {
                          draft.rows = draft.rows.filter(
                            ({ id }) => id !== row.id,
                          );
                          related(catalog, draft.id, row.key, "");
                        })
                      }
                    />
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
        {!filtered.length && (
          <p className="subtle-copy">
            {query ? "No matching rows." : "Add a row to enter data."}
          </p>
        )}
      </div>
      <div className="effect-row data-pagination">
        <span>
          {filtered.length ? shown * PAGE_SIZE + 1 : 0}–
          {Math.min(filtered.length, (shown + 1) * PAGE_SIZE)} of{" "}
          {filtered.length}
        </span>
        <button
          aria-label="Previous row page"
          disabled={shown === 0}
          onClick={() => setPage(shown - 1)}
        >
          <ChevronLeft size={16} />
        </button>
        <button
          aria-label="Next row page"
          disabled={shown === last}
          onClick={() => setPage(shown + 1)}
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </>
  );
}

export function Enums({ data }: { data: Catalog }) {
  return (
    <Registry
      items={data.enums}
      label="Enum"
      add={() => {
        if (data.enums.length >= 128) {
          dataError("The project already has 128 enums.");
          return "";
        }
        const id = newId();
        editCatalog((draft) => {
          draft.enums.push({
            id,
            name: "Enum " + (draft.enums.length + 1),
            members: [{ id: newId(), name: "Member 1" }],
          });
        });
        return id;
      }}
    >
      {(item) => {
        const change = (recipe: (next: typeof item) => void) =>
          editCatalog((draft) =>
            recipe(draft.enums.find(({ id }) => id === item.id)!),
          );
        return (
          <>
            <NameBar
              label="Enum"
              name={item.name}
              change={(name) =>
                change((draft) => {
                  draft.name = name;
                })
              }
              remove={() => {
                if (enumReferenced(data, item.id)) {
                  dataError("Replace the enum references before deleting it.");
                  return;
                }
                editCatalog((draft) => {
                  draft.enums = draft.enums.filter(({ id }) => id !== item.id);
                });
              }}
            />
            <div className="data-title">
              <strong>Members</strong>
              <button
                disabled={item.members.length >= 256}
                onClick={() => {
                  let number = item.members.length + 1;
                  while (
                    item.members.some(({ name }) => name === "Member " + number)
                  )
                    number++;
                  change((draft) => {
                    draft.members.push({
                      id: newId(),
                      name: "Member " + number,
                    });
                  });
                }}
              >
                <Plus size={14} /> Member
              </button>
            </div>
            {item.members.map((member) => (
              <div className="effect-row data-entry" key={member.id}>
                <TextField
                  label="Enum member name"
                  value={member.name}
                  onChange={(name) => {
                    if (
                      item.members.some(
                        (other) =>
                          other.id !== member.id && other.name === name,
                      )
                    ) {
                      dataError("Enum member names must be unique.");
                      return;
                    }
                    change((draft) => {
                      draft.members.find(({ id }) => id === member.id)!.name =
                        name;
                    });
                  }}
                />
                <Remove
                  label={"Remove " + member.name}
                  disabled={item.members.length <= 1}
                  remove={() => {
                    if (enumReferenced(data, item.id, member.id)) {
                      dataError(
                        "Replace this member’s values before removing it.",
                      );
                      return;
                    }
                    change((draft) => {
                      draft.members = draft.members.filter(
                        ({ id }) => id !== member.id,
                      );
                    });
                  }}
                />
              </div>
            ))}
          </>
        );
      }}
    </Registry>
  );
}

export function Structs({ data }: { data: Catalog }) {
  return (
    <Registry
      items={data.structs}
      label="Struct"
      add={() => {
        if (data.structs.length >= 128) {
          dataError("The project already has 128 structs.");
          return "";
        }
        const id = newId();
        editCatalog((draft) => {
          draft.structs.push({
            id,
            name: "Struct " + (draft.structs.length + 1),
            fields: [],
          });
        });
        return id;
      }}
    >
      {(schema) => <StructEditor data={data} schema={schema} />}
    </Registry>
  );
}

function StructEditor({ data, schema }: { data: Catalog; schema: DataStruct }) {
  const change = (recipe: (draft: DataStruct, catalog: Catalog) => void) =>
    editCatalog((draft) => recipe(findStruct(draft, schema.id), draft));
  const updateField = (
    id: string,
    recipe: (field: DataField, catalog: Catalog) => void,
  ) =>
    change((draft, catalog) => {
      recipe(
        draft.fields.find((field) => field.id === id)!,
        catalog,
      );
    });
  const remove = () => {
    const used =
      data.sheets.some((item) => item.structId === schema.id) ||
      data.resources.some((item) => item.structId === schema.id) ||
      data.globals.some(
        ({ initial }) =>
          typeof initial === "object" &&
          initial.kind === "record" &&
          initial.schema === schema.id,
      );
    if (used) {
      dataError(
        "Remove the sheets, resources, and globals using this struct first.",
      );
      return;
    }
    editCatalog((draft) => {
      draft.structs = draft.structs.filter(({ id }) => id !== schema.id);
    });
  };
  return (
    <>
      <NameBar
        label="Struct"
        name={schema.name}
        change={(name) =>
          change((draft) => {
            draft.name = name;
          })
        }
        remove={remove}
      />
      <div className="data-title">
        <strong>Fields</strong>
        <button
          disabled={schema.fields.length >= 64}
          onClick={() => {
            const id = newId();
            let number = schema.fields.length + 1;
            while (schema.fields.some(({ name }) => name === "Field " + number))
              number++;
            change((draft, catalog) => {
              draft.fields.push({
                id,
                name: "Field " + number,
                type: "number",
                initial: 0,
              });
              valuesFor(catalog, draft.id, (values) => {
                values[id] = 0;
              });
            });
          }}
        >
          <Plus size={14} /> Field
        </button>
      </div>
      {schema.fields.map((field) => (
        <section
          className="data-entry data-form"
          key={field.id}
          aria-label={field.name + " field"}
        >
          <div className="effect-row">
            <TextField
              label="Field name"
              value={field.name}
              onChange={(name) => {
                if (
                  schema.fields.some(
                    (item) => item.id !== field.id && item.name === name,
                  )
                ) {
                  dataError("Field names must be unique.");
                  return;
                }
                updateField(field.id, (draft) => {
                  draft.name = name;
                });
              }}
            />
            <select
              aria-label={field.name + " type"}
              value={field.type}
              onChange={(event) => {
                const type = event.target.value as DataField["type"];
                const initial = defaultScalar(type, data);
                updateField(field.id, (draft, catalog) => {
                  draft.type = type;
                  draft.initial = initial;
                  delete draft.relation;
                  valuesFor(catalog, schema.id, (values) => {
                    values[field.id] = cloneScalar(initial);
                  });
                });
              }}
            >
              {dataTypes.map((type) => (
                <option
                  key={type}
                  value={type}
                  disabled={type === "enum" && !data.enums.length}
                >
                  {dataLabels[type]}
                </option>
              ))}
            </select>
            <Remove
              label={"Delete field " + field.name}
              remove={() =>
                change((draft, catalog) => {
                  draft.fields = draft.fields.filter(
                    ({ id }) => id !== field.id,
                  );
                  valuesFor(catalog, schema.id, (values) => {
                    delete values[field.id];
                  });
                })
              }
            />
          </div>
          {field.type === "string" && (
            <Field label="Relates to">
              <SelectData
                label={field.name + " relation"}
                value={field.relation ?? ""}
                items={data.sheets}
                none="No relation"
                change={(id) =>
                  updateField(field.id, (draft, catalog) => {
                    if (id) {
                      draft.relation = id;
                      const keys = new Set(
                        catalog.sheets
                          .find((item) => item.id === id)!
                          .rows.map(({ key }) => key),
                      );
                      if (!keys.has(String(draft.initial))) draft.initial = "";
                      valuesFor(catalog, schema.id, (values) => {
                        if (!keys.has(String(values[field.id])))
                          values[field.id] = "";
                      });
                    } else delete draft.relation;
                  })
                }
              />
            </Field>
          )}
          <Field label="Default">
            <ScalarInput
              label={field.name + " default"}
              value={field.initial}
              field={field}
              catalog={data}
              enumRegistry
              change={(value) =>
                updateField(field.id, (draft, catalog) => {
                  const old = draft.initial;
                  draft.initial = value;
                  if (
                    typeof old === "object" &&
                    old.kind === "enum" &&
                    typeof value === "object" &&
                    value.kind === "enum" &&
                    old.enumId !== value.enumId
                  ) {
                    valuesFor(catalog, schema.id, (values) => {
                      values[field.id] = cloneScalar(value);
                    });
                  }
                })
              }
            />
          </Field>
        </section>
      ))}
    </>
  );
}

export function Resources({ data }: { data: Catalog }) {
  return (
    <Registry
      items={data.resources}
      label="Resource"
      empty="Create a resource from a struct."
      add={() => {
        if (!data.structs.length) {
          dataError("Create a struct to define the resource fields.");
          return "";
        }
        if (data.resources.length >= 1024) {
          dataError("The project already has 1,024 resources.");
          return "";
        }
        const schema = data.structs[0];
        const id = newId();
        editCatalog((draft) => {
          draft.resources.push({
            id,
            name: "Resource " + (draft.resources.length + 1),
            structId: schema.id,
            values: defaultRecord(schema),
          });
        });
        return id;
      }}
    >
      {(item) => {
        const change = (recipe: (next: typeof item) => void) =>
          editCatalog((draft) =>
            recipe(draft.resources.find(({ id }) => id === item.id)!),
          );
        return (
          <>
            <NameBar
              label="Resource"
              name={item.name}
              change={(name) =>
                change((draft) => {
                  draft.name = name;
                })
              }
              remove={() =>
                editCatalog((draft) => {
                  draft.resources = draft.resources.filter(
                    ({ id }) => id !== item.id,
                  );
                })
              }
            />
            <Field label="Struct">
              <SelectData
                label="Resource struct"
                items={data.structs}
                value={item.structId}
                change={(id) =>
                  change((draft) => {
                    draft.structId = id;
                    draft.values = defaultRecord(findStruct(data, id));
                  })
                }
              />
            </Field>
            <RecordFields
              schema={findStruct(data, item.structId)}
              values={item.values}
              catalog={data}
              change={(id, value) =>
                change((draft) => {
                  draft.values[id] = value;
                })
              }
            />
          </>
        );
      }}
    </Registry>
  );
}

export function Globals({ data }: { data: Catalog }) {
  return (
    <Registry
      items={data.globals}
      label="Global"
      add={() => {
        if (data.globals.length >= 512) {
          dataError("The project already has 512 globals.");
          return "";
        }
        const id = newId();
        editCatalog((draft) => {
          draft.globals.push({
            id,
            name: "Global " + (draft.globals.length + 1),
            constant: false,
            saved: false,
            initial: 0,
          });
        });
        return id;
      }}
    >
      {(item) => {
        const change = (recipe: (next: typeof item) => void) =>
          editCatalog((draft) =>
            recipe(draft.globals.find(({ id }) => id === item.id)!),
          );
        const types = [...dataTypes, "record"] as const;
        return (
          <>
            <NameBar
              label="Global"
              name={item.name}
              change={(name) =>
                change((draft) => {
                  draft.name = name;
                })
              }
              remove={() =>
                editCatalog((draft) => {
                  draft.globals = draft.globals.filter(
                    ({ id }) => id !== item.id,
                  );
                })
              }
            />
            <div className="data-form">
              <Field label="Stable ID">
                <input aria-label="Global ID" readOnly value={item.id} />
              </Field>
              <Field label="Type">
                <select
                  aria-label="Global type"
                  value={typeOf(item.initial)}
                  onChange={(event) => {
                    const type = event.target.value as (typeof types)[number];
                    const schema = data.structs[0];
                    change((draft) => {
                      if (type === "record")
                        draft.initial = {
                          kind: "record",
                          schema: schema.id,
                          fields: defaultRecord(schema),
                        };
                      else draft.initial = defaultScalar(type, data);
                    });
                  }}
                >
                  {types.map((type) => (
                    <option
                      key={type}
                      value={type}
                      disabled={
                        (type === "record" && !data.structs.length) ||
                        (type === "enum" && !data.enums.length)
                      }
                    >
                      {dataLabels[type]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Constant">
                <input
                  type="checkbox"
                  aria-label="Constant global"
                  checked={item.constant}
                  onChange={(event) =>
                    change((draft) => {
                      draft.constant = event.target.checked;
                      if (draft.constant) draft.saved = false;
                    })
                  }
                />
              </Field>
              <Field label="Include in game saves">
                <input
                  type="checkbox"
                  aria-label="Save global"
                  disabled={item.constant}
                  checked={item.saved}
                  onChange={(event) =>
                    change((draft) => {
                      draft.saved = event.target.checked;
                    })
                  }
                />
              </Field>
              <GlobalInitial
                value={item.initial}
                catalog={data}
                change={(value) =>
                  change((draft) => {
                    draft.initial = value;
                  })
                }
              />
            </div>
          </>
        );
      }}
    </Registry>
  );
}
