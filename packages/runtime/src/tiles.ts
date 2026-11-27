import type { Frame, Scene, Terrain, Tile, TileLayer } from "@mosaic/model";

export type Point = { x: number; y: number };
export type Rect = Point & { width: number; height: number };
export const TILE_CHUNK_SIZE = 16;
export const RESIDENT_TILE_CHUNKS = 32;
export const NORTH = 1,
  EAST = 2,
  SOUTH = 4,
  WEST = 8;

export class TileGrid {
  private chunks = new Map<number, Tile[]>();
  private loaded = new Map<number, Map<number, Tile>>();
  private lastKey = -1;
  private lastChunk?: Map<number, Tile>;
  get residentChunks() {
    return this.loaded.size;
  }
  private stride: number;
  private masks = new WeakMap<Tile, number>();
  constructor(
    readonly width: number,
    readonly height: number,
    readonly size: number,
    tiles: Tile[],
  ) {
    this.stride = Math.ceil(width / TILE_CHUNK_SIZE);
    for (const tile of tiles) {
      const key = this.chunkKey(tile.x, tile.y);
      let chunk = this.chunks.get(key);
      if (!chunk) {
        chunk = [];
        this.chunks.set(key, chunk);
      }
      chunk.push(tile);
    }
  }
  private chunkKey(x: number, y: number) {
    return (
      Math.floor(y / TILE_CHUNK_SIZE) * this.stride +
      Math.floor(x / TILE_CHUNK_SIZE)
    );
  }
  private load(key: number) {
    if (key === this.lastKey) return this.lastChunk;
    this.lastKey = key;
    this.lastChunk = undefined;
    const cached = this.loaded.get(key);
    if (cached) {
      this.loaded.delete(key);
      this.loaded.set(key, cached);
      this.lastChunk = cached;
      return cached;
    }
    const source = this.chunks.get(key);
    if (!source) return undefined;
    const indexed = new Map(
      source.map((tile) => [tile.y * this.width + tile.x, tile]),
    );
    const oldest = this.loaded.keys().next();
    if (this.loaded.size >= RESIDENT_TILE_CHUNKS && !oldest.done)
      this.loaded.delete(oldest.value);
    this.loaded.set(key, indexed);
    this.lastChunk = indexed;
    return indexed;
  }
  at(x: number, y: number) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return undefined;
    return this.load(this.chunkKey(x, y))?.get(y * this.width + x);
  }
  forArea(rect: Rect, use: (tile: Tile) => void) {
    if (!this.chunks.size) return;
    const s = this.size;
    const left = Math.max(0, Math.floor(rect.x / s));
    const top = Math.max(0, Math.floor(rect.y / s));
    // Include boundary cells for sweeps. Rendering clips them at the viewport.
    const right = Math.min(
      this.width - 1,
      Math.floor((rect.x + rect.width) / s),
    );
    const bottom = Math.min(
      this.height - 1,
      Math.floor((rect.y + rect.height) / s),
    );
    if (left > right || top > bottom) return;
    const n = TILE_CHUNK_SIZE;
    for (let cy = Math.floor(top / n); cy <= Math.floor(bottom / n); cy++) {
      for (let cx = Math.floor(left / n); cx <= Math.floor(right / n); cx++) {
        const chunk = this.load(cy * this.stride + cx);
        if (!chunk) continue;
        for (const tile of chunk.values()) {
          if (
            tile.x >= left &&
            tile.x <= right &&
            tile.y >= top &&
            tile.y <= bottom
          )
            use(tile);
        }
      }
    }
  }
  mask(tile: Tile) {
    const { x, y, terrainId } = tile;
    if (!terrainId) return 0;
    const saved = this.masks.get(tile);
    if (saved !== undefined) return saved;
    const mask =
      (this.at(x, y - 1)?.terrainId === terrainId ? NORTH : 0) |
      (this.at(x + 1, y)?.terrainId === terrainId ? EAST : 0) |
      (this.at(x, y + 1)?.terrainId === terrainId ? SOUTH : 0) |
      (this.at(x - 1, y)?.terrainId === terrainId ? WEST : 0);
    this.masks.set(tile, mask);
    return mask;
  }
}

