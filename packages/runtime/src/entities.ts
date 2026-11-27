import {
  entityComponents,
  type ComponentName,
  type Entity,
} from "@mosaic/model";

export type EntityHandle = Readonly<{
  index: number;
  generation: number;
  scope: symbol;
}>;

const bits = Object.fromEntries(
  entityComponents.map(({ key }, index) => [key, 1 << index]),
) as Record<ComponentName, number>;

function mask(entity: Entity) {
  let result = 0;
  for (const component of entityComponents)
    if (component.present(entity)) result |= bits[component.key];
  return result;
}

/** Identity and membership are dense. Systems keep their specialized data and
 *  caches, and query membership again after the scene commits structural edits. */
export class EntityStore<T extends { entity: Entity }> {
  private scope = Symbol();
  private rows: (T | undefined)[] = [];
  private byId = new Map<string, number>();
  private free: number[] = [];
  private generations = new Uint32Array(32);
  private masks = new Uint32Array(32);
  private queries = new Map<number, readonly T[]>();

  get(id: string): T | undefined {
    const index = this.byId.get(id);
    return index === undefined ? undefined : this.rows[index];
  }
  has(id: string) {
    return this.byId.has(id);
  }
  handle(id: string): EntityHandle | undefined {
    const index = this.byId.get(id);
    return index === undefined
      ? undefined
      : { index, generation: this.generations[index], scope: this.scope };
  }
  resolve(handle: EntityHandle): T | undefined {
    return handle.scope === this.scope &&
      this.generations[handle.index] === handle.generation
      ? this.rows[handle.index]
      : undefined;
  }
  *[Symbol.iterator]() {
    for (const [id, index] of this.byId) yield [id, this.rows[index]!] as const;
  }
  add(value: T) {
    const id = value.entity.id;
    if (this.byId.has(id)) throw Error("Duplicate runtime entity " + id);
    const index = this.free.pop() ?? this.rows.length;
    if (index >= this.masks.length) {
      const masks = new Uint32Array(this.masks.length * 2);
      const generations = new Uint32Array(masks.length);
      masks.set(this.masks);
      generations.set(this.generations);
      this.masks = masks;
      this.generations = generations;
    }
    this.rows[index] = value;
    this.byId.set(id, index);
    this.masks[index] = mask(value.entity);
    this.queries.clear();
  }
  update(id: string) {
    const index = this.byId.get(id);
    if (index === undefined) return false;
    const next = mask(this.rows[index]!.entity);
    if (next === this.masks[index]) return false;
    this.masks[index] = next;
    this.queries.clear();
    return true;
  }
  remove(id: string) {
    const index = this.byId.get(id);
    if (index === undefined) return;
    this.byId.delete(id);
    this.generations[index]++;
    this.masks[index] = 0;
    this.rows[index] = undefined;
    this.free.push(index);
    this.queries.clear();
  }
  query(...components: ComponentName[]): readonly T[] {
    let required = 0;
    for (const component of components) required |= bits[component];
    const cached = this.queries.get(required);
    if (cached) return cached;
    const matched: T[] = [];
    for (let index = 0; index < this.rows.length; index++) {
      const row = this.rows[index];
      if (row && (this.masks[index] & required) === required) matched.push(row);
    }
    this.queries.set(required, matched);
    return matched;
  }
}
