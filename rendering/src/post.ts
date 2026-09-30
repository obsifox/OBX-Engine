export type ToneMapOperator = "linear" | "reinhard" | "aces";

export interface BloomSettings {
  enabled: boolean;
  threshold: number;
  intensity: number;
  radius: number;
}

export interface ColorGradeSettings {
  exposure: number;
  contrast: number;
  saturation: number;
  lift: number;
  gamma: number;
  gain: number;
}

export interface VignetteSettings {
  strength: number;
  radius: number;
}

export interface SsaoSettings {
  enabled: boolean;
  intensity: number;
  samples: number;
  radius: number;
}

export interface DepthOfFieldSettings {
  enabled: boolean;
  focusDistance: number;
  blurRadius: number;
}

export interface MotionBlurSettings {
  enabled: boolean;
  strength: number;
}

export interface TaaSettings {
  enabled: boolean;
  alpha: number;
}

export interface PostSettings {
  toneMap: ToneMapOperator;
  bloom: BloomSettings;
  grade: ColorGradeSettings;
  vignette: VignetteSettings;
  fxaaEnabled: boolean;
  ssao: SsaoSettings;
  depthOfField: DepthOfFieldSettings;
  motionBlur: MotionBlurSettings;
  taa: TaaSettings;
}

export interface FrameBuffer {
  width: number;
  height: number;
  color: Float32Array;
  depth?: Float32Array | null;
  velocity?: Float32Array | null;
}

export function createFrameBuffer(width: number, height: number, depth = false, velocity = false): FrameBuffer {
  return {
    width,
    height,
    color: new Float32Array(width * height * 4),
    depth: depth ? new Float32Array(width * height) : null,
    velocity: velocity ? new Float32Array(width * height * 2) : null,
  };
}

export function defaultPostSettings(): PostSettings {
  return {
    toneMap: "aces",
    bloom: { enabled: true, threshold: 1, intensity: 0.6, radius: 2 },
    grade: { exposure: 1, contrast: 1, saturation: 1, lift: 0, gamma: 1, gain: 1 },
    vignette: { strength: 0.25, radius: 0.85 },
    fxaaEnabled: true,
    ssao: { enabled: false, intensity: 1, samples: 8, radius: 1 },
    depthOfField: { enabled: false, focusDistance: 5, blurRadius: 2 },
    motionBlur: { enabled: false, strength: 0.5 },
    taa: { enabled: false, alpha: 0.1 },
  };
}

export function toneMapValue(value: number, operator: ToneMapOperator): number {
  const v = Math.max(0, value);
  switch (operator) {
    case "linear":
      return Math.min(1, v);
    case "reinhard":
      return v / (1 + v);
    case "aces": {
      const a = 2.51;
      const b = 0.03;
      const c = 2.43;
      const d = 0.59;
      const e = 0.14;
      return Math.min(1, Math.max(0, (v * (a * v + b)) / (v * (c * v + d) + e)));
    }
  }
}

export function applyToneMap(buffer: FrameBuffer, operator: ToneMapOperator): void {
  const color = buffer.color;
  for (let i = 0; i < color.length; i += 4) {
    color[i] = toneMapValue(color[i]!, operator);
    color[i + 1] = toneMapValue(color[i + 1]!, operator);
    color[i + 2] = toneMapValue(color[i + 2]!, operator);
  }
}

function luma(color: Float32Array, index: number): number {
  return color[index]! * 0.2126 + color[index + 1]! * 0.7152 + color[index + 2]! * 0.0722;
}

export function extractBrightPass(buffer: FrameBuffer, threshold: number): Float32Array {
  const out = new Float32Array(buffer.width * buffer.height * 4);
  for (let i = 0; i < buffer.color.length; i += 4) {
    const brightness = luma(buffer.color, i);
    const factor = Math.max(0, brightness - threshold) / Math.max(brightness, 1e-5);
    out[i] = buffer.color[i]! * factor;
    out[i + 1] = buffer.color[i + 1]! * factor;
    out[i + 2] = buffer.color[i + 2]! * factor;
    out[i + 3] = 1;
  }
  return out;
}

