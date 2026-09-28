import { Color, Vec3 } from "@obx/math";
import { Random } from "@obx/core";
import type { PhysicsWorld } from "@obx/physics";
import {
  ParticleEmitter,
  emitterConfig,
  rainEmitter,
  smokeEmitter,
  snowEmitter,
  sparksEmitter,
  type EmitterConfig,
} from "@obx/particles";

export interface ScreenEffectState {
  fade: number;
  flash: number;
  flashColor: Color;
  shake: number;
  vignette: number;
}

export class ScreenEffects {
  fade = 0;
  flash = 0;
  flashColor = new Color(1, 1, 1, 1);
  shake = 0;
  vignette = 0;
  private fadeTarget = 0;
  private fadeSpeed = 0;
  private flashSpeed = 0;
  private vignetteTarget = 0;
  private vignetteSpeed = 0;

  fadeTo(target: number, duration: number): void {
    this.fadeTarget = target;
    this.fadeSpeed = duration <= 0 ? Infinity : Math.abs(target - this.fade) / duration;
    if (duration <= 0) this.fade = target;
  }

  flashScreen(color: Color, strength: number, duration: number): void {
    this.flashColor.copy(color);
    this.flash = strength;
    this.flashSpeed = duration <= 0 ? Infinity : strength / duration;
    if (duration <= 0) this.flash = 0;
  }

  addShake(trauma: number): void {
    this.shake = Math.min(1, this.shake + trauma);
  }

  vignetteTo(target: number, duration: number): void {
    this.vignetteTarget = target;
    this.vignetteSpeed = duration <= 0 ? Infinity : Math.abs(target - this.vignette) / duration;
    if (duration <= 0) this.vignette = target;
  }

  update(dt: number): ScreenEffectState {
    this.fade = approach(this.fade, this.fadeTarget, this.fadeSpeed * dt);
    this.flash = Math.max(0, this.flash - this.flashSpeed * dt);
    this.shake = Math.max(0, this.shake - dt * 0.9);
    this.vignette = approach(this.vignette, this.vignetteTarget, this.vignetteSpeed * dt);
    return this.state();
  }

  state(): ScreenEffectState {
    return {
      fade: this.fade,
      flash: this.flash,
      flashColor: this.flashColor.clone(),
      shake: this.shake,
      vignette: this.vignette,
    };
  }
}

function approach(value: number, target: number, maxDelta: number): number {
  if (value < target) return Math.min(target, value + maxDelta);
  return Math.max(target, value - maxDelta);
}

export type WeatherType = "clear" | "rain" | "snow";

export class WeatherSystem {
  readonly rain: ParticleEmitter;
  readonly snow: ParticleEmitter;
  current: WeatherType = "clear";
  intensity = 0;

  constructor(
    readonly random: Random = new Random(7),
    rainConfig: Partial<EmitterConfig> = {},
    snowConfig: Partial<EmitterConfig> = {},
  ) {
    this.rain = new ParticleEmitter(rainEmitter({ ...rainConfig, rate: 0, seed: this.random.int(1, 2 ** 31) }));
    this.snow = new ParticleEmitter(snowEmitter({ ...snowConfig, rate: 0, seed: this.random.int(1, 2 ** 31) }));
  }

  set(type: WeatherType, intensity: number): void {
    this.current = type;
    this.intensity = Math.max(0, Math.min(1, intensity));
    this.rain.emitting = type === "rain";
    this.snow.emitting = type === "snow";
  }

  update(dt: number, wind: Vec3 = new Vec3(0, 0, 0), world?: PhysicsWorld): void {
    this.rain.config.rate = 260 * this.intensity;
    this.snow.config.rate = 90 * this.intensity;
    this.rain.config.direction.copy(wind).add(new Vec3(0, -1, 0)).normalize();
    this.snow.config.direction.copy(wind).scale(0.35).add(new Vec3(0, -1, 0)).normalize();
    this.rain.update(dt, world);
    this.snow.update(dt, world);
  }

  get aliveCount(): number {
    return this.rain.aliveCount + this.snow.aliveCount;
  }
}

export interface VfxContext {
  screen: ScreenEffects;
  random: Random;
  register: (emitter: ParticleEmitter) => void;
}

export interface VfxEvent {
  at: number;
  run: (context: VfxContext) => void;
}

export class VfxGraph {
  time = 0;
  finished = false;
  private cursor = 0;
  readonly emitters: ParticleEmitter[] = [];

  constructor(
    readonly name: string,
    readonly events: readonly VfxEvent[],
  ) {}

