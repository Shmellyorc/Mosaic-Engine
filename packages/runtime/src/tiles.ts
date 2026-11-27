import type { Frame, Scene, Terrain, Tile, TileLayer } from "@mosaic/model";

export type Point = { x: number; y: number };
export type Rect = Point & { width: number; height: number };
export const TILE_CHUNK_SIZE = 16;
export const NORTH = 1,
  EAST = 2,
  SOUTH = 4,
  WEST = 8;

export class TileGrid {
  private chunks = new Map<number, Map<number, Tile>>();
  private stride: number;
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
        chunk = new Map();
        this.chunks.set(key, chunk);
      }
      chunk.set(tile.y * width + tile.x, tile);
    }
  }
  private chunkKey(x: number, y: number) {
    return (
      Math.floor(y / TILE_CHUNK_SIZE) * this.stride +
      Math.floor(x / TILE_CHUNK_SIZE)
    );
  }
  at(x: number, y: number) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return undefined;
    return this.chunks.get(this.chunkKey(x, y))?.get(y * this.width + x);
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
        const chunk = this.chunks.get(cy * this.stride + cx);
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
    return (
      (this.at(x, y - 1)?.terrainId === terrainId ? NORTH : 0) |
      (this.at(x + 1, y)?.terrainId === terrainId ? EAST : 0) |
      (this.at(x, y + 1)?.terrainId === terrainId ? SOUTH : 0) |
      (this.at(x - 1, y)?.terrainId === terrainId ? WEST : 0)
    );
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

export class TileWorld {
  readonly legacy: TileGrid;
  readonly layers: { definition: TileLayer; grid: TileGrid }[];
  private terrains: Map<string, Terrain>;
  constructor(readonly map: Scene["tilemap"]) {
    const grid = (tiles: Tile[]) =>
      new TileGrid(map.width, map.height, map.size, tiles);
    this.legacy = grid(map.tiles);
    this.layers = (map.layers ?? []).map((definition) => ({
      definition,
      grid: grid(definition.tiles),
    }));
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
      if (definition.collision) grid.forArea(area, use);
  }
  navigationCost(x: number, y: number) {
    let cost = 1;
    const base = this.legacy.at(x, y);
    if (base) {
      if (this.solid(base)) return 0;
      cost = this.cost(base);
    }
    for (const { definition, grid } of this.layers) {
      const tile = grid.at(x, y);
      if (!tile) continue;
      if (definition.collision && this.solid(tile)) return 0;
      if (definition.navigation) cost = Math.max(cost, this.cost(tile));
    }
    return cost;
  }
}
