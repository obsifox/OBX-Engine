import { describe, expect, it } from "vitest";
import { Color, Vec3 } from "@obx/math";
import { Body, PhysicsWorld, planeShape } from "@obx/physics";
import {
  Curve,
  GpuParticleBuffer,
  ParticleEmitter,
  ParticleSystem,
  dustEmitter,
  emitterConfig,
  fireEmitter,
  rainEmitter,
  smokeEmitter,
  snowEmitter,
  sparksEmitter,
} from "../src/index.js";

describe("Curve", () => {
  it("samples piecewise linear keys", () => {
    const curve = new Curve([{ t: 0, value: 0 }, { t: 0.5, value: 1 }, { t: 1, value: 0 }]);
    expect(curve.sample(0)).toBe(0);
    expect(curve.sample(0.25)).toBeCloseTo(0.5, 12);
    expect(curve.sample(0.5)).toBe(1);
    expect(curve.sample(0.75)).toBeCloseTo(0.5, 12);
    expect(curve.sample(2)).toBe(0);
    expect(Curve.constant(3).sample(0.7)).toBe(3);
    expect(Curve.linear(2, 4).sample(0.5)).toBe(3);
    expect(() => new Curve([{ t: 1, value: 0 }, { t: 0, value: 1 }])).toThrow();
  });
});

describe("ParticleEmitter", () => {
  it("spawns deterministically from a seed", () => {
    const config = { rate: 0, burst: 12, maxParticles: 32, lifetime: [1, 1] as const, speed: [1, 2] as const, seed: 42 };
    const a = new ParticleEmitter(config, 42);
    const b = new ParticleEmitter(config, 42);
    a.burst();
    b.burst();
    expect(a.aliveCount).toBe(12);
    for (let i = 0; i < 12; i += 1) {
      expect(a.particles[i]!.position.x).toBe(b.particles[i]!.position.x);
      expect(a.particles[i]!.velocity.y).toBe(b.particles[i]!.velocity.y);
    }
  });

  it("expires particles by lifetime", () => {
    const emitter = new ParticleEmitter({ rate: 0, burst: 4, maxParticles: 8, lifetime: [0.5, 0.5], gravity: new Vec3(0, 0, 0) }, 1);
    emitter.burst();
    expect(emitter.aliveCount).toBe(4);
    emitter.update(0.4);
    expect(emitter.aliveCount).toBe(4);
    emitter.update(0.2);
    expect(emitter.aliveCount).toBe(0);
  });

  it("integrates gravity and drag", () => {
    const emitter = new ParticleEmitter({
      rate: 0,
      burst: 1,
      maxParticles: 2,
      lifetime: [10, 10],
      speed: [0, 0],
      gravity: new Vec3(0, -10, 0),
      drag: 0,
    }, 1);
    emitter.burst();
    emitter.update(1);
    expect(emitter.particles[0]!.velocity.y).toBeCloseTo(-10, 6);
    expect(emitter.particles[0]!.position.y).toBeCloseTo(-10, 6);
    const dragged = new ParticleEmitter({
      rate: 0,
      burst: 1,
      maxParticles: 2,
      lifetime: [10, 10],
      speed: [2, 2],
      direction: new Vec3(1, 0, 0),
      spread: 0,
      gravity: new Vec3(0, 0, 0),
      drag: 1,
    }, 1);
    dragged.burst();
    dragged.update(0.5);
    expect(dragged.particles[0]!.velocity.x).toBeCloseTo(1, 6);
  });

  it("animates size and color over life", () => {
    const emitter = new ParticleEmitter({
      rate: 0,
      burst: 1,
      maxParticles: 2,
      lifetime: [1, 1],
      speed: [0, 0],
      gravity: new Vec3(0, 0, 0),
      startSize: [2, 2],
      endSize: 0,
      startColor: new Color(1, 0, 0, 1),
      endColor: new Color(0, 0, 1, 1),
    }, 1);
    emitter.burst();
    emitter.update(0.5);
    const particle = emitter.particles[0]!;
    expect(particle.size).toBeCloseTo(1, 9);
    expect(particle.color.r).toBeCloseTo(0.5, 6);
    expect(particle.color.b).toBeCloseTo(0.5, 6);
    emitter.update(0.5);
    expect(emitter.aliveCount).toBe(0);
  });

  it("bounces or kills on world collision", () => {
    const world = new PhysicsWorld({ gravity: new Vec3(0, 0, 0) });
    world.addBody(new Body({ type: "static", shape: planeShape(new Vec3(0, 1, 0), 0) }));
    const bouncer = new ParticleEmitter({
      rate: 0,
      burst: 1,
      maxParticles: 2,
      lifetime: [10, 10],
      speed: [2, 2],
      direction: new Vec3(0, -1, 0),
      spread: 0,
      gravity: new Vec3(0, 0, 0),
      drag: 0,
      collision: { bounce: 0.5, friction: 0, kill: false, killBelowSpeed: 0.01 },
    }, 1);
    bouncer.particles[0]!.position.set(0, 1, 0);
    bouncer.burst();
    bouncer.particles[0]!.position.set(0, 1, 0);
    bouncer.update(1, world);
    expect(bouncer.particles[0]!.position.y).toBeGreaterThan(0);
    expect(bouncer.particles[0]!.velocity.y).toBeGreaterThan(0);
    const killer = new ParticleEmitter({
      rate: 0,
      burst: 1,
      maxParticles: 2,
      lifetime: [10, 10],
      speed: [2, 2],
      direction: new Vec3(0, -1, 0),
      spread: 0,
      gravity: new Vec3(0, 0, 0),
      collision: { bounce: 0.5, friction: 0, kill: true, killBelowSpeed: 0.01 },
    }, 1);
    killer.burst();
    killer.particles[0]!.position.set(0, 1, 0);
    killer.update(1, world);
    expect(killer.aliveCount).toBe(0);
  });

  it("records trails", () => {
    const emitter = new ParticleEmitter({
      rate: 0,
      burst: 1,
      maxParticles: 2,
      lifetime: [4, 4],
      speed: [1, 1],
      direction: new Vec3(0, 1, 0),
      spread: 0,
      gravity: new Vec3(0, 0, 0),
      trailLength: 3,
    }, 1);
    emitter.burst();
    for (let i = 0; i < 5; i += 1) emitter.update(0.1);
    expect(emitter.trails[0]!.length).toBe(3);
    expect(emitter.trails[0]![2]!.y).toBeGreaterThan(emitter.trails[0]![0]!.y);
  });
});

