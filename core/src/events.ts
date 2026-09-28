/**
 * ObsiFox Event System — §2 Core / Event Bus + Signals.
 *
 * - {@link EventBus}: named, global-ish pub/sub with priorities and `once`.
 * - {@link Signal}: a single typed event slot that can be connected to many
 *   handlers (C#/Godot-style). Useful as class members (`onDamage: Signal<[number]>`).
 */

/** Unsubscribe handle returned by subscription methods. */
export type Unsubscribe = () => void;

export interface SubscribeOptions {
  /** Run at most once (auto-disconnects after first emit). */
  once?: boolean;
  /** Higher priority runs first (default 0). Ties keep insertion order. */
  priority?: number;
}

interface HandlerEntry<T> {
  handler: (payload: T) => void;
  once: boolean;
  priority: number;
  seq: number;
}

/**
 * Typed publish/subscribe bus.
 *
 * ```ts
 * type Events = { "player:died": { id: number }; "level:loaded": string };
 * const bus = new EventBus<Events>();
 * bus.on("player:died", (e) => console.log(e.id));
 * bus.emit("player:died", { id: 7 });
 * ```
 */
export class EventBus<M extends Record<string, unknown>> {
  #handlers = new Map<keyof M, HandlerEntry<unknown>[]>();
  #seq = 0;

  /** Number of live subscriptions (optionally for one event). */
  listenerCount(event?: keyof M): number {
    if (event !== undefined) {
      return this.#handlers.get(event)?.length ?? 0;
    }
    let total = 0;
    for (const list of this.#handlers.values()) total += list.length;
    return total;
  }

  on<K extends keyof M>(event: K, handler: (payload: M[K]) => void, options: SubscribeOptions = {}): Unsubscribe {
    const entry: HandlerEntry<unknown> = {
      handler: handler as (payload: unknown) => void,
      once: options.once ?? false,
      priority: options.priority ?? 0,
      seq: this.#seq++,
    };
    let list = this.#handlers.get(event);
    if (!list) {
      list = [];
      this.#handlers.set(event, list);
    }
    list.push(entry);
    // Keep sorted: priority desc, then insertion order asc.
    list.sort((a, b) => b.priority - a.priority || a.seq - b.seq);

    return () => this.off(event, handler);
  }

  once<K extends keyof M>(event: K, handler: (payload: M[K]) => void, options: Omit<SubscribeOptions, "once"> = {}): Unsubscribe {
    return this.on(event, handler, { ...options, once: true });
  }

  off<K extends keyof M>(event: K, handler: (payload: M[K]) => void): void {
    const list = this.#handlers.get(event);
    if (!list) return;
    const index = list.findIndex((entry) => entry.handler === (handler as (payload: unknown) => void));
    if (index >= 0) list.splice(index, 1);
    if (list.length === 0) this.#handlers.delete(event);
  }

  /**
   * Emit an event synchronously to all subscribers.
   * Handler errors are isolated: a throwing handler does not stop the others.
   * Thrown errors are re-thrown as a single aggregate at the end if any occurred.
   */
  emit<K extends keyof M>(event: K, payload: M[K]): void {
    const list = this.#handlers.get(event);
    if (!list || list.length === 0) return;
    const snapshot = [...list];
    let firstError: unknown;
    let errorCount = 0;

    for (const entry of snapshot) {
      if (entry.once) this.off(event, entry.handler as (payload: M[K]) => void);
      try {
        entry.handler(payload);
      } catch (error) {
        errorCount += 1;
        firstError ??= error;
      }
    }

    if (errorCount > 0) {
      throw new AggregateError(
        [firstError as Error],
        `EventBus.emit("${String(event)}") failed in ${errorCount} handler(s)`,
      );
    }
  }

  /** Remove all handlers (optionally for one event). */
  clear(event?: keyof M): void {
    if (event !== undefined) {
      this.#handlers.delete(event);
    } else {
      this.#handlers.clear();
    }
  }
}

/**
 * A single reusable event with many listeners.
 *
 * ```ts
 * const onHit = new Signal<[damage: number, critical: boolean]>();
 * onHit.connect((dmg, crit) => applyDamage(dmg, crit));
 * onHit.emit(25, true);
 * ```
 */
export class Signal<T extends unknown[] = []> {
  #handlers: { handler: (...args: T) => void; once: boolean; seq: number }[] = [];
  #seq = 0;

  get listenerCount(): number {
    return this.#handlers.length;
  }

  connect(handler: (...args: T) => void, options: { once?: boolean } = {}): Unsubscribe {
    const entry = { handler, once: options.once ?? false, seq: this.#seq++ };
    this.#handlers.push(entry);
    return () => this.disconnect(handler);
  }

  once(handler: (...args: T) => void): Unsubscribe {
    return this.connect(handler, { once: true });
  }

  disconnect(handler: (...args: T) => void): void {
    const index = this.#handlers.findIndex((entry) => entry.handler === handler);
    if (index >= 0) this.#handlers.splice(index, 1);
  }

  emit(...args: T): void {
    const snapshot = [...this.#handlers];
    let firstError: unknown;
    let errorCount = 0;
    for (const entry of snapshot) {
      if (entry.once) this.disconnect(entry.handler);
      try {
        entry.handler(...args);
      } catch (error) {
        errorCount += 1;
        firstError ??= error;
      }
    }
    if (errorCount > 0) {
      throw new AggregateError([firstError as Error], `Signal.emit failed in ${errorCount} handler(s)`);
    }
  }

  clear(): void {
    this.#handlers.length = 0;
  }
}
