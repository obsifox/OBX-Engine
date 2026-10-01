import { Reader, Writer } from "@obx/networking";

export interface WorldSnapshot {
  tick: number;
  entities: Record<number, Record<string, number>>;
}

export function encodeSnapshot(snapshot: WorldSnapshot): Uint8Array {
  const writer = new Writer().varint(snapshot.tick).varint(Object.keys(snapshot.entities).length);
  for (const [netId, state] of Object.entries(snapshot.entities)) {
    writer.varint(Number(netId)).varint(Object.keys(state).length);
    for (const [key, value] of Object.entries(state)) {
      writer.string(key).f32(value);
    }
  }
  return writer.finish();
}

export function decodeSnapshot(bytes: Uint8Array): WorldSnapshot {
  const reader = new Reader(bytes);
  const tick = reader.varint();
  const entityCount = reader.varint();
  const entities: Record<number, Record<string, number>> = {};
  for (let i = 0; i < entityCount; i += 1) {
    const netId = reader.varint();
    const fieldCount = reader.varint();
    const state: Record<string, number> = {};
    for (let f = 0; f < fieldCount; f += 1) {
      state[reader.string()] = reader.f32();
    }
    entities[netId] = state;
  }
  return { tick, entities };
}

export interface DeltaEntry {
  netId: number;
  fields: Record<string, number>;
}

export interface SnapshotDelta {
  baselineTick: number;
  tick: number;
  changed: DeltaEntry[];
  removed: number[];
}

export function snapshotDelta(baseline: WorldSnapshot | null, current: WorldSnapshot): SnapshotDelta {
  const changed: DeltaEntry[] = [];
  const removed: number[] = [];
  for (const [netId, state] of Object.entries(current.entities)) {
    const previous = baseline?.entities[Number(netId)] ?? null;
    const fields: Record<string, number> = {};
    for (const [key, value] of Object.entries(state)) {
      if (!previous || previous[key] !== value) fields[key] = value;
    }
    if (Object.keys(fields).length > 0) changed.push({ netId: Number(netId), fields });
  }
  if (baseline) {
    for (const netId of Object.keys(baseline.entities)) {
      if (current.entities[Number(netId)] === undefined) removed.push(Number(netId));
    }
  }
  return { baselineTick: baseline?.tick ?? 0, tick: current.tick, changed, removed };
}

export function applyDelta(baseline: WorldSnapshot | null, delta: SnapshotDelta): WorldSnapshot {
  const entities: Record<number, Record<string, number>> = {};
  if (baseline) {
    for (const [netId, state] of Object.entries(baseline.entities)) entities[Number(netId)] = { ...state };
  }
  for (const entry of delta.changed) {
    entities[entry.netId] = { ...(entities[entry.netId] ?? {}), ...entry.fields };
  }
  for (const netId of delta.removed) delete entities[netId];
  return { tick: delta.tick, entities };
}

export function encodeDelta(delta: SnapshotDelta): Uint8Array {
  const writer = new Writer().varint(delta.baselineTick).varint(delta.tick).varint(delta.changed.length);
  for (const entry of delta.changed) {
    writer.varint(entry.netId).varint(Object.keys(entry.fields).length);
    for (const [key, value] of Object.entries(entry.fields)) writer.string(key).f32(value);
  }
  writer.varint(delta.removed.length);
  for (const netId of delta.removed) writer.varint(netId);
  return writer.finish();
}

export function decodeDelta(bytes: Uint8Array): SnapshotDelta {
  const reader = new Reader(bytes);
  const baselineTick = reader.varint();
  const tick = reader.varint();
  const changedCount = reader.varint();
  const changed: DeltaEntry[] = [];
  for (let i = 0; i < changedCount; i += 1) {
    const netId = reader.varint();
    const fieldCount = reader.varint();
    const fields: Record<string, number> = {};
    for (let f = 0; f < fieldCount; f += 1) fields[reader.string()] = reader.f32();
    changed.push({ netId, fields });
  }
  const removedCount = reader.varint();
  const removed: number[] = [];
  for (let i = 0; i < removedCount; i += 1) removed.push(reader.varint());
  return { baselineTick, tick, changed, removed };
}

export interface TrafficCounters {
  packets: number;
  bytes: number;
  byKind: Record<string, number>;
}

export class TrafficProfiler {
  #counters: TrafficCounters = { packets: 0, bytes: 0, byKind: {} };

  record(kind: string, bytes: number): void {
    this.#counters.packets += 1;
    this.#counters.bytes += bytes;
    this.#counters.byKind[kind] = (this.#counters.byKind[kind] ?? 0) + bytes;
  }

  get counters(): TrafficCounters {
    return { packets: this.#counters.packets, bytes: this.#counters.bytes, byKind: { ...this.#counters.byKind } };
  }

  averageBytesPerPacket(): number {
    return this.#counters.packets === 0 ? 0 : this.#counters.bytes / this.#counters.packets;
  }

  reset(): void {
    this.#counters = { packets: 0, bytes: 0, byKind: {} };
  }
}

export class BandwidthBudget {
  #bytesPerSecond: number;
  #window: { bytes: number; at: number }[] = [];
  #dropped = 0;

  constructor(bytesPerSecond = 32_000) {
    this.#bytesPerSecond = bytesPerSecond;
  }

  get dropped(): number {
    return this.#dropped;
  }

  allow(bytes: number, now: number): boolean {
    this.#window = this.#window.filter((entry) => now - entry.at < 1000);
    const total = this.#window.reduce((sum, entry) => sum + entry.bytes, 0);
    if (total + bytes > this.#bytesPerSecond) {
      this.#dropped += 1;
      return false;
    }
    this.#window.push({ bytes, at: now });
    return true;
  }

  usage(now: number): number {
    this.#window = this.#window.filter((entry) => now - entry.at < 1000);
    return this.#window.reduce((sum, entry) => sum + entry.bytes, 0);
  }
}

export interface PredictionFrame {
  seq: number;
  input: Record<string, number>;
}

export class ReconciliationQueue {
  #pending: PredictionFrame[] = [];
  #confirmed = -1;

  submit(frame: PredictionFrame): void {
    this.#pending.push(frame);
    this.#pending.sort((a, b) => a.seq - b.seq);
  }

  acknowledge(upToSeq: number): PredictionFrame[] {
    const replay: PredictionFrame[] = [];
    while (this.#pending.length > 0 && this.#pending[0]!.seq <= upToSeq) {
      this.#confirmed = this.#pending[0]!.seq;
      this.#pending.shift();
    }
    for (const frame of this.#pending) replay.push(frame);
    return replay;
  }

  get pendingCount(): number {
    return this.#pending.length;
  }

  get confirmedSeq(): number {
    return this.#confirmed;
  }
}
