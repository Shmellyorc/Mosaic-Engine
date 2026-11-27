import { describe, expect, test } from "vitest";
import { literal, type Blueprint } from "@mosaic/blueprints";
import {
  createEmitter,
  createEntity,
  createProject,
  inspectWav,
  parseProject,
  serializeProject,
} from "@mosaic/model";
import { AnimationPlayer, Game, STEP } from "@mosaic/runtime";
import { signalMixer, signalWav } from "../packages/example/src/signal-lab";

function ticks(game: Game, count: number) {
  for (let i = 0; i < count; i++) game.advance(STEP);
}

describe("animation and effects", () => {
  test("animator follows ordered parameter and completion transitions", () => {
    const first = { x: 0, y: 0, w: 8, h: 8 };
    const last = { ...first, x: 8 };
    const player = new AnimationPlayer(
      {
        entry: "idle",
        states: [
          { id: "idle", name: "Idle", clipId: "idle" },
          { id: "fire", name: "Fire", clipId: "fire" },
        ],
        parameters: [{ id: "pressed", name: "Pressed", value: 0 }],
        transitions: [
          {
            id: "begin",
            from: "idle",
            to: "fire",
            condition: {
              kind: "parameter",
              parameterId: "pressed",
              op: "gt",
              value: 0,
            },
          },
          {
            id: "end",
            from: "fire",
            to: "idle",
            condition: { kind: "finished" },
          },
        ],
      },
      [
        { id: "idle", name: "Idle", fps: 2, loop: true, frames: [first] },
        {
          id: "fire",
          name: "Fire",
          fps: 10,
          loop: false,
          frames: [first, last],
        },
      ],
    );
    expect(player.stateId).toBe("idle");
    player.parameter("pressed", 1);
    player.step(STEP);
    expect(player.stateId).toBe("fire");
    player.step(0.1);
    expect(player.frame()).toEqual(last);
    player.parameter("pressed", 0);
    player.step(0.1);
    expect(player.stateId).toBe("idle");
    expect(player.frame()).toEqual(first);
  });

  test("timeline, tweens and sound commands execute from a serialized Blueprint", () => {
    const project = createProject();
    const scene = project.scenes[0];
    const actor = createEntity(scene.layers[0].id);
    actor.blueprintId = "behaviour";
    scene.entities.push(actor);
    scene.timelines = [
      {
        id: "track",
        name: "Track",
        duration: 1,
        autoplay: false,
        loop: false,
        tracks: [
          {
            id: "x",
            entityId: actor.id,
            property: "x",
            keys: [
              { time: 0, value: 100, ease: "linear" },
              { time: 1, value: 200, ease: "linear" },
            ],
          },
        ],
      },
    ];
    project.mixer = signalMixer();
    const behaviour: Blueprint = {
      id: "behaviour",
      name: "Behaviour",
      version: 2,
      variables: [],
      events: [
        {
          id: "init",
          kind: "start",
          blocks: [
            {
              id: "run-track",
              kind: "timeline",
              timelineId: "track",
              playing: true,
            },
            {
              id: "tween-fade",
              kind: "tween",
              property: "alpha",
              seconds: literal(1),
              value: literal(0),
              ease: "in",
            },
            {
              id: "play-chime",
              kind: "sound",
              soundId: "signal-chime",
              playing: true,
            },
            { id: "wait-for-stop", kind: "wait", seconds: literal(0.5) },
            {
              id: "stop-chime",
              kind: "sound",
              soundId: "signal-chime",
              playing: false,
            },
          ],
        },
      ],
    };
    project.blueprints = [behaviour];
    const game = new Game(parseProject(serializeProject(project)));
    const messages: unknown[] = [];
    ticks(game, 30);
    const transform = game.getEntity(actor.id)!.transform;
    expect(transform.x).toBeCloseTo(150);
    expect(transform.alpha).toBeCloseTo(0.75);
    ticks(game, 30);
    expect(transform.x).toBe(200);
    expect(transform.alpha).toBe(0);
    expect(game.logs).toEqual([]);
    game.consumeAudio((command) => messages.push(command));
    game.consumeAudio((command) => messages.push(command));
    expect(messages).toEqual([
      { soundId: "signal-chime", playing: true },
      { soundId: "signal-chime", playing: false },
    ]);
    expect(actor.transform.x).toBe(320);
  });

  test("particles are seeded, bounded, culled and reset when reused", () => {
    const project = createProject();
    const scene = project.scenes[0];
    const emitter = createEntity(scene.layers[0].id);
    emitter.visual = null;
    emitter.particles = {
      ...createEmitter(),
      enabled: false,
      limit: 4,
      speed: 50,
      lifetime: 0.1,
    };
    scene.entities.push(emitter);
    const first = new Game(project),
      second = new Game(project);
    const burst = (game: Game) => game.previewParticles(emitter.id, true, STEP);
    burst(first);
    burst(second);
    first.previewParticles(emitter.id, false, STEP);
    second.previewParticles(emitter.id, false, STEP);
    expect(first.frame().draws).toEqual(second.frame().draws);
    expect(first.frame().draws).toHaveLength(4);
    expect(first.frame({ x: -1000, y: -1000, zoom: 1 }).draws).toHaveLength(0);
    for (let i = 0; i < 7; i++) first.previewParticles(emitter.id, false, STEP);
    expect(first.frame().draws).toHaveLength(0);
    burst(first);
    expect(first.frame().draws).toHaveLength(4);
    expect(
      first.frame().draws.every((draw) => draw.alpha === 1 && draw.width === 7),
    ).toBe(true);
  });

  test("invalid tracks and mixer routes are rejected and legacy projects stay readable", () => {
    const project = createProject();
    const scene = project.scenes[0];
    const actor = createEntity(scene.layers[0].id);
    scene.entities.push(actor);
    expect(
      parseProject(serializeProject(project)).scenes[0].timelines,
    ).toBeUndefined();
    scene.timelines = [
      {
        id: "track",
        name: "Track",
        duration: 1,
        autoplay: false,
        loop: false,
        tracks: [
          {
            id: "x",
            entityId: actor.id,
            property: "x",
            keys: [
              { time: 0, value: 0, ease: "step" },
              { time: 0, value: 9, ease: "linear" },
            ],
          },
        ],
      },
    ];
    expect(() => serializeProject(project)).toThrow(/unique, ordered keys/);
    scene.timelines = undefined;
    project.mixer = signalMixer();
    project.mixer.sounds[0].bus = "renamed";
    expect(() => serializeProject(project)).toThrow(/missing audio bus/);
  });

  test("WAV inspection accepts PCM samples and rejects truncated or mislabeled data", () => {
    const wav = signalWav();
    expect(inspectWav(wav)).toMatchObject({
      rate: 12000,
      channels: 1,
      frames: 5760,
    });
    expect(() => inspectWav(wav.subarray(0, 100))).toThrow(/PCM WAV/);
    wav[20] = 3;
    expect(() => inspectWav(wav)).toThrow(/PCM WAV/);
  });
});
