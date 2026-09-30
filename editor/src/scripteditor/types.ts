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

