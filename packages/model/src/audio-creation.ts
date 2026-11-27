import { z } from "zod";
import type { Project } from "./index";
import { MASTER_BUS } from "./effects";

const id = z.string().min(1).max(100);
const unit = z.number().min(0).max(1);
const base = {
  id,
  name: z.string().trim().min(1).max(100),
  bus: id,
  gain: unit,
  loop: z.boolean(),
};
export const waves = [
  "sine",
  "triangle",
  "square",
  "pulse",
  "saw",
  "noise",
] as const;
export const trackerEffects = [
  "none",
  "slide",
  "vibrato",
  "tremolo",
  "echo",
  "cut",
] as const;
export const soundPatchSchema = z.object({
  ...base,
  wave: z.enum(waves),
  note: z.number().int().min(12).max(108),
  duration: z.number().min(0.03).max(8),
  pulse: z.number().min(0.05).max(0.95),
  attack: z.number().min(0).max(2),
  decay: z.number().min(0).max(4),
  sustain: unit,
  release: z.number().min(0).max(4),
  sweep: z.number().min(-36).max(36),
  vibrato: z.number().min(0).max(5),
  cutoff: z.number().min(70).max(10000),
  echo: unit,
  seed: z.number().int().min(1).max(2147483647),
});
const trackerCellSchema = z.object({
  note: z.number().int().min(12).max(108),
  velocity: unit,
  effect: z.enum(trackerEffects),
  amount: unit,
});
const trackerTrackSchema = z.object({
  id,
  name: base.name,
  instrumentId: id,
  gain: unit,
  pan: z.number().min(-1).max(1),
  muted: z.boolean(),
});
const trackerPatternSchema = z.object({
  id,
  name: base.name,
  rows: z.number().int().min(1).max(64),
  notes: z
    .array(
      z.object({
        track: id,
        row: z.number().int().min(0).max(63),
        cell: trackerCellSchema,
      }),
    )
    .max(1024),
});
export const trackerSchema = z.object({
  ...base,
  tempo: z.number().int().min(40).max(240),
  rowsPerBeat: z.number().int().min(1).max(8),
  tracks: z.array(trackerTrackSchema).min(1).max(16),
  patterns: z.array(trackerPatternSchema).min(1).max(48),
  order: z.array(id).min(1).max(96),
});
export const audioCreationSchema = z.object({
  patches: z.array(soundPatchSchema).max(128),
  songs: z.array(trackerSchema).max(48),
});
export type AudioCreation = z.infer<typeof audioCreationSchema>;
export type SoundPatch = z.infer<typeof soundPatchSchema>;
export type TrackerSong = z.infer<typeof trackerSchema>;
export type TrackerCell = z.infer<typeof trackerCellSchema>;
export type TrackerPattern = z.infer<typeof trackerPatternSchema>;
export const audioAssets = (
  project: Pick<Project, "mixer" | "audioCreation">,
) => [
  ...(project.mixer?.sounds ?? []),
  ...(project.audioCreation?.patches ?? []),
  ...(project.audioCreation?.songs ?? []),
];
export const MAX_TRACKER_SECONDS = 90;
export const trackerSeconds = (song: TrackerSong) => {
  const rows = new Map(song.patterns.map(({ id, rows }) => [id, rows]));
  return (
    (song.order.reduce((total, id) => total + (rows.get(id) ?? 0), 0) * 60) /
    song.tempo /
    song.rowsPerBeat
  );
};
export function validateAudioCreation(
  project: Pick<Project, "mixer" | "audioCreation">,
) {
  const audio = project.audioCreation;
  if (!audio) return;
  const ids = new Set<string>();
  const buses = new Set([
    MASTER_BUS,
    ...(project.mixer?.buses.map(({ id }) => id) ?? []),
  ]);
  for (const asset of audioAssets(project)) {
    if (ids.has(asset.id) || !buses.has(asset.bus))
      throw new Error(
        `Audio "${asset.name}" has a duplicate ID or missing bus.`,
      );
    ids.add(asset.id);
  }
  const patches = new Set(audio.patches.map(({ id }) => id));
  for (const song of audio.songs) {
    const tracks = new Set(song.tracks.map(({ id }) => id));
    const patterns = new Set(song.patterns.map(({ id }) => id));
    if (
      tracks.size !== song.tracks.length ||
      patterns.size !== song.patterns.length ||
      song.tracks.some(({ instrumentId }) => !patches.has(instrumentId)) ||
      song.order.some((id) => !patterns.has(id))
    )
      throw new Error(
        `Song "${song.name}" has a missing or duplicate track, instrument, or pattern.`,
      );
    if (trackerSeconds(song) > MAX_TRACKER_SECONDS)
      throw new Error(
        `Song "${song.name}" exceeds ${MAX_TRACKER_SECONDS} seconds.`,
      );
    for (const pattern of song.patterns) {
      const seen = new Set<string>();
      for (const note of pattern.notes) {
        const key = JSON.stringify([note.track, note.row]);
        if (
          seen.has(key) ||
          !tracks.has(note.track) ||
          note.row >= pattern.rows
        )
          throw new Error(
            `Pattern "${pattern.name}" has an invalid or duplicate note cell.`,
          );
        seen.add(key);
      }
    }
  }
}
export const patchPresets = {
  "Glass Bell": {
    wave: "sine",
    note: 76,
    duration: 0.63,
    attack: 0.008,
    decay: 0.22,
    sustain: 0.24,
    release: 0.21,
    sweep: 0,
    cutoff: 5200,
    echo: 0.28,
  },
  "Circuit Blip": {
    wave: "pulse",
    note: 60,
    duration: 0.19,
    attack: 0.006,
    decay: 0.09,
    sustain: 0.12,
    release: 0.07,
    sweep: 9,
    cutoff: 4300,
    echo: 0,
  },
  "Dust Kick": {
    wave: "triangle",
    note: 48,
    duration: 0.24,
    attack: 0.002,
    decay: 0.11,
    sustain: 0.25,
    release: 0.09,
    sweep: -24,
    cutoff: 1400,
    echo: 0,
  },
  "Shore Wind": {
    wave: "noise",
    note: 44,
    duration: 1.8,
    attack: 0.3,
    decay: 0.4,
    sustain: 0.6,
    release: 0.52,
    sweep: 0,
    cutoff: 540,
    echo: 0.19,
  },
} satisfies Record<string, Partial<SoundPatch>>;
export type PatchPreset = keyof typeof patchPresets;
export function createPatch(
  id: string,
  name: string,
  preset: PatchPreset = "Glass Bell",
): SoundPatch {
  return {
    id,
    name,
    bus: MASTER_BUS,
    gain: 0.7,
    loop: false,
    pulse: 0.25,
    vibrato: 0,
    seed: 71,
    ...patchPresets[preset],
  };
}
export function varyPatch(patch: SoundPatch): SoundPatch {
  const seed = Math.imul(patch.seed, 48271) >>> 1 || 1;
  const fraction = (seed % 97) / 96;
  const clamp = (value: number, low: number, high: number) =>
    Math.min(high, Math.max(low, value));
  return {
    ...patch,
    seed,
    note: clamp(patch.note + Math.round(10 * fraction - 5), 12, 108),
    sweep: clamp(patch.sweep + 7 * fraction - 3.5, -36, 36),
    pulse: clamp(patch.pulse + 0.32 * fraction - 0.16, 0.05, 0.95),
    cutoff: clamp(patch.cutoff * (0.65 + fraction * 0.65), 70, 10000),
  };
}
