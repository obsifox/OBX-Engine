export class Selection {
  private readonly ids = new Set<string>();

  get size(): number {
    return this.ids.size;
  }

  get list(): string[] {
    return [...this.ids];
  }

  has(id: string): boolean {
    return this.ids.has(id);
  }

  select(id: string): void {
    this.ids.clear();
    this.ids.add(id);
  }

  toggle(id: string): void {
    if (this.ids.has(id)) this.ids.delete(id);
    else this.ids.add(id);
  }

  add(id: string): void {
    this.ids.add(id);
  }

  clear(): void {
    this.ids.clear();
  }
}

