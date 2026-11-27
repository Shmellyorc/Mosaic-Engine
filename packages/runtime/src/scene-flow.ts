import type { SceneOperation } from "@mosaic/blueprints";
import type { Entity, Project, Scene, SceneRoute } from "@mosaic/model";
import type { Point, TileSource } from "./tiles";

type Mounted = { id: string; source: Scene; serial: number; offset: Point };
type EntityScope = {
  sceneId: string;
  name: string;
  entities: Map<string, string>;
  timelines: Map<string, string>;
};
export type SceneCommand = {
  operation: SceneOperation;
  sceneId: string;
  fade?: number;
  offset?: Point;
};

const origin = { x: 0, y: 0 };

export class SceneWorld {
  private loaded = new Map<string, Mounted>();
  private prepared = new Map<string, Mounted>();
  private serial = 0;
  private carried = new Map<string, Map<string, Entity>>();
  private reserved = new Set<string>();
  private mountedCache = new WeakMap<
    Mounted,
    {
      entities: Entity[];
      scope: EntityScope;
      layers: Scene["layers"];
      timelines: Scene["timelines"];
      tilemap: Scene["tilemap"];
    }
  >();
  readonly scopes = new Map<string, EntityScope>();
  tileSources: TileSource[] = [];
  constructor(
    public project: Project,
    public primary: string,
  ) {
    const source = this.source(primary);
    this.reserved = new Set(source.entities.map(({ id }) => id));
    this.loaded.set(primary, {
      id: primary,
      source,
      serial: 0,
      offset: origin,
    });
  }

  private source(id: string) {
    const source =
      this.prepared.get(id)?.source ??
      this.project.scenes.find((scene) => scene.id === id);
    if (!source) throw new Error(`Scene "${id}" does not exist.`);
    return source;
  }

  isLoaded(sceneId: string) {
    return this.loaded.has(sceneId);
  }

  entityId(sceneId: string, entityId: string) {
    const mounted = this.loaded.get(sceneId);
    return (
      (mounted && this.materialize(mounted).scope.entities.get(entityId)) ??
      this.carried.get(sceneId)?.get(entityId)?.id
    );
  }

  route(target: string, from: string) {
    const route = this.project.sceneFlow?.routes.find(
      ({ id }) => id === target,
    );
    if (!route || (route.from !== null && route.from !== from))
      throw new Error(
        `Scene route "${target}" is unavailable from this scene.`,
      );
    return this.commandFor(route);
  }

  signal(id: string, from: string) {
    const routes = this.project.sceneFlow?.routes;
    const route =
      routes?.find((route) => route.signalId === id && route.from === from) ??
      routes?.find((route) => route.signalId === id && route.from === null);
    return route && this.commandFor(route);
  }

  private commandFor(route: SceneRoute): SceneCommand {
    return {
      operation: route.operation,
      sceneId: route.to,
      offset: route.offset,
      fade: route.fade,
    };
  }

  validate({ operation, sceneId }: SceneCommand) {
    this.source(sceneId);
    if (operation === "unload" && sceneId === this.primary)
      throw new Error("Change the primary scene before unloading it.");
  }

  get status() {
    return {
      primary: this.primary,
      loaded: [...this.loaded.keys()],
      preloaded: [...this.prepared.keys()],
    };
  }

  apply(command: SceneCommand) {
    this.validate(command);
    const { operation, sceneId } = command;
    const source = this.source(sceneId);
    if (operation === "preload") {
      if (!this.prepared.has(sceneId)) {
        if (this.prepared.size >= 32)
          this.prepared.delete(this.prepared.keys().next().value!);
        const mount = this.mount(source, command.offset ?? origin);
        this.materialize(mount);
        this.prepared.set(sceneId, mount);
      }
      return false;
    }
    if (operation === "unload") {
      const slice = this.loaded.get(sceneId);
      if (!slice) return false;
      this.carry(slice);
      this.loaded.delete(sceneId);
      return true;
    }
    if (operation === "change") {
      if (sceneId === this.primary && this.loaded.size === 1) return false;
      for (const [id, slice] of this.loaded)
        if (id !== sceneId) this.carry(slice);
      const incoming = this.loaded.get(sceneId);
      this.loaded.clear();
      this.primary = sceneId;
      this.loaded.set(sceneId, incoming ?? this.activate(source, origin));
      return true;
    }
    const existing = this.loaded.get(sceneId);
    if (operation === "add" && existing) return false;
    if (existing) this.carry(existing);
    this.loaded.set(
      sceneId,
      this.activate(source, existing?.offset ?? command.offset ?? origin),
    );
    return true;
  }

