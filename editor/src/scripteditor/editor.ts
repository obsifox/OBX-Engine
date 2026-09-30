import { nextTabId } from "./tokenizer.js";
import { analyze, findMatches } from "../scripteditor/analysis.js";
import { languageForPath } from "../scripteditor/paths.js";
import { tokenize } from "../scripteditor/tokenizer.js";
import { type ExecutionResult, type FindMatch, type ScriptDiagnostic, type ScriptLanguage, type ScriptReloader, type ScriptRunner, type ScriptTab, type Token } from "../scripteditor/types.js";

export class ScriptEditor {
  readonly tabs: ScriptTab[] = [];
  activeId: string | null = null;
  private runner: ScriptRunner = () => ({ ok: true, output: [], error: null });
  private reloader: ScriptReloader = () => null;

  open(path: string, text: string, language: ScriptLanguage = languageForPath(path)): ScriptTab {
    const existing = this.tabs.find((tab) => tab.path === path);
    if (existing) {
      existing.text = text;
      existing.diagnostics = analyze(text);
      existing.dirty = false;
      this.activeId = existing.id;
      return existing;
    }
    const tab: ScriptTab = {
      id: nextTabId(),
      path,
      language,
      text,
      cursor: 0,
      diagnostics: analyze(text),
      dirty: false,
    };
    this.tabs.push(tab);
    this.activeId = tab.id;
    return tab;
  }

  get active(): ScriptTab | null {
    return this.tabs.find((tab) => tab.id === this.activeId) ?? null;
  }

  close(id: string): boolean {
    const index = this.tabs.findIndex((tab) => tab.id === id);
    if (index === -1) return false;
    this.tabs.splice(index, 1);
    if (this.activeId === id) this.activeId = this.tabs[Math.min(index, this.tabs.length - 1)]?.id ?? null;
    return true;
  }

  activate(id: string): boolean {
    if (!this.tabs.some((tab) => tab.id === id)) return false;
    this.activeId = id;
    return true;
  }

  reorder(from: number, to: number): void {
    const [tab] = this.tabs.splice(from, 1);
    if (tab) this.tabs.splice(to, 0, tab);
  }

  edit(id: string, text: string, cursor = 0): ScriptTab {
    const tab = this.tabs.find((entry) => entry.id === id);
    if (!tab) throw new RangeError(`unknown tab ${id}`);
    tab.text = text;
    tab.cursor = cursor;
    tab.dirty = true;
    tab.diagnostics = analyze(text);
    return tab;
  }

  setCursor(id: string, cursor: number): void {
    const tab = this.tabs.find((entry) => entry.id === id);
    if (tab) tab.cursor = cursor;
  }

  find(id: string, query: string, caseSensitive = false): FindMatch[] {
    const tab = this.tabs.find((entry) => entry.id === id);
    return tab ? findMatches(tab.text, query, caseSensitive) : [];
  }

  replace(id: string, query: string, replacement: string, index: number): boolean {
    const tab = this.tabs.find((entry) => entry.id === id);
    if (!tab) return false;
    const matches = findMatches(tab.text, query);
    const match = matches[index];
    if (!match) return false;
    tab.text = tab.text.slice(0, match.index) + replacement + tab.text.slice(match.index + query.length);
    tab.dirty = true;
    tab.diagnostics = analyze(tab.text);
    return true;
  }

  replaceAll(id: string, query: string, replacement: string): number {
    const tab = this.tabs.find((entry) => entry.id === id);
    if (!tab) return 0;
    const matches = findMatches(tab.text, query);
    let text = tab.text;
    for (let index = matches.length - 1; index >= 0; index -= 1) {
      const match = matches[index]!;
      text = text.slice(0, match.index) + replacement + text.slice(match.index + query.length);
    }
    tab.text = text;
    tab.dirty = true;
    tab.diagnostics = analyze(tab.text);
    return matches.length;
  }

  highlight(id: string): Token[] {
    const tab = this.tabs.find((entry) => entry.id === id);
    return tab ? tokenize(tab.text, tab.language) : [];
  }

  diagnostics(id: string): ScriptDiagnostic[] {
    return this.tabs.find((entry) => entry.id === id)?.diagnostics ?? [];
  }

  setRunner(runner: ScriptRunner): void {
    this.runner = runner;
  }

  setReloader(reloader: ScriptReloader): void {
    this.reloader = reloader;
  }

  execute(id: string): ExecutionResult {
    const tab = this.tabs.find((entry) => entry.id === id);
    if (!tab) return { ok: false, output: [], error: `unknown tab ${id}` };
    let result: ExecutionResult;
    try {
      result = this.runner(tab.text, tab.path);
    } catch (error) {
      result = { ok: false, output: [], error: (error as Error).message };
    }
    if (!result.ok && result.error) {
      const marker = /:(\d+)/.exec(result.error);
      tab.diagnostics = [
        ...tab.diagnostics,
        {
          line: marker ? Number(marker[1]) : 1,
          column: 0,
          endLine: marker ? Number(marker[1]) : 1,
          endColumn: 1,
          severity: "error",
          message: result.error,
        },
      ];
    }
    return result;
  }

  reload(id: string): boolean {
    const tab = this.tabs.find((entry) => entry.id === id);
    if (!tab) return false;
    const text = this.reloader(tab.path);
    if (text === null) return false;
    tab.text = text;
    tab.dirty = false;
    tab.diagnostics = analyze(text);
    return true;
  }

  errorDiagnostics(id: string): ScriptDiagnostic[] {
    return this.diagnostics(id).filter((diagnostic) => diagnostic.severity === "error");
  }
}