export function autotileFrame(
  atlas: NonNullable<Terrain["atlas"]>,
  neighbors: number,
): Frame {
  const index = atlas.first + neighbors;
  return {
    x: (index % atlas.columns) * atlas.size,
    y: Math.floor(index / atlas.columns) * atlas.size,
    w: atlas.size,
    h: atlas.size,
  };
}

export type TileSource = {
  map: Scene["tilemap"];
  offset: Point;
  layerIndex: number;
};
type TilePart = { world: TileWorld; offset: Point; layerIndex: number };
export class TileWorld {
  readonly parts: TilePart[];
  readonly navigationMap: Pick<Scene["tilemap"], "width" | "height" | "size">;
  readonly legacy: TileGrid;
  readonly layers: { definition: TileLayer; grid: TileGrid }[];
  private terrains: Map<string, Terrain>;
  constructor(
    readonly map: Scene["tilemap"],
    private enabled: (layerId: string) => boolean = () => true,
    sources: TileSource[] = [],
  ) {
    const grid = (tiles: Tile[]) =>
      new TileGrid(map.width, map.height, map.size, tiles);
    this.legacy = grid(map.tiles);
    this.layers = (map.layers ?? []).map((definition) => ({
      definition,
      grid: grid(definition.tiles),
    }));
    this.parts = sources.map(({ map, offset, layerIndex }) => ({
      world: new TileWorld(map, enabled),
      offset,
      layerIndex,
    }));
    const width = Math.max(
      map.width,
      ...sources.map((source) =>
        Math.ceil(
          (source.offset.x + source.map.width * source.map.size) / map.size,
        ),
      ),
    );
    const height = Math.max(
      map.height,
      ...sources.map((source) =>
        Math.ceil(
          (source.offset.y + source.map.height * source.map.size) / map.size,
        ),
      ),
    );
    // Navigation keeps a bounded dense grid. Rendering and collision retain independent sparse grids.
    this.navigationMap =
      width * height <= 1048576 ? { width, height, size: map.size } : map;
    this.terrains = new Map(
      (map.terrains ?? []).map((terrain) => [terrain.id, terrain]),
    );
  }
  terrain(tile: Tile) {
    return tile.terrainId ? this.terrains.get(tile.terrainId) : undefined;
  }
  solid(tile: Tile) {
    return tile.solid ?? this.terrain(tile)?.solid ?? false;
  }
  cost(tile: Tile) {
    return tile.cost ?? this.terrain(tile)?.cost ?? 1;
  }
  solids(area: Rect, visit: (rect: Rect) => void) {
    if (this.parts.length) {
      for (const { world, offset } of this.parts)
        world.solids(
          { ...area, x: area.x - offset.x, y: area.y - offset.y },
          (rect) =>
            visit({ ...rect, x: rect.x + offset.x, y: rect.y + offset.y }),
        );
      return;
    }
    const { size } = this.map;
    const use = (tile: Tile) => {
      if (this.solid(tile))
        visit({
          x: tile.x * size,
          y: tile.y * size,
          width: size,
          height: size,
        });
    };
    this.legacy.forArea(area, use);
    for (const { definition, grid } of this.layers)
      if (definition.collision && this.enabled(definition.id))
        grid.forArea(area, use);
  }
  navigationCost(x: number, y: number) {
    if (this.parts.length) {
      const wx = (x + 0.5) * this.map.size;
      const wy = (y + 0.5) * this.map.size;
      let cost = 1;
      for (const { world, offset } of this.parts) {
        const weight = world.navigationCost(
          Math.floor((wx - offset.x) / world.map.size),
          Math.floor((wy - offset.y) / world.map.size),
        );
        if (!weight) return 0;
        cost = Math.max(cost, weight);
      }
      return cost;
    }
    let cost = 1;
    const base = this.legacy.at(x, y);
    if (base) {
      if (this.solid(base)) return 0;
      cost = this.cost(base);
    }
    for (const { definition, grid } of this.layers) {
      if (!this.enabled(definition.id)) continue;
      const tile = grid.at(x, y);
      if (!tile) continue;
      if (definition.collision && this.solid(tile)) return 0;
      if (definition.navigation) cost = Math.max(cost, this.cost(tile));
    }
    return cost;
  }
}
