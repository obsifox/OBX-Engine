import { Color, Vec3 } from "@obx/math";
import { Random } from "@obx/core";
import type { PhysicsWorld } from "@obx/physics";

function coneDirection(random: Random, direction: Vec3, spread: number): Vec3 {
  const z = Math.cos(random.range(0, spread));
  const radius = Math.sqrt(Math.max(0, 1 - z * z));
  const phi = random.range(0, Math.PI * 2);
  const forward = direction.clone().normalize();
  const helper = Math.abs(forward.y) < 0.99 ? new Vec3(0, 1, 0) : new Vec3(1, 0, 0);
  const right = forward.clone().cross(helper).normalize();
  const up = right.clone().cross(forward).normalize();
  return forward
    .scale(z)
    .add(right.scale(radius * Math.cos(phi)))
    .add(up.scale(radius * Math.sin(phi)));
}

export interface Keyframe {
  t: number;
  value: number;
}

export class Curve {
  constructor(readonly keys: readonly Keyframe[]) {
    for (let i = 1; i < keys.length; i += 1) {
      if (keys[i]!.t < keys[i - 1]!.t) throw new Error("curve keys must be ordered");
    }
  }

  static constant(value: number): Curve {
    return new Curve([{ t: 0, value }, { t: 1, value }]);
  }

  static linear(a: number, b: number): Curve {
    return new Curve([{ t: 0, value: a }, { t: 1, value: b }]);
  }

  sample(t: number): number {
    const keys = this.keys;
    if (keys.length === 0) return 0;
    const first = keys[0]!;
    const last = keys[keys.length - 1]!;
    if (t <= first.t) return first.value;
    if (t >= last.t) return last.value;
    for (let i = 1; i < keys.length; i += 1) {
      const a = keys[i - 1]!;
      const b = keys[i]!;
      if (t <= b.t) {
        const span = b.t - a.t;
        const k = span <= 0 ? 0 : (t - a.t) / span;
        return a.value + (b.value - a.value) * k;
      }
    }
    return last.value;
  }
}

export interface Particle {
  position: Vec3;
  velocity: Vec3;
  life: number;
  maxLife: number;
  size: number;
  startSize: number;
  endSize: number;
  rotation: number;
  angularVelocity: number;
  color: Color;
  alive: boolean;
}

export interface ParticleCollision {
  bounce: number;
  friction: number;
  kill: boolean;
  killBelowSpeed: number;
}

export interface EmitterConfig {
  rate: number;
  burst: number;
  maxParticles: number;
  lifetime: readonly [number, number];
  speed: readonly [number, number];
  direction: Vec3;
  spread: number;
  gravity: Vec3;
  drag: number;
  startSize: readonly [number, number];
  endSize: number;
  sizeOverLife: Curve | null;
  startColor: Color;
  endColor: Color;
  angularVelocity: readonly [number, number];
  collision: ParticleCollision | null;
  trailLength: number;
  spawnCenter: Vec3;
  spawnBox: Vec3 | null;
  seed: number;
}

export function emitterConfig(over: Partial<EmitterConfig> = {}): EmitterConfig {
  return {
    rate: over.rate ?? 20,
    burst: over.burst ?? 0,
    maxParticles: over.maxParticles ?? 256,
    lifetime: over.lifetime ?? [0.5, 1.2],
    speed: over.speed ?? [1, 2],
    direction: over.direction?.clone() ?? new Vec3(0, 1, 0),
    spread: over.spread ?? 0.3,
    gravity: over.gravity?.clone() ?? new Vec3(0, -9.8, 0),
    drag: over.drag ?? 0.1,
    startSize: over.startSize ?? [0.2, 0.35],
    endSize: over.endSize ?? 0.05,
    sizeOverLife: over.sizeOverLife ?? null,
    startColor: over.startColor?.clone() ?? new Color(1, 1, 1, 1),
    endColor: over.endColor?.clone() ?? new Color(1, 1, 1, 0),
    angularVelocity: over.angularVelocity ?? [-1, 1],
    collision: over.collision ? { ...over.collision } : null,
    trailLength: over.trailLength ?? 0,
    spawnCenter: over.spawnCenter?.clone() ?? new Vec3(0, 0, 0),
    spawnBox: over.spawnBox?.clone() ?? null,
    seed: over.seed ?? 1,
  };
}

