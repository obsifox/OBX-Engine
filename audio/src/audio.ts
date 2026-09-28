import { Vec3 } from "@obx/math";

export interface AudioClip {
  readonly name: string;
  readonly sampleRate: number;
  readonly channels: number;
  readonly data: Float32Array;
  readonly frames: number;
}

export function createClip(
  name: string,
  data: Float32Array,
  sampleRate = 44100,
  channels = 1,
): AudioClip {
  return { name, sampleRate, channels, data, frames: data.length / channels };
}

export function createSilenceClip(frames: number, sampleRate = 44100, channels = 1): AudioClip {
  return createClip("silence", new Float32Array(frames * channels), sampleRate, channels);
}

export type Waveform = "sine" | "square" | "triangle" | "saw";

export interface ToneOptions {
  sampleRate?: number;
  amplitude?: number;
  waveform?: Waveform;
  phase?: number;
}

export function createToneClip(
  name: string,
  frequency: number,
  durationSeconds: number,
  options: ToneOptions = {},
): AudioClip {
  const sampleRate = options.sampleRate ?? 44100;
  const amplitude = options.amplitude ?? 1;
  const phase = options.phase ?? 0;
  const frames = Math.max(1, Math.round(durationSeconds * sampleRate));
  const data = new Float32Array(frames);
  for (let i = 0; i < frames; i += 1) {
    const t = (i / sampleRate) * frequency * Math.PI * 2 + phase;
    const sine = Math.sin(t);
    let value = sine;
    switch (options.waveform ?? "sine") {
      case "square":
        value = sine >= 0 ? 1 : -1;
        break;
      case "triangle":
        value = (2 / Math.PI) * Math.asin(sine);
        break;
      case "saw":
        value = (((i / sampleRate) * frequency) % 1) * 2 - 1;
        break;
      default:
        value = sine;
    }
    data[i] = value * amplitude;
  }
  return createClip(name, data, sampleRate, 1);
}

export function createNoiseClip(
  name: string,
  durationSeconds: number,
  seed = 1,
  sampleRate = 44100,
  amplitude = 1,
): AudioClip {
  const frames = Math.max(1, Math.round(durationSeconds * sampleRate));
  const data = new Float32Array(frames);
  let state = seed >>> 0 || 1;
  for (let i = 0; i < frames; i += 1) {
    state = (state * 1664525 + 1013904223) >>> 0;
    data[i] = ((state / 0xffffffff) * 2 - 1) * amplitude;
  }
  return createClip(name, data, sampleRate, 1);
}

export interface EnvelopePoint {
  time: number;
  value: number;
}

export class Envelope {
  constructor(readonly points: readonly EnvelopePoint[]) {
    if (points.length === 0) throw new RangeError("Envelope needs points");
    for (let i = 1; i < points.length; i += 1) {
      if (points[i]!.time < points[i - 1]!.time) {
        throw new RangeError("Envelope points must be ordered");
      }
    }
  }

  static adsr(attack: number, decay: number, sustain: number, release: number): Envelope {
    return new Envelope([
      { time: 0, value: 0 },
      { time: attack, value: 1 },
      { time: attack + decay, value: sustain },
      { time: attack + decay + release, value: sustain },
      { time: attack + decay + release + 0.0001, value: 0 },
    ]);
  }

  sample(time: number): number {
    const points = this.points;
    if (time <= points[0]!.time) return points[0]!.value;
    const last = points[points.length - 1]!;
    if (time >= last.time) return last.value;
    for (let i = 1; i < points.length; i += 1) {
      const b = points[i]!;
      if (time <= b.time) {
        const a = points[i - 1]!;
        const span = b.time - a.time;
        const t = span <= 0 ? 1 : (time - a.time) / span;
        return a.value + (b.value - a.value) * t;
      }
    }
    return last.value;
  }
}

export interface AudioListener {
  position: Vec3;
  right: Vec3;
  maxDistance: number;
  rolloff: number;
}

export function createListener(position = new Vec3(0, 0, 0)): AudioListener {
  return { position, right: new Vec3(1, 0, 0), maxDistance: 20, rolloff: 1 };
}

export interface VoiceOptions {
  loop?: boolean;
  volume?: number;
  pitch?: number;
  pan?: number;
  bus?: string;
  position?: Vec3;
  envelope?: Envelope | null;
  maxDistance?: number;
}

