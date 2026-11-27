import {
  MAX_PARTICLES,
  type Entity,
  type ParticleEmitter,
} from "@mosaic/model";

type Emitter = {
  entity: Entity;
  config: ParticleEmitter;
  emitting: boolean;
  carry: number;
  random: number;
  active: number;
  pending: number;
};
type Particle = {
  emitter: Emitter;
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
};
type Origin = { x: number; y: number };
type DrawParticle = (
  layerId: string,
  x: number,
  y: number,
  size: number,
  alpha: number,
  color: string,
) => void;

export class ParticleWorld {
  private emitters = new Map<string, Emitter>();
  private active: Particle[] = [];
  private free: Particle[] = [];

  constructor(entities: Entity[]) {
    for (const entity of entities) {
      if (!entity.particles) continue;
      this.emitters.set(entity.id, {
        entity,
        config: entity.particles,
        emitting: entity.particles.enabled,
        random: entity.particles.seed,
        carry: 0,
        active: 0,
        pending: 0,
      });
    }
  }
  get hasEmitters() {
    return this.emitters.size > 0;
  }
  control(entityId: string, operation: "burst" | "start" | "stop") {
    const emitter = this.emitters.get(entityId);
    if (!emitter) throw new Error("The entity has no particle emitter.");
    if (operation === "burst") {
      emitter.pending = Math.min(
        emitter.config.limit,
        emitter.pending + emitter.config.burst,
      );
    } else if (emitter.emitting !== (operation === "start")) {
      emitter.emitting = operation === "start";
      emitter.carry = 0;
    }
  }
  private random(emitter: Emitter) {
    let value = emitter.random;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    emitter.random = value >>> 0;
    return emitter.random / 0x100000000;
  }
  step(delta: number, origin: (id: string) => Origin | undefined) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const particle = this.active[i];
      particle.age += delta;
      if (particle.age + 1e-9 >= particle.emitter.config.lifetime) {
        particle.emitter.active--;
        this.active[i] = this.active[this.active.length - 1];
        this.active.pop();
        this.free.push(particle);
        continue;
      }
      particle.vy += particle.emitter.config.gravity * delta;
      particle.x += particle.vx * delta;
      particle.y += particle.vy * delta;
    }
    for (const emitter of this.emitters.values()) {
      if (emitter.emitting) emitter.carry += emitter.config.rate * delta;
      const whole = Math.floor(emitter.carry + 1e-9);
      emitter.carry = Math.max(0, emitter.carry - whole);
      const count = Math.min(
        whole + emitter.pending,
        emitter.config.limit - emitter.active,
        MAX_PARTICLES - this.active.length,
      );
      emitter.pending = 0;
      if (count <= 0) continue;
      const center = origin(emitter.entity.id);
      if (!center) continue;
      const { angle, spread, speed } = emitter.config;
      for (let i = 0; i < count; i++) {
        const radians =
          ((angle + (this.random(emitter) - 0.5) * spread) * Math.PI) / 180;
        const velocity = speed * (0.7 + this.random(emitter) * 0.6);
        const particle = this.free.pop() ?? {
          emitter,
          x: 0,
          y: 0,
          vx: 0,
          vy: 0,
          age: 0,
        };
        particle.emitter = emitter;
        particle.x = center.x;
        particle.y = center.y;
        particle.vx = Math.cos(radians) * velocity;
        particle.vy = Math.sin(radians) * velocity;
        particle.age = 0;
        this.active.push(particle);
        emitter.active++;
      }
    }
  }
  forEach(draw: DrawParticle) {
    for (const {
      emitter: { entity, config },
      x,
      y,
      age,
    } of this.active) {
      const progress = age / config.lifetime;
      draw(
        entity.layerId,
        x,
        y,
        config.size + (config.endSize - config.size) * progress,
        1 - progress,
        config.color,
      );
    }
  }
}
