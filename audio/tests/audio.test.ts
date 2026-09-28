import { describe, expect, it } from "vitest";
import { Vec3 } from "@obx/math";
import {
  AudioMixer,
  EchoEffect,
  Envelope,
  GainEffect,
  ReverbEffect,
  createClip,
  createListener,
  createNoiseClip,
  createSilenceClip,
  createToneClip,
} from "../src/index.js";

describe("clips", () => {
  it("generates exact sine samples", () => {
    const clip = createToneClip("sine", 4, 1, { sampleRate: 16, amplitude: 0.5 });
    expect(clip.frames).toBe(16);
    expect(clip.data[0]).toBeCloseTo(0, 12);
    expect(clip.data[1]).toBeCloseTo(0.5, 12);
    expect(clip.data[2]).toBeCloseTo(0, 12);
    expect(clip.data[3]).toBeCloseTo(-0.5, 12);
  });

  it("generates square, triangle and saw waves", () => {
    const square = createToneClip("sq", 1, 1, { sampleRate: 8, waveform: "square" });
    expect(square.data[0]).toBe(1);
    expect(square.data[4]!).toBe(1);
    const saw = createToneClip("saw", 1, 1, { sampleRate: 8, waveform: "saw" });
    expect(saw.data[0]).toBeCloseTo(-1, 12);
    expect(saw.data[3]!).toBeCloseTo(-0.25, 12);
  });

  it("creates deterministic noise and silence", () => {
    const a = createNoiseClip("n", 0.01, 42);
    const b = createNoiseClip("n", 0.01, 42);
    expect(Array.from(a.data)).toEqual(Array.from(b.data));
    expect(a.data[0]).toBeGreaterThanOrEqual(-1);
    expect(createSilenceClip(8).data.every((v) => v === 0)).toBe(true);
  });

  it("roundtrips raw clips", () => {
    const clip = createClip("raw", new Float32Array([0.1, -0.2, 0.3]), 8000);
    expect(clip.frames).toBe(3);
    expect(clip.sampleRate).toBe(8000);
  });
});

describe("Envelope", () => {
  it("samples piecewise linear curves", () => {
    const env = Envelope.adsr(1, 1, 0.5, 1);
    expect(env.sample(0)).toBeCloseTo(0, 12);
    expect(env.sample(0.5)).toBeCloseTo(0.5, 12);
    expect(env.sample(1)).toBeCloseTo(1, 12);
    expect(env.sample(1.5)).toBeCloseTo(0.75, 12);
    expect(env.sample(2)).toBeCloseTo(0.5, 12);
    expect(env.sample(2.5)).toBeCloseTo(0.5, 12);
    expect(env.sample(3.5)).toBeCloseTo(0, 12);
  });

  it("rejects unordered points", () => {
    expect(() => new Envelope([{ time: 1, value: 0 }, { time: 0, value: 1 }])).toThrow();
  });
});

