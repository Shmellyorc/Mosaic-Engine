import { useId, useState, type ReactNode } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  defaultValue,
  typeOf,
  type Scalar,
  type Value,
  type ValueType,
} from "@mosaic/blueprints";
import {
  createCatalog,
  indexCatalog,
  type Catalog,
  type DataField,
  type DataStruct,
} from "@mosaic/model";
import { ValueControl } from "./blueprint-values";
import { Field, TextField } from "./controls";
import { useEditor } from "./state";

export type EditCatalog = (recipe: (draft: Catalog) => void) => void;
export const emptyCatalog = createCatalog();
export function editCatalog(recipe: (draft: Catalog) => void) {
  useEditor
    .getState()
    .edit((project) => recipe((project.data ??= createCatalog())));
}
export const dataError = (message: string) =>
  useEditor.getState().report(message, "error");
export const dataTypes = [
  "number",
  "string",
  "boolean",
  "vector",
  "entity",
  "asset",
  "enum",
] as const;
export const dataLabels: Record<ValueType, string> = {
  number: "Float",
  string: "Text",
  boolean: "Bool",
  vector: "Vector2",
  entity: "Entity",
  asset: "Asset",
  enum: "Enum",
  record: "Struct",
};

export function Remove({
  label,
  remove,
  disabled,
}: {
  label: string;
  remove: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={remove}
    >
      <Trash2 size={14} />
    </button>
  );
}

