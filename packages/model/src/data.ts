import { z } from "zod";
import {
  blueprintValueSchema,
  scalarSchema,
  typeOf,
  valueType,
  type DataSource,
  type DataSymbols,
  type Scalar,
  type Value,
  type ValueType,
} from "@mosaic/blueprints";

const id = z.string().trim().min(1).max(100);
const name = z.string().trim().min(1).max(100);
const locale = z.string().min(2).max(35);
const named = z.object({ id, name });
const scalarType = valueType.exclude(["record"]);
const fieldSchema = named.extend({
  type: scalarType,
  initial: scalarSchema,
  relation: id.optional(),
});
const enumSchema = named.extend({ members: z.array(named).min(1).max(256) });
const structSchema = named.extend({ fields: z.array(fieldSchema).max(64) });
const rowSchema = z.object({ id, key: id, values: z.record(id, scalarSchema) });
const sheetSchema = named.extend({
  structId: id,
  rows: z.array(rowSchema).max(10000),
});
const resourceSchema = named.extend({
  structId: id,
  values: z.record(id, scalarSchema),
});
const globalSchema = named.extend({
  initial: blueprintValueSchema,
  constant: z.boolean(),
  saved: z.boolean(),
});
export const saveGameSchema = z.object({
  format: z.literal("mosaic-save"),
  project: id,
  version: z.number().int().min(1).max(1000),
  locale,
  globals: z.record(id, blueprintValueSchema),
});
const translationSchema = z.object({
  id,
  key: id,
  values: z.record(locale, z.string().max(300)),
});
export const catalogSchema = z.object({
  enums: z.array(enumSchema).max(128),
  structs: z.array(structSchema).max(128),
  sheets: z.array(sheetSchema).max(128),
  resources: z.array(resourceSchema).max(1024),
  globals: z.array(globalSchema).max(512),
  saves: z.object({
    version: z.number().int().min(1).max(1000),
    slots: z.array(named).max(32),
    migrations: z
      .array(
        z.object({
          from: z.number().int().min(1).max(999),
          rename: z.array(z.object({ from: id, to: id })).max(512),
          drop: z.array(id).max(512),
        }),
      )
      .max(128),
  }),
  localization: z.object({
    default: locale,
    locales: z.array(locale).min(1).max(24),
    entries: z.array(translationSchema).max(4096),
  }),
});
export type Catalog = z.infer<typeof catalogSchema>;
export type DataField = z.infer<typeof fieldSchema>;
export type DataStruct = z.infer<typeof structSchema>;
export type DataSheet = z.infer<typeof sheetSchema>;
export type DataRow = z.infer<typeof rowSchema>;
export type DataResource = z.infer<typeof resourceSchema>;
export type DataGlobal = z.infer<typeof globalSchema>;

export const createCatalog = (): Catalog => ({
  enums: [],
  structs: [],
  sheets: [],
  resources: [],
  globals: [],
  saves: { version: 1, slots: [], migrations: [] },
  localization: { default: "en", locales: ["en"], entries: [] },
});

export function languageTag(value: string) {
  try {
    return Intl.getCanonicalLocales(value)[0];
  } catch {
    return undefined;
  }
}

function indexed<T extends { id: string }>(items: readonly T[]) {
  return new Map(items.map((item) => [item.id, item]));
}

export class DataIndex implements DataSymbols {
  readonly enums: Map<string, Catalog["enums"][number]>;
  readonly enumMembers: Map<string, Set<string>>;
  readonly structs: Map<string, DataStruct>;
  readonly sheets: Map<string, DataSheet>;
  readonly rows: Map<string, Map<string, DataRow>>;
  readonly resources: Map<string, DataResource>;
  readonly globals: Map<string, DataGlobal>;
  readonly translations: Map<
    string,
    Catalog["localization"]["entries"][number]
  >;
  readonly slots: Map<string, Catalog["saves"]["slots"][number]>;
  readonly locales: Set<string>;
  private rowsById = new Map<string, Map<string, DataRow>>();
  private fieldTypes: Map<string, ReadonlyMap<string, ValueType>>;