export class ParticleEmitter {
  readonly config: EmitterConfig;
  readonly random: Random;
  readonly particles: Particle[] = [];
  readonly trails: Vec3[][] = [];
  elapsed = 0;
  emitting = true;
  private emitCarry = 0;

  constructor(config: Partial<EmitterConfig> = {}, seed?: number) {
    this.config = emitterConfig(config);
    this.random = new Random(seed ?? this.config.seed);
    for (let i = 0; i < this.config.maxParticles; i += 1) {
      this.particles.push(this.makeDead());
      this.trails.push([]);
    }
  }

  get aliveCount(): number {
    let count = 0;
    for (const particle of this.particles) if (particle.alive) count += 1;
    return count;
  }

  burst(count?: number): void {
    const amount = count ?? this.config.burst;
    for (let i = 0; i < amount; i += 1) this.spawn();
  }

  update(dt: number, world?: PhysicsWorld): void {
    this.elapsed += dt;
    if (this.emitting && this.config.rate > 0) {
      this.emitCarry += this.config.rate * dt;
      const whole = Math.floor(this.emitCarry);
      this.emitCarry -= whole;
      for (let i = 0; i < whole; i += 1) this.spawn();
    }
    const config = this.config;
    for (let index = 0; index < this.particles.length; index += 1) {
      const particle = this.particles[index]!;
      if (!particle.alive) continue;
      particle.life += dt;
      if (particle.life >= particle.maxLife) {
        particle.alive = false;
        this.trails[index]!.length = 0;
        continue;
      }
      const lifeT = particle.life / particle.maxLife;
      particle.velocity.add(config.gravity.clone().scale(dt));
      const dragFactor = Math.max(0, 1 - config.drag * dt);
      particle.velocity.scale(dragFactor);
      const previous = particle.position.clone();
      const delta = particle.velocity.clone().scale(dt);
      if (config.collision && world && delta.lengthSq() > 1e-12) {
        const hit = world.raycast(previous, delta.clone().normalize(), delta.length() + 1e-6);
        if (hit) {
          const collision = config.collision;
          if (collision.kill) {
            particle.alive = false;
            this.trails[index]!.length = 0;
            continue;
          }
          const velocity = particle.velocity;
          const normalComponent = velocity.dot(hit.normal);
          const reflected = velocity.clone().sub(hit.normal.clone().scale(2 * normalComponent));
          const tangent = reflected.clone().sub(hit.normal.clone().scale(reflected.dot(hit.normal)));
          particle.velocity = reflected.scale(collision.bounce).add(tangent.scale(1 - collision.friction));
          particle.position = hit.point.clone().add(hit.normal.clone().scale(0.01));
          if (particle.velocity.length() < collision.killBelowSpeed) {
            particle.alive = false;
            this.trails[index]!.length = 0;
            continue;
          }
        } else {
          particle.position.add(delta);
        }
      } else {
        particle.position.add(delta);
      }
      particle.rotation += particle.angularVelocity * dt;
      particle.size = config.sizeOverLife
        ? config.sizeOverLife.sample(lifeT)
        : particle.startSize + (config.endSize - particle.startSize) * lifeT;
      Color.lerp(config.startColor, config.endColor, lifeT, particle.color);
      if (config.trailLength > 0) {
        const trail = this.trails[index]!;
        trail.push(particle.position.clone());
        if (trail.length > config.trailLength) trail.shift();
      }
    }
  }

  private spawn(): void {
    const config = this.config;
    const index = this.particles.findIndex((particle) => !particle.alive);
    if (index < 0) return;
    const particle = this.particles[index]!;
    const random = this.random;
    const life = random.range(config.lifetime[0], config.lifetime[1]);
    const speed = random.range(config.speed[0], config.speed[1]);
    const direction = coneDirection(random, config.direction, config.spread);
    if (config.spawnBox) {
      particle.position.copy(config.spawnCenter).add(
        new Vec3(
          random.range(-config.spawnBox.x, config.spawnBox.x),
          random.range(-config.spawnBox.y, config.spawnBox.y),
          random.range(-config.spawnBox.z, config.spawnBox.z),
        ),
      );
    } else {
      particle.position.copy(config.spawnCenter);
    }
    particle.velocity.copy(direction).scale(speed);
    particle.life = 0;
    particle.maxLife = life;
    particle.startSize = random.range(config.startSize[0], config.startSize[1]);
    particle.size = particle.startSize;
    particle.rotation = random.range(0, Math.PI * 2);
    particle.angularVelocity = random.range(config.angularVelocity[0], config.angularVelocity[1]);
    particle.color.copy(config.startColor);
    particle.alive = true;
    this.trails[index]!.length = 0;
  }

