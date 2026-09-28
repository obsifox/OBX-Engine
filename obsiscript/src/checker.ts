import {
  type Block,
  type Expr,
  type FunctionDecl,
  type Program,
  type Stmt,
  type TypeName,
  type TypeNode,
} from "./ast.js";

export interface TypeIssue {
  line: number;
  message: string;
}

export class TypeChecker {
  readonly issues: TypeIssue[] = [];
  private readonly scopes: Array<Map<string, TypeNode>> = [new Map()];

  check(program: Program): TypeIssue[] {
    for (const statement of program.statements) this.checkStmt(statement);
    return this.issues;
  }

  private checkStmt(statement: Stmt): void {
    switch (statement.kind) {
      case "let": {
        const valueType = this.infer(statement.value);
        if (statement.type && valueType && !this.compatible(statement.type, valueType)) {
          this.issues.push({ line: statement.line, message: `cannot assign ${valueType.name} to ${statement.type.name}` });
        }
        this.scopes[this.scopes.length - 1]!.set(statement.name, statement.type ?? valueType ?? { name: "any" });
        return;
      }
      case "expr":
        this.infer(statement.expression);
        return;
      case "if":
        this.infer(statement.condition);
        this.checkBlock(statement.then);
        if (statement.otherwise) this.checkBlock(statement.otherwise);
        return;
      case "while":
        this.infer(statement.condition);
        this.checkBlock(statement.body);
        return;
      case "for":
        this.push();
        if (statement.setup) this.checkStmt(statement.setup);
        if (statement.condition) this.infer(statement.condition);
        this.checkBlock(statement.body);
        if (statement.step) this.checkStmt(statement.step);
        this.pop();
        return;
      case "return": {
        const expected = this.functionReturns[this.functionReturns.length - 1];
        if (!expected) return;
        const actual = statement.value ? this.infer(statement.value) : { name: "void" as TypeName };
        if (actual && !this.compatible(expected, actual)) {
          this.issues.push({ line: statement.line, message: `expected return ${expected.name}, got ${actual.name}` });
        }
        return;
      }
      case "fn":
        this.checkFunction(statement.declaration);
        return;
      case "class":
        for (const method of statement.declaration.methods) this.checkFunction(method);
        return;
      case "export":
        this.checkStmt(statement.statement);
        return;
      case "import":
      case "spawn":
        return;
    }
  }

  private checkBlock(block: Block): void {
    this.push();
    for (const statement of block.statements) this.checkStmt(statement);
    this.pop();
  }

  private checkFunction(declaration: FunctionDecl): void {
    this.scopes[this.scopes.length - 1]!.set(declaration.name, {
      name: "fn",
      params: declaration.params.map((param) => param.type.name),
      returns: declaration.returnType.name,
    });
    this.push();
    for (const param of declaration.params) this.scopes[this.scopes.length - 1]!.set(param.name, param.type);
    this.functionReturns.push(declaration.returnType);
    for (const statement of declaration.body.statements) this.checkStmt(statement);
    this.functionReturns.pop();
    this.pop();
  }

  private readonly functionReturns: TypeNode[] = [];

  private infer(expression: Expr): TypeNode | null {
    switch (expression.kind) {
      case "number":
        return { name: "number" };
      case "string":
        return { name: "string" };
      case "bool":
        return { name: "bool" };
      case "null":
        return { name: "any" };
      case "identifier": {
        const found = this.lookup(expression.name);
        if (!found) {
          this.issues.push({ line: expression.line, message: `undefined variable ${expression.name}` });
          return { name: "any" };
        }
        return found;
      }
      case "this":
        return { name: "object" };
      case "array":
        return { name: "any" };
      case "map":
        return { name: "object" };
      case "unary":
        this.infer(expression.operand);
        return { name: expression.op === "-" ? "number" : "bool" };
      case "binary": {
        const left = this.infer(expression.left);
        const right = this.infer(expression.right);
        if (expression.op === "+") {
          if (left?.name === "string" || right?.name === "string") return { name: "string" };
          return { name: "number" };
        }
        if (["-", "*", "/", "%"].includes(expression.op)) return { name: "number" };
        return { name: "bool" };
      }
      case "logical":
        this.infer(expression.left);
        this.infer(expression.right);
        return { name: "bool" };
      case "assign": {
        const valueType = this.infer(expression.value);
        if (expression.target.kind === "identifier") {
          const known = this.lookup(expression.target.name);
          if (known && valueType && !this.compatible(known, valueType)) {
            this.issues.push({ line: expression.target.line, message: `cannot assign ${valueType.name} to ${known.name}` });
          }
          return valueType;
        }
        this.infer(expression.target);
        return valueType;
      }
      case "call": {
        const callee = this.infer(expression.callee);
        for (const arg of expression.args) this.infer(arg);
        return { name: callee?.returns ?? "any" };
      }
      case "index":
        this.infer(expression.object);
        this.infer(expression.index);
        return { name: "any" };
      case "member":
        this.infer(expression.object);
        return { name: "any" };
      case "function":
        this.checkFunction({
          name: expression.name ?? "anonymous",
          params: expression.params,
          returnType: { name: "any" },
          body: expression.body,
          line: 0,
        });
        return { name: "fn" };
    }
  }

  private lookup(name: string): TypeNode | null {
    for (let index = this.scopes.length - 1; index >= 0; index -= 1) {
      const found = this.scopes[index]!.get(name);
      if (found) return found;
    }
    return null;
  }

  private compatible(declared: TypeNode, actual: TypeNode): boolean {
    if (declared.name === "any" || actual.name === "any") return true;
    return declared.name === actual.name;
  }

  private push(): void {
    this.scopes.push(new Map());
  }

  private pop(): void {
    this.scopes.pop();
  }
}

export function typeCheck(program: Program): TypeIssue[] {
  return new TypeChecker().check(program);
}