  reload(project: Project) {
    if (!project.scenes.some(({ id }) => id === this.primary)) return false;
    this.project = project;
    for (const id of this.prepared.keys()) {
      const scene = project.scenes.find((scene) => scene.id === id);
      if (scene !== this.prepared.get(id)?.source) this.prepared.delete(id);
    }
    for (const [id, slice] of this.loaded) {
      const scene = project.scenes.find((scene) => scene.id === id);
      if (!scene) this.loaded.delete(id);
      else if (scene !== slice.source)
        this.loaded.set(id, { ...slice, source: scene });
    }
    return true;
  }

  private mount(source: Scene, offset: Point): Mounted {
    return { id: source.id, source, offset, serial: ++this.serial };
  }

  private activate(source: Scene, offset: Point) {
    const prepared = this.prepared.get(source.id);
    this.prepared.delete(source.id);
    if (prepared?.offset.x === offset.x && prepared.offset.y === offset.y)
      return prepared;
    return this.mount(source, offset);
  }

  private scoped(slice: Mounted, kind: string, id: string): string {
    if (!slice.serial) return id;
    let key = JSON.stringify([slice.serial, kind, id]);
    while (this.reserved.has(key)) key += "!";
    return key;
  }

  private materialize(slice: Mounted) {
    const cached = this.mountedCache.get(slice);
    if (cached) return cached;
    const { source, offset } = slice;
    const carried = this.carried.get(slice.id);
    const entityIds = new Map(
      source.entities.map(({ id }) => [
        id,
        carried?.get(id)?.id ?? this.scoped(slice, "entity", id),
      ]),
    );
    const timelineIds = new Map(
      (source.timelines ?? []).map(({ id }) => [
        id,
        this.scoped(slice, "timeline", id),
      ]),
    );
    const layerId = (id: string) => this.scoped(slice, "layer", id);
    const tileLayerId = (id: string) => this.scoped(slice, "tiles", id);
    const scope: EntityScope = {
      sceneId: source.id,
      name: source.name,
      entities: entityIds,
      timelines: timelineIds,
    };
    const result = {
      scope,
      layers: slice.serial
        ? source.layers.map((layer) => ({ ...layer, id: layerId(layer.id) }))
        : source.layers,
      entities: source.entities.flatMap<Entity>((entity) => {
        if (carried?.has(entity.id)) return [];
        if (!slice.serial && !offset.x && !offset.y) return [entity];
        return [
          {
            ...entity,
            id: entityIds.get(entity.id)!,
            layerId: layerId(entity.layerId),
            parentId: entity.parentId ? entityIds.get(entity.parentId)! : null,
            transform: entity.parentId
              ? entity.transform
              : {
                  ...entity.transform,
                  x: entity.transform.x + offset.x,
                  y: entity.transform.y + offset.y,
                },
            navigation: entity.navigation
              ? {
                  ...entity.navigation,
                  target: entity.navigation.target
                    ? (entityIds.get(entity.navigation.target) ?? null)
                    : null,
                }
              : undefined,
            prefab: entity.prefab
              ? {
                  ...entity.prefab,
                  instanceId: this.scoped(
                    slice,
                    "prefab",
                    entity.prefab.instanceId,
                  ),
                }
              : undefined,
            tileLayers: entity.tileLayers?.map(tileLayerId),
          },
        ];
      }),
      timelines: slice.serial
        ? source.timelines?.map((timeline) => ({
            ...timeline,
            id: timelineIds.get(timeline.id)!,
            tracks: timeline.tracks.map((track) => ({
              ...track,
              entityId: entityIds.get(track.entityId)!,
            })),
          }))
        : source.timelines,
      tilemap: slice.serial
        ? {
            ...source.tilemap,
            layers: source.tilemap.layers?.map((layer) => ({
              ...layer,
              id: tileLayerId(layer.id),
              layerId: layerId(layer.layerId),
            })),
          }
        : source.tilemap,
    };
    this.mountedCache.set(slice, result);
    return result;
  }

