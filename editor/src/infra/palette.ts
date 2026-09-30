export interface PaletteCommand {
  id: string;
  title: string;
  category: string;
  keywords?: string[];
  run: () => void;
}

export function fuzzyScore(query: string, target: string): number {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (q.length === 0) return 1;
  if (t.includes(q)) return 100 - t.indexOf(q);
  let score = 0;
  let index = 0;
  for (const char of q) {
    const found = t.indexOf(char, index);
    if (found === -1) return 0;
    score += found === index ? 2 : 1;
    index = found + 1;
  }
  return score;
}

export class CommandPalette {
  private readonly commands = new Map<string, PaletteCommand>();
  private readonly history: string[] = [];

  register(command: PaletteCommand): void {
    this.commands.set(command.id, command);
  }

  unregister(id: string): boolean {
    return this.commands.delete(id);
  }

  get(id: string): PaletteCommand | null {
    return this.commands.get(id) ?? null;
  }

  search(query: string, limit = 20): PaletteCommand[] {
    return [...this.commands.values()]
      .map((command) => ({
        command,
        score: Math.max(
          fuzzyScore(query, command.title),
          fuzzyScore(query, command.category),
          ...(command.keywords ?? []).map((keyword) => fuzzyScore(query, keyword)),
        ),
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.command.title.localeCompare(b.command.title))
      .slice(0, limit)
      .map((entry) => entry.command);
  }

  execute(id: string): boolean {
    const command = this.commands.get(id);
    if (!command) return false;
    command.run();
    this.history.push(id);
    return true;
  }

  recent(): string[] {
    return [...this.history].reverse();
  }

  get size(): number {
    return this.commands.size;
  }
}

