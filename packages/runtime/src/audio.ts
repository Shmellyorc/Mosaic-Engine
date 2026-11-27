import { inspectWav, MASTER_BUS, type Mixer, type Sound } from "@mosaic/model";

export type AudioCommand = { soundId: string; playing: boolean };
const MAX_VOICES = 32;
const MAX_BUFFER_BYTES = 48 * 1024 * 1024;

type Voice = { id: string; source: AudioBufferSourceNode; gain: GainNode };
type CachedSound = { source: string; buffer: AudioBuffer; bytes: number };
const unit = (value: number, muted: boolean) => (muted ? 0 : value);

export class AudioMixer {
  private context?: AudioContext;
  private master?: GainNode;
  private analyzer?: AnalyserNode;
  private samples = new Float32Array(512);
  private buses = new Map<string, GainNode>();
  private sounds = new Map<string, Sound>();
  private voices = new Set<Voice>();
  private buffers = new Map<string, CachedSound>();
  private bufferBytes = 0;
  private disposed = false;
  private config?: Mixer;

  constructor(private report: (message: string) => void) {}

  configure(config?: Mixer) {
    if (this.config === config) return;
    this.config = config;
    const previousSounds = this.sounds;
    this.sounds = new Map(config?.sounds.map((sound) => [sound.id, sound]));
    for (const [id, cached] of this.buffers) {
      if (cached.source === this.sounds.get(id)?.source) continue;
      this.bufferBytes -= cached.bytes;
      this.buffers.delete(id);
    }
    for (const voice of this.voices) {
      const sound = this.sounds.get(voice.id);
      if (!sound || previousSounds.get(voice.id)?.source !== sound.source)
        this.stop(voice);
      else {
        voice.gain.gain.value = sound.gain;
        voice.source.loop = voice.source.loop && sound.loop;
      }
    }
    if (this.context) this.apply();
  }

  private apply() {
    const master = this.master!;
    master.gain.value = unit(
      this.config?.master ?? 1,
      this.config?.muted ?? false,
    );
    const ids = new Set(this.config?.buses.map(({ id }) => id));
    for (const [id, node] of this.buses) {
      if (ids.has(id)) continue;
      node.disconnect();
      this.buses.delete(id);
    }
    for (const bus of this.config?.buses ?? []) {
      let node = this.buses.get(bus.id);
      if (!node) {
        node = this.context!.createGain();
        node.connect(master);
        this.buses.set(bus.id, node);
      }
      node.gain.value = unit(bus.gain, bus.muted);
    }
    for (const voice of this.voices) {
      const bus = this.sounds.get(voice.id)?.bus ?? MASTER_BUS;
      voice.gain.disconnect();
      voice.gain.connect(this.buses.get(bus) ?? master);
    }
  }

  async unlock() {
    if (this.disposed || !this.sounds.size) return false;
    try {
      if (!this.context) {
        const context = new AudioContext();
        this.context = context;
        this.master = context.createGain();
        this.analyzer = context.createAnalyser();
        this.analyzer.fftSize = this.samples.length;
        this.master.connect(this.analyzer);
        this.analyzer.connect(context.destination);
        this.apply();
      }
      await this.context.resume();
      return this.context.state === "running";
    } catch (error) {
      if (!this.disposed)
        this.report(`Audio could not start. ${String(error)}`);
      return false;
    }
  }
  peak() {
    if (!this.analyzer || !this.voices.size) return 0;
    this.analyzer.getFloatTimeDomainData(this.samples);
    let peak = 0;
    for (const sample of this.samples) peak = Math.max(peak, Math.abs(sample));
    return Math.min(1, peak);
  }
  pause() {
    if (this.context && this.context.state !== "closed")
      void this.context.suspend().catch(() => undefined);
  }

  private buffer(sound: Sound) {
    const cached = this.buffers.get(sound.id);
    if (cached) {
      this.buffers.delete(sound.id);
      this.buffers.set(sound.id, cached);
      return cached.buffer;
    }
    const encoded = atob(sound.source.slice(sound.source.indexOf(",") + 1));
    const bytes = new Uint8Array(encoded.length);
    for (let i = 0; i < encoded.length; i++) bytes[i] = encoded.charCodeAt(i);
    const { input, offset, frames, channels, rate } = inspectWav(bytes);
    const size = frames * channels * 4;
    while (this.bufferBytes + size > MAX_BUFFER_BYTES) {
      const pinned = new Set([...this.voices].map((voice) => voice.id));
      const first = [...this.buffers.keys()].find((id) => !pinned.has(id));
      if (first === undefined)
        throw new Error("The active sounds fill the audio buffer budget.");
      const evicted = this.buffers.get(first)!;
      this.buffers.delete(first);
      this.bufferBytes -= evicted.bytes;
    }
    const buffer = this.context!.createBuffer(channels, frames, rate);
    for (let ch = 0; ch < channels; ch++) {
      const samples = buffer.getChannelData(ch);
      for (let frame = 0; frame < frames; frame++)
        samples[frame] =
          input.getInt16(offset + (frame * channels + ch) * 2, true) / 32768;
    }
    this.buffers.set(sound.id, { source: sound.source, buffer, bytes: size });
    this.bufferBytes += size;
    return buffer;
  }

  private clean(voice: Voice) {
    this.voices.delete(voice);
    voice.source.disconnect();
    voice.gain.disconnect();
  }
  private stop(voice: Voice) {
    voice.source.onended = null;
    voice.source.stop();
    this.clean(voice);
  }
  stopAll() {
    for (const voice of this.voices) this.stop(voice);
  }

  dispatch({ soundId, playing }: AudioCommand, preview = false) {
    if (!playing) {
      for (const voice of this.voices)
        if (voice.id === soundId) this.stop(voice);
      return;
    }
    const sound = this.sounds.get(soundId);
    const context = this.context;
    if (!sound || !context || this.disposed) return;
    const loop = !preview && sound.loop;
    if (
      loop &&
      [...this.voices].some(
        (voice) => voice.id === soundId && voice.source.loop,
      )
    )
      return;
    if (this.voices.size >= MAX_VOICES) {
      const first = [...this.voices].find((voice) => !voice.source.loop);
      if (!first) return;
      this.stop(first);
    }
    try {
      const buffer = this.buffer(sound);
      const source = context.createBufferSource();
      const gain = context.createGain();
      source.buffer = buffer;
      source.loop = loop;
      gain.gain.value = sound.gain;
      source.connect(gain);
      gain.connect(this.buses.get(sound.bus) ?? this.master!);
      const voice = { id: sound.id, source, gain };
      source.onended = () => this.clean(voice);
      this.voices.add(voice);
      source.start();
    } catch (failure) {
      this.report(`Sound "${sound.name}" could not play. ${String(failure)}`);
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.stopAll();
    this.buffers.clear();
    this.buses.clear();
    this.bufferBytes = 0;
    void this.context?.close().catch(() => undefined);
  }
}
