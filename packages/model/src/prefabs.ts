import type { Value } from "@mosaic/blueprints";
import { newId, type Entity, type Prefab, type Scene } from "./index";

export function hierarchyIds(entities: readonly Entity[], root: string) {
  const children = new Map<string, string[]>();
  for (const { id, parentId } of entities) {
    if (!parentId) continue;
    const list = children.get(parentId);
    if (list) list.push(id);
    else children.set(parentId, [id]);
  }
  const ids = new Set<string>();
  const pending = [root];
  while (pending.length) {
    const id = pending.pop()!;
    if (ids.has(id)) continue;
    ids.add(id);
    for (const child of children.get(id) ?? []) pending.push(child);
  }
  return ids;
}

export function reparentEntity(
  scene: Scene,
  id: string,
  parentId: string | null,
) {
  const entity = scene.entities.find((entry) => entry.id === id);
  if (!entity || entity.parentId === parentId) return false;
  if (
    parentId &&
    (entity.body ||
      entity.navigation ||
      !scene.entities.some((entry) => entry.id === parentId) ||
      hierarchyIds(scene.entities, id).has(parentId))
  )
    return false;
  entity.parentId = parentId;
  return true;
}

function remap(
  value: Value,
  ids: ReadonlyMap<string, string>,
  keepExternal: boolean,
): Value {
  if (typeof value !== "object") return value;
  if (value.kind === "entity")
    return {
      ...value,
      id: ids.get(value.id) ?? (keepExternal ? value.id : ""),
    };
  if (value.kind === "record")
    return {
      ...value,
      fields: Object.fromEntries(
        Object.entries(value.fields).map(([key, entry]) => [
          key,
          entry && typeof entry === "object" && entry.kind === "entity"
            ? {
                ...entry,
                id: ids.get(entry.id) ?? (keepExternal ? entry.id : ""),
              }
            : entry,
        ]),
      ),
    };
  return value;
}

function references(
  entity: Entity,
  ids: ReadonlyMap<string, string>,
  keepExternal = true,
) {
  if (entity.navigation?.target)
    entity.navigation.target =
      ids.get(entity.navigation.target) ??
      (keepExternal ? entity.navigation.target : null);
  for (const attachment of entity.attachments ?? [])
    if (attachment.overrides)
      attachment.overrides = Object.fromEntries(
        Object.entries(attachment.overrides).map(([key, value]) => [
          key,
          remap(value, ids, keepExternal),
        ]),
      );
}

export function capturePrefab(scene: Scene, rootId: string): Prefab {
  const root = scene.entities.find(({ id }) => id === rootId);
  if (!root) throw Error("Choose an entity to save as a prefab.");
  const ids = hierarchyIds(scene.entities, rootId);
  if (ids.size > 2000) throw Error("A prefab supports up to 2,000 entities.");
  const mapping = new Map([...ids].map((id) => [id, id]));
  const entities = scene.entities
    .filter(({ id }) => ids.has(id))
    .map((source) => {
      const entity = structuredClone(source);
      delete entity.prefab;
      delete entity.tileLayers;
      if (entity.id === rootId) entity.parentId = null;
      references(entity, mapping, false);
      return entity;
    });
  return { id: newId(), name: root.name, entities };
}

type InstancePlacement = { parentId?: string | null; x?: number; y?: number };
export function instantiatePrefab(
  prefab: Prefab,
  scene: Scene,
  placement: InstancePlacement = {},
) {
  if (scene.entities.length + prefab.entities.length > 20000)
    throw Error("The instance exceeds the scene entity limit.");
  const root = prefab.entities.find(({ parentId }) => !parentId);
  if (!root) throw Error("The prefab has no root.");
  if (placement.parentId && (root.body || root.navigation))
    throw Error(
      "A prefab with root physics or navigation must be placed at the scene root.",
    );
  const instanceId = newId();
  const ids = new Map(prefab.entities.map(({ id }) => [id, newId()]));
  const layers = new Set(scene.layers.map(({ id }) => id));
  return prefab.entities.map((source) => {
    const entity = structuredClone(source);
    entity.id = ids.get(source.id)!;
    entity.prefab = { assetId: prefab.id, instanceId, sourceId: source.id };
    if (!layers.has(entity.layerId)) entity.layerId = scene.layers[0].id;
    entity.parentId = source.parentId
      ? ids.get(source.parentId)!
      : (placement.parentId ?? null);
    if (!source.parentId) {
      entity.transform.x = placement.x ?? source.transform.x;
      entity.transform.y = placement.y ?? source.transform.y;
    }
    references(entity, ids, false);
    return entity;
  });
}