export function blurBuffer(source: Float32Array, width: number, height: number, radius: number): Float32Array {
  const r = Math.max(0, Math.round(radius));
  const horizontal = new Float32Array(source.length);
  const out = new Float32Array(source.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      let count = 0;
      for (let dx = -r; dx <= r; dx += 1) {
        const sx = Math.min(width - 1, Math.max(0, x + dx));
        const index = (y * width + sx) * 4;
        rSum += source[index]!;
        gSum += source[index + 1]!;
        bSum += source[index + 2]!;
        count += 1;
      }
      const index = (y * width + x) * 4;
      horizontal[index] = rSum / count;
      horizontal[index + 1] = gSum / count;
      horizontal[index + 2] = bSum / count;
      horizontal[index + 3] = 1;
    }
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      let count = 0;
      for (let dy = -r; dy <= r; dy += 1) {
        const sy = Math.min(height - 1, Math.max(0, y + dy));
        const index = (sy * width + x) * 4;
        rSum += horizontal[index]!;
        gSum += horizontal[index + 1]!;
        bSum += horizontal[index + 2]!;
        count += 1;
      }
      const index = (y * width + x) * 4;
      out[index] = rSum / count;
      out[index + 1] = gSum / count;
      out[index + 2] = bSum / count;
      out[index + 3] = 1;
    }
  }
  return out;
}

export function applyBloom(buffer: FrameBuffer, settings: BloomSettings): void {
  if (!settings.enabled) return;
  const bright = extractBrightPass(buffer, settings.threshold);
  const blurred = blurBuffer(bright, buffer.width, buffer.height, settings.radius);
  for (let i = 0; i < buffer.color.length; i += 4) {
    buffer.color[i] = buffer.color[i]! + ( blurred[i]! * settings.intensity);
    buffer.color[i + 1] = buffer.color[i + 1]! + ( blurred[i + 1]! * settings.intensity);
    buffer.color[i + 2] = buffer.color[i + 2]! + ( blurred[i + 2]! * settings.intensity);
  }
}

export function applyColorGrade(buffer: FrameBuffer, settings: ColorGradeSettings): void {
  for (let i = 0; i < buffer.color.length; i += 4) {
    const values: [number, number, number] = [0, 0, 0];
    for (let channel = 0; channel < 3; channel += 1) {
      let value = buffer.color[i + channel]! * settings.exposure;
      value = Math.pow(Math.max(0, value), 1 / Math.max(settings.gamma, 1e-3)) * settings.gain + settings.lift;
      values[channel] = (value - 0.5) * settings.contrast + 0.5;
    }
    const gray = 0.2126 * values[0] + 0.7152 * values[1] + 0.0722 * values[2];
    for (let channel = 0; channel < 3; channel += 1) {
      buffer.color[i + channel] = Math.max(0, gray + (values[channel]! - gray) * settings.saturation);
    }
  }
}

export function applyVignette(buffer: FrameBuffer, settings: VignetteSettings): void {
  const { width, height } = buffer;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const u = (x + 0.5) / width * 2 - 1;
      const v = (y + 0.5) / height * 2 - 1;
      const distance = Math.sqrt(u * u + v * v) / Math.SQRT2;
      const falloff = Math.max(0, 1 - Math.max(0, distance - settings.radius) * settings.strength * 4);
      const index = (y * width + x) * 4;
      buffer.color[index] = buffer.color[index]! * ( falloff);
      buffer.color[index + 1] = buffer.color[index + 1]! * ( falloff);
      buffer.color[index + 2] = buffer.color[index + 2]! * ( falloff);
    }
  }
}

export function applyFxaa(buffer: FrameBuffer): void {
  const { width, height, color } = buffer;
  const original = color.slice();
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = (y * width + x) * 4;
      const center = luma(original, index);
      const left = luma(original, index - 4);
      const right = luma(original, index + 4);
      const up = luma(original, index - width * 4);
      const down = luma(original, index + width * 4);
      const edge = Math.max(Math.abs(left - right), Math.abs(up - down));
      if (edge < 0.08) continue;
      const blend = (left + right + up + down) / 4;
      const factor = Math.min(1, edge * 2) * 0.5;
      for (let channel = 0; channel < 3; channel += 1) {
        color[index + channel] = original[index + channel]! * (1 - factor) + blend * factor;
      }
    }
  }
}

export function computeSsao(depth: Float32Array, width: number, height: number, settings: SsaoSettings): Float32Array {
  const occlusion = new Float32Array(width * height);
  if (!settings.enabled) {
    occlusion.fill(1);
    return occlusion;
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      const center = depth[index]!;
      if (!Number.isFinite(center) || center <= 0) {
        occlusion[index] = 1;
        continue;
      }
      let blocked = 0;
      const samples = Math.max(1, settings.samples);
      for (let s = 0; s < samples; s += 1) {
        const angle = (s / samples) * Math.PI * 2;
        const sx = Math.round(x + Math.cos(angle) * settings.radius);
        const sy = Math.round(y + Math.sin(angle) * settings.radius);
        if (sx < 0 || sy < 0 || sx >= width || sy >= height) continue;
        const neighbor = depth[sy * width + sx]!;
        if (Number.isFinite(neighbor) && neighbor < center - 1e-4) {
          blocked += 1 - Math.min(1, (center - neighbor) * settings.radius * 8);
        }
      }
      occlusion[index] = Math.max(0, 1 - (blocked / samples) * settings.intensity);
    }
  }
  return occlusion;
}

