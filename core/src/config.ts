/**
 * ObsiFox Configuration System — §2 Core / Configuration.
 *
 * Hierarchical config store with dot-path access, deep merge and change
 * watching. Used for engine settings, project settings and runtime flags.
 */

import { ConfigError, ensure } from "./errors.js";
import type { Unsubscribe } from "./events.js";

export type ConfigValue = unknown;
export type ConfigObject = Record<string, unknown>;

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

interface WatchEntry {
  path: string | "*";
  callback: (path: string, value: unknown) => void;
}

function isPlainObject(value: unknown): value is ConfigObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepClone<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => deepClone(item)) as unknown as T;
  }
  if (isPlainObject(value)) {
    const out: ConfigObject = {};
    for (const [key, item] of Object.entries(value)) out[key] = deepClone(item);
    return out as T;
  }
  return value;
}

function deepMerge(target: ConfigObject, source: ConfigObject): ConfigObject {
  for (const [key, value] of Object.entries(source)) {
    if (isPlainObject(value) && isPlainObject(target[key])) {
      deepMerge(target[key] as ConfigObject, value);
    } else {
      target[key] = deepClone(value);
    }
  }
  return target;
}

/**
 * Hierarchical key/value store with `dot.path` addressing.
 *
 * ```ts
 * const config = new ConfigStore({ window: { width: 1280 } });
 * config.get("window.width"); // 1280
 * config.set("window.height", 720);
 * config.watch("window", (path, value) => console.log(path, value));
 * ```
 */
export class ConfigStore<T extends object = ConfigObject> {
  #data: ConfigObject;
  #watchers: WatchEntry[] = [];

  constructor(initial?: DeepPartial<T> | ConfigObject) {
    this.#data = initial ? (deepMerge({}, initial as ConfigObject)) : {};
  }

  /** Create a store from a JSON string. */
  static fromJSON<T extends ConfigObject = ConfigObject>(json: string): ConfigStore<T> {
    try {
      const parsed = JSON.parse(json) as unknown;
      if (!isPlainObject(parsed)) {
        throw new ConfigError("Config JSON must be an object");
      }
      return new ConfigStore<T>(parsed);
    } catch (error) {
      if (error instanceof ConfigError) throw error;
      throw new ConfigError("Failed to parse config JSON", { cause: error });
    }
  }

  /** Deep-cloned snapshot of the whole config. */
  toJSON(): T {
    return deepClone(this.#data) as T;
  }

  /** Get a value by dot-path. Returns `defaultValue` when missing. */
  get<P = unknown>(path: string, defaultValue?: P): P {
    ensure(path.length > 0, "Config path must be a non-empty string");
    let node: unknown = this.#data;
    for (const key of path.split(".")) {
      if (!isPlainObject(node) || !(key in node)) {
        return defaultValue as P;
      }
      node = node[key];
    }
    return node as P;
  }

  /** Whether a dot-path exists. */
  has(path: string): boolean {
    return this.get(path, SENTINEL_MISSING) !== SENTINEL_MISSING;
  }

  /** Set a value by dot-path (creates intermediate objects). */
  set(path: string, value: unknown): void {
    ensure(path.length > 0, "Config path must be a non-empty string");
    const keys = path.split(".");
    let node = this.#data;
    for (let i = 0; i < keys.length - 1; i += 1) {
      const key = keys[i] as string;
      if (!isPlainObject(node[key])) {
        node[key] = {};
      }
      node = node[key] as ConfigObject;
    }
    const lastKey = keys[keys.length - 1] as string;
    node[lastKey] = deepClone(value);
    this.#notify(path, value);
    this.#notify("*", value);
  }

  /** Delete a value by dot-path. Returns true if something was removed. */
  delete(path: string): boolean {
    const keys = path.split(".");
    let node: unknown = this.#data;
    for (let i = 0; i < keys.length - 1; i += 1) {
      const key = keys[i] as string;
      if (!isPlainObject(node) || !(key in node)) return false;
      node = node[key];
    }
    const lastKey = keys[keys.length - 1] as string;
    if (!isPlainObject(node) || !(lastKey in node)) return false;
    delete node[lastKey];
    this.#notify(path, undefined);
    this.#notify("*", undefined);
    return true;
  }

  /** Deep-merge a partial object into the store (fires watchers per key). */
  merge(partial: DeepPartial<T> | ConfigObject): void {
    deepMerge(this.#data, partial as ConfigObject);
    for (const [key, value] of Object.entries(partial as ConfigObject)) {
      this.#notify(key, value);
    }
    this.#notify("*", deepClone(partial));
  }

  /** Watch a dot-path (or `"*"` for all changes). Returns an unsubscribe fn. */
  watch(path: string, callback: (path: string, value: unknown) => void): Unsubscribe {
    const entry: WatchEntry = { path, callback };
    this.#watchers.push(entry);
    return () => {
      const index = this.#watchers.indexOf(entry);
      if (index >= 0) this.#watchers.splice(index, 1);
    };
  }

  /** Clear all watchers. */
  clearWatchers(): void {
    this.#watchers = [];
  }

  #notify(path: string, value: unknown): void {
    for (const watcher of [...this.#watchers]) {
      if (watcher.path === "*" || watcher.path === path || path.startsWith(`${watcher.path}.`)) {
        watcher.callback(path, value);
      }
    }
  }
}

const SENTINEL_MISSING = Symbol("missing");
