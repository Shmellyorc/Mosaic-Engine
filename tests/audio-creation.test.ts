import { expect, test } from "vitest";
import {
  createPatch,
  createMixer,
  createProject,
  inspectWav,
  parseProject,
  serializeProject,
  varyPatch,
  type TrackerSong,
} from "@mosaic/model";
import {
  encodePcmWav,
  renderPatch,
  renderSong,
  SYNTH_RATE,
} from "@mosaic/runtime";

test("renders repeatable sound presets and varied waveforms to 16-bit PCM", () => {
  const patch = createPatch("wind", "Wind", "Shore Wind");
  const samples = renderPatch(patch);
  expect(samples).toEqual(renderPatch(patch));
  expect(renderPatch(varyPatch(patch))).not.toEqual(samples);
  const result = inspectWav(encodePcmWav([samples]));
  expect(result).toMatchObject({
    channels: 1,
    rate: SYNTH_RATE,
    frames: samples.length,
  });
  expect(samples.some((value) => Math.abs(value) > 0.1)).toBe(true);
});
test("renders a repeating stereo arrangement with more than four tracks and checks asset references", () => {
  const project = createProject();
  project.mixer = createMixer();
  project.mixer.buses.push({
    id: "score",
    name: "Score",
    gain: 0.8,
    muted: false,
  });
  const patch = createPatch("bell", "Bell");
  const tracks = Array.from({ length: 6 }, (_, i) => ({
    id: "track-" + i,
    name: "Track " + i,
    instrumentId: patch.id,
    gain: 0.25,
    pan: i % 2 ? 0.7 : -0.8,
    muted: false,
  }));
  const song: TrackerSong = {
    id: "song",
    name: "Theme",
    bus: "score",
    gain: 0.75,
    loop: true,
    tempo: 120,
    rowsPerBeat: 4,
    tracks,
    patterns: [
      {
        id: "pattern",
        name: "Pattern",
        rows: 8,
        notes: tracks.map(({ id }, i) => ({
          track: id,
          row: i,
          cell: {
            note: 60 + i,
            velocity: 1,
            effect: i % 2 ? "slide" : "echo",
            amount: 0.5,
          },
        })),
      },
    ],
    order: ["pattern", "pattern"],
  };
  project.audioCreation = { patches: [patch], songs: [song] };
  expect(parseProject(serializeProject(project)).audioCreation).toEqual(
    project.audioCreation,
  );
  const channels = renderSong(song, [patch]);
  expect(channels).toHaveLength(2);
  expect(channels.every((samples) => samples.length === SYNTH_RATE * 2)).toBe(
    true,
  );
  expect(channels[0]).not.toEqual(channels[1]);
  expect(channels[1].some((value) => Math.abs(value) > 0.1)).toBe(true);
  expect(inspectWav(encodePcmWav(channels))).toMatchObject({
    channels: 2,
    frames: SYNTH_RATE * 2,
  });
  song.tracks[0].instrumentId = "missing";
  expect(() => serializeProject(project)).toThrow(/instrument/);
});