export function applySsao(buffer: FrameBuffer, settings: SsaoSettings): void {
  if (!settings.enabled || !buffer.depth) return;
  const occlusion = computeSsao(buffer.depth, buffer.width, buffer.height, settings);
  for (let i = 0; i < buffer.color.length; i += 4) {
    const factor = occlusion[i / 4]!;
    buffer.color[i] = buffer.color[i]! * factor;
    buffer.color[i + 1] = buffer.color[i + 1]! * factor;
    buffer.color[i + 2] = buffer.color[i + 2]! * factor;
  }
}

export function applyDepthOfField(buffer: FrameBuffer, settings: DepthOfFieldSettings): void {
  if (!settings.enabled || !buffer.depth) return;
  const blurred = blurBuffer(buffer.color, buffer.width, buffer.height, settings.blurRadius);
  for (let y = 0; y < buffer.height; y += 1) {
    for (let x = 0; x < buffer.width; x += 1) {
      const index = y * buffer.width + x;
      const distance = buffer.depth![index]!;
      const factor = Math.min(1, Math.abs(distance - settings.focusDistance) / Math.max(settings.focusDistance, 1e-3));
      const offset = index * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        buffer.color[offset + channel] = buffer.color[offset + channel]! * (1 - factor) + blurred[offset + channel]! * factor;
      }
    }
  }
}

export function applyMotionBlur(buffer: FrameBuffer, settings: MotionBlurSettings): void {
  if (!settings.enabled || !buffer.velocity) return;
  const original = buffer.color.slice();
  const velocity = buffer.velocity;
  for (let y = 0; y < buffer.height; y += 1) {
    for (let x = 0; x < buffer.width; x += 1) {
      const index = y * buffer.width + x;
      const vx = velocity[index * 2]! * settings.strength;
      const vy = velocity[index * 2 + 1]! * settings.strength;
      let r = 0;
      let g = 0;
      let b = 0;
      let count = 0;
      for (let step = 0; step < 4; step += 1) {
        const t = step / 3 - 0.5;
        const sx = Math.min(buffer.width - 1, Math.max(0, Math.round(x + vx * t * buffer.width)));
        const sy = Math.min(buffer.height - 1, Math.max(0, Math.round(y + vy * t * buffer.height)));
        const source = (sy * buffer.width + sx) * 4;
        r += original[source]!;
        g += original[source + 1]!;
        b += original[source + 2]!;
        count += 1;
      }
      const offset = index * 4;
      buffer.color[offset] = r / count;
      buffer.color[offset + 1] = g / count;
      buffer.color[offset + 2] = b / count;
    }
  }
}

export function applyTaa(buffer: FrameBuffer, history: Float32Array, settings: TaaSettings): void {
  if (!settings.enabled) return;
  const alpha = Math.min(1, Math.max(0, settings.alpha));
  for (let i = 0; i < buffer.color.length; i += 4) {
    buffer.color[i] = buffer.color[i]! * (1 - alpha) + history[i]! * alpha;
    buffer.color[i + 1] = buffer.color[i + 1]! * (1 - alpha) + history[i + 1]! * alpha;
    buffer.color[i + 2] = buffer.color[i + 2]! * (1 - alpha) + history[i + 2]! * alpha;
    history[i] = buffer.color[i]!;
    history[i + 1] = buffer.color[i + 1]!;
    history[i + 2] = buffer.color[i + 2]!;
  }
}

export function applyPostChain(buffer: FrameBuffer, settings: PostSettings, history?: Float32Array | null): void {
  applySsao(buffer, settings.ssao);
  applyBloom(buffer, settings.bloom);
  applyToneMap(buffer, settings.toneMap);
  applyColorGrade(buffer, settings.grade);
  if (settings.taa.enabled && history) {
    applyTaa(buffer, history, settings.taa);
  }
  if (settings.fxaaEnabled) {
    applyFxaa(buffer);
  }
  applyDepthOfField(buffer, settings.depthOfField);
  applyMotionBlur(buffer, settings.motionBlur);
  applyVignette(buffer, settings.vignette);
}
