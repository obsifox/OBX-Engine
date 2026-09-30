import { type ScriptLanguage, type Token, type TokenKind } from "../scripteditor/types.js";

const KEYWORDS = new Set([
  "const", "let", "var", "function", "return", "if", "else", "for", "while", "class", "extends",
  "new", "import", "export", "from", "default", "async", "await", "try", "catch", "throw",
  "switch", "case", "break", "continue", "typeof", "instanceof", "this", "null", "true", "false",
  "uniform", "attribute", "varying", "entry", "vertex", "fragment", "in", "out", "void", "float", "int",
]);

let tabCounter = 0;

export function nextTabId(): string {
  tabCounter += 1;
  return `tab_${tabCounter}`;
}

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

