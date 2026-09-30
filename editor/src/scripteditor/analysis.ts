import { type FindMatch, type ScriptDiagnostic } from "../scripteditor/types.js";
import {  } from "../shell/docking.js";

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

