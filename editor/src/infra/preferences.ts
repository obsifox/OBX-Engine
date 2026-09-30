export interface PreferenceValue {
  [key: string]: string | number | boolean | PreferenceValue;
}

export class Preferences {
  private readonly values = new Map<string, string | number | boolean>();

  constructor(defaults: Record<string, string | number | boolean> = {}) {
    for (const [key, value] of Object.entries(defaults)) this.values.set(key, value);
  }

  get<T extends string | number | boolean>(key: string, fallback: T): T {
    const value = this.values.get(key);
    return value === undefined ? fallback : (value as T);
  }

  set(key: string, value: string | number | boolean): void {
    this.values.set(key, value);
  }

  reset(key: string): boolean {
    return this.values.delete(key);
  }

  entries(): Record<string, string | number | boolean> {
    return Object.fromEntries(this.values);
  }

  serialize(): string {
    return JSON.stringify(this.entries(), null, 2);
  }

  restore(serialized: string): void {
    this.values.clear();
    for (const [key, value] of Object.entries(JSON.parse(serialized) as Record<string, string | number | boolean>)) {
      this.values.set(key, value);
    }
  }
}

