export interface GpuFrameCounters {
  drawCalls: number;
  triangles: number;
  textureBinds: number;
  shaderSwitches: number;
  renderTargetSwitches: number;
  textureMemoryBytes: number;
  bufferMemoryBytes: number;
  gpuTimeMs: number;
}

export interface GpuBackendCaps {
  name: string;
  timingSupported: boolean;
  memoryCountersSupported: boolean;
  pipelineStatsSupported: boolean;
}

export function gpuCaps(name: string, over: Partial<GpuBackendCaps> = {}): GpuBackendCaps {
  return {
    name,
    timingSupported: over.timingSupported ?? true,
    memoryCountersSupported: over.memoryCountersSupported ?? true,
    pipelineStatsSupported: over.pipelineStatsSupported ?? true,
  };
}

export class GpuProfiler {
  readonly caps: GpuBackendCaps;
  #frames: GpuFrameCounters[] = [];
  #current: GpuFrameCounters = GpuProfiler.#empty();
  #unavailable: string[] = [];

  constructor(caps: GpuBackendCaps = gpuCaps("null")) {
    this.caps = caps;
  }

  static #empty(): GpuFrameCounters {
    return {
      drawCalls: 0,
      triangles: 0,
      textureBinds: 0,
      shaderSwitches: 0,
      renderTargetSwitches: 0,
      textureMemoryBytes: 0,
      bufferMemoryBytes: 0,
      gpuTimeMs: 0,
    };
  }

  recordDraw(triangles: number): void {
    if (!this.caps.pipelineStatsSupported) {
      this.#markUnavailable("draw statistics");
      return;
    }
    this.#current.drawCalls += 1;
    this.#current.triangles += triangles;
  }

  recordBind(): void {
    this.#current.textureBinds += 1;
  }

  recordShaderSwitch(): void {
    this.#current.shaderSwitches += 1;
  }

  recordTargetSwitch(): void {
    this.#current.renderTargetSwitches += 1;
  }

  addTextureMemory(bytes: number): void {
    if (!this.caps.memoryCountersSupported) {
      this.#markUnavailable("memory counters");
      return;
    }
    this.#current.textureMemoryBytes += bytes;
    this.#current.bufferMemoryBytes += bytes;
  }

  recordGpuTime(ms: number): void {
    if (!this.caps.timingSupported) {
      this.#markUnavailable("gpu timing");
      return;
    }
    this.#current.gpuTimeMs += ms;
  }

  endFrame(): GpuFrameCounters {
    const counters = { ...this.#current };
    this.#frames.push(counters);
    this.#current = GpuProfiler.#empty();
    return counters;
  }

  #markUnavailable(feature: string): void {
    if (!this.#unavailable.includes(feature)) this.#unavailable.push(feature);
  }

  get unavailable(): string[] {
    return [...this.#unavailable];
  }

  get frames(): GpuFrameCounters[] {
    return [...this.#frames];
  }

  summary(): { frames: number; averageGpuTimeMs: number; peakTextureMemoryBytes: number; totalDrawCalls: number } {
    if (this.#frames.length === 0) return { frames: 0, averageGpuTimeMs: 0, peakTextureMemoryBytes: 0, totalDrawCalls: 0 };
    let gpuTotal = 0;
    let peakTexture = 0;
    let draws = 0;
    for (const frame of this.#frames) {
      gpuTotal += frame.gpuTimeMs;
      peakTexture = Math.max(peakTexture, frame.textureMemoryBytes);
      draws += frame.drawCalls;
    }
    return {
      frames: this.#frames.length,
      averageGpuTimeMs: Number((gpuTotal / this.#frames.length).toFixed(3)),
      peakTextureMemoryBytes: peakTexture,
      totalDrawCalls: draws,
    };
  }
}
