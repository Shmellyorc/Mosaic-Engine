import { type DataSource, type Scalar, type Value } from "@mosaic/blueprints";
import {
  createCatalog,
  indexCatalog,
  languageTag,
  saveGameSchema,
  type Catalog,
  type DataIndex,
} from "@mosaic/model";

export const MAX_SAVE_BYTES = 1024 * 1024;
export interface SlotStorage {
  read(key: string): string | null;
  write(key: string, source: string): void;
}
export function memorySlotStorage(): SlotStorage {
  const slots = new Map<string, string>();
  return {
    read: (key) => slots.get(key) ?? null,
    write: (key, source) => {
      slots.set(key, source);
    },
  };
}
export function browserSlotStorage(scope: string): SlotStorage {
  const keyFor = (key: string) => "mosaic-game-save:" + scope + ":" + key;
  return {
    read(key) {
      try {
        return globalThis.localStorage.getItem(keyFor(key));
      } catch {
        throw Error(
          "Local save slots are unavailable in this browser. Use a portable save file.",
        );
      }
    },
    write(key, source) {
      try {
        globalThis.localStorage.setItem(keyFor(key), source);
      } catch {
        throw Error(
          "The save slot could not be written. Use a portable save file.",
        );
      }
    },
  };
}

const emptyData = Object.freeze(createCatalog());
function copyValue(value: Value): Value {
  if (typeof value !== "object") return value;
  if (value.kind !== "record") return Object.freeze({ ...value });
  const fields = Object.fromEntries(
    Object.entries(value.fields).map(([id, field]) => [
      id,
      typeof field === "object" ? Object.freeze({ ...field }) : field,
    ]),
  );
  return Object.freeze({ ...value, fields: Object.freeze(fields) });
}

export class GameData {
  readonly index: DataIndex;
  private values: Map<string, Value>;
  private locale: string;
  revision = 0;
  private records = new WeakMap<Record<string, Scalar>, Value>();
  private migrations: Map<number, Catalog["saves"]["migrations"][number]>;
  private savedIds: string[];

  constructor(
    private projectId: string,
    private catalog: Catalog = emptyData,
    private storage: SlotStorage = memorySlotStorage(),
  ) {
    this.index = indexCatalog(catalog);
    this.values = this.defaults();
    this.locale = catalog.localization.default;
    this.migrations = new Map(
      catalog.saves.migrations.map((migration) => [migration.from, migration]),
    );
    this.savedIds = catalog.globals
      .filter((global) => global.saved && !global.constant)
      .map(({ id }) => id);
  }

  private defaults() {
    return new Map(
      this.catalog.globals.map(({ id, initial }) => [id, copyValue(initial)]),
    );
  }

  private record(schema: string, fields: Record<string, Scalar>): Value {
    const existing = this.records.get(fields);
    if (existing) return existing;
    const record = copyValue({ kind: "record", schema, fields });
    this.records.set(fields, record);
    return record;
  }

  read(source: DataSource, id: string, key?: string): Value {
    switch (source) {
      case "global": {
        const value = this.values.get(id);
        if (value !== undefined) return value;
        break;
      }
      case "sheet": {
        const sheet = this.index.sheets.get(id);
        const row = key !== undefined && this.index.rows.get(id)?.get(key);
        if (sheet && row) return this.record(sheet.structId, row.values);
        throw Error(
          `Row "${key ?? ""}" is missing from sheet "${sheet?.name ?? id}".`,
        );
      }
      case "resource": {
        const resource = this.index.resources.get(id);
        if (resource) return this.record(resource.structId, resource.values);
        break;
      }
      case "translation": {
        const entry = this.index.translations.get(id);
        if (entry) return this.translated(entry.values) ?? entry.key;
        break;
      }
      case "locale":
        return this.locale;
      case "slot":
        return this.storage.read(this.slotKey(id)) !== null;
    }
    throw Error(`The ${source} reference is missing from the project.`);
  }

  private translated(values: Record<string, string>) {
    for (const start of [this.locale, this.catalog.localization.default]) {
      let tag = start;
      while (tag) {
        if (Object.hasOwn(values, tag)) return values[tag];
        const separator = tag.lastIndexOf("-");
        tag = separator < 0 ? "" : tag.slice(0, separator);
      }
    }
    return undefined;
  }

