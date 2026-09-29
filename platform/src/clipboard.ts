import type { Clipboard } from "./types.js";
export class MemoryClipboard implements Clipboard {
  #text = "";

  read(): string {
    return this.#text;
  }

  write(text: string): void {
    this.#text = text;
  }

  hasText(): boolean {
    return this.#text.length > 0;
  }

  clear(): void {
    this.#text = "";
  }
}

