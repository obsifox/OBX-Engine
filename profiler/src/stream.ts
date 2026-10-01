import type { UnifiedFrameReport } from "./frames.js";
import type { SpanReport } from "./profiler.js";

export interface ProfileChunk {
  sequence: number;
  frame: number;
  kind: "frame" | "span" | "system";
  payload: string;
}

export interface ProfileStreamStats {
  sent: number;
  dropped: number;
  bytes: number;
}

export type ProfileSink = (chunk: ProfileChunk) => void;

export class ProfileStream {
  #sequence = 0;
  #stats: ProfileStreamStats = { sent: 0, dropped: 0, bytes: 0 };
  #buffer: ProfileChunk[] = [];
  #capacity: number;

  constructor(capacity = 256) {
    this.#capacity = capacity;
  }

  pushFrame(report: UnifiedFrameReport, sink?: ProfileSink): ProfileChunk {
    return this.#push({ sequence: this.#sequence, frame: report.frame, kind: "frame", payload: JSON.stringify({
      frame: report.frame,
      cpuMs: report.cpuMs,
      gpuMs: report.gpuMs,
      peakMemoryBytes: report.peakMemoryBytes,
    }) }, sink);
  }

  pushSpans(frame: number, spans: readonly SpanReport[], sink?: ProfileSink): ProfileChunk[] {
    return spans.map((span) => this.#push({ sequence: this.#sequence, frame, kind: "span", payload: JSON.stringify(span) }, sink));
  }

  #push(chunk: ProfileChunk, sink?: ProfileSink): ProfileChunk {
    this.#sequence += 1;
    if (this.#buffer.length >= this.#capacity) {
      this.#buffer.shift();
      this.#stats.dropped += 1;
    }
    this.#buffer.push(chunk);
    this.#stats.sent += 1;
    this.#stats.bytes += chunk.payload.length;
    if (sink) sink(chunk);
    return chunk;
  }

  drain(): ProfileChunk[] {
    const chunks = [...this.#buffer];
    this.#buffer = [];
    return chunks;
  }

  get stats(): ProfileStreamStats {
    return { ...this.#stats };
  }

  static decode(chunk: ProfileChunk): unknown {
    return JSON.parse(chunk.payload);
  }
}
