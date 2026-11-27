import type { Scene } from "@mosaic/model";
import type { Point } from "./tiles";

type Configuration = Scene["camera"];
export type Camera = Point & { zoom: number };

function clampAxis(
  value: number,
  origin: number,
  size: number,
  halfView: number,
) {
  if (size <= halfView * 2) return origin + size / 2;
  return Math.min(origin + size - halfView, Math.max(origin + halfView, value));
}

export function cameraView(
  config: Configuration,
  target: Point | undefined,
  width: number,
  height: number,
  previous?: Camera,
  seconds = 0,
): Camera {
  let x = target ? target.x + (config.offsetX ?? 0) : config.x;
  let y = target ? target.y + config.offsetY : config.y;
  if (target && previous) {
    const w = (config.deadZone?.width ?? 0) / (2 * config.zoom);
    const h = (config.deadZone?.height ?? 0) / (2 * config.zoom);
    const edge = (point: number, center: number, radius: number) =>
      Math.min(point + radius, Math.max(center, point - radius));
    x = edge(x, previous.x, w);
    y = edge(y, previous.y, h);
    const factor = config.damping ? 1 - Math.exp(-config.damping * seconds) : 1;
    x = previous.x + (x - previous.x) * factor;
    y = previous.y + (y - previous.y) * factor;
  }
  if (config.bounds) {
    x = clampAxis(
      x,
      config.bounds.x,
      config.bounds.width,
      width / (2 * config.zoom),
    );
    y = clampAxis(
      y,
      config.bounds.y,
      config.bounds.height,
      height / (2 * config.zoom),
    );
  }
  return { x, y, zoom: config.zoom };
}
