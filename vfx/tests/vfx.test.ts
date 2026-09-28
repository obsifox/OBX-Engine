import { describe, expect, it } from "vitest";
import { Color, Vec3 } from "@obx/math";
import { Random } from "@obx/core";
import {
  ScreenEffects,
  VfxGraph,
  WeatherSystem,
  explosionEffect,
  fireScreen,
  impactEffect,
  smokeScreen,
} from "../src/index.js";



describe("ScreenEffects", () => {
  it("fades toward the target at a rate", () => {
    const screen = new ScreenEffects();
    screen.fadeTo(1, 0.5);
    screen.update(0.25);
    expect(screen.fade).toBeCloseTo(0.5, 9);
    screen.update(0.25);
    expect(screen.fade).toBeCloseTo(1, 9);
  });

  it("decays flash and shake", () => {
    const screen = new ScreenEffects();
    screen.flashScreen(new Color(1, 0, 0, 1), 0.8, 0.4);
    screen.addShake(0.5);
    expect(screen.flash).toBeCloseTo(0.8, 9);
    const state = screen.update(0.2);
    expect(state.flash).toBeCloseTo(0.4, 9);
    expect(state.shake).toBeCloseTo(0.32, 9);
    screen.update(0.5);
    expect(screen.flash).toBe(0);
  });

  it("clamps shake and vignette targets", () => {
    const screen = new ScreenEffects();
    screen.addShake(2);
    expect(screen.shake).toBe(1);
    screen.vignetteTo(0.6, 0.3);
    screen.update(1);
    expect(screen.vignette).toBeCloseTo(0.6, 9);
    screen.fadeTo(0, 0);
    expect(screen.fade).toBe(0);
  });
});

describe("WeatherSystem", () => {
  it("switches rain and snow with intensity", () => {
    const weather = new WeatherSystem(new Random(5));
    weather.set("rain", 1);
    weather.update(0.2, new Vec3(0.5, 0, 0));
    expect(weather.rain.emitting).toBe(true);
    expect(weather.rain.aliveCount).toBeGreaterThan(0);
    expect(weather.snow.aliveCount).toBe(0);
    weather.set("snow", 0.5);
    weather.update(0.2);
    expect(weather.snow.emitting).toBe(true);
    weather.set("clear", 0);
    expect(weather.rain.emitting).toBe(false);
    expect(weather.intensity).toBe(0);
    expect(weather.aliveCount).toBeGreaterThan(0);
  });

  it("spawns deterministically", () => {
    const a = new WeatherSystem(new Random(11));
    const b = new WeatherSystem(new Random(11));
    a.set("rain", 1);
    b.set("rain", 1);
    a.update(0.3, new Vec3(0, 0, 0));
    b.update(0.3, new Vec3(0, 0, 0));
    expect(a.rain.aliveCount).toBe(b.rain.aliveCount);
    expect(a.rain.particles[0]!.position.x).toBe(b.rain.particles[0]!.position.x);
  });
});

describe("VfxGraph", () => {
  it("runs events on schedule and finishes", () => {
    const fired: string[] = [];
    const graph = new VfxGraph("test", [
      { at: 0, run: () => fired.push("a") },
      { at: 0.5, run: () => fired.push("b") },
    ]);
    const screen = new ScreenEffects();
    expect(graph.update(0.2, screen)).toBe(false);
    expect(fired).toEqual(["a"]);
    expect(graph.update(0.3, screen)).toBe(true);
    expect(fired).toEqual(["a", "b"]);
    graph.reset();
    expect(graph.time).toBe(0);
    expect(graph.finished).toBe(false);
  });

  it("drives the explosion composition", () => {
    const bundle = explosionEffect(new Random(17));
    const screen = new ScreenEffects();
    expect(screen.shake).toBe(0);
    bundle.graph.update(0.05, screen);
    expect(screen.shake).toBeGreaterThan(0.5);
    expect(screen.flash).toBeGreaterThan(0.3);
    expect(bundle.sparks.aliveCount).toBeGreaterThan(0);
    expect(bundle.smoke.aliveCount).toBeGreaterThan(0);
    for (let i = 0; i < 30; i += 1) bundle.graph.update(0.1, screen);
    expect(bundle.smoke.emitting).toBe(false);
  });

  it("drives the impact composition", () => {
    const bundle = impactEffect(new Random(19));
    const screen = new ScreenEffects();
    bundle.graph.update(0.05, screen);
    expect(bundle.sparks.aliveCount).toBeGreaterThan(0);
    expect(screen.shake).toBeGreaterThan(0.1);
  });
});

describe("vfx screens", () => {
  it("creates smoke and fire columns", () => {
    const smoke = smokeScreen();
    const fire = fireScreen();
    smoke.update(0.5);
    fire.update(0.5);
    expect(smoke.aliveCount).toBeGreaterThan(0);
    expect(fire.aliveCount).toBeGreaterThan(0);
  });
});
