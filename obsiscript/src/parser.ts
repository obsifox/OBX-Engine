import {
  type Block,
  type ClassDecl,
  type Expr,
  type FunctionDecl,
  type Param,
  type Program,
  type Stmt,
  type TypeName,
  type TypeNode,
} from "./ast.js";
import { type Token, tokenize } from "./lexer.js";

const precedence: Record<string, number> = {
  "=": 1,
  "||": 2,
  "&&": 3,
  "==": 4,
  "!=": 4,
  "<": 5,
  ">": 5,
  "<=": 5,
  ">=": 5,
  "+": 6,
  "-": 6,
  "*": 7,
  "/": 7,
  "%": 7,
};

export class Parser {
  private position = 0;

  constructor(readonly tokens: Token[]) {}

  static parse(source: string): Program {
    return new Parser(tokenize(source)).parseProgram();
  }

  parseProgram(): Program {
    const statements: Stmt[] = [];
    while (!this.check("eof")) {
      this.skipTerminators();
      if (this.check("eof")) break;
      statements.push(this.parseStatement());
      this.expectTerminator();
    }
    return { statements };
  }

  private parseStatement(): Stmt {
    const token = this.peek();
    if (token.type === "keyword") {
      switch (token.value) {
        case "let":
        case "const":
          return this.parseLet();
        case "if":
          return this.parseIf();
        case "while":
          return this.parseWhile();
        case "for":
          return this.parseFor();
        case "return": {
          this.advance();
          if (this.atTerminator() || this.check("eof")) return { kind: "return", value: null, line: token.line };
          return { kind: "return", value: this.parseExpression(), line: token.line };
        }
        case "fn":
          return { kind: "fn", declaration: this.parseFunction() };
        case "class":
          return { kind: "class", declaration: this.parseClass() };
        case "import":
          return this.parseImport();
        case "export":
          return this.parseExport();
        case "spawn":
          return this.parseSpawn();
      }
    }
    return { kind: "expr", expression: this.parseExpression() };
  }

  private parseLet(): Stmt {
    const token = this.advance();
    const name = this.expect("identifier").value;
    let type: TypeNode | null = null;
    if (this.match("operator", ":")) type = this.parseType();
    this.expect("operator", "=");
    const value = this.parseExpression();
    return { kind: "let", name, type, value, constant: token.value === "const", line: token.line };
  }

  private parseIf(): Stmt {
    this.expect("keyword", "if");
    this.expect("operator", "(");
    const condition = this.parseExpression();
    this.expect("operator", ")");
    const then = this.parseBlock();
    let otherwise: Block | null = null;
    if (this.check("keyword", "else")) {
      this.advance();
      otherwise = this.parseBlock();
    }
    return { kind: "if", condition, then, otherwise };
  }

  private parseWhile(): Stmt {
    this.expect("keyword", "while");
    this.expect("operator", "(");
    const condition = this.parseExpression();
    this.expect("operator", ")");
    return { kind: "while", condition, body: this.parseBlock() };
  }

  private parseFor(): Stmt {
    this.expect("keyword", "for");
    this.expect("operator", "(");
    let setup: Stmt | null = null;
    if (!this.check("operator", ";")) setup = this.parseLet();
    this.expect("operator", ";");
    const condition = this.check("operator", ";") ? null : this.parseExpression();
    this.expect("operator", ";");
    let step: Stmt | null = null;
    if (!this.check("operator", ")")) step = { kind: "expr", expression: this.parseExpression() };
    this.expect("operator", ")");
    return { kind: "for", setup, condition, step, body: this.parseBlock() };
  }

  private parseFunction(): FunctionDecl {
    const token = this.expect("keyword", "fn");
    const name = this.check("identifier") ? this.advance().value : "";
    this.expect("operator", "(");
    const params = this.parseParams();
    this.expect("operator", ")");
    let returnType: TypeNode = { name: "any" };
    if (this.match("operator", ":")) returnType = this.parseType();
    return { name, params, returnType, body: this.parseBlock(), line: token.line };
  }

