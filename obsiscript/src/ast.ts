export type TypeName = "number" | "string" | "bool" | "void" | "any" | "fn" | "object";

export interface TypeNode {
  name: TypeName;
  params?: TypeName[];
  returns?: TypeName;
}

export type Expr =
  | { kind: "number"; value: number }
  | { kind: "string"; value: string }
  | { kind: "bool"; value: boolean }
  | { kind: "null" }
  | { kind: "identifier"; name: string; line: number }
  | { kind: "this"; line: number }
  | { kind: "array"; items: Expr[] }
  | { kind: "map"; entries: Array<{ key: Expr; value: Expr }> }
  | { kind: "unary"; op: "-" | "!"; operand: Expr }
  | { kind: "binary"; op: string; left: Expr; right: Expr }
  | { kind: "logical"; op: "&&" | "||"; left: Expr; right: Expr }
  | { kind: "assign"; target: Expr; value: Expr }
  | { kind: "call"; callee: Expr; args: Expr[]; line: number }
  | { kind: "index"; object: Expr; index: Expr }
  | { kind: "member"; object: Expr; name: string; line: number }
  | { kind: "function"; params: Param[]; body: Block; name: string | null };

export interface Param {
  name: string;
  type: TypeNode;
}

export type Stmt =
  | { kind: "let"; name: string; type: TypeNode | null; value: Expr; constant: boolean; line: number }
  | { kind: "expr"; expression: Expr }
  | { kind: "if"; condition: Expr; then: Block; otherwise: Block | null }
  | { kind: "while"; condition: Expr; body: Block }
  | { kind: "for"; setup: Stmt | null; condition: Expr | null; step: Stmt | null; body: Block }
  | { kind: "return"; value: Expr | null; line: number }
  | { kind: "fn"; declaration: FunctionDecl }
  | { kind: "class"; declaration: ClassDecl }
  | { kind: "import"; module: string; alias: string; line: number }
  | { kind: "export"; statement: Stmt; name: string; line: number }
  | { kind: "spawn"; delay: Expr; body: Expr; line: number };

export interface Block {
  statements: Stmt[];
}

export interface FunctionDecl {
  name: string;
  params: Param[];
  returnType: TypeNode;
  body: Block;
  line: number;
}

export interface ClassDecl {
  name: string;
  methods: FunctionDecl[];
  line: number;
}

export interface Program {
  statements: Stmt[];
}
