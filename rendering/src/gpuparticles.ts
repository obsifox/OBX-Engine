import { Vec3, Color, Colors } from "@obx/math";
export type EmitterShape = "point" | "sphere" | "box";

export interface ParticleSystemOptions {
  maxParticles: number;
  seed: number;
  rate: number;
  lifetime: number;
  gravity: Vec3;
  drag: number;
  startSize: number;
  endSize: number;
  startColor: Color;
  endColor: Color;
  emitter: EmitterShape;
  emitterSize: Vec3;
  velocity: Vec3;
  velocitySpread: number;
}

export function defaultParticleOptions(overrides: Partial<ParticleSystemOptions> = {}): ParticleSystemOptions {
  return {
    maxParticles: 1024,
    seed: 1,
    rate: 32,
    lifetime: 2,
    gravity: new Vec3(0, -9.81, 0),
    drag: 0.1,
    startSize: 0.25,
    endSize: 0.05,
    startColor: Colors.white.clone(),
    endColor: new Color(1, 0.4, 0.1, 0),
    emitter: "point",
    emitterSize: new Vec3(1, 1, 1),
    velocity: new Vec3(0, 1, 0),
    velocitySpread: 0.5,
    ...overrides,
  };
}

export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface ParticleGpuBuffer {
  write(data: ArrayBufferView, offsetBytes?: number): void;
}

export interface ParticleGpuDevice {
  createBuffer(descriptor: { label?: string; usage: "vertex"; size: number; data?: ArrayBufferView }): ParticleGpuBuffer;
}

export const PARTICLE_INSTANCE_STRIDE = 8;

export class GpuParticleSystem {
  readonly options: ParticleSystemOptions;
  #rng: () => number;
  #time = 0;
  #accumulator = 0;
  #alive = 0;
  #positions: Float32Array;
  #velocities: Float32Array;
  #life: Float32Array;
  #instanceData: Float32Array;

  constructor(options: Partial<ParticleSystemOptions> = {}) {
    this.options = defaultParticleOptions(options);
    this.#rng = mulberry32(this.options.seed);
    const max = this.options.maxParticles;
    this.#positions = new Float32Array(max * 3);
    this.#velocities = new Float32Array(max * 3);
    this.#life = new Float32Array(max);
    this.#instanceData = new Float32Array(max * PARTICLE_INSTANCE_STRIDE);
  }

  get aliveCount(): number {
    return this.#alive;
  }

  get time(): number {
    return this.#time;
  }

  reset(): void {
    this.#rng = mulberry32(this.options.seed);
    this.#time = 0;
    this.#accumulator = 0;
    this.#alive = 0;
    this.#positions.fill(0);
    this.#velocities.fill(0);
    this.#life.fill(0);
    this.#instanceData.fill(0);
  }

  #spawn(): void {
    if (this.#alive >= this.options.maxParticles) return;
    const index = this.#alive;
    this.#alive += 1;
    const random = this.#rng;
    const spread = this.options.velocitySpread;
    let ox = 0;
    let oy = 0;
    let oz = 0;
    if (this.options.emitter === "sphere") {
      const theta = random() * Math.PI * 2;
      const phi = Math.acos(2 * random() - 1);
      const radius = this.options.emitterSize.x * Math.cbrt(random());
      ox = radius * Math.sin(phi) * Math.cos(theta);
      oy = radius * Math.sin(phi) * Math.sin(theta);
      oz = radius * Math.cos(phi);
    } else if (this.options.emitter === "box") {
      ox = (random() - 0.5) * this.options.emitterSize.x;
      oy = (random() - 0.5) * this.options.emitterSize.y;
      oz = (random() - 0.5) * this.options.emitterSize.z;
    }
    this.#positions[index * 3] = ox;
    this.#positions[index * 3 + 1] = oy;
    this.#positions[index * 3 + 2] = oz;
    this.#velocities[index * 3] = this.options.velocity.x + (random() - 0.5) * 2 * spread;
    this.#velocities[index * 3 + 1] = this.options.velocity.y + (random() - 0.5) * 2 * spread;
    this.#velocities[index * 3 + 2] = this.options.velocity.z + (random() - 0.5) * 2 * spread;
    this.#life[index] = this.options.lifetime * (0.75 + 0.25 * random());
  }