  constructor(data: Catalog) {
    this.enums = indexed(data.enums);
    this.enumMembers = new Map(
      data.enums.map((entry) => [
        entry.id,
        new Set(entry.members.map(({ id }) => id)),
      ]),
    );
    this.structs = indexed(data.structs);
    this.fieldTypes = new Map(
      data.structs.map((item) => [
        item.id,
        new Map(item.fields.map(({ id, type }) => [id, type])),
      ]),
    );
    this.sheets = indexed(data.sheets);
    this.rows = new Map(
      data.sheets.map((sheet) => [
        sheet.id,
        new Map(sheet.rows.map((row) => [row.key, row])),
      ]),
    );
    this.resources = indexed(data.resources);
    this.globals = indexed(data.globals);
    this.translations = indexed(data.localization.entries);
    this.slots = indexed(data.saves.slots);
    this.locales = new Set(data.localization.locales);
  }

  rowById(sheetId: string, rowId: string) {
    let rows = this.rowsById.get(sheetId);
    if (!rows) {
      const sheet = this.sheets.get(sheetId);
      if (!sheet) return;
      rows = indexed(sheet.rows);
      this.rowsById.set(sheetId, rows);
    }
    return rows.get(rowId);
  }

  readType(source: DataSource, id: string): ValueType | undefined {
    switch (source) {
      case "global": {
        const item = this.globals.get(id);
        return item && typeOf(item.initial);
      }
      case "sheet":
        return this.sheets.has(id) ? "record" : undefined;
      case "resource":
        return this.resources.has(id) ? "record" : undefined;
      case "translation":
        return this.translations.has(id) ? "string" : undefined;
      case "locale":
        return "string";
      case "slot":
        return this.slots.has(id) ? "boolean" : undefined;
    }
  }
  fields(source: DataSource, id: string) {
    let schema: string | undefined;
    if (source === "sheet") schema = this.sheets.get(id)?.structId;
    if (source === "resource") schema = this.resources.get(id)?.structId;
    if (source === "global") {
      const initial = this.globals.get(id)?.initial;
      if (typeof initial === "object" && initial.kind === "record")
        schema = initial.schema;
    }
    return schema ? this.fieldTypes.get(schema) : undefined;
  }
  writeType(id: string): ValueType | undefined {
    const item = this.globals.get(id);
    return item && !item.constant ? typeOf(item.initial) : undefined;
  }
  hasSlot(id: string) {
    return this.slots.has(id);
  }
  hasLocale(id: string) {
    return this.locales.has(id);
  }

  fieldMatches(field: DataField, value: Scalar) {
    if (typeOf(value) !== field.type) return false;
    if (field.relation)
      return (
        typeof value === "string" &&
        (value === "" || Boolean(this.rows.get(field.relation)?.has(value)))
      );
    if (typeof value === "object" && value.kind === "enum") {
      const initial = field.initial;
      return (
        typeof initial === "object" &&
        initial.kind === "enum" &&
        value.enumId === initial.enumId &&
        Boolean(this.enumMembers.get(value.enumId)?.has(value.key))
      );
    }
    return true;
  }
  fieldsMatch(structId: string, values: Record<string, Scalar>) {
    const schema = this.structs.get(structId);
    return Boolean(
      schema &&
      Object.keys(values).length === schema.fields.length &&
      schema.fields.every(
        (field) =>
          Object.hasOwn(values, field.id) &&
          this.fieldMatches(field, values[field.id]),
      ),
    );
  }
  globalMatches(definition: DataGlobal, value: Value) {
    if (typeOf(value) !== typeOf(definition.initial)) return false;
    if (typeof value !== "object") return true;
    if (value.kind === "record") {
      const initial = definition.initial;
      return (
        typeof initial === "object" &&
        initial.kind === "record" &&
        initial.schema === value.schema &&
        this.fieldsMatch(value.schema, value.fields)
      );
    }
    if (value.kind !== "enum") return true;
    const initial = definition.initial;
    return (
      typeof initial === "object" &&
      initial.kind === "enum" &&
      initial.enumId === value.enumId &&
      Boolean(this.enumMembers.get(value.enumId)?.has(value.key))
    );
  }
}

