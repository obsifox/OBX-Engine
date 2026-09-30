export interface StatusField {
  key: string;
  value: string;
}

export class StatusBar {
  private readonly fields = new Map<string, string>();

  set(key: string, value: string): void {
    this.fields.set(key, value);
  }

  get(key: string): string {
    return this.fields.get(key) ?? "";
  }

  list(): StatusField[] {
    return [...this.fields.entries()].map(([key, value]) => ({ key, value }));
  }

  clear(): void {
    this.fields.clear();
  }
}