  private parseClass(): ClassDecl {
    const token = this.expect("keyword", "class");
    const name = this.expect("identifier").value;
    this.expect("operator", "{");
    const methods: FunctionDecl[] = [];
    while (!this.check("operator", "}")) {
      this.skipTerminators();
      if (this.check("operator", "}")) break;
      methods.push(this.parseFunction());
      this.skipTerminators();
    }
    this.expect("operator", "}");
    return { name, methods, line: token.line };
  }

  private parseImport(): Stmt {
    const token = this.expect("keyword", "import");
    const module = this.expect("string").value;
    this.expect("identifier", "as");
    const alias = this.expect("identifier").value;
    return { kind: "import", module, alias, line: token.line };
  }

  private parseExport(): Stmt {
    const token = this.expect("keyword", "export");
    const next = this.peek();
    if (next.type === "keyword" && (next.value === "fn" || next.value === "class")) {
      const statement = this.parseStatement();
      const name =
        statement.kind === "fn"
          ? statement.declaration.name
          : statement.kind === "class"
            ? statement.declaration.name
            : "";
      return { kind: "export", statement, name, line: token.line };
    }
    const declaration = this.parseLet();
    if (declaration.kind !== "let") throw new SyntaxError(`invalid export at ${token.line}`);
    return { kind: "export", statement: declaration, name: declaration.name, line: token.line };
  }

  private parseSpawn(): Stmt {
    const token = this.expect("keyword", "spawn");
    this.expect("operator", "(");
    const delay = this.parseExpression();
    this.expect("operator", ",");
    const body = this.parseExpression();
    this.expect("operator", ")");
    return { kind: "spawn", delay, body, line: token.line };
  }

  private parseParams(): Param[] {
    const params: Param[] = [];
    if (this.check("operator", ")")) return params;
    do {
      const name = this.expect("identifier").value;
      let type: TypeNode = { name: "any" };
      if (this.match("operator", ":")) type = this.parseType();
      params.push({ name, type });
    } while (this.match("operator", ","));
    return params;
  }

  private parseType(): TypeNode {
    const token = this.expect("identifier");
    const name = token.value as TypeName;
    if (name === "fn") {
      this.expect("operator", "(");
      const params: TypeName[] = [];
      if (!this.check("operator", ")")) {
        do {
          params.push(this.expect("identifier").value as TypeName);
        } while (this.match("operator", ","));
      }
      this.expect("operator", ")");
      this.expect("operator", ":");
      const returns = this.expect("identifier").value as TypeName;
      return { name, params, returns };
    }
    return { name };
  }

  private parseBlock(): Block {
    this.expect("operator", "{");
    const statements: Stmt[] = [];
    while (!this.check("operator", "}")) {
      this.skipTerminators();
      if (this.check("operator", "}")) break;
      statements.push(this.parseStatement());
      this.skipTerminators();
    }
    this.expect("operator", "}");
    return { statements };
  }

  private parseExpression(): Expr {
    return this.parseBinary(0);
  }

  private parseBinary(minPrecedence: number): Expr {
    let left = this.parseUnary();
    while (true) {
      const token = this.peek();
      let op: string | null = null;
      if (token.type === "operator" && token.value in precedence) op = token.value;
      else if (token.type === "keyword" && (token.value === "and" || token.value === "or")) op = token.value === "and" ? "&&" : "||";
      if (op === null) break;
      const level = precedence[op]!;
      if (level < minPrecedence) break;
      this.advance();
      const right = this.parseBinary(level + 1);
      if (op === "&&" || op === "||") {
        left = { kind: "logical", op, left, right };
      } else if (op === "=") {
        left = { kind: "assign", target: left, value: right };
      } else {
        left = { kind: "binary", op, left, right };
      }
    }
    return left;
  }

  private parseUnary(): Expr {
    const token = this.peek();
    if (token.type === "operator" && (token.value === "-" || token.value === "!")) {
      this.advance();
      return { kind: "unary", op: token.value, operand: this.parseUnary() };
    }
    if (token.type === "keyword" && token.value === "not") {
      this.advance();
      return { kind: "unary", op: "!", operand: this.parseUnary() };
    }
    return this.parsePostfix();
  }