export const prefabProperties = [
  "name",
  "visible",
  "order",
  "transform",
  "visual",
  "body",
  "navigation",
  "light",
  "animator",
  "particles",
  "clips",
  "camera",
  "audio",
  "blueprintId",
  "behaviorTree",
  "attachments",
  "persistent",
] as const;
type PrefabProperty = (typeof prefabProperties)[number];

export function prefabDefaults(scene: Scene, prefab: Prefab, entity: Entity) {
  const link = entity.prefab;
  const source = prefab.entities.find(({ id }) => id === link?.sourceId);
  if (!link || !source) return undefined;
  const ids = new Map(
    scene.entities
      .filter((member) => member.prefab?.instanceId === link.instanceId)
      .map((member) => [member.prefab!.sourceId, member.id]),
  );
  const defaults = structuredClone(source);
  references(defaults, ids, false);
  return defaults;
}

export function prefabOverrides(
  entity: Entity,
  defaults: Entity,
): PrefabProperty[] {
  return prefabProperties.filter(
    (key) => JSON.stringify(entity[key]) !== JSON.stringify(defaults[key]),
  );
}

export function resetPrefabProperties(
  entity: Entity,
  defaults: Entity,
  properties: readonly PrefabProperty[],
) {
  for (const key of properties) {
    if (
      (key === "body" || key === "navigation") &&
      defaults[key] &&
      entity.parentId
    )
      throw Error("Physics and navigation require a scene root.");
    if (defaults[key] === undefined) delete entity[key];
    else Object.assign(entity, { [key]: structuredClone(defaults[key]) });
  }
}

/** Apply new defaults to inherited properties. Overrides compare against the
 * old source after remapping its references into each instance. */
export function applyPrefabRevision(
  scenes: Scene[],
  oldPrefab: Prefab,
  nextPrefab: Prefab,
) {
  for (const scene of scenes) {
    for (const entity of scene.entities) {
      if (entity.prefab?.assetId !== oldPrefab.id) continue;
      const oldDefaults = prefabDefaults(scene, oldPrefab, entity);
      const nextDefaults = prefabDefaults(scene, nextPrefab, entity);
      if (!oldDefaults || !nextDefaults) continue;
      const overridden = new Set(prefabOverrides(entity, oldDefaults));
      for (const key of Object.keys(
        entity.transform,
      ) as (keyof Entity["transform"])[])
        if (entity.transform[key] === oldDefaults.transform[key])
          entity.transform[key] = nextDefaults.transform[key];
      resetPrefabProperties(
        entity,
        nextDefaults,
        prefabProperties.filter(
          (key) => key !== "transform" && !overridden.has(key),
        ),
      );
    }
  }
}

export function publishPrefabOverrides(
  prefab: Prefab,
  scene: Scene,
  member: Entity,
  properties: readonly PrefabProperty[],
): Prefab {
  const link = member.prefab;
  if (!link || link.assetId !== prefab.id)
    throw Error("This entity is not a member of the prefab.");
  const entity = structuredClone(member);
  const ids = new Map(
    scene.entities
      .filter((item) => item.prefab?.instanceId === link.instanceId)
      .map((item) => [item.id, item.prefab!.sourceId]),
  );
  references(entity, ids, false);
  const next = structuredClone(prefab);
  const source = next.entities.find(({ id }) => id === link.sourceId);
  if (!source) throw Error("The original prefab entity is missing.");
  resetPrefabProperties(source, entity, properties);
  return next;
}