  #kill(index: number): void {
    const last = this.#alive - 1;
    if (index !== last) {
      for (let channel = 0; channel < 3; channel += 1) {
        this.#positions[index * 3 + channel] = this.#positions[last * 3 + channel]!;
        this.#velocities[index * 3 + channel] = this.#velocities[last * 3 + channel]!;
      }
      this.#life[index] = this.#life[last]!;
    }
    this.#alive = last;
    this.#life[last] = 0;
  }

  simulate(deltaSeconds: number): void {
    const dt = Math.max(0, Math.min(deltaSeconds, 0.1));
    this.#time += dt;
    this.#accumulator += dt * this.options.rate;
    while (this.#accumulator >= 1) {
      this.#accumulator -= 1;
      this.#spawn();
    }
    const dragFactor = Math.max(0, 1 - this.options.drag * dt);
    for (let i = this.#alive - 1; i >= 0; i -= 1) {
      this.#life[i] = this.#life[i]! - ( dt);
      if (this.#life[i]! <= 0) {
        this.#kill(i);
        continue;
      }
      this.#velocities[i * 3] = this.#velocities[i * 3]! * dragFactor + this.options.gravity.x * dt;
      this.#velocities[i * 3 + 1] = this.#velocities[i * 3 + 1]! * dragFactor + this.options.gravity.y * dt;
      this.#velocities[i * 3 + 2] = this.#velocities[i * 3 + 2]! * dragFactor + this.options.gravity.z * dt;
      this.#positions[i * 3] = this.#positions[i * 3]! + ( this.#velocities[i * 3]! * dt);
      this.#positions[i * 3 + 1] = this.#positions[i * 3 + 1]! + ( this.#velocities[i * 3 + 1]! * dt);
      this.#positions[i * 3 + 2] = this.#positions[i * 3 + 2]! + ( this.#velocities[i * 3 + 2]! * dt);
    }
  }

  instanceData(): Float32Array {
    const { startSize, endSize, startColor, endColor, lifetime } = this.options;
    for (let i = 0; i < this.#alive; i += 1) {
      const age = 1 - Math.max(0, this.#life[i]!) / Math.max(lifetime, 1e-4);
      const base = i * PARTICLE_INSTANCE_STRIDE;
      this.#instanceData[base] = this.#positions[i * 3]!;
      this.#instanceData[base + 1] = this.#positions[i * 3 + 1]!;
      this.#instanceData[base + 2] = this.#positions[i * 3 + 2]!;
      this.#instanceData[base + 3] = startSize + (endSize - startSize) * age;
      this.#instanceData[base + 4] = startColor.r + (endColor.r - startColor.r) * age;
      this.#instanceData[base + 5] = startColor.g + (endColor.g - startColor.g) * age;
      this.#instanceData[base + 6] = startColor.b + (endColor.b - startColor.b) * age;
      this.#instanceData[base + 7] = startColor.a + (endColor.a - startColor.a) * age;
    }
    return this.#instanceData.subarray(0, this.#alive * PARTICLE_INSTANCE_STRIDE);
  }

  createInstanceBuffer(device: ParticleGpuDevice): ParticleGpuBuffer {
    return device.createBuffer({
      label: "gpu-particles",
      usage: "vertex",
      size: Math.max(1, this.options.maxParticles * PARTICLE_INSTANCE_STRIDE * 4),
      data: this.instanceData(),
    });
  }

  updateInstanceBuffer(buffer: ParticleGpuBuffer): void {
    buffer.write(this.instanceData());
  }
}

export interface TrailOptions {
  maxPoints: number;
  width: number;
  color: Color;
  fade: boolean;
}

export class ParticleTrail {
  readonly options: TrailOptions;
  #points: Vec3[] = [];

  constructor(options: Partial<TrailOptions> = {}) {
    this.options = {
      maxPoints: options.maxPoints ?? 32,
      width: options.width ?? 0.1,
      color: options.color?.clone() ?? Colors.white.clone(),
      fade: options.fade ?? true,
    };
  }

  get length(): number {
    return this.#points.length;
  }

  push(position: Vec3): void {
    this.#points.push(position.clone());
    if (this.#points.length > this.options.maxPoints) {
      this.#points.shift();
    }
  }

  clear(): void {
    this.#points = [];
  }

  segments(): Float32Array {
    const count = Math.max(0, this.#points.length - 1);
    const data = new Float32Array(count * 2 * PARTICLE_INSTANCE_STRIDE);
    for (let i = 0; i < count; i += 1) {
      const a = this.#points[i]!;
      const b = this.#points[i + 1]!;
      const t0 = i / Math.max(1, count - 1);
      const t1 = (i + 1) / Math.max(1, count - 1);
      const alpha0 = this.options.fade ? 1 - t0 : 1;
      const alpha1 = this.options.fade ? 1 - t1 : 1;
      const base = i * 2 * PARTICLE_INSTANCE_STRIDE;
      data[base] = a.x;
      data[base + 1] = a.y;
      data[base + 2] = a.z;
      data[base + 3] = this.options.width;
      data[base + 4] = this.options.color.r;
      data[base + 5] = this.options.color.g;
      data[base + 6] = this.options.color.b;
      data[base + 7] = alpha0 * this.options.color.a;
      const next = base + PARTICLE_INSTANCE_STRIDE;
      data[next] = b.x;
      data[next + 1] = b.y;
      data[next + 2] = b.z;
      data[next + 3] = this.options.width;
      data[next + 4] = this.options.color.r;
      data[next + 5] = this.options.color.g;
      data[next + 6] = this.options.color.b;
      data[next + 7] = alpha1 * this.options.color.a;
    }
    return data;
  }
}

export interface GpuEffectOptions {
  turbulence: number;
  vortex: number;
  burst: number;
}

export class GpuEffectSystem {
  readonly particles: GpuParticleSystem;
  readonly options: GpuEffectOptions;

  constructor(particles = new GpuParticleSystem(), options: Partial<GpuEffectOptions> = {}) {
    this.particles = particles;
    this.options = { turbulence: options.turbulence ?? 0, vortex: options.vortex ?? 0, burst: options.burst ?? 0 };
  }

  apply(deltaSeconds: number, time: number): void {
    if (this.options.vortex !== 0 || this.options.turbulence !== 0) {
      const data = this.particles.instanceData();
      const count = this.particles.aliveCount;
      for (let i = 0; i < count; i += 1) {
        const base = i * PARTICLE_INSTANCE_STRIDE;
        const x = data[base]!;
        const z = data[base + 2]!;
        if (this.options.vortex !== 0) {
          data[base] = data[base]! + (-z * this.options.vortex * deltaSeconds);
          data[base + 2] = data[base + 2]! + (x * this.options.vortex * deltaSeconds);
        }
        if (this.options.turbulence !== 0) {
          data[base + 1] = data[base + 1]! + ( Math.sin(time + i * 0.37) * this.options.turbulence * deltaSeconds);
        }
      }
    }
    this.particles.simulate(deltaSeconds);
  }
}