export class AudioVoice {
  loop: boolean;
  volume: number;
  pitch: number;
  pan: number;
  bus: string;
  position: Vec3 | null;
  envelope: Envelope | null;
  maxDistance: number;
  playing = false;
  paused = false;
  cursor = 0;
  elapsed = 0;

  constructor(readonly clip: AudioClip, options: VoiceOptions = {}) {
    this.loop = options.loop ?? false;
    this.volume = options.volume ?? 1;
    this.pitch = options.pitch ?? 1;
    this.pan = options.pan ?? 0;
    this.bus = options.bus ?? "master";
    this.position = options.position?.clone() ?? null;
    this.envelope = options.envelope ?? null;
    this.maxDistance = options.maxDistance ?? 20;
  }

  play(): void {
    this.playing = true;
    this.paused = false;
    if (this.cursor >= this.clip.frames) this.cursor = 0;
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
  }

  stop(): void {
    this.playing = false;
    this.cursor = 0;
    this.elapsed = 0;
  }

  get finished(): boolean {
    return !this.playing && this.cursor === 0;
  }
}

export interface AudioEffect {
  readonly name: string;
  process(buffer: Float32Array, frames: number, channels: number, sampleRate: number): void;
}

export class GainEffect implements AudioEffect {
  readonly name = "gain";
  constructor(public gain: number) {}
  process(buffer: Float32Array, frames: number, channels: number): void {
    for (let i = 0; i < frames * channels; i += 1) buffer[i] = (buffer[i] ?? 0) * this.gain;
  }
}

export class EchoEffect implements AudioEffect {
  readonly name = "echo";
  private readonly history: Float32Array;

  private writeIndex = 0;

  constructor(
    readonly delaySeconds: number,
    readonly feedback: number,
    readonly mix: number,
    maxDelaySeconds = 2,
  ) {
    this.history = new Float32Array(Math.ceil(maxDelaySeconds * 48000));
  }

  process(buffer: Float32Array, frames: number, channels: number, sampleRate: number): void {
    const delaySamples = Math.max(1, Math.round(this.delaySeconds * sampleRate)) * channels;
    const size = this.history.length;
    for (let i = 0; i < frames * channels; i += 1) {
      const readIndex = (this.writeIndex - delaySamples + size) % size;
      const delayed = this.history[readIndex] ?? 0;
      const input = buffer[i] ?? 0;
      const output = input + delayed * this.feedback;
      this.history[this.writeIndex] = output;
      this.writeIndex = (this.writeIndex + 1) % size;
      buffer[i] = input * (1 - this.mix) + output * this.mix;
    }
  }
}

export class ReverbEffect implements AudioEffect {
  readonly name = "reverb";
  private combs: Float32Array[];
  private combIndex: number[];
  private allpasses: Float32Array[];
  private allpassIndex: number[];

  constructor(readonly roomSize = 0.7, readonly damping = 0.3, readonly wet = 0.3, sampleRate = 44100) {
    const combDelays = [1557, 1617, 1491, 1422].map((d) => Math.round((d * sampleRate) / 44100));
    const allpassDelays = [225, 556].map((d) => Math.round((d * sampleRate) / 44100));
    this.combs = combDelays.map((d) => new Float32Array(d));
    this.combIndex = combDelays.map(() => 0);
    this.allpasses = allpassDelays.map((d) => new Float32Array(d));
    this.allpassIndex = allpassDelays.map(() => 0);
  }

  process(buffer: Float32Array, frames: number, channels: number): void {
    for (let i = 0; i < frames * channels; i += 1) {
      const input = buffer[i] ?? 0;
      let sum = 0;
      for (let c = 0; c < this.combs.length; c += 1) {
        const buf = this.combs[c]!;
        const index = this.combIndex[c]!;
        const output = buf[index] ?? 0;
        buf[index] = input + output * this.roomSize * (1 - this.damping * 0.1);
        this.combIndex[c] = (index + 1) % buf.length;
        sum += output;
      }
      let processed = sum / this.combs.length;
      for (let a = 0; a < this.allpasses.length; a += 1) {
        const buf = this.allpasses[a]!;
        const index = this.allpassIndex[a]!;
        const delayed = buf[index] ?? 0;
        const output = -processed + delayed;
        buf[index] = processed + delayed * 0.5;
        this.allpassIndex[a] = (index + 1) % buf.length;
        processed = output;
      }
      buffer[i] = input * (1 - this.wet) + processed * this.wet;
    }
  }
}