describe("AudioMixer", () => {
  it("mixes mono clips to stereo with gains", () => {
    const mixer = new AudioMixer();
    const clip = createClip("flat", new Float32Array([1, 1, 1, 1]), 4, 1);
    const voice = mixer.play(clip, { volume: 0.5, pan: 0, bus: "sfx" });
    expect(voice.playing).toBe(true);
    const output = new Float32Array(8);
    mixer.render(output, 4, 4, 2);
    const expected = 0.5 * Math.cos(Math.PI / 4);
    expect(output[0]).toBeCloseTo(expected, 6);
    expect(output[1]).toBeCloseTo(expected, 6);
    expect(output[6]).toBeCloseTo(expected, 6);
    expect(output[7]).toBeCloseTo(expected, 6);
  });

  it("pans hard left and right", () => {
    const mixer = new AudioMixer();
    mixer.play(createClip("f", new Float32Array([1, 1]), 2, 1), { volume: 1, pan: -1 });
    const output = new Float32Array(4);
    mixer.render(output, 2, 2, 2);
    expect(output[0]).toBeCloseTo(1, 6);
    expect(output[1]).toBeCloseTo(0, 6);
    const mixer2 = new AudioMixer();
    mixer2.play(createClip("f", new Float32Array([1, 1]), 2, 1), { volume: 1, pan: 1 });
    const output2 = new Float32Array(4);
    mixer2.render(output2, 2, 2, 2);
    expect(output2[0]).toBeCloseTo(0, 6);
    expect(output2[1]).toBeCloseTo(1, 6);
  });

  it("respects pitch and looping", () => {
    const mixer = new AudioMixer();
    mixer.play(createClip("c", new Float32Array([1, 0, 0, 0]), 4, 1), { pitch: 2, loop: true });
    const output = new Float32Array(8);
    mixer.render(output, 4, 4, 2);
    const center = Math.cos(Math.PI / 4);
    expect(output[0]).toBeCloseTo(center, 6);
    expect(output[2]).toBeCloseTo(0, 6);
    expect(output[4]).toBeCloseTo(center, 6);
  });

  it("applies envelopes and master gain", () => {
    const mixer = new AudioMixer();
    mixer.masterGain = 0.5;
    mixer.play(createClip("c", new Float32Array([1, 1, 1, 1]), 4, 1), {
      envelope: new Envelope([{ time: 0, value: 1 }, { time: 1, value: 0 }]),
    });
    const output = new Float32Array(8);
    mixer.render(output, 4, 4, 2);
    expect(output[0]).toBeGreaterThan(output[6]!);
    expect(output[6]).toBeCloseTo(0.25 * 0.5 * Math.cos(Math.PI / 4), 6);
  });

  it("computes spatial attenuation and pan", () => {
    const mixer = new AudioMixer();
    mixer.listener = createListener(new Vec3(0, 0, 0));
    mixer.listener.maxDistance = 10;
    mixer.play(createClip("c", new Float32Array([1, 1, 1, 1]), 4, 1), {
      position: new Vec3(10, 0, 0),
      maxDistance: 10,
    });
    const output = new Float32Array(8);
    mixer.render(output, 4, 4, 2);
    expect(output[0]).toBeCloseTo(0, 6);
    expect(output[1]).toBeCloseTo(0, 6);
    const mixer2 = new AudioMixer();
    mixer2.listener.maxDistance = 10;
    mixer2.play(createClip("c", new Float32Array([1, 1, 1, 1]), 4, 1), {
      position: new Vec3(5, 0, 0),
      maxDistance: 10,
    });
    const output2 = new Float32Array(8);
    mixer2.render(output2, 4, 4, 2);
    expect(output2[1]).toBeGreaterThan(output2[0]!);
  });
});

describe("effects", () => {
  it("scales with gain", () => {
    const effect = new GainEffect(0.25);
    const buffer = new Float32Array([1, -1, 0.5, 0]);
    effect.process(buffer, 2, 2, 44100);
    expect(buffer[0]).toBeCloseTo(0.25, 12);
    expect(buffer[1]).toBeCloseTo(-0.25, 12);
  });

  it("echoes with feedback", () => {
    const effect = new EchoEffect(0.5, 0.5, 1, 1);
    const buffer = new Float32Array([1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    effect.process(buffer, 12, 1, 10);
    expect(buffer[0]).toBeCloseTo(1, 12);
    expect(buffer[5]).toBeCloseTo(0.5, 12);
    expect(buffer[10]).toBeCloseTo(0.25, 12);
  });

  it("reverb preserves dry level at zero wet", () => {
    const effect = new ReverbEffect(0.7, 0.3, 0, 44100);
    const buffer = new Float32Array([1, 0, 0, 0]);
    effect.process(buffer, 4, 1, 44100);
    expect(buffer[0]).toBeCloseTo(1, 12);
    const wet = new ReverbEffect(0.7, 0.3, 1, 100);
    const impulse = new Float32Array(64);
    impulse[0] = 1;
    wet.process(impulse, 64, 1, 100);
    expect(impulse.some((value, index) => index > 0 && Math.abs(value) > 0.01)).toBe(true);
  });
});