  update(dt: number, screen: ScreenEffects = new ScreenEffects(), random: Random = new Random(1)): boolean {
    if (this.finished) return true;
    this.time += dt;
    const context: VfxContext = {
      screen,
      random,
      register: (emitter) => {
        if (!this.emitters.includes(emitter)) this.emitters.push(emitter);
      },
    };
    while (this.cursor < this.events.length && this.events[this.cursor]!.at <= this.time) {
      this.events[this.cursor]!.run(context);
      this.cursor += 1;
    }
    for (const emitter of this.emitters) emitter.update(dt);
    this.finished = this.cursor >= this.events.length && this.emitters.every((emitter) => emitter.aliveCount === 0);
    return this.finished;
  }

  reset(): void {
    this.time = 0;
    this.cursor = 0;
    this.finished = false;
  }
}

export interface ExplosionBundle {
  graph: VfxGraph;
  sparks: ParticleEmitter;
  smoke: ParticleEmitter;
}

export function explosionEffect(random: Random = new Random(13)): ExplosionBundle {
  const sparks = new ParticleEmitter(sparksEmitter({ burst: 56, maxParticles: 112, seed: random.int(1, 2 ** 31) }), random.int(1, 2 ** 31));
  const smoke = new ParticleEmitter(
    smokeEmitter({
      rate: 60,
      maxParticles: 140,
      lifetime: [0.9, 1.8],
      speed: [1.2, 2.6],
      spread: 2.4,
      gravity: new Vec3(0, 1.4, 0),
      startSize: [0.7, 1.2],
      endSize: 2.4,
      startColor: new Color(0.25, 0.24, 0.26, 0.9),
      endColor: new Color(0.55, 0.55, 0.6, 0),
      seed: random.int(1, 2 ** 31),
    }),
    random.int(1, 2 ** 31),
  );
  const graph = new VfxGraph("explosion", [
    {
      at: 0,
      run: (context) => {
        sparks.burst(56);
        smoke.emitting = true;
        context.register(sparks);
        context.register(smoke);
        context.screen.addShake(0.75);
        context.screen.flashScreen(new Color(1, 0.82, 0.55, 1), 0.65, 0.28);
      },
    },
    {
      at: 0.35,
      run: () => {
        smoke.emitting = false;
      },
    },
    {
      at: 1.4,
      run: (context) => {
        context.screen.addShake(0.1);
      },
    },
  ]);
  return { graph, sparks, smoke };
}

export function impactEffect(random: Random = new Random(21)): ExplosionBundle {
  const sparks = new ParticleEmitter(
    sparksEmitter({ burst: 18, maxParticles: 36, speed: [2, 5], spread: 1.35, seed: random.int(1, 2 ** 31) }),
    random.int(1, 2 ** 31),
  );
  const smoke = new ParticleEmitter(
    dustEmitterConfig(random.int(1, 2 ** 31)),
    random.int(1, 2 ** 31),
  );
  const graph = new VfxGraph("impact", [
    {
      at: 0,
      run: (context) => {
        sparks.burst(18);
        smoke.burst(10);
        context.register(sparks);
        context.register(smoke);
        context.screen.addShake(0.28);
      },
    },
  ]);
  return { graph, sparks, smoke };
}

function dustEmitterConfig(seed: number): EmitterConfig {
  return emitterConfig({
    rate: 0,
    burst: 10,
    maxParticles: 48,
    lifetime: [0.4, 0.9],
    speed: [1, 2.2],
    spread: 1.5,
    gravity: new Vec3(0, -1.2, 0),
    drag: 2.2,
    startSize: [0.35, 0.6],
    endSize: 1.1,
    startColor: new Color(0.6, 0.54, 0.46, 0.6),
    endColor: new Color(0.6, 0.54, 0.46, 0),
    seed,
  });
}

export const vfxPresets = {
  explosion: explosionEffect,
  impact: impactEffect,
};

export function smokeScreen(): ParticleEmitter {
  return new ParticleEmitter(smokeEmitter({ rate: 40, maxParticles: 260 }));
}

export function fireScreen(): ParticleEmitter {
  return new ParticleEmitter(emitterConfig({
    rate: 80,
    maxParticles: 240,
    lifetime: [0.3, 0.7],
    speed: [1.4, 3.4],
    direction: new Vec3(0, 1, 0),
    spread: 0.5,
    gravity: new Vec3(0, 3, 0),
    drag: 1.2,
    startSize: [0.4, 0.75],
    endSize: 0.06,
    startColor: new Color(1, 0.7, 0.2, 0.95),
    endColor: new Color(1, 0.22, 0.04, 0),
    seed: 5,
  }));
}