  private carry(slice: Mounted) {
    const { entities, scope } = this.materialize(slice);
    const byId = new Map(entities.map((entity) => [entity.id, entity]));
    const rooted = new Map<string, string>();
    const rootOf = (entity: Entity) => {
      const visited: string[] = [];
      while (true) {
        const known = rooted.get(entity.id);
        const parent = entity.parentId && byId.get(entity.parentId);
        if (known || !parent) {
          const root = known ?? entity.id;
          for (const id of visited) rooted.set(id, root);
          return root;
        }
        visited.push(entity.id);
        entity = parent;
      }
    };
    const roots = new Set(
      entities.filter(({ persistent }) => persistent).map(rootOf),
    );
    if (!roots.size) return;
    let carried = this.carried.get(slice.id);
    if (!carried) {
      carried = new Map();
      this.carried.set(slice.id, carried);
    }
    for (const [original, id] of scope.entities) {
      const entity = byId.get(id);
      if (entity && roots.has(rootOf(entity))) carried.set(original, entity);
    }
    this.mountedCache.delete(slice);
    const prepared = this.prepared.get(slice.id);
    if (prepared) this.mountedCache.delete(prepared);
  }

  compose(): Scene {
    this.scopes.clear();
    const primary = this.loaded.get(this.primary)!;
    const ordered = [
      primary,
      ...[...this.loaded.values()].filter((slice) => slice !== primary),
    ];
    const main = this.materialize(primary);
    if (ordered.length === 1 && !this.carried.size && !primary.serial) {
      this.tileSources = [];
      return primary.source;
    }
    const layers: Scene["layers"] = [];
    const entities: Entity[] = [];
    const timelines: NonNullable<Scene["timelines"]> = [];
    this.tileSources = ordered.map((slice) => {
      const material = this.materialize(slice);
      for (const entity of material.entities) {
        entities.push(entity);
        this.scopes.set(entity.id, material.scope);
      }
      const layerIndex = layers.length;
      layers.push(...material.layers);
      timelines.push(...(material.timelines ?? []));
      return { map: material.tilemap, offset: slice.offset, layerIndex };
    });
    for (const [sceneId, carried] of this.carried) {
      const loaded = this.loaded.get(sceneId);
      const scope = loaded
        ? this.materialize(loaded).scope
        : {
            sceneId,
            name:
              this.project.scenes.find(({ id }) => id === sceneId)?.name ??
              sceneId,
            entities: new Map(
              [...carried].map(([original, entity]) => [original, entity.id]),
            ),
            timelines: new Map<string, string>(),
          };
      for (const entity of carried.values()) {
        this.scopes.set(entity.id, scope);
        entities.push({
          ...entity,
          tileLayers: undefined,
          layerId: main.layers[0].id,
        });
      }
    }
    const { source, offset } = primary;
    return {
      ...source,
      layers,
      entities,
      timelines,
      camera: {
        ...source.camera,
        x: source.camera.x + offset.x,
        y: source.camera.y + offset.y,
        follow: source.camera.follow
          ? (main.scope.entities.get(source.camera.follow) ?? null)
          : null,
        bounds: source.camera.bounds
          ? {
              ...source.camera.bounds,
              x: source.camera.bounds.x + offset.x,
              y: source.camera.bounds.y + offset.y,
            }
          : undefined,
      },
      tilemap: main.tilemap,
    };
  }
}
