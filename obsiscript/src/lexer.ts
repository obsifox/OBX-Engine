export type TokenType =
  | "number"
  | "string"
  | "identifier"
  | "keyword"
  | "operator"
  | "newline"
  | "eof";

export interface Token {
  type: TokenType;
  value: string;
  line: number;
  column: number;
  numberValue?: number;
}

export const keywords = new Set([
  "let",
  "const",
  "fn",
  "return",
  "if",
  "else",
  "while",
  "for",
  "class",
  "this",
  "import",
  "export",
  "true",
  "false",
  "null",
  "and",
  "or",
  "not",
  "spawn",
]);

const operators = [
  "==",
  "!=",
  "<=",
  ">=",
  "&&",
  "||",
  "=>",
  "+",
  "-",
  "*",
  "/",
  "%",
  "<",
  ">",
  "=",
  "!",
  "(",
  ")",
  "{",
  "}",
  "[",
  "]",
  ",",
  ".",
  ":",
  ";",
];

export class Lexer {
  private index = 0;
  private line = 1;
  private column = 1;

  constructor(readonly source: string) {}

  tokenize(): Token[] {
    const tokens: Token[] = [];
    while (this.index < this.source.length) {
      const token = this.next();
      if (token) tokens.push(token);
    }
    tokens.push({ type: "eof", value: "", line: this.line, column: this.column });
    return tokens;
  }

  private next(): Token | null {
    const char = this.source[this.index]!;
    if (char === "\n") {
      this.index += 1;
      this.line += 1;
      this.column = 1;
      return { type: "newline", value: "\n", line: this.line - 1, column: 1 };
    }
    if (char === " " || char === "\t" || char === "\r") {
      this.index += 1;
      this.column += 1;
      return null;
    }
    if (char === "/" && this.source[this.index + 1] === "/") {
      while (this.index < this.source.length && this.source[this.index] !== "\n") {
        this.index += 1;
        this.column += 1;
      }
      return null;
    }
    if (char === '"') return this.readString();
    if (this.isDigit(char)) return this.readNumber();
    if (this.isIdentStart(char)) return this.readIdentifier();
    for (const operator of operators) {
      if (this.source.startsWith(operator, this.index)) {
        const token: Token = { type: "operator", value: operator, line: this.line, column: this.column };
        this.index += operator.length;
        this.column += operator.length;
        return token;
      }
    }
    throw new SyntaxError(`unexpected character ${JSON.stringify(char)} at ${this.line}:${this.column}`);
  }

  private readString(): Token {
    const line = this.line;
    const column = this.column;
    this.index += 1;
    this.column += 1;
    let value = "";
    while (this.index < this.source.length && this.source[this.index] !== '"') {
      const char = this.source[this.index]!;
      if (char === "\n") throw new SyntaxError(`unterminated string at ${line}:${column}`);
      if (char === "\\" && this.index + 1 < this.source.length) {
        const escaped = this.source[this.index + 1]!;
        value += escaped === "n" ? "\n" : escaped === "t" ? "\t" : escaped;
        this.index += 2;
        this.column += 2;
        continue;
      }
      value += char;
      this.index += 1;
      this.column += 1;
    }
    if (this.index >= this.source.length) throw new SyntaxError(`unterminated string at ${line}:${column}`);
    this.index += 1;
    this.column += 1;
    return { type: "string", value, line, column };
  }

  private readNumber(): Token {
    const line = this.line;
    const column = this.column;
    let value = "";
    while (this.index < this.source.length && (this.isDigit(this.source[this.index]!) || this.source[this.index] === ".")) {
      value += this.source[this.index]!;
      this.index += 1;
      this.column += 1;
    }
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) throw new SyntaxError(`invalid number ${value} at ${line}:${column}`);
    return { type: "number", value, line, column, numberValue };
  }

  private readIdentifier(): Token {
    const line = this.line;
    const column = this.column;
    let value = "";
    while (this.index < this.source.length && this.isIdentPart(this.source[this.index]!)) {
      value += this.source[this.index]!;
      this.index += 1;
      this.column += 1;
    }
    return { type: keywords.has(value) ? "keyword" : "identifier", value, line, column };
  }

  private isDigit(char: string): boolean {
    return char >= "0" && char <= "9";
  }

  private isIdentStart(char: string): boolean {
    return (char >= "a" && char <= "z") || (char >= "A" && char <= "Z") || char === "_";
  }

  private isIdentPart(char: string): boolean {
    return this.isIdentStart(char) || this.isDigit(char);
  }
}

export function tokenize(source: string): Token[] {
  return new Lexer(source).tokenize();
}