  private makeDead(): Particle {
    return {
      position: new Vec3(0, 0, 0),
      velocity: new Vec3(0, 0, 0),
      life: 0,
      maxLife: 1,
      size: 0,
      startSize: 0,
      endSize: 0,
      rotation: 0,
      angularVelocity: 0,
      color: new Color(1, 1, 1, 1),
      alive: false,
    };
  }
}

export class ParticleSystem {
  readonly emitters: ParticleEmitter[] = [];

  add(emitter: ParticleEmitter): ParticleEmitter {
    this.emitters.push(emitter);
    return emitter;
  }

  update(dt: number, world?: PhysicsWorld): void {
    for (const emitter of this.emitters) emitter.update(dt, world);
  }

  get aliveCount(): number {
    let count = 0;
    for (const emitter of this.emitters) count += emitter.aliveCount;
    return count;
  }
}

export class GpuParticleBuffer {
  readonly positions: Float32Array;
  readonly velocities: Float32Array;
  readonly life: Float32Array;
  readonly maxLife: Float32Array;
  readonly size: Float32Array;
  readonly color: Float32Array;
  alive = 0;

  constructor(readonly capacity: number) {
    this.positions = new Float32Array(capacity * 3);
    this.velocities = new Float32Array(capacity * 3);
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity);
    this.size = new Float32Array(capacity);
    this.color = new Float32Array(capacity * 4);
  }

  spawn(position: Vec3, velocity: Vec3, maxLife: number, size: number, color: Color): number {
    if (this.alive >= this.capacity) return -1;
    const index = this.alive;
    this.alive += 1;
    this.positions.set([position.x, position.y, position.z], index * 3);
    this.velocities.set([velocity.x, velocity.y, velocity.z], index * 3);
    this.life[index] = 0;
    this.maxLife[index] = maxLife;
    this.size[index] = size;
    this.color.set([color.r, color.g, color.b, color.a], index * 4);
    return index;
  }

  update(dt: number, gravity: Vec3, drag = 0): void {
    const dragFactor = Math.max(0, 1 - drag * dt);
    for (let index = this.alive - 1; index >= 0; index -= 1) {
      this.life[index] = this.life[index]! + dt;
      if (this.life[index]! >= this.maxLife[index]!) {
        const last = this.alive - 1;
        this.swap(index, last);
        this.alive -= 1;
        continue;
      }
      const v = index * 3;
      this.velocities[v] = (this.velocities[v]! + gravity.x * dt) * dragFactor;
      this.velocities[v + 1] = (this.velocities[v + 1]! + gravity.y * dt) * dragFactor;
      this.velocities[v + 2] = (this.velocities[v + 2]! + gravity.z * dt) * dragFactor;
      this.positions[v] = this.positions[v]! + this.velocities[v]! * dt;
      this.positions[v + 1] = this.positions[v + 1]! + this.velocities[v + 1]! * dt;
      this.positions[v + 2] = this.positions[v + 2]! + this.velocities[v + 2]! * dt;
    }
  }

  private swap(a: number, b: number): void {
    if (a === b) return;
    for (let channel = 0; channel < 3; channel += 1) {
      const av = this.positions[a * 3 + channel]!;
      this.positions[a * 3 + channel] = this.positions[b * 3 + channel]!;
      this.positions[b * 3 + channel] = av;
      const avv = this.velocities[a * 3 + channel]!;
      this.velocities[a * 3 + channel] = this.velocities[b * 3 + channel]!;
      this.velocities[b * 3 + channel] = avv;
    }
    for (let channel = 0; channel < 4; channel += 1) {
      const ac = this.color[a * 4 + channel]!;
      this.color[a * 4 + channel] = this.color[b * 4 + channel]!;
      this.color[b * 4 + channel] = ac;
    }
    for (const buffer of [this.life, this.maxLife, this.size] as const) {
      const value = buffer[a]!;
      buffer[a] = buffer[b]!;
      buffer[b] = value;
    }
  }
}

