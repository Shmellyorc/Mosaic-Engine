import { z } from "zod";
import { easingSchema, motionPropertySchema } from "@mosaic/blueprints";

const id = z.string().min(1).max(100);
const name = z.string().trim().min(1).max(100);
const color = z.string().regex(/^#[0-9a-f]{6}$/i);
const value = z.number().min(-1e7).max(1e7);
export const MAX_SOUND_BYTES = 8 * 1024 * 1024;
export const MAX_EMITTERS = 128;
export const MAX_PARTICLES = 4096;
export const MASTER_BUS = "master";

export const animatorSchema = z.object({
  entry: id,
  parameters: z.array(z.object({ id, name, value })).max(32),
  states: z
    .array(z.object({ id, name, clipId: id }))
    .min(1)
    .max(64),
  transitions: z
    .array(
      z.object({
        id,
        from: id.nullable(),
        to: id,
        condition: z.discriminatedUnion("kind", [
          z.object({ kind: z.literal("finished") }),
          z.object({
            kind: z.literal("parameter"),
            parameterId: id,
            op: z.enum(["lt", "eq", "gt", "ne"]),
            value,
          }),
        ]),
      }),
    )
    .max(128),
});

export const timelineSchema = z.object({
  id,
  name,
  duration: z.number().min(0.1).max(600),
  loop: z.boolean(),
  autoplay: z.boolean(),
  tracks: z
    .array(
      z.object({
        id,
        entityId: id,
        property: motionPropertySchema,
        keys: z
          .array(
            z.object({
              time: z.number().min(0).max(600),
              value,
              ease: easingSchema,
            }),
          )
          .min(1)
          .max(128),
      }),
    )
    .max(128),
});

export const emitterSchema = z.object({
  enabled: z.boolean(),
  rate: z.number().min(0).max(500),
  burst: z.number().int().min(1).max(256),
  limit: z.number().int().min(1).max(1024),
  lifetime: z.number().min(0.05).max(20),
  size: z.number().min(1).max(256),
  endSize: z.number().min(0).max(256),
  angle: z.number().min(-360).max(360),
  spread: z.number().min(0).max(360),
  speed: z.number().min(0).max(4000),
  gravity: z.number().min(-4000).max(4000),
  color,
  seed: z.number().int().min(1).max(0xffffffff),
});

export const soundSchema = z.object({
  id,
  name,
  source: z
    .string()
    .max(4 * Math.ceil(MAX_SOUND_BYTES / 3) + 22)
    .refine((source) => {
      const prefix = "data:audio/wav;base64,";
      if (!source.startsWith(prefix)) return false;
      const payload = source.slice(prefix.length);
      return (
        payload.length >= 60 &&
        payload.length % 4 === 0 &&
        /^[A-Za-z0-9+/]+={0,2}$/.test(payload) &&
        (payload.length / 4) * 3 -
          (payload.endsWith("==") ? 2 : Number(payload.endsWith("="))) <=
          MAX_SOUND_BYTES
      );
    }, "Expected an embedded WAV sound."),
  bus: id,
  gain: z.number().min(0).max(1),
  loop: z.boolean(),
});

export const mixerSchema = z.object({
  master: z.number().min(0).max(1),
  muted: z.boolean(),
  buses: z
    .array(
      z.object({
        id,
        name,
        gain: z.number().min(0).max(1),
        muted: z.boolean(),
      }),
    )
    .max(16),
  sounds: z.array(soundSchema).max(128),
});

export type Animator = z.infer<typeof animatorSchema>;
export type Timeline = z.infer<typeof timelineSchema>;
export type TimelineTrack = Timeline["tracks"][number];
export type ParticleEmitter = z.infer<typeof emitterSchema>;
export type Mixer = z.infer<typeof mixerSchema>;
export type Sound = z.infer<typeof soundSchema>;

export const createMixer = (): Mixer => ({
  master: 0.8,
  muted: false,
  buses: [],
  sounds: [],
});

export const createEmitter = (): ParticleEmitter => ({
  enabled: true,
  rate: 20,
  burst: 30,
  limit: 160,
  lifetime: 1,
  size: 7,
  endSize: 1,
  angle: -90,
  spread: 75,
  speed: 105,
  gravity: 75,
  color: "#ffc383",
  seed: 1,
});
