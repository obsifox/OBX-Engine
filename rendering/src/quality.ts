export type QualityLevelName = "low" | "medium" | "high" | "ultra";

export interface QualitySettings {
  level: QualityLevelName;
  shadowMapSize: number;
  pcfTaps: number;
  pcfRadius: number;
  shadowCascades: number;
  maxLights: number;
  bloomEnabled: boolean;
  bloomRadius: number;
  ssaoEnabled: boolean;
  ssaoSamples: number;
  fxaaEnabled: boolean;
  taaEnabled: boolean;
  particleBudget: number;
  lodBias: number;
}

const PRESETS: Record<QualityLevelName, QualitySettings> = {
  low: {
    level: "low",
    shadowMapSize: 512,
    pcfTaps: 1,
    pcfRadius: 0,
    shadowCascades: 1,
    maxLights: 4,
    bloomEnabled: false,
    bloomRadius: 1,
    ssaoEnabled: false,
    ssaoSamples: 4,
    fxaaEnabled: true,
    taaEnabled: false,
    particleBudget: 2048,
    lodBias: 0.5,
  },
  medium: {
    level: "medium",
    shadowMapSize: 1024,
    pcfTaps: 4,
    pcfRadius: 1,
    shadowCascades: 2,
    maxLights: 8,
    bloomEnabled: true,
    bloomRadius: 2,
    ssaoEnabled: true,
    ssaoSamples: 8,
    fxaaEnabled: true,
    taaEnabled: false,
    particleBudget: 8192,
    lodBias: 1,
  },
  high: {
    level: "high",
    shadowMapSize: 2048,
    pcfTaps: 9,
    pcfRadius: 1.5,
    shadowCascades: 3,
    maxLights: 16,
    bloomEnabled: true,
    bloomRadius: 3,
    ssaoEnabled: true,
    ssaoSamples: 12,
    fxaaEnabled: true,
    taaEnabled: true,
    particleBudget: 32768,
    lodBias: 1.5,
  },
  ultra: {
    level: "ultra",
    shadowMapSize: 4096,
    pcfTaps: 16,
    pcfRadius: 2,
    shadowCascades: 4,
    maxLights: 32,
    bloomEnabled: true,
    bloomRadius: 4,
    ssaoEnabled: true,
    ssaoSamples: 16,
    fxaaEnabled: true,
    taaEnabled: true,
    particleBudget: 131072,
    lodBias: 2,
  },
};

export function qualitySettings(level: QualityLevelName): QualitySettings {
  return { ...PRESETS[level] };
}

export function qualityLevels(): QualityLevelName[] {
  return ["low", "medium", "high", "ultra"];
}

export function scaledQuality(level: QualityLevelName, scale: number): QualitySettings {
  const base = qualitySettings(level);
  const clamped = Math.max(0.25, Math.min(2, scale));
  return {
    ...base,
    shadowMapSize: Math.round(base.shadowMapSize * clamped),
    pcfTaps: Math.max(1, Math.round(base.pcfTaps * clamped)),
    maxLights: Math.max(1, Math.round(base.maxLights * clamped)),
    particleBudget: Math.max(64, Math.round(base.particleBudget * clamped)),
  };
}

export class QualityController {
  #level: QualityLevelName;
  #settings: QualitySettings;

  constructor(level: QualityLevelName = "medium") {
    this.#level = level;
    this.#settings = qualitySettings(level);
  }

  get level(): QualityLevelName {
    return this.#level;
  }

  get settings(): QualitySettings {
    return { ...this.#settings };
  }

  setLevel(level: QualityLevelName): QualitySettings {
    this.#level = level;
    this.#settings = qualitySettings(level);
    return this.settings;
  }

  apply(scale = 1): QualitySettings {
    this.#settings = scaledQuality(this.#level, scale);
    return this.settings;
  }
}
