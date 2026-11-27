import {
  defaultValue,
  typeOf,
  type Scalar,
  type Value,
  type ValueType,
} from "@mosaic/blueprints";
import { useState } from "react";
import { Field, NumberField, TextField } from "./controls";
import { selectedScene, useEditor } from "./state";

const labels: Record<ValueType, string> = {
  number: "Float",
  boolean: "Bool",
  string: "Text",
  vector: "Vector2",
  entity: "Entity",
  asset: "Asset",
  enum: "Enum",
  record: "Record",
};
export function TypeOptions({
  allowVoid = false,
  allowRecord = true,
}: {
  allowVoid?: boolean;
  allowRecord?: boolean;
}) {
  return (
    <>
      {allowVoid && <option value="void">None</option>}
      {Object.entries(labels)
        .filter(([key]) => allowRecord || key !== "record")
        .map(([type, label]) => (
          <option key={type} value={type}>
            {label}
          </option>
        ))}
    </>
  );
}
type Props = { label: string; value: Value; change: (value: Value) => void };

export function ValueControl({ label, value, change }: Props) {
  if (typeof value === "number")
    return (
      <NumberField label={label} value={value} onChange={change} step={0.1} />
    );
  if (typeof value === "boolean")
    return (
      <select
        aria-label={label}
        value={String(value)}
        onChange={(event) => change(event.target.value === "true")}
      >
        <option value="true">True</option>
        <option value="false">False</option>
      </select>
    );
  if (typeof value === "string")
    return (
      <TextField
        label={label}
        value={value}
        onChange={change}
        allowEmpty
        maxLength={300}
      />
    );
  if (value.kind === "vector")
    return (
      <div className="numeric-grid">
        {(["x", "y"] as const).map((axis) => (
          <Field key={axis} label={axis.toUpperCase()}>
            <NumberField
              label={label + " " + axis.toUpperCase()}
              step={0.1}
              value={value[axis]}
              onChange={(n) => change({ ...value, [axis]: n })}
            />
          </Field>
        ))}
      </div>
    );
  if (value.kind === "entity" || value.kind === "asset")
    return <ReferenceControl label={label} value={value} change={change} />;
  if (value.kind === "enum")
    return (
      <div className="extended-fields">
        <Field label="Enum">
          <TextField
            label={label + " enum ID"}
            value={value.enumId}
            onChange={(enumId) => change({ ...value, enumId })}
            allowEmpty
          />
        </Field>
        <Field label="Member">
          <TextField
            label={label + " enum member"}
            value={value.key}
            onChange={(key) => change({ ...value, key })}
            allowEmpty
          />
        </Field>
      </div>
    );
  return <RecordControl label={label} value={value} change={change} />;
}

function ReferenceControl({
  label,
  value,
  change,
}: Omit<Props, "value"> & {
  value: Extract<Value, { kind: "asset" | "entity" }>;
}) {
  const assets = useEditor((state) => state.project.assets);
  const scene = useEditor(selectedScene);
  const options = value.kind === "asset" ? assets : scene.entities;
  return (
    <select
      aria-label={label}
      value={value.id}
      onChange={(event) => change({ ...value, id: event.target.value })}
    >
      <option value="">None</option>
      {value.id && !options.some((item) => item.id === value.id) && (
        <option value={value.id}>Missing reference ({value.id})</option>
      )}
      {options.map((item) => (
        <option key={item.id} value={item.id}>
          {item.name}
        </option>
      ))}
    </select>
  );
}

function RecordControl({
  label,
  value,
  change,
}: Omit<Props, "value"> & { value: Extract<Value, { kind: "record" }> }) {
  const [key, setKey] = useState("");
  return (
    <div className="extended-fields">
      <Field label="Schema">
        <TextField
          label={label + " schema ID"}
          value={value.schema}
          onChange={(schema) => change({ ...value, schema })}
          allowEmpty
        />
      </Field>
      {Object.entries(value.fields).map(([name, field]) => (
        <div className="record-field" key={name}>
          <strong>{name}</strong>
          <select
            aria-label={name + " type"}
            value={typeOf(field)}
            onChange={(event) =>
              change({
                ...value,
                fields: {
                  ...value.fields,
                  [name]: defaultValue[
                    event.target.value as Exclude<ValueType, "record">
                  ] as Scalar,
                },
              })
            }
          >
            <TypeOptions allowRecord={false} />
          </select>
          <ValueControl
            label={name}
            value={field}
            change={(next) =>
              change({
                ...value,
                fields: { ...value.fields, [name]: next as Scalar },
              })
            }
          />
          <button
            aria-label={"Remove field " + name}
            onClick={() => {
              const fields = { ...value.fields };
              delete fields[name];
              change({ ...value, fields });
            }}
          >
            ×
          </button>
        </div>
      ))}
      <div className="inline-actions">
        <input
          aria-label={label + " field name"}
          value={key}
          maxLength={100}
          onChange={(e) => setKey(e.target.value)}
        />
        <button
          disabled={!key.trim() || Object.hasOwn(value.fields, key.trim())}
          onClick={() => {
            change({ ...value, fields: { ...value.fields, [key.trim()]: 0 } });
            setKey("");
          }}
        >
          Add Field
        </button>
      </div>
    </div>
  );
}