describe("ParticleSystem and presets", () => {
  it("updates multiple emitters", () => {
    const system = new ParticleSystem();
    system.add(new ParticleEmitter({ rate: 10, burst: 2, maxParticles: 16, lifetime: [1, 1] }, 1));
    system.add(new ParticleEmitter({ rate: 0, burst: 5, maxParticles: 16, lifetime: [2, 2] }, 2));
    system.update(0.5);
    expect(system.aliveCount).toBeGreaterThan(2);
    expect(system.emitters).toHaveLength(2);
  });

  it("produces sensible presets", () => {
    for (const preset of [smokeEmitter, fireEmitter, sparksEmitter, dustEmitter, rainEmitter, snowEmitter]) {
      const config = preset();
      expect(config.maxParticles).toBeGreaterThan(0);
      expect(config.lifetime[1]).toBeGreaterThan(config.lifetime[0]);
    }
    expect(sparksEmitter().trailLength).toBeGreaterThan(0);
    expect(rainEmitter().direction.y).toBeLessThan(0);
  });
});

describe("GpuParticleBuffer", () => {
  it("runs a structure-of-arrays simulation", () => {
    const buffer = new GpuParticleBuffer(8);
    const color = new Color(1, 1, 1, 1);
    for (let i = 0; i < 8; i += 1) {
      buffer.spawn(new Vec3(0, i, 0), new Vec3(1, 0, 0), 0.5, 0.1, color);
    }
    expect(buffer.alive).toBe(8);
    expect(buffer.spawn(new Vec3(0, 0, 0), new Vec3(0, 0, 0), 1, 1, color)).toBe(-1);
    buffer.update(0.25, new Vec3(0, -10, 0), 0);
    expect(buffer.alive).toBe(8);
    expect(buffer.positions[0]).toBeCloseTo(0.25, 5);
    buffer.update(0.3, new Vec3(0, -10, 0), 0);
    expect(buffer.alive).toBe(0);
  });

  it("is deterministic against the object emitter path", () => {
    const buffer = new GpuParticleBuffer(4);
    const emitter = new ParticleEmitter({
      rate: 0,
      burst: 4,
      maxParticles: 4,
      lifetime: [1, 1],
      speed: [1, 1],
      direction: new Vec3(0, 1, 0),
      spread: 0,
      gravity: new Vec3(0, -5, 0),
      drag: 0,
    }, 9);
    emitter.burst();
    for (const particle of emitter.particles.slice(0, 4)) {
      buffer.spawn(particle.position, particle.velocity, particle.maxLife, particle.size, particle.color);
    }
    buffer.update(0.5, new Vec3(0, -5, 0), 0);
    emitter.update(0.5);
    expect(buffer.positions[1]).toBeCloseTo(emitter.particles[0]!.position.y, 5);
  });
});
