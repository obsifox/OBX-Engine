import { describe, expect, it } from "vitest";
import {
  DialogueGraph,
  DialogueRunner,
  DialogueVariables,
  LocalizedText,
  type DialogueNode,
} from "../src/index.js";

const nodes: DialogueNode[] = [
  {
    id: "greet",
    speaker: "Elder",
    text: "greeting",
    voice: "elder_greet",
    effects: [(vars) => vars.set("met", true)],
    choices: [
      { id: "accept", text: "Accept", next: "accept" },
      { id: "ask", text: "Ask price", condition: (vars) => vars.get("met", false), effects: [(vars) => vars.set("asked", true)], next: "price" },
      { id: "locked", text: "Locked", condition: (vars) => vars.get("vip", false), next: "vip" },
    ],
  },
  { id: "accept", speaker: "Elder", text: "acceptance", next: "bye" },
  { id: "price", speaker: "Elder", text: "price", next: "bye" },
  { id: "vip", speaker: "Elder", text: "vip", next: null },
  { id: "bye", speaker: "Elder", text: "goodbye", next: null },
];

describe("DialogueGraph", () => {
  it("indexes nodes and validates references", () => {
    const graph = new DialogueGraph(nodes);
    expect(graph.size).toBe(5);
    expect(graph.ids).toContain("greet");
    expect(graph.node("accept")?.speaker).toBe("Elder");
    expect(graph.node("missing")).toBe(undefined);
    expect(graph.validate()).toEqual([]);

    const broken = new DialogueGraph([
      { id: "a", speaker: "x", text: "t", next: "ghost" },
      { id: "b", speaker: "x", text: "t", choices: [{ id: "c", text: "c", next: "nope" }] },
    ]);
    expect(broken.validate()).toEqual(["a -> ghost", "b -> nope"]);
    expect(() => new DialogueGraph([nodes[0]!, nodes[0]!])).toThrow(RangeError);
  });
});

describe("DialogueRunner", () => {
  it("runs linear nodes with history and voice", () => {
    const runner = new DialogueRunner(new DialogueGraph(nodes));
    const start = runner.start("greet");
    expect(start.id).toBe("greet");
    expect(runner.finished).toBe(false);
    expect(runner.voice()).toBe("elder_greet");
    expect(runner.text()).toBe("greeting");
    expect(runner.variables.get("met", false)).toBe(true);
    expect(runner.advance()).toBe(runner.current);
    runner.choose("accept");
    expect(runner.current?.id).toBe("accept");
    runner.advance();
    expect(runner.current?.id).toBe("bye");
    expect(runner.voice()).toBe(null);
    runner.advance();
    expect(runner.finished).toBe(true);
    expect(runner.history.map((entry) => entry.text)).toEqual(["greeting", "acceptance", "goodbye"]);
    expect(runner.text()).toBe("");
  });

  it("filters choices by condition and applies effects", () => {
    const runner = new DialogueRunner(new DialogueGraph(nodes));
    runner.start("greet");
    expect(runner.availableChoices().map((choice) => choice.id)).toEqual(["accept", "ask"]);
    expect(runner.choose("locked")).toBe(null);
    expect(runner.choose("missing")).toBe(null);
    runner.choose("ask");
    expect(runner.variables.get("asked", false)).toBe(true);
    expect(runner.current?.id).toBe("price");
  });

  it("resolves localized text with fallback", () => {
    const text = new LocalizedText({
      en: { greeting: "Hello", goodbye: "Bye" },
      fa: { greeting: "سلام" },
    });
    expect(text.resolve("greeting", "fa")).toBe("سلام");
    expect(text.resolve("goodbye", "fa")).toBe("Bye");
    expect(text.resolve("unknown", "fa")).toBe("unknown");
    const runner = new DialogueRunner(new DialogueGraph(nodes), {
      locale: "fa",
      text: (key, locale) => text.resolve(key, locale),
    });
    runner.start("greet");
    expect(runner.text()).toBe("سلام");
    expect(runner.text("en")).toBe("Hello");
    expect(new LocalizedText({}).resolve("key", "en")).toBe("key");
  });

  it("tracks variables and reports speaking", () => {
    const spoken: string[] = [];
    const variables = new DialogueVariables();
    variables.set("hp", 10);
    variables.set("name", "Ash");
    variables.set("alive", true);
    const runner = new DialogueRunner(new DialogueGraph(nodes), {
      variables,
      onSpeak: (node) => spoken.push(node.id),
    });
    runner.start("greet");
    runner.choose("accept");
    expect(spoken).toEqual(["greet", "accept"]);
    expect(variables.get("hp", 0)).toBe(10);
    expect(variables.has("name")).toBe(true);
    expect(variables.toObject().alive).toBe(true);
    variables.load({ hp: 20 });
    expect(variables.get("hp", 0)).toBe(20);
    expect(variables.has("name")).toBe(false);
    expect(variables.delete("hp")).toBe(true);
    expect(() => runner.start("missing")).toThrow(RangeError);
  });
});