const indexes = new WeakMap<Catalog, DataIndex>();
export function indexCatalog(data: Catalog) {
  if (!Object.isFrozen(data)) return new DataIndex(data);
  let index = indexes.get(data);
  if (!index) {
    index = new DataIndex(data);
    indexes.set(data, index);
  }
  return index;
}

function unique(values: string[], label: string) {
  if (new Set(values).size !== values.length)
    throw Error("Duplicate " + label + ".");
}

export function validateCatalog(data: Catalog) {
  const registry = new DataIndex(data);
  for (const [name, items] of [
    ["enum", data.enums],
    ["struct", data.structs],
    ["sheet", data.sheets],
    ["resource", data.resources],
    ["global", data.globals],
    ["save slot", data.saves.slots],
    ["translation", data.localization.entries],
  ] as const)
    unique(
      items.map(({ id }) => id),
      name + " ID",
    );
  for (const enumeration of data.enums) {
    unique(
      enumeration.members.map(({ id }) => id),
      "enum member ID",
    );
    unique(
      enumeration.members.map(({ name }) => name),
      "member name in " + enumeration.name,
    );
  }
  for (const struct of data.structs) {
    unique(
      struct.fields.map(({ id }) => id),
      "struct field ID",
    );
    unique(
      struct.fields.map(({ name }) => name),
      "field name in " + struct.name,
    );
    for (const field of struct.fields) {
      if (
        field.relation &&
        (field.type !== "string" || !registry.sheets.has(field.relation))
      )
        throw Error(`Field "${field.name}" has an invalid sheet relation.`);
      if (!registry.fieldMatches(field, field.initial))
        throw Error(`Field "${field.name}" has an invalid default.`);
    }
  }
  for (const sheet of data.sheets) {
    if (!registry.structs.has(sheet.structId))
      throw Error(`Sheet "${sheet.name}" needs a struct.`);
    unique(
      sheet.rows.map(({ id }) => id),
      "row ID in " + sheet.name,
    );
    unique(
      sheet.rows.map(({ key }) => key),
      "row key in " + sheet.name,
    );
    for (const row of sheet.rows)
      if (!registry.fieldsMatch(sheet.structId, row.values))
        throw Error(
          `Row "${row.key}" in "${sheet.name}" does not match its struct.`,
        );
  }
  for (const resource of data.resources)
    if (!registry.fieldsMatch(resource.structId, resource.values))
      throw Error(`Resource "${resource.name}" does not match its struct.`);
  for (const item of data.globals) {
    if (
      (item.constant && item.saved) ||
      !registry.globalMatches(item, item.initial)
    )
      throw Error(
        `Global "${item.name}" has an invalid initial value or save setting.`,
      );
  }
  const { locales, entries } = data.localization;
  unique(locales, "language tag");
  if (
    !registry.hasLocale(data.localization.default) ||
    locales.some((tag) => tag !== languageTag(tag))
  )
    throw Error(
      "Localization requires canonical language tags and a default language.",
    );
  unique(
    entries.map(({ key }) => key),
    "translation key",
  );
  for (const entry of entries)
    if (Object.keys(entry.values).some((tag) => !registry.hasLocale(tag)))
      throw Error(`Translation "${entry.key}" references an unknown language.`);
  unique(
    data.saves.migrations.map(({ from }) => String(from)),
    "migration version",
  );
  for (const migration of data.saves.migrations) {
    if (migration.from >= data.saves.version)
      throw Error("A save migration must start below the active version.");
    unique(
      migration.rename.map(({ from }) => from),
      "migration source",
    );
    unique(
      migration.rename.map(({ to }) => to),
      "migration destination",
    );
    unique(migration.drop, "dropped key in migration");
    if (
      migration.rename.some(
        ({ from, to }) =>
          from === to ||
          migration.drop.includes(from) ||
          migration.drop.includes(to),
      )
    )
      throw Error("A save migration has overlapping mapping and drop rules.");
  }
}
