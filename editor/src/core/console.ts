export type LogLevel = "info" | "warn" | "error";

export interface ConsoleEntry {
  level: LogLevel;
  message: string;
  time: number;
}

export class EditorConsole {
  readonly entries: ConsoleEntry[] = [];
  private clock = 0;

  log(level: LogLevel, message: string): void {
    this.clock += 1;
    this.entries.push({ level, message, time: this.clock });
  }

  filter(level: LogLevel | "all"): ConsoleEntry[] {
    return level === "all" ? [...this.entries] : this.entries.filter((entry) => entry.level === level);
  }

  clear(): void {
    this.entries.length = 0;
  }

  get counts(): Record<LogLevel, number> {
    const counts: Record<LogLevel, number> = { info: 0, warn: 0, error: 0 };
    for (const entry of this.entries) counts[entry.level] += 1;
    return counts;
  }
}

