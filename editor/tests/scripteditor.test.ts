import { describe, expect, it } from "vitest";
import {
  ScriptEditor,
  analyze,
  findMatches,
  languageForPath,
  tokenize,
} from "../src/index.js";

describe("tokenizer", () => {
  it("tokenizes javascript with keywords, strings, numbers and comments", () => {
    const tokens = tokenize('const x = 42; // note\nlet s = "hi";', "javascript").filter((token) => token.kind !== "whitespace");
    expect(tokens[0]).toMatchObject({ kind: "keyword", text: "const" });
    expect(tokens[1]).toMatchObject({ kind: "ident", text: "x" });
    expect(tokens[3]).toMatchObject({ kind: "number", text: "42" });
    expect(tokens[5]).toMatchObject({ kind: "comment", text: "// note" });
    const stringToken = tokens.find((token) => token.kind === "string")!;
    expect(stringToken.text).toBe('"hi"');
    expect(stringToken.line).toBe(2);
  });

  it("tokenizes obx shader declarations", () => {
    const tokens = tokenize("uniform vec3 uColor\nentry fragment main", "obx-shader").filter((token) => token.kind !== "whitespace");
    expect(tokens.map((token) => token.text)).toEqual(["uniform", "vec3", "uColor", "entry", "fragment", "main"]);
    expect(tokens[0]!.kind).toBe("keyword");
  });

  it("reports language detection", () => {
    expect(languageForPath("a/b.ts")).toBe("typescript");
    expect(languageForPath("x.js")).toBe("javascript");
    expect(languageForPath("data.json")).toBe("json");
    expect(languageForPath("shaders/light.wgsl")).toBe("obx-shader");
    expect(languageForPath("readme")).toBe("text");
  });
});

describe("find and replace", () => {
  it("finds matches with line and column info", () => {
    const matches = findMatches("abc abc\nabc", "abc");
    expect(matches).toHaveLength(3);
    expect(matches[1]).toMatchObject({ line: 1, column: 4 });
    expect(matches[2]).toMatchObject({ line: 2, column: 0 });
    expect(findMatches("ABC abc", "abc")).toHaveLength(2);
    expect(findMatches("ABC abc", "abc", true)).toHaveLength(1);
  });

  it("replaces one and all occurrences", () => {
    const editor = new ScriptEditor();
    const tab = editor.open("a.ts", "x = 1; x = 2;");
    expect(editor.replace(tab.id, "x", "y", 1)).toBe(true);
    expect(tab.text).toBe("x = 1; y = 2;");
    expect(editor.replaceAll(tab.id, "x", "z")).toBe(1);
    expect(tab.text).toBe("z = 1; y = 2;");
    expect(editor.replace(tab.id, "missing", "q", 0)).toBe(false);
    expect(tab.dirty).toBe(true);
  });
});

describe("diagnostics", () => {
  it("detects unmatched brackets and unterminated strings", () => {
    expect(analyze("function f() { return 1; }")).toEqual([]);
    const unclosed = analyze("function f() {");
    expect(unclosed).toHaveLength(1);
    expect(unclosed[0]).toMatchObject({ severity: "error", message: 'unclosed "{"', line: 1 });
    const unmatched = analyze("a = (b];");
    expect(unmatched[0]).toMatchObject({ message: 'unmatched "]"' });
    const unterminated = analyze('const s = "abc');
    expect(unterminated[0]).toMatchObject({ message: "unterminated string", line: 1 });
  });
});

describe("script editor", () => {
  it("manages tabs", () => {
    const editor = new ScriptEditor();
    const first = editor.open("a.ts", "1");
    const second = editor.open("b.ts", "2");
    expect(editor.tabs).toHaveLength(2);
    expect(editor.active!.id).toBe(second.id);
    editor.activate(first.id);
    expect(editor.active!.id).toBe(first.id);
    editor.reorder(1, 0);
    expect(editor.tabs[0]!.id).toBe(second.id);
    editor.open("a.ts", "3");
    expect(editor.tabs).toHaveLength(2);
    expect(editor.active!.text).toBe("3");
    editor.close(first.id);
    expect(editor.active!.id).toBe(second.id);
    editor.close(second.id);
    expect(editor.active).toBeNull();
    expect(editor.close("nope")).toBe(false);
  });

  it("tracks edits and cursors", () => {
    const editor = new ScriptEditor();
    const tab = editor.open("a.ts", "ok");
    editor.edit(tab.id, "bad {", 3);
    expect(tab.dirty).toBe(true);
    expect(tab.diagnostics.length).toBeGreaterThan(0);
    editor.setCursor(tab.id, 2);
    expect(tab.cursor).toBe(2);
    expect(() => editor.edit("missing", "x")).toThrow();
  });

  it("highlights active tabs", () => {
    const editor = new ScriptEditor();
    const tab = editor.open("s.obx", "entry vertex main");
    const tokens = editor.highlight(tab.id);
    expect(tokens.some((token) => token.text === "vertex" && token.kind === "keyword")).toBe(true);
    expect(editor.highlight("missing")).toEqual([]);
    expect(editor.diagnostics("missing")).toEqual([]);
  });

  it("executes scripts with error display", () => {
    const editor = new ScriptEditor();
    const tab = editor.open("run.js", "throw new Error('boom:12')");
    editor.setRunner(() => ({ ok: false, output: ["log"], error: "boom:12" }));
    const result = editor.execute(tab.id);
    expect(result.ok).toBe(false);
    expect(result.output).toEqual(["log"]);
    expect(editor.errorDiagnostics(tab.id).some((diagnostic) => diagnostic.line === 12)).toBe(true);
    editor.setRunner(() => {
      throw new Error("crash");
    });
    const crashed = editor.execute(tab.id);
    expect(crashed.error).toBe("crash");
    expect(editor.execute("missing").ok).toBe(false);
  });

  it("reloads scripts from source", () => {
    const editor = new ScriptEditor();
    const tab = editor.open("a.ts", "old");
    editor.edit(tab.id, "dirty", 0);
    editor.setReloader((path) => (path === "a.ts" ? "fresh" : null));
    expect(editor.reload(tab.id)).toBe(true);
    expect(tab.text).toBe("fresh");
    expect(tab.dirty).toBe(false);
    expect(editor.reload("missing")).toBe(false);
  });
});
