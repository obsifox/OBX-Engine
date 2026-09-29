export type ScriptLanguage = "javascript" | "typescript" | "json" | "obx-shader" | "text";

export type TokenKind = "keyword" | "string" | "number" | "comment" | "ident" | "punct" | "whitespace";

export interface Token {
  kind: TokenKind;
  text: string;
  start: number;
  end: number;
  line: number;
  column: number;
}

export interface ScriptDiagnostic {
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  severity: "error" | "warning" | "info";
  message: string;
}

export interface ScriptTab {
  id: string;
  path: string;
  language: ScriptLanguage;
  text: string;
  cursor: number;
  diagnostics: ScriptDiagnostic[];
  dirty: boolean;
}

export interface FindMatch {
  index: number;
  line: number;
  column: number;
  text: string;
}

export interface ExecutionResult {
  ok: boolean;
  output: string[];
  error: string | null;
}

export type ScriptRunner = (text: string, path: string) => ExecutionResult;
export type ScriptReloader = (path: string) => string | null;

const KEYWORDS = new Set([
  "const", "let", "var", "function", "return", "if", "else", "for", "while", "class", "extends",
  "new", "import", "export", "from", "default", "async", "await", "try", "catch", "throw",
  "switch", "case", "break", "continue", "typeof", "instanceof", "this", "null", "true", "false",
  "uniform", "attribute", "varying", "entry", "vertex", "fragment", "in", "out", "void", "float", "int",
]);

let tabCounter = 0;

export function tokenize(text: string, language: ScriptLanguage): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  let line = 1;
  let lineStart = 0;
  const push = (kind: TokenKind, start: number, end: number) => {
    tokens.push({ kind, text: text.slice(start, end), start, end, line, column: start - lineStart });
    for (const char of text.slice(start, end)) {
      if (char === "\n") {
        line += 1;
        lineStart = end;
      }
    }
  };
  while (index < text.length) {
    const char = text[index]!;
    if (char === "\n") {
      push("whitespace", index, index + 1);
      index += 1;
      lineStart = index;
      continue;
    }
    if (/\s/.test(char)) {
      let end = index + 1;
      while (end < text.length && /\s/.test(text[end]!) && text[end] !== "\n") end += 1;
      push("whitespace", index, end);
      index = end;
      continue;
    }
    if (char === "/" && text[index + 1] === "/") {
      let end = index + 2;
      while (end < text.length && text[end] !== "\n") end += 1;
      push("comment", index, end);
      index = end;
      continue;
    }
    if (char === "/" && text[index + 1] === "*") {
      let end = index + 2;
      while (end < text.length && !(text[end] === "*" && text[end + 1] === "/")) end += 1;
      end = Math.min(text.length, end + 2);
      push("comment", index, end);
      index = end;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      let end = index + 1;
      while (end < text.length && text[end] !== char) {
        if (text[end] === "\\") end += 1;
        if (text[end] === "\n") break;
        end += 1;
      }
      end = Math.min(text.length, end + 1);
      push("string", index, end);
      index = end;
      continue;
    }
    if (/[0-9]/.test(char)) {
      let end = index + 1;
      while (end < text.length && /[0-9._a-fA-Fx]/.test(text[end]!)) end += 1;
      push("number", index, end);
      index = end;
      continue;
    }
    if (/[A-Za-z_$]/.test(char)) {
      let end = index + 1;
      while (end < text.length && /[A-Za-z0-9_$]/.test(text[end]!)) end += 1;
      const word = text.slice(index, end);
      push(KEYWORDS.has(word) || (language === "obx-shader" && KEYWORDS.has(word)) ? "keyword" : "ident", index, end);
      index = end;
      continue;
    }
    let end = index + 1;
    while (end < text.length && !/[A-Za-z0-9_$\s]/.test(text[end]!) && text[end] !== "\n") end += 1;
    push("punct", index, end);
    index = end;
  }
  return tokens;
}

export function findMatches(text: string, query: string, caseSensitive = false): FindMatch[] {
  if (query.length === 0) return [];
  const matches: FindMatch[] = [];
  const haystack = caseSensitive ? text : text.toLowerCase();
  const needle = caseSensitive ? query : query.toLowerCase();
  let index = 0;
  while (index <= haystack.length - needle.length) {
    const found = haystack.indexOf(needle, index);
    if (found === -1) break;
    const before = text.slice(0, found);
    const line = before.split("\n").length;
    const column = found - (before.lastIndexOf("\n") + 1);
    matches.push({ index: found, line, column, text: text.slice(found, found + query.length) });
    index = found + Math.max(1, query.length);
  }
  return matches;
}

export function analyze(text: string): ScriptDiagnostic[] {
  const diagnostics: ScriptDiagnostic[] = [];
  const stack: { char: string; index: number }[] = [];
  const pairs: Record<string, string> = { ")": "(", "]": "[", "}": "{" };
  let inString: string | null = null;
  let index = 0;
  let line = 1;
  let lineStart = 0;
  while (index < text.length) {
    const char = text[index]!;
    if (char === "\n") {
      if (inString) {
        diagnostics.push({
          line,
          column: index - lineStart,
          endLine: line,
          endColumn: index - lineStart + 1,
          severity: "error",
          message: "unterminated string",
        });
        inString = null;
      }
      line += 1;
      lineStart = index + 1;
      index += 1;
      continue;
    }
    if (inString) {
      if (char === "\\") index += 1;
      else if (char === inString) inString = null;
      index += 1;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      inString = char;
      index += 1;
      continue;
    }
    if (char === "/" && text[index + 1] === "/") {
      while (index < text.length && text[index] !== "\n") index += 1;
      continue;
    }
    if (char === "(" || char === "[" || char === "{") {
      stack.push({ char, index });
      index += 1;
      continue;
    }
    if (char === ")" || char === "]" || char === "}") {
      const open = stack.pop();
      if (!open || open.char !== pairs[char]) {
        diagnostics.push({
          line,
          column: index - lineStart,
          endLine: line,
          endColumn: index - lineStart + 1,
          severity: "error",
          message: `unmatched "${char}"`,
        });
      }
      index += 1;
      continue;
    }
    index += 1;
  }
  for (const open of stack) {
    const before = text.slice(0, open.index);
    const openLine = before.split("\n").length;
    diagnostics.push({
      line: openLine,
      column: open.index - (before.lastIndexOf("\n") + 1),
      endLine: openLine,
      endColumn: open.index - (before.lastIndexOf("\n") + 2),
      severity: "error",
      message: `unclosed "${open.char}"`,
    });
  }
  if (inString) {
    diagnostics.push({
      line,
      column: Math.max(0, text.length - lineStart),
      endLine: line,
      endColumn: Math.max(1, text.length - lineStart + 1),
      severity: "error",
      message: "unterminated string",
    });
  }
  return diagnostics;
}

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
    tabCounter += 1;
    const tab: ScriptTab = {
      id: `tab_${tabCounter}`,
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

export function languageForPath(path: string): ScriptLanguage {
  const extension = path.includes(".") ? path.slice(path.lastIndexOf(".") + 1).toLowerCase() : "";
  if (extension === "js" || extension === "mjs") return "javascript";
  if (extension === "ts") return "typescript";
  if (extension === "json") return "json";
  if (extension === "obx" || extension === "frag" || extension === "vert" || extension === "wgsl") return "obx-shader";
  return "text";
}
