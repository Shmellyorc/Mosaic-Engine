import type { Entity } from "@mosaic/model";
import { bodyRect, overlaps, type PhysicsWorld } from "./physics";
import { type Point, type Rect, type TileWorld } from "./tiles";

type Step = { index: number; cost: number; priority: number };
class OpenSet {
  items: Step[] = [];
  push(step: Step) {
    let at = this.items.length;
    this.items.push(step);
    while (at > 0) {
      const parent = (at - 1) >> 1;
      if (this.items[parent].priority <= step.priority) break;
      this.items[at] = this.items[parent];
      at = parent;
    }
    this.items[at] = step;
  }
  pop() {
    const first = this.items[0];
    const last = this.items.pop()!;
    if (!this.items.length) return first;
    let at = 0;
    while (at * 2 + 1 < this.items.length) {
      let child = at * 2 + 1;
      if (
        child + 1 < this.items.length &&
        this.items[child + 1].priority < this.items[child].priority
      )
        child++;
      if (this.items[child].priority >= last.priority) break;
      this.items[at] = this.items[child];
      at = child;
    }
    this.items[at] = last;
    return first;
  }
}

export function entityCenter(entity: Entity): Point {
  const rect = entity.body
    ? bodyRect(entity as Entity & { body: NonNullable<Entity["body"]> })
    : entity.transform;
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}
export class NavigationGrid {
  private grids = new Map<string, Float32Array>();
  private statics: Rect[];
  constructor(
    private tiles: TileWorld,
    entities: Entity[] = [],
  ) {
    this.statics = entities.flatMap((entity) =>
      entity.body?.kind === "static" && !entity.parentId
        ? [bodyRect(entity as Entity & { body: NonNullable<Entity["body"]> })]
        : [],
    );
  }
  private costs(width: number, height: number) {
    const key = width + "," + height;
    const cached = this.grids.get(key);
    if (cached) return cached;
    const { width: cols, height: rows, size } = this.tiles.map;
    const costs = new Float32Array(cols * rows);
    const cover = new Uint8Array(cols * rows);
    for (const rect of this.statics) {
      const left = Math.max(0, Math.floor((rect.x - width / 2) / size));
      const top = Math.max(0, Math.floor((rect.y - height / 2) / size));
      const right = Math.min(
        cols - 1,
        Math.floor((rect.x + rect.width + width / 2) / size),
      );
      const bottom = Math.min(
        rows - 1,
        Math.floor((rect.y + rect.height + height / 2) / size),
      );
      for (let y = top; y <= bottom; y++)
        for (let x = left; x <= right; x++) {
          const actor = {
            x: (x + 0.5) * size - width / 2,
            y: (y + 0.5) * size - height / 2,
            width,
            height,
          };
          if (overlaps(actor, rect)) cover[y * cols + x] = 1;
        }
    }
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        if (cover[i]) continue;
        const cost = this.tiles.navigationCost(x, y);
        if (!cost) continue;
        const actor = {
          x: (x + 0.5) * size - width / 2,
          y: (y + 0.5) * size - height / 2,
          width,
          height,
        };
        if (
          actor.x < 0 ||
          actor.y < 0 ||
          actor.x + width > cols * size ||
          actor.y + height > rows * size
        )
          continue;
        let blocked = false;
        if (width > size || height > size)
          this.tiles.solids(actor, (solid) => {
            if (overlaps(actor, solid)) blocked = true;
          });
        if (!blocked) costs[i] = cost;
      }
    if (this.grids.size >= 8)
      this.grids.delete(this.grids.keys().next().value!);
    this.grids.set(key, costs);
    return costs;
  }
  cell(point: Point) {
    const { width, height, size } = this.tiles.map;
    const x = Math.floor(point.x / size),
      y = Math.floor(point.y / size);
    return x < 0 || y < 0 || x >= width || y >= height ? -1 : y * width + x;
  }
  path(
    from: Point,
    to: Point,
    body?: { width: number; height: number },
  ): Point[] {
    const { width, height, size } = this.tiles.map;
    const start = this.cell(from),
      goal = this.cell(to);
    if (start < 0 || goal < 0) return [];
    const costs = this.costs(body?.width ?? 1, body?.height ?? 1);
    if (!costs[start] || !costs[goal]) return [];
    const center = (key: number) => ({
      x: ((key % width) + 0.5) * size,
      y: (Math.floor(key / width) + 0.5) * size,
    });
    if (start === goal) return [center(start)];
    const dist = new Float64Array(costs.length).fill(Infinity);
    const previous = new Int32Array(costs.length).fill(-1);
    const open = new OpenSet();
    const gx = goal % width,
      gy = Math.floor(goal / width);
    const heuristic = (x: number, y: number) =>
      Math.abs(x - gx) + Math.abs(y - gy);
    dist[start] = 0;
    open.push({
      index: start,
      cost: 0,
      priority: heuristic(start % width, Math.floor(start / width)),
    });
    function add(x: number, y: number, step: Step) {
      if (x < 0 || y < 0 || x >= width || y >= height) return;
      const i = y * width + x;
      if (!costs[i]) return;
      const cost = step.cost + costs[i];
      if (cost >= dist[i]) return;
      previous[i] = step.index;
      dist[i] = cost;
      open.push({ index: i, cost, priority: cost + heuristic(x, y) });
    }
    while (open.items.length) {
      const step = open.pop();
      if (step.cost !== dist[step.index]) continue;
      if (step.index === goal) {
        const path: Point[] = [];
        for (let at = goal; at >= 0; at = previous[at]) path.push(center(at));
        return path.reverse();
      }
      const x = step.index % width,
        y = Math.floor(step.index / width);
      add(x + 1, y, step);
      add(x, y + 1, step);
      add(x - 1, y, step);
      add(x, y - 1, step);
    }
    return [];
  }
}

export class NavigationWorld {
  private agents: {
    entity: Entity;
    goalCell: number;
    path: Point[];
    next: number;
  }[];
  private targets: Map<string, Entity>;
  constructor(
    private grid: NavigationGrid,
    entities: Entity[],
  ) {
    this.targets = new Map(entities.map((entity) => [entity.id, entity]));
    this.agents = entities
      .filter(
        (entity) =>
          entity.navigation?.enabled &&
          !entity.parentId &&
          entity.body?.kind !== "static",
      )
      .map((entity) => ({ entity, goalCell: -2, path: [], next: 0 }));
  }
  step(seconds: number, physics: PhysicsWorld) {
    for (const agent of this.agents) {
      const { entity } = agent;
      const configuration = entity.navigation!;
      const target =
        configuration.target && this.targets.get(configuration.target);
      const goal = target ? entityCenter(target) : configuration;
      const from = entityCenter(entity);
      const goalCell = this.grid.cell(goal);
      if (agent.goalCell !== goalCell) {
        agent.goalCell = goalCell;
        agent.path = this.grid.path(from, goal, entity.body);
        agent.next = 0;
      }
      let point = agent.path[agent.next];
      while (point && Math.hypot(point.x - from.x, point.y - from.y) < 0.001) {
        agent.next++;
        point = agent.path[agent.next];
      }
      if (!point) continue;
      const length = Math.hypot(point.x - from.x, point.y - from.y);
      const factor = Math.min(1, (configuration.speed * seconds) / length);
      const x = (point.x - from.x) * factor,
        y = (point.y - from.y) * factor;
      if (!physics.request(entity.id, x, y)) {
        entity.transform.x += x;
        entity.transform.y += y;
      }
    }
  }
}