export function Registry<T extends { id: string; name: string }>({
  items,
  label,
  add,
  empty,
  children,
}: {
  items: T[];
  label: string;
  add: () => string;
  empty?: string;
  children: (item: T) => ReactNode;
}) {
  const [activeId, setActiveId] = useState("");
  const [search, setSearch] = useState("");
  const item = items.find(({ id }) => id === activeId) ?? items[0];
  const matching = items.filter(({ name }) =>
    name.toLowerCase().includes(search.trim().toLowerCase()),
  );
  return (
    <div className="data-registry">
      <aside className="data-list" aria-label={label + " registry"}>
        <button
          onClick={() => {
            setSearch("");
            setActiveId(add());
          }}
        >
          <Plus size={14} /> Add {label}
        </button>
        {items.length > 6 && (
          <input
            type="search"
            aria-label={"Find " + label.toLowerCase()}
            placeholder="Find…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        )}
        {matching.map((entry) => (
          <button
            key={entry.id}
            aria-pressed={item?.id === entry.id}
            onClick={() => setActiveId(entry.id)}
            title={entry.name}
          >
            {entry.name}
          </button>
        ))}
      </aside>
      {item ? (
        <div className="data-record" key={item.id}>
          {children(item)}
        </div>
      ) : (
        <div className="empty-state">
          <p>{empty ?? "Add a " + label.toLowerCase() + " to get started."}</p>
        </div>
      )}
    </div>
  );
}

export function NameBar({
  name,
  label,
  change,
  remove,
}: {
  name: string;
  label: string;
  change: (name: string) => void;
  remove: () => void;
}) {
  return (
    <div className="data-title">
      <TextField label={label + " name"} value={name} onChange={change} />
      <Remove label={"Delete " + label.toLowerCase()} remove={remove} />
    </div>
  );
}

export function SelectData({
  label,
  value,
  items,
  change,
  none,
}: {
  label: string;
  value: string;
  items: readonly { id: string; name: string }[];
  change: (id: string) => void;
  none?: string;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(event) => change(event.target.value)}
    >
      {none && <option value="">{none}</option>}
      {!!value && !items.some(({ id }) => id === value) && (
        <option disabled value={value}>
          Unavailable ({value})
        </option>
      )}
      {items.map(({ id, name }) => (
        <option key={id} value={id}>
          {name}
        </option>
      ))}
    </select>
  );
}

export function cloneScalar(value: Scalar): Scalar {
  return typeof value === "object" ? { ...value } : value;
}
export function defaultRecord(schema: DataStruct) {
  return Object.fromEntries(
    schema.fields.map((field) => [field.id, cloneScalar(field.initial)]),
  );
}
export function defaultScalar(
  type: DataField["type"],
  catalog: Catalog,
): Scalar {
  const enumeration = catalog.enums[0];
  if (type === "enum" && enumeration)
    return {
      kind: "enum",
      enumId: enumeration.id,
      key: enumeration.members[0].id,
    };
  return cloneScalar(defaultValue[type] as Scalar);
}

function RelationInput({
  label,
  value,
  sheet,
  catalog,
  change,
}: {
  label: string;
  value: string;
  sheet: string;
  catalog: Catalog;
  change: (key: string) => void;
}) {
  const listId = useId();
  const keys = indexCatalog(catalog).rows.get(sheet);
  return (
    <RelationKey
      key={value}
      label={label}
      value={value}
      listId={listId}
      keys={keys}
      change={change}
    />
  );
}

function RelationKey({
  label,
  value,
  listId,
  keys,
  change,
}: {
  label: string;
  value: string;
  listId: string;
  keys?: ReadonlyMap<string, unknown>;
  change: (key: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const suggestions: string[] = [];
  const normalized = draft.trim().toLowerCase();
  for (const key of keys?.keys() ?? []) {
    if (!normalized || key.toLowerCase().includes(normalized))
      suggestions.push(key);
    if (suggestions.length === 20) break;
  }
  return (
    <>
      <input
        aria-label={label}
        aria-invalid={Boolean(draft.trim() && !keys?.has(draft.trim()))}
        list={listId}
        placeholder="Row key"
        maxLength={100}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          const key = draft.trim();
          if (!key || keys?.has(key)) change(key);
          else {
            dataError("Choose an existing related row key.");
            setDraft(value);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
      <datalist id={listId}>
        {suggestions.map((key) => (
          <option value={key} key={key} />
        ))}
      </datalist>
    </>
  );
}

export function ScalarInput({
  label,
  value,
  field,
  catalog,
  change,
  enumRegistry = false,
}: {
  label: string;
  value: Scalar;
  field?: DataField;
  catalog: Catalog;
  change: (next: Scalar) => void;
  enumRegistry?: boolean;
}) {
  if (field?.relation && typeof value === "string")
    return (
      <RelationInput
        label={label}
        value={value}
        sheet={field.relation}
        catalog={catalog}
        change={change}
      />
    );
  if (typeof value === "object" && value.kind === "enum") {
    const enumeration = catalog.enums.find(({ id }) => id === value.enumId);
    return (
      <div className="data-enum-input">
        {enumRegistry && (
          <SelectData
            label={label + " enum"}
            value={value.enumId}
            items={catalog.enums}
            change={(id) => {
              const next = catalog.enums.find((entry) => entry.id === id);
              if (next)
                change({ kind: "enum", enumId: id, key: next.members[0].id });
            }}
          />
        )}
        <SelectData
          label={label}
          value={value.key}
          items={enumeration?.members ?? []}
          change={(key) => change({ ...value, key })}
        />
      </div>
    );
  }
  return (
    <ValueControl
      label={label}
      value={value}
      change={(next) => change(next as Scalar)}
    />
  );
}

export function RecordFields({
  schema,
  values,
  catalog,
  change,
}: {
  schema: DataStruct;
  values: Record<string, Scalar>;
  catalog: Catalog;
  change: (id: string, value: Scalar) => void;
}) {
  return (
    <div className="data-form">
      {schema.fields.map((field) => (
        <Field key={field.id} label={field.name}>
          <ScalarInput
            label={field.name}
            value={values[field.id]}
            field={field}
            catalog={catalog}
            change={(value) => change(field.id, value)}
          />
        </Field>
      ))}
      {!schema.fields.length && (
        <p className="subtle-copy">Add fields in the Structs tab.</p>
      )}
    </div>
  );
}

export function GlobalInitial({
  value,
  catalog,
  change,
}: {
  value: Value;
  catalog: Catalog;
  change: (next: Value) => void;
}) {
  if (typeof value === "object" && value.kind === "record") {
    const schema = catalog.structs.find(({ id }) => id === value.schema)!;
    return (
      <div className="data-form">
        <Field label="Struct">
          <SelectData
            label="Global struct"
            value={value.schema}
            items={catalog.structs}
            change={(id) => {
              const next = catalog.structs.find((item) => item.id === id)!;
              change({
                kind: "record",
                schema: id,
                fields: defaultRecord(next),
              });
            }}
          />
        </Field>
        <RecordFields
          schema={schema}
          values={value.fields}
          catalog={catalog}
          change={(id, next) =>
            change({ ...value, fields: { ...value.fields, [id]: next } })
          }
        />
      </div>
    );
  }
  return (
    <Field label="Initial value">
      <ScalarInput
        label="Global initial value"
        value={value}
        catalog={catalog}
        change={change}
        enumRegistry={typeOf(value) === "enum"}
      />
    </Field>
  );
}