export function smokeEmitter(over: Partial<EmitterConfig> = {}): EmitterConfig {
  return emitterConfig({
    rate: 26,
    maxParticles: 220,
    lifetime: [1.2, 2.4],
    speed: [0.4, 1.1],
    direction: new Vec3(0, 1, 0),
    spread: 0.5,
    gravity: new Vec3(0, 0.6, 0),
    drag: 0.9,
    startSize: [0.5, 0.9],
    endSize: 1.8,
    startColor: new Color(0.45, 0.45, 0.5, 0.75),
    endColor: new Color(0.7, 0.7, 0.75, 0),
    ...over,
  });
}

export function fireEmitter(over: Partial<EmitterConfig> = {}): EmitterConfig {
  return emitterConfig({
    rate: 60,
    maxParticles: 180,
    lifetime: [0.35, 0.7],
    speed: [1.6, 3.2],
    direction: new Vec3(0, 1, 0),
    spread: 0.35,
    gravity: new Vec3(0, 2.4, 0),
    drag: 1.4,
    startSize: [0.35, 0.6],
    endSize: 0.08,
    startColor: new Color(1, 0.72, 0.18, 0.95),
    endColor: new Color(1, 0.25, 0.05, 0),
    ...over,
  });
}

export function sparksEmitter(over: Partial<EmitterConfig> = {}): EmitterConfig {
  return emitterConfig({
    rate: 0,
    burst: 48,
    maxParticles: 96,
    lifetime: [0.25, 0.75],
    speed: [4, 9],
    direction: new Vec3(0, 1, 0),
    spread: 1.1,
    gravity: new Vec3(0, -12, 0),
    drag: 0.4,
    startSize: [0.06, 0.12],
    endSize: 0.02,
    startColor: new Color(1, 0.85, 0.35, 1),
    endColor: new Color(1, 0.4, 0.1, 0),
    trailLength: 6,
    ...over,
  });
}

export function dustEmitter(over: Partial<EmitterConfig> = {}): EmitterConfig {
  return emitterConfig({
    rate: 18,
    maxParticles: 120,
    lifetime: [0.6, 1.4],
    speed: [0.8, 1.8],
    direction: new Vec3(0, 1, 0),
    spread: 1.4,
    gravity: new Vec3(0, -0.6, 0),
    drag: 1.8,
    startSize: [0.3, 0.55],
    endSize: 0.9,
    startColor: new Color(0.62, 0.55, 0.45, 0.55),
    endColor: new Color(0.62, 0.55, 0.45, 0),
    ...over,
  });
}

export function rainEmitter(over: Partial<EmitterConfig> = {}): EmitterConfig {
  return emitterConfig({
    rate: 260,
    maxParticles: 520,
    lifetime: [0.9, 1.3],
    speed: [11, 15],
    direction: new Vec3(0, -1, 0),
    spread: 0.06,
    gravity: new Vec3(0, -6, 0),
    drag: 0,
    startSize: [0.035, 0.06],
    endSize: 0.035,
    startColor: new Color(0.65, 0.78, 1, 0.7),
    endColor: new Color(0.65, 0.78, 1, 0.35),
    spawnBox: new Vec3(12, 1, 4),
    ...over,
  });
}

export function snowEmitter(over: Partial<EmitterConfig> = {}): EmitterConfig {
  return emitterConfig({
    rate: 90,
    maxParticles: 260,
    lifetime: [2.6, 4.2],
    speed: [0.7, 1.3],
    direction: new Vec3(0, -1, 0),
    spread: 0.7,
    gravity: new Vec3(0, -0.35, 0),
    drag: 0.5,
    startSize: [0.06, 0.12],
    endSize: 0.06,
    startColor: new Color(1, 1, 1, 0.9),
    endColor: new Color(1, 1, 1, 0.4),
    spawnBox: new Vec3(12, 1, 4),
    ...over,
  });
}
