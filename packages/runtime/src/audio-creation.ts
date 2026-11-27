import {
  MAX_TRACKER_SECONDS,
  trackerSeconds,
  type SoundPatch,
  type TrackerCell,
  type TrackerSong,
} from "@mosaic/model";

export const SYNTH_RATE = 22050;
const tau = Math.PI * 2;
const clamp = (number: number) => Math.min(1, Math.max(-1, number));
function oscillator(
  wave: SoundPatch["wave"],
  phase: number,
  pulse: number,
  noise: number,
) {
  switch (wave) {
    case "sine":
      return Math.sin(phase * tau);
    case "triangle":
      return 1 - Math.abs(4 * phase - 2);
    case "square":
      return phase < 0.5 ? 1 : -1;
    case "pulse":
      return phase < pulse ? 1 : -1;
    case "saw":
      return phase * 2 - 1;
    case "noise":
      return noise;
  }
}

export function renderPatch(
  patch: SoundPatch,
  cell?: TrackerCell,
  gate = patch.duration,
): Float32Array {
  const duration = Math.max(0.01, gate);
  const release = Math.min(patch.release, duration * 0.6);
  const attack = Math.min(patch.attack, duration * 0.45);
  const decay = Math.min(patch.decay, Math.max(0, duration - attack - release));
  const echo =
    cell?.effect === "echo" ? Math.max(cell.amount, patch.echo) : patch.echo;
  const echoDelay = Math.round(SYNTH_RATE * 0.12);
  const dry = Math.ceil(SYNTH_RATE * duration);
  const signal = new Float32Array(dry + (echo ? echoDelay * 3 : 0));
  const initial = cell?.note ?? patch.note;
  const damp = 1 - Math.exp((-tau * patch.cutoff) / SYNTH_RATE);
  const vibrato =
    patch.vibrato + (cell?.effect === "vibrato" ? cell.amount * 4 : 0);
  let random = patch.seed | 0,
    phase = 0,
    filter = 0;
  for (let i = 0; i < dry; i++) {
    const seconds = i / SYNTH_RATE,
      progress = seconds / duration;
    let envelope =
      attack && seconds < attack
        ? seconds / attack
        : decay && seconds < attack + decay
          ? 1 - ((1 - patch.sustain) * (seconds - attack)) / decay
          : patch.sustain;
    if (release && seconds > duration - release)
      envelope *= Math.max(0, (duration - seconds) / release);
    if (cell?.effect === "cut" && progress > 1 - cell.amount) envelope = 0;
    if (cell?.effect === "tremolo")
      envelope *= 1 - (cell.amount * (1 + Math.sin(seconds * tau * 7))) / 2;
    const slide = cell?.effect === "slide" ? cell.amount * 24 * progress : 0;
    const note =
      initial +
      patch.sweep * progress +
      slide +
      Math.sin(seconds * tau * 6) * vibrato;
    const frequency = Math.min(
      SYNTH_RATE * 0.45,
      440 * 2 ** ((note - 69) / 12),
    );
    phase = (phase + frequency / SYNTH_RATE) % 1;
    random ^= random << 13;
    random ^= random >>> 17;
    random ^= random << 5;
    const sample = oscillator(
      patch.wave,
      phase,
      patch.pulse,
      (random >>> 0) / 2147483648 - 1,
    );
    filter += damp * (sample - filter);
    const edge = Math.min(1, i / 24, (dry - 1 - i) / 24);
    signal[i] = filter * envelope * edge * (cell?.velocity ?? 1);
  }
  if (echo)
    for (let i = echoDelay; i < signal.length; i++)
      signal[i] = clamp(signal[i] + signal[i - echoDelay] * echo * 0.68);
  return signal;
}

export function renderSong(song: TrackerSong, patches: SoundPatch[]) {
  const seconds = trackerSeconds(song);
  if (!seconds || seconds > MAX_TRACKER_SECONDS)
    throw new Error("The song exceeds the offline synthesis duration.");
  const rowSeconds = 60 / song.tempo / song.rowsPerBeat;
  const frames = Math.max(1, Math.ceil(seconds * SYNTH_RATE));
  const left = new Float32Array(frames),
    right = new Float32Array(frames);
  const instruments = new Map(patches.map((patch) => [patch.id, patch]));
  const tracks = new Map(
    song.tracks.filter(({ muted }) => !muted).map((track) => [track.id, track]),
  );
  const patterns = new Map(
    song.patterns.map((pattern) => [pattern.id, pattern]),
  );
  const cache = new Map<string, Float32Array>();
  let row = 0;
  for (const id of song.order) {
    const pattern = patterns.get(id);
    if (!pattern)
      throw new Error("The tracker arrangement contains a missing pattern.");
    for (const note of pattern.notes) {
      const track = tracks.get(note.track);
      const patch = track && instruments.get(track.instrumentId);
      if (!track || !patch) continue;
      const at = Math.round((row + note.row) * rowSeconds * SYNTH_RATE);
      if (at < 0 || at >= frames) continue;
      const key = JSON.stringify([
        patch.id,
        note.cell.note,
        note.cell.velocity,
        note.cell.effect,
        note.cell.amount,
      ]);
      let signal = cache.get(key);
      if (!signal) {
        signal = renderPatch(
          patch,
          note.cell,
          Math.min(patch.duration, rowSeconds * 2),
        );
        if (cache.size >= 128) cache.delete(cache.keys().next().value!);
        cache.set(key, signal);
      }
      const gain = patch.gain * track.gain,
        pan = ((track.pan + 1) * Math.PI) / 4;
      const l = Math.cos(pan) * gain,
        r = Math.sin(pan) * gain;
      for (let i = 0, n = Math.min(signal.length, frames - at); i < n; i++) {
        left[at + i] += signal[i] * l;
        right[at + i] += signal[i] * r;
      }
    }
    row += pattern.rows;
  }
  let peak = 1;
  for (let i = 0; i < frames; i++)
    peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
  if (peak > 1)
    for (let i = 0; i < frames; i++) {
      left[i] /= peak;
      right[i] /= peak;
    }
  return [left, right];
}

export function encodePcmWav(channels: Float32Array[], rate = SYNTH_RATE) {
  if (
    (channels.length !== 1 && channels.length !== 2) ||
    !channels[0]?.length ||
    channels.some((channel) => channel.length !== channels[0].length)
  )
    throw new Error("Choose one or two equal-length audio channels.");
  if (!Number.isInteger(rate) || rate < 8000 || rate > 96000)
    throw new Error("Unsupported WAV sample rate.");
  const samples = channels[0].length,
    frameBytes = channels.length * 2,
    count = samples * frameBytes;
  const bytes = new Uint8Array(44 + count);
  const view = new DataView(bytes.buffer);
  const tag = (at: number, name: string) => {
    for (let i = 0; i < 4; i++) bytes[at + i] = name.charCodeAt(i);
  };
  tag(0, "RIFF");
  view.setUint32(4, count + 36, true);
  tag(8, "WAVE");
  tag(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels.length, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * frameBytes, true);
  view.setUint16(32, frameBytes, true);
  view.setUint16(34, 16, true);
  tag(36, "data");
  view.setUint32(40, count, true);
  for (let sample = 0; sample < samples; sample++)
    for (let ch = 0; ch < channels.length; ch++)
      view.setInt16(
        44 + sample * frameBytes + ch * 2,
        Math.round(clamp(channels[ch][sample]) * 32767),
        true,
      );
  return bytes;
}
