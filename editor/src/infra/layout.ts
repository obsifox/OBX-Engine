export class LayoutPersistence {
  private readonly layouts = new Map<string, unknown>();

  save(name: string, layout: unknown): void {
    this.layouts.set(name, structuredClone(layout));
  }

  load<T = unknown>(name: string): T | null {
    const layout = this.layouts.get(name);
    return layout === undefined ? null : (structuredClone(layout) as T);
  }

  remove(name: string): boolean {
    return this.layouts.delete(name);
  }

  names(): string[] {
    return [...this.layouts.keys()];
  }

  serialize(): string {
    return JSON.stringify(Object.fromEntries(this.layouts), null, 2);
  }

  restore(serialized: string): void {
    this.layouts.clear();
    for (const [name, layout] of Object.entries(JSON.parse(serialized) as Record<string, unknown>)) {
      this.layouts.set(name, layout);
    }
  }
}