  private parsePostfix(): Expr {
    let expression = this.parsePrimary();
    while (true) {
      if (this.match("operator", "(")) {
        const args: Expr[] = [];
        if (!this.check("operator", ")")) {
          do {
            args.push(this.parseExpression());
          } while (this.match("operator", ","));
        }
        this.expect("operator", ")");
        expression = { kind: "call", callee: expression, args, line: this.peek().line };
      } else if (this.match("operator", ".")) {
        const name = this.expect("identifier");
        expression = { kind: "member", object: expression, name: name.value, line: name.line };
      } else if (this.match("operator", "[")) {
        const index = this.parseExpression();
        this.expect("operator", "]");
        expression = { kind: "index", object: expression, index };
      } else {
        break;
      }
    }
    return expression;
  }

  private parsePrimary(): Expr {
    const token = this.peek();
    if (token.type === "number") {
      this.advance();
      return { kind: "number", value: token.numberValue ?? Number(token.value) };
    }
    if (token.type === "string") {
      this.advance();
      return { kind: "string", value: token.value };
    }
    if (token.type === "identifier") {
      this.advance();
      return { kind: "identifier", name: token.value, line: token.line };
    }
    if (token.type === "keyword") {
      if (token.value === "true" || token.value === "false") {
        this.advance();
        return { kind: "bool", value: token.value === "true" };
      }
      if (token.value === "null") {
        this.advance();
        return { kind: "null" };
      }
      if (token.value === "this") {
        this.advance();
        return { kind: "this", line: token.line };
      }
      if (token.value === "fn") {
        this.advance();
        this.expect("operator", "(");
        const params = this.parseParams();
        this.expect("operator", ")");
        let returnType: TypeNode = { name: "any" };
        if (this.match("operator", ":")) returnType = this.parseType();
        return { kind: "function", params, body: this.parseBlock(), name: null };
      }
    }
    if (this.match("operator", "(")) {
      const expression = this.parseExpression();
      this.expect("operator", ")");
      return expression;
    }
    if (this.match("operator", "[")) {
      const items: Expr[] = [];
      if (!this.check("operator", "]")) {
        do {
          items.push(this.parseExpression());
        } while (this.match("operator", ","));
      }
      this.expect("operator", "]");
      return { kind: "array", items };
    }
    if (this.match("operator", "{")) {
      const entries: Array<{ key: Expr; value: Expr }> = [];
      if (!this.check("operator", "}")) {
        do {
          const key = this.parseExpression();
          this.expect("operator", ":");
          entries.push({ key, value: this.parseExpression() });
        } while (this.match("operator", ","));
      }
      this.expect("operator", "}");
      return { kind: "map", entries };
    }
    throw new SyntaxError(`unexpected token ${token.value || token.type} at ${token.line}:${token.column}`);
  }

  private peek(): Token {
    return this.tokens[this.position]!;
  }

  private advance(): Token {
    const token = this.peek();
    this.position += 1;
    return token;
  }

  private check(type: string, value?: string): boolean {
    const token = this.peek();
    return token.type === type && (value === undefined || token.value === value);
  }

  private match(type: string, value?: string): boolean {
    if (!this.check(type, value)) return false;
    this.advance();
    return true;
  }

  private expect(type: string, value?: string): Token {
    const token = this.peek();
    if (token.type !== type || (value !== undefined && token.value !== value)) {
      throw new SyntaxError(`expected ${value ?? type} but found ${token.value || token.type} at ${token.line}:${token.column}`);
    }
    return this.advance();
  }

  private skipTerminators(): void {
    while (this.check("newline") || this.check("operator", ";")) this.advance();
  }

  private atTerminator(): boolean {
    return this.check("newline") || this.check("operator", ";");
  }

  private expectTerminator(): void {
    if (this.atTerminator()) {
      this.skipTerminators();
      return;
    }
    if (this.check("eof") || this.check("operator", "}")) return;
    const token = this.peek();
    throw new SyntaxError(`expected newline but found ${token.value || token.type} at ${token.line}:${token.column}`);
  }
}

export function parse(source: string): Program {
  return Parser.parse(source);
}
