import type { Rect } from "./tiles";

type Cells = { left: number; right: number; top: number; bottom: number };
const same = (a: Cells, b: Cells) =>
  a.left === b.left &&
  a.right === b.right &&
  a.top === b.top &&
  a.bottom === b.bottom;

// A sparse grid with an overflow bucket for bounds that span many cells.
export class SpatialGrid<T> {
  private buckets = new Map<number, Map<number, Set<T>>>();
  private bounds = new Map<T, Cells | null>();
  private overflow = new Set<T>();

  constructor(
    private size = 128,
    private maxCells = 64,
  ) {}

  private cells(rect: Rect): Cells | null {
    const left = Math.floor(rect.x / this.size);
    const top = Math.floor(rect.y / this.size);
    const right = Math.floor((rect.x + rect.width) / this.size);
    const bottom = Math.floor((rect.y + rect.height) / this.size);
    if (
      !Number.isSafeInteger(left) ||
      !Number.isSafeInteger(top) ||
      !Number.isSafeInteger(right) ||
      !Number.isSafeInteger(bottom) ||
      (right - left + 1) * (bottom - top + 1) > this.maxCells
    )
      return null;
    return { left, top, right, bottom };
  }

  update(item: T, rect: Rect) {
    const next = this.cells(rect);
    const previous = this.bounds.get(item);
    if (
      (previous === null && !next) ||
      (previous && next && same(previous, next))
    )
      return;
    this.remove(item);
    this.bounds.set(item, next);
    if (!next) {
      this.overflow.add(item);
      return;
    }
    for (let y = next.top; y <= next.bottom; y++) {
      let row = this.buckets.get(y);
      if (!row) {
        row = new Map();
        this.buckets.set(y, row);
      }
      for (let x = next.left; x <= next.right; x++) {
        let column = row.get(x);
        if (!column) {
          column = new Set();
          row.set(x, column);
        }
        column.add(item);
      }
    }
  }

  remove(item: T) {
    const previous = this.bounds.get(item);
    if (previous === undefined) return;
    this.bounds.delete(item);
    if (!previous) {
      this.overflow.delete(item);
      return;
    }
    for (let y = previous.top; y <= previous.bottom; y++) {
      const row = this.buckets.get(y)!;
      for (let x = previous.left; x <= previous.right; x++) {
        const column = row.get(x)!;
        column.delete(item);
        if (!column.size) row.delete(x);
      }
      if (!row.size) this.buckets.delete(y);
    }
  }

  query(rect: Rect, destination = new Set<T>()) {
    destination.clear();
    const cells = this.cells(rect);
    if (!cells) {
      for (const item of this.bounds.keys()) destination.add(item);
      return destination;
    }
    for (const item of this.overflow) destination.add(item);
    for (let y = cells.top; y <= cells.bottom; y++) {
      const row = this.buckets.get(y);
      if (!row) continue;
      for (let x = cells.left; x <= cells.right; x++) {
        const column = row.get(x);
        if (column) for (const item of column) destination.add(item);
      }
    }
    return destination;
  }
}
