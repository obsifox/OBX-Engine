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

export class ConfigStore<T extends object = ConfigObject> {
  #data: ConfigObject;
  #watchers: WatchEntry[] = [];

  constructor(initial?: DeepPartial<T> | ConfigObject) {
    this.#data = initial ? (deepMerge({}, initial as ConfigObject)) : {};
  }

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

  toJSON(): T {
    return deepClone(this.#data) as T;
  }

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

  has(path: string): boolean {
    return this.get(path, SENTINEL_MISSING) !== SENTINEL_MISSING;
  }

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

  merge(partial: DeepPartial<T> | ConfigObject): void {
    deepMerge(this.#data, partial as ConfigObject);
    for (const [key, value] of Object.entries(partial as ConfigObject)) {
      this.#notify(key, value);
    }
    this.#notify("*", deepClone(partial));
  }

  watch(path: string, callback: (path: string, value: unknown) => void): Unsubscribe {
    const entry: WatchEntry = { path, callback };
    this.#watchers.push(entry);
    return () => {
      const index = this.#watchers.indexOf(entry);
      if (index >= 0) this.#watchers.splice(index, 1);
    };
  }

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
