import { useMemo } from "react";
import type { Entity, Scene } from "@mosaic/model";
import {
  bodyRect,
  entityCenter,
  NavigationGrid,
  TileWorld,
  type Camera,
  type Game,
} from "@mosaic/runtime";
import type { WorldTool } from "./world";

type Props = {
  tool: WorldTool;
  scene: Scene;
  selected?: Entity;
  width: number;
  height: number;
  camera: Camera;
  game: Game;
};
export function WorldOverlay({
  tool,
  scene,
  selected,
  width,
  height,
  camera,
  game,
}: Props) {
  const grid = useMemo(
    () =>
      tool === "Physics" || tool === "Navigation"
        ? new TileWorld(scene.tilemap)
        : undefined,
    [scene.tilemap, tool],
  );
  const nav = useMemo(
    () =>
      grid && tool === "Navigation"
        ? new NavigationGrid(grid, scene.entities)
        : undefined,
    [grid, scene.entities, tool],
  );
  const agent = selected?.navigation;
  const target = agent?.target
    ? scene.entities.find((item) => item.id === agent.target)
    : undefined;
  const goal = useMemo(
    () => (target ? entityCenter(target) : agent),
    [target, agent],
  );
  const from = useMemo(() => selected && entityCenter(selected), [selected]);
  const path = useMemo(
    () => (nav && from && goal ? nav.path(from, goal, selected?.body) : []),
    [nav, from, goal, selected?.body],
  );
  const x = (value: number) => width / 2 + (value - camera.x) * camera.zoom;
  const y = (value: number) => height / 2 + (value - camera.y) * camera.zoom;

  if (tool === "Physics" && grid) {
    let tileOutline = "";
    const step = grid.map.size * camera.zoom;
    if (step >= 4)
      grid.solids(
        {
          x: camera.x - width / (2 * camera.zoom),
          y: camera.y - height / (2 * camera.zoom),
          width: width / camera.zoom,
          height: height / camera.zoom,
        },
        (tile) => {
          tileOutline += `M${x(tile.x)} ${y(tile.y)}h${step}v${step}h-${step}Z`;
        },
      );
    return (
      <g className="world-overlay" data-testid="physics-overlay">
        <path
          d={tileOutline}
          fill="#ff77772c"
          stroke="#ff7777"
          strokeWidth={1}
        />
        {scene.entities.flatMap((entity) => {
          if (!entity.body) return [];
          const rect = bodyRect(
            entity as Entity & { body: NonNullable<Entity["body"]> },
          );
          const color =
            entity.body.kind === "sensor"
              ? "#f6d778"
              : entity.id === selected?.id
                ? "#8ef6da"
                : "#a492ff";
          return [
            <rect
              key={entity.id}
              x={x(rect.x)}
              y={y(rect.y)}
              width={rect.width * camera.zoom}
              height={rect.height * camera.zoom}
              fill={color + "20"}
              stroke={color}
              strokeWidth={1.5}
              strokeDasharray={
                entity.body.kind === "sensor" ? "4 3" : undefined
              }
            />,
          ];
        })}
      </g>
    );
  }
  if (tool === "Cameras") {
    const bounds = scene.camera.bounds;
    const live = game.view();
    const center = { x: x(live.x), y: y(live.y) };
    const zone = scene.camera.deadZone;
    return (
      <g className="world-overlay" data-testid="camera-overlay" fill="none">
        {bounds && (
          <rect
            x={x(bounds.x)}
            y={y(bounds.y)}
            width={bounds.width * camera.zoom}
            height={bounds.height * camera.zoom}
            stroke="#a7b9ff"
            strokeWidth={2}
            strokeDasharray="6 4"
          />
        )}
        <rect
          x={x(live.x - width / (2 * live.zoom))}
          y={y(live.y - height / (2 * live.zoom))}
          width={(width / live.zoom) * camera.zoom}
          height={(height / live.zoom) * camera.zoom}
          stroke="#dfc8ff"
          strokeWidth={2}
        />
        <path
          d={`M ${center.x - 8} ${center.y} h16 M ${center.x} ${center.y - 8} v16`}
          stroke="#dfc8ff"
          strokeWidth={2}
        />
        {zone && (
          <rect
            x={center.x - ((zone.width / 2) * camera.zoom) / live.zoom}
            y={center.y - ((zone.height / 2) * camera.zoom) / live.zoom}
            width={(zone.width * camera.zoom) / live.zoom}
            height={(zone.height * camera.zoom) / live.zoom}
            stroke="#82e6dd"
            fill="#82e6dd16"
            strokeDasharray="4 3"
          />
        )}
      </g>
    );
  }
  if (tool === "Navigation" && from && goal)
    return (
      <g className="world-overlay" data-testid="navigation-overlay">
        {path.length > 0 && (
          <polyline
            points={[from, ...path].map((p) => `${x(p.x)},${y(p.y)}`).join(" ")}
            fill="none"
            stroke="#89f0cf"
            strokeWidth={2.5}
            strokeLinejoin="round"
          />
        )}
        <circle cx={x(from.x)} cy={y(from.y)} r={4} fill="#89f0cf" />
        <circle
          cx={x(goal.x)}
          cy={y(goal.y)}
          r={6}
          fill="none"
          stroke={path.length ? "#edcd8c" : "#ff859b"}
          strokeWidth={2}
        />
      </g>
    );
  if (tool === "Lighting")
    return (
      <g className="world-overlay" data-testid="lighting-overlay">
        {scene.entities.flatMap((entity) => {
          if (!entity.light || entity.id !== selected?.id) return [];
          const p = game.worldPoint(entity.id) ?? entity.transform;
          return [
            <circle
              key={entity.id}
              cx={x(p.x)}
              cy={y(p.y)}
              r={entity.light.radius * camera.zoom}
              fill="none"
              stroke={entity.light.color}
              strokeWidth={1.25}
              strokeDasharray="5 4"
            />,
          ];
        })}
      </g>
    );
  return null;
}