  write(id: string, value: Value) {
    const definition = this.index.globals.get(id);
    if (!definition || definition.constant)
      throw Error("The global is missing or constant.");
    if (!this.index.globalMatches(definition, value))
      throw Error(`The value does not match global "${definition.name}".`);
    if (this.values.get(id) !== value) {
      this.values.set(id, copyValue(value));
      this.revision++;
    }
  }

  setLanguage(tag: string) {
    const canonical = languageTag(tag);
    if (!canonical || !this.index.hasLocale(canonical))
      throw Error("The language is unavailable in this project.");
    if (this.locale !== canonical) {
      this.locale = canonical;
      this.revision++;
    }
  }

  encode() {
    const source = JSON.stringify({
      format: "mosaic-save",
      project: this.projectId,
      version: this.catalog.saves.version,
      locale: this.locale,
      globals: Object.fromEntries(
        this.savedIds.map((id) => [id, this.values.get(id)!]),
      ),
    });
    if (new TextEncoder().encode(source).length > MAX_SAVE_BYTES)
      throw Error("The game save exceeds 1 MiB.");
    return source;
  }

  restore(source: string) {
    if (
      source.length > MAX_SAVE_BYTES ||
      new TextEncoder().encode(source).length > MAX_SAVE_BYTES
    )
      throw Error("The game save exceeds 1 MiB.");
    let value: unknown;
    try {
      value = JSON.parse(source);
    } catch {
      throw Error("This is not a valid game save.");
    }
    const result = saveGameSchema.safeParse(value);
    if (!result.success || result.data.project !== this.projectId)
      throw Error(
        "This save does not belong to this project or has an invalid format.",
      );
    const save = result.data;
    if (save.version > this.catalog.saves.version)
      throw Error("This save requires a newer project version.");
    const globals = new Map(Object.entries(save.globals));
    for (
      let version = save.version;
      version < this.catalog.saves.version;
      version++
    ) {
      const step = this.migrations.get(version);
      if (!step) throw Error(`Missing save migration from version ${version}.`);
      const moved = step.rename.map(({ from, to }) => ({
        from,
        to,
        value: globals.get(from),
      }));
      for (const { from, value } of moved)
        if (value !== undefined) globals.delete(from);
      for (const id of step.drop) globals.delete(id);
      for (const { to, value } of moved) {
        if (value === undefined) continue;
        if (globals.has(to))
          throw Error(`Save migration has conflicting values for "${to}".`);
        globals.set(to, value);
      }
    }
    const values = new Map(this.values);
    for (const id of this.savedIds) {
      const definition = this.index.globals.get(id)!;
      let value = globals.get(id) ?? definition.initial;
      const initial = definition.initial;
      if (
        save.version < this.catalog.saves.version &&
        typeof value === "object" &&
        value.kind === "record" &&
        typeof initial === "object" &&
        initial.kind === "record" &&
        initial.schema === value.schema
      ) {
        const previous = value.fields;
        value = {
          ...value,
          fields: Object.fromEntries(
            Object.entries(initial.fields).map(([id, fallback]) => [
              id,
              Object.hasOwn(previous, id) ? previous[id] : fallback,
            ]),
          ),
        };
      }
      if (!this.index.globalMatches(definition, value))
        throw Error(`Saved value for "${definition.name}" needs a migration.`);
      values.set(id, copyValue(value));
    }
    this.values = values;
    this.revision++;
    this.locale = this.index.hasLocale(save.locale)
      ? save.locale
      : this.catalog.localization.default;
  }

  private slotKey(id: string) {
    if (!this.index.hasSlot(id))
      throw Error("The project save slot is missing.");
    return JSON.stringify([this.projectId, id]);
  }
  save(id: string) {
    this.storage.write(this.slotKey(id), this.encode());
  }
  load(id: string) {
    const source = this.storage.read(this.slotKey(id));
    if (source === null) return false;
    this.restore(source);
    return true;
  }
}
