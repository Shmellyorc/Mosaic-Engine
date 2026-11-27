import { useSyncExternalStore } from "react";
import type { Renderer } from "@mosaic/render";
import type { Game } from "@mosaic/runtime";

type FrameSample = {
  frame: number;
  simulation: number;
  build: number;
  draw: number;
};
type Details = {
  backend: string;
  draws: number;
  entities: number;
  candidates: number;
  chunks: number;
  textures?: ReturnType<NonNullable<Renderer["metrics"]>>;
};
const capacity = 180;
const buffer: FrameSample[] = [];
const listeners = new Set<() => void>();
let cursor = 0;
let simulation = 0;
let reloads = 0;
let lastReload = 0;
let previous = 0;
let publishedAt = 0;
let snapshot = {
  frames: [] as FrameSample[],
  details: undefined as Details | undefined,
  reloads: 0,
  lastReload: 0,
};
function samples() {
  return buffer.length === capacity
    ? [...buffer.slice(cursor), ...buffer.slice(0, cursor)]
    : buffer.slice();
}
function publish(details = snapshot.details) {
  snapshot = { frames: samples(), details, reloads, lastReload };
  for (const listener of listeners) listener();
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
const read = () => snapshot;
export function resetProfile() {
  buffer.length = 0;
  cursor = simulation = reloads = lastReload = previous = publishedAt = 0;
  snapshot = { frames: [], details: undefined, reloads: 0, lastReload: 0 };
  for (const listener of listeners) listener();
}
export function profileSimulation(ms: number) {
  simulation += ms;
}
export function profileReload(ms: number) {
  reloads++;
  lastReload = ms;
}
export function profileFrame(
  start: number,
  built: number,
  rendered: number,
  renderer: Renderer,
  backend: string,
  draws: number,
  game: Game,
) {
  if (previous && start - previous < 250) {
    buffer[cursor] = {
      frame: start - previous,
      simulation,
      build: built - start,
      draw: rendered - built,
    };
    cursor = (cursor + 1) % capacity;
  }
  previous = start;
  simulation = 0;
  if (start - publishedAt < 200) return;
  publishedAt = start;
  publish({
    backend,
    draws,
    ...game.renderMetrics(),
    textures: renderer.metrics?.(),
  });
}
function download() {
  const capture = { ...snapshot, frames: samples() };
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(capture, null, 2)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "mosaic-profile.json";
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const timings = [
  ["Frame interval", "frame"],
  ["Simulation", "simulation"],
  ["Build draw list", "build"],
  ["Submit to renderer", "draw"],
] as const;
export function ProfilerPanel() {
  const { frames, details, reloads, lastReload } = useSyncExternalStore(
    subscribe,
    read,
  );
  return (
    <div className="panel-body profiler-panel">
      <div className="system-toolbar">
        <button disabled={!frames.length} onClick={download}>
          Download capture
        </button>
        <button disabled={!frames.length} onClick={resetProfile}>
          Clear capture
        </button>
        <span role="status">
          {frames.length
            ? frames.length + " sampled frames"
            : "Play the scene to collect samples."}
        </span>
      </div>
      {details && frames.length > 0 && (
        <>
          <div className="profiler-trace" aria-label="Recent frame intervals">
            {frames.slice(-90).map((sample, i) => (
              <span
                key={i}
                title={sample.frame.toFixed(2) + " ms"}
                style={{ height: Math.min(100, sample.frame * 2.4) + "%" }}
              />
            ))}
          </div>
          <table className="profiler-timings">
            <thead>
              <tr>
                <th>CPU timing</th>
                <th>Latest</th>
                <th>95th percentile</th>
              </tr>
            </thead>
            <tbody>
              {timings.map(([label, key]) => {
                const sorted = frames
                  .map((frame) => frame[key])
                  .sort((a, b) => a - b);
                return (
                  <tr key={key}>
                    <th scope="row">{label}</th>
                    <td>{frames.at(-1)![key].toFixed(2)} ms</td>
                    <td>
                      {sorted[Math.ceil(sorted.length * 0.95) - 1].toFixed(2)}{" "}
                      ms
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <dl className="profiler-counters">
            <dt>Renderer</dt>
            <dd>{details.backend}</dd>
            <dt>Draw commands</dt>
            <dd>{details.draws}</dd>
            <dt>Entity candidates</dt>
            <dd>
              {details.candidates} / {details.entities}
            </dd>
            <dt>Resident tile chunks</dt>
            <dd>{details.chunks}</dd>
            {details.textures && (
              <>
                <dt>Texture cache</dt>
                <dd>
                  {details.textures.resident} resident ·{" "}
                  {details.textures.decoding} decoding ·{" "}
                  {(details.textures.bytes / 1048576).toFixed(1)} MiB ·{" "}
                  {details.textures.evicted} evicted
                </dd>
              </>
            )}
            <dt>Live reloads</dt>
            <dd>
              {reloads}
              {reloads > 0 && " · " + lastReload.toFixed(2) + " ms last"}
            </dd>
          </dl>
        </>
      )}
    </div>
  );
}