export interface AudioBus {
  name: string;
  gain: number;
  effects: AudioEffect[];
}

export class AudioMixer {
  masterGain = 1;
  readonly voices = new Set<AudioVoice>();
  readonly buses = new Map<string, AudioBus>();
  listener: AudioListener = createListener();

  constructor() {
    this.createBus("master");
    this.createBus("music");
    this.createBus("sfx");
  }

  createBus(name: string, gain = 1): AudioBus {
    const bus: AudioBus = { name, gain, effects: [] };
    this.buses.set(name, bus);
    return bus;
  }

  addVoice(voice: AudioVoice): AudioVoice {
    this.voices.add(voice);
    return voice;
  }

  play(clip: AudioClip, options: VoiceOptions = {}): AudioVoice {
    const voice = new AudioVoice(clip, options);
    voice.play();
    this.voices.add(voice);
    return voice;
  }

  render(output: Float32Array, frames: number, sampleRate = 44100, channels = 2): void {
    output.fill(0);
    for (const voice of this.voices) {
      if (!voice.playing || voice.paused) continue;
      this.renderVoice(voice, output, frames, sampleRate, channels);
      if (!voice.playing && voice.cursor === 0) this.voices.delete(voice);
    }
    for (const bus of this.buses.values()) {
      if (bus.name === "master" || bus.gain === 1) continue;
    }
    for (let i = 0; i < frames * channels; i += 1) {
      output[i] = (output[i] ?? 0) * this.masterGain;
    }
    void this.runBusEffects(frames, sampleRate, channels);
  }

  private runBusEffects(frames: number, sampleRate: number, channels: number): void {
    void frames;
    void sampleRate;
    void channels;
  }

  private renderVoice(
    voice: AudioVoice,
    output: Float32Array,
    frames: number,
    sampleRate: number,
    channels: number,
  ): void {
    const clip = voice.clip;
    const bus = this.buses.get(voice.bus);
    const busGain = bus?.gain ?? 1;
    const clipRatio = clip.sampleRate / sampleRate;
    const pan = Math.max(-1, Math.min(1, voice.pan));
    const angle = ((pan + 1) * Math.PI) / 4;
    const panLeft = Math.cos(angle);
    const panRight = Math.sin(angle);

    let spatialGain = 1;
    let spatialPan = 0;
    if (voice.position) {
      const toSource = voice.position.clone().sub(this.listener.position);
      const distance = toSource.length();
      const maxDistance = Math.min(voice.maxDistance, this.listener.maxDistance);
      spatialGain = Math.max(0, 1 - (distance / Math.max(maxDistance, 1e-6)) * this.listener.rolloff);
      if (distance > 1e-9) {
        spatialPan = Math.max(-1, Math.min(1, toSource.clone().normalize().dot(this.listener.right)));
      }
    }
    const spatialAngle = ((spatialPan + 1) * Math.PI) / 4;

    for (let frame = 0; frame < frames; frame += 1) {
      if (!voice.playing) break;
      if (voice.cursor >= clip.frames) {
        if (voice.loop && clip.frames > 0) {
          voice.cursor %= clip.frames;
        } else {
          voice.playing = false;
          voice.cursor = 0;
          voice.elapsed = 0;
          break;
        }
      }
      const index = Math.floor(voice.cursor);
      const next = Math.min(index + 1, clip.frames - 1);
      const fraction = voice.cursor - index;
      const env = voice.envelope ? voice.envelope.sample(voice.elapsed) : 1;
      const gain = voice.volume * env * busGain * spatialGain;
      for (let channel = 0; channel < channels; channel += 1) {
        const clipChannel = Math.min(channel, clip.channels - 1);
        const a = clip.data[index * clip.channels + clipChannel] ?? 0;
        const b = clip.data[next * clip.channels + clipChannel] ?? 0;
        const sample = (a + (b - a) * fraction) * gain;
        const panL = voice.position ? Math.cos(spatialAngle) : panLeft;
        const panR = voice.position ? Math.sin(spatialAngle) : panRight;
        const outIndex = frame * channels + channel;
        const panGain = channel === 0 ? panL : channel === 1 ? panR : 1 / Math.sqrt(channels);
        output[outIndex] = (output[outIndex] ?? 0) + sample * panGain;
      }
      voice.cursor += voice.pitch * clipRatio;
      voice.elapsed += 1 / sampleRate;
    }
    if (bus) {
      void bus;
    }
  }
}
