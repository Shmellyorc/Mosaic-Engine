import type { Easing, MotionProperty } from "@mosaic/blueprints";
import type { Entity, Timeline, TimelineTrack } from "@mosaic/model";

type Clip = Entity["clips"][number];

export function sampleClip(clip: Clip, seconds: number) {
  const index = Math.max(0, Math.floor(seconds * clip.fps + 1e-9));
  return clip.frames[
    clip.loop
      ? index % clip.frames.length
      : Math.min(index, clip.frames.length - 1)
  ];
}

export class AnimationPlayer {
  private clips: Map<string, Clip>;
  private clipNames: Map<string, Clip>;
  private parameters: Map<string, number>;
  private states: Map<string, string>;
  private state?: string;
  private stateTime = 0;
  private clipTime = 0;
  private clip?: Clip;

  constructor(
    private definition: Entity["animator"],
    clips: Clip[],
  ) {
    this.clips = new Map(clips.map((clip) => [clip.id, clip]));
    this.clipNames = new Map(clips.map((clip) => [clip.name, clip]));
    this.parameters = new Map(
      definition?.parameters.map(({ id, value }) => [id, value]),
    );
    this.states = new Map(
      definition?.states.map(({ id, clipId }) => [id, clipId]),
    );
    if (definition) this.enter(definition.entry);
  }
  private enter(state: string) {
    this.state = state;
    this.stateTime = 0;
    this.clipTime = 0;
    this.clip = this.clips.get(this.states.get(state)!);
  }
  play(name: string) {
    const clip = this.clipNames.get(name);
    if (!clip) throw new Error(`Animation "${name}" is missing.`);
    if (this.clip === clip) return;
    this.clip = clip;
    this.clipTime = 0;
  }
  parameter(id: string, value: number) {
    if (!this.parameters.has(id))
      throw new Error("Animation parameter is missing.");
    if (!Number.isFinite(value))
      throw new Error("Animation parameter must be finite.");
    this.parameters.set(id, value);
  }
  step(delta: number) {
    this.stateTime += delta;
    this.clipTime += delta;
    if (!this.definition || !this.state) return;
    const stateClip = this.clips.get(this.states.get(this.state)!);
    for (const { from, to, condition } of this.definition.transitions) {
      if (to === this.state || (from !== null && from !== this.state)) continue;
      let matches: boolean;
      if (condition.kind === "finished") {
        matches = Boolean(
          stateClip &&
          !stateClip.loop &&
          this.stateTime + 1e-9 >= stateClip.frames.length / stateClip.fps,
        );
      } else {
        const value = this.parameters.get(condition.parameterId)!;
        const threshold = condition.value;
        switch (condition.op) {
          case "lt":
            matches = value < threshold;
            break;
          case "gt":
            matches = value > threshold;
            break;
          case "ne":
            matches = value !== threshold;
            break;
          case "eq":
            matches = value === threshold;
            break;
        }
      }
      if (matches) {
        this.enter(to);
        break;
      }
    }
  }
  get stateId() {
    return this.state;
  }
  frame() {
    return this.clip && sampleClip(this.clip, this.clipTime);
  }
}

export function easeProgress(progress: number, ease: Easing): number {
  switch (ease) {
    case "step":
      return Number(progress >= 1);
    case "in":
      return progress * progress;
    case "out":
      return progress * (2 - progress);
    case "in-out":
      return progress < 0.5
        ? 2 * progress * progress
        : 1 - 2 * (1 - progress) ** 2;
    case "linear":
      return progress;
  }
}

export function sampleTrack(track: TimelineTrack, seconds: number) {
  const keys = track.keys;
  let low = 0;
  let high = keys.length - 1;
  if (seconds <= keys[0].time) return keys[0].value;
  if (seconds >= keys[high].time) return keys[high].value;
  while (high - low > 1) {
    const mid = (low + high) >>> 1;
    if (keys[mid].time <= seconds) low = mid;
    else high = mid;
  }
  const before = keys[low],
    after = keys[high];
  const progress = easeProgress(
    (seconds - before.time) / (after.time - before.time),
    before.ease,
  );
  return before.value + (after.value - before.value) * progress;
}

function bounded(property: MotionProperty, value: number) {
  const limit = property === "scaleX" || property === "scaleY" ? 100 : 1e7;
  return property === "alpha"
    ? Math.max(0, Math.min(1, value))
    : Math.max(-limit, Math.min(limit, value));
}

type Tween = {
  entity: Entity;
  property: MotionProperty;
  from: number;
  to: number;
  elapsed: number;
  duration: number;
  ease: Easing;
};
type ActiveTimeline = { definition: Timeline; elapsed: number };

export class MotionWorld {
  private timelines: Map<string, Timeline>;
  private active = new Map<string, ActiveTimeline>();
  private tweens = new Map<string, Tween>();

  constructor(
    timelines: Timeline[],
    private entity: (id: string) => Entity | undefined,
  ) {
    this.timelines = new Map(
      timelines.map((timeline) => [timeline.id, timeline]),
    );
  }
  start() {
    for (const timeline of this.timelines.values())
      if (timeline.autoplay) this.play(timeline.id, true);
  }
  play(id: string, playing: boolean) {
    const definition = this.timelines.get(id);
    if (!definition) throw new Error("Timeline is missing from this scene.");
    if (!playing) {
      this.active.delete(id);
      return;
    }
    if (!this.active.has(id)) {
      this.active.set(id, { definition, elapsed: 0 });
      this.seek(id, 0);
    }
  }
  seek(id: string, seconds: number) {
    const timeline = this.timelines.get(id);
    if (!timeline) throw new Error("Timeline is missing from this scene.");
    for (const track of timeline.tracks) {
      const entity = this.entity(track.entityId);
      if (entity)
        entity.transform[track.property] = bounded(
          track.property,
          sampleTrack(track, seconds),
        );
    }
  }
  tween(
    entity: Entity,
    property: MotionProperty,
    to: number,
    duration: number,
    ease: Easing,
  ) {
    if (
      !Number.isFinite(to) ||
      !Number.isFinite(duration) ||
      duration < 0 ||
      duration > 600
    )
      throw new Error(
        "Tween needs a finite value and a duration of 0 to 600 seconds.",
      );
    const key = entity.id + ":" + property;
    to = bounded(property, to);
    const existing = this.tweens.get(key);
    if (
      existing?.to === to &&
      existing.duration === duration &&
      existing.ease === ease
    )
      return;
    this.tweens.delete(key);
    const from = entity.transform[property];
    if (!duration || from === to) {
      entity.transform[property] = to;
    } else {
      this.tweens.set(key, {
        entity,
        property,
        from,
        to,
        elapsed: 0,
        duration,
        ease,
      });
    }
  }
  step(delta: number) {
    for (const [id, playback] of this.active) {
      const { definition } = playback;
      playback.elapsed += delta;
      if (playback.elapsed + 1e-9 >= definition.duration) {
        if (definition.loop)
          playback.elapsed = Math.max(
            0,
            playback.elapsed - definition.duration,
          );
        else {
          this.seek(id, definition.duration);
          this.active.delete(id);
          continue;
        }
      }
      this.seek(id, playback.elapsed);
    }
    for (const [key, tween] of this.tweens) {
      tween.elapsed += delta;
      const progress =
        tween.elapsed + 1e-9 >= tween.duration
          ? 1
          : tween.elapsed / tween.duration;
      tween.entity.transform[tween.property] =
        tween.from +
        (tween.to - tween.from) * easeProgress(progress, tween.ease);
      if (progress === 1) this.tweens.delete(key);
    }
  }
}
