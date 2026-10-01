export interface ClockSample {
  clientTime: number;
  serverTime: number;
}

export class NetworkClock {
  #tickRate: number;
  #serverTime = 0;
  #offset = 0;
  #samples: ClockSample[] = [];

  constructor(tickRate = 60) {
    this.#tickRate = tickRate;
  }

  get tickRate(): number {
    return this.#tickRate;
  }

  get tickInterval(): number {
    return 1000 / this.#tickRate;
  }

  get offset(): number {
    return this.#offset;
  }

  pushSample(sample: ClockSample): void {
    this.#samples.push(sample);
    if (this.#samples.length > 32) this.#samples.shift();
    let total = 0;
    for (const entry of this.#samples) total += entry.serverTime - entry.clientTime;
    this.#offset = total / this.#samples.length;
  }

  syncFromRtt(clientSend: number, serverReceive: number, serverSend: number, clientReceive: number): number {
    const rtt = clientReceive - clientSend;
    const serverMid = (serverReceive + serverSend) / 2;
    const clientMid = (clientSend + clientReceive) / 2;
    this.pushSample({ clientTime: clientMid, serverTime: serverMid });
    return rtt;
  }

  estimateServerTime(clientTime: number): number {
    return clientTime + this.#offset;
  }

  tickNumber(clientTime: number): number {
    return Math.floor(this.estimateServerTime(clientTime) / this.tickInterval);
  }

  advance(deltaSeconds: number): void {
    this.#serverTime += deltaSeconds * 1000;
  }

  reset(): void {
    this.#serverTime = 0;
    this.#offset = 0;
    this.#samples = [];
  }
}

export interface InterpolationEntry<T> {
  time: number;
  value: T;
}

export class InterpolationBuffer<T> {
  #entries: InterpolationEntry<T>[] = [];
  #delay: number;

  constructor(delayMs = 100) {
    this.#delay = delayMs;
  }

  get size(): number {
    return this.#entries.length;
  }

  push(time: number, value: T): void {
    this.#entries.push({ time, value });
    this.#entries.sort((a, b) => a.time - b.time);
  }

  sample(renderTime: number, lerp: (a: T, b: T, t: number) => T): T | null {
    const target = renderTime - this.#delay;
    if (this.#entries.length === 0) return null;
    if (target <= this.#entries[0]!.time) return this.#entries[0]!.value;
    const last = this.#entries[this.#entries.length - 1]!;
    if (target >= last.time) return last.value;
    for (let i = 0; i < this.#entries.length - 1; i += 1) {
      const a = this.#entries[i]!;
      const b = this.#entries[i + 1]!;
      if (target >= a.time && target <= b.time) {
        const t = (target - a.time) / Math.max(b.time - a.time, 1e-6);
        return lerp(a.value, b.value, t);
      }
    }
    return last.value;
  }

  prune(beforeTime: number): void {
    this.#entries = this.#entries.filter((entry) => entry.time >= beforeTime);
  }
}
