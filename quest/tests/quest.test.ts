import { describe, expect, it } from "vitest";
import {
  QUEST_SNAPSHOT_VERSION,
  QuestSystem,
  type QuestDefinition,
} from "../src/index.js";

const quests: QuestDefinition[] = [
  {
    id: "herbs",
    title: "Gather herbs",
    objectives: [
      { id: "collect", type: "collect", target: "herb", count: 5 },
      { id: "bonus", type: "talk", target: "healer", count: 1, optional: true },
    ],
    rewards: { items: [{ id: "coin", count: 10 }], flags: ["herbs_done"] },
    next: ["cure"],
  },
  {
    id: "cure",
    title: "Cure the elder",
    prerequisites: ["herbs"],
    objectives: [
      { id: "deliver", type: "talk", target: "elder", count: 1 },
      { id: "kill", type: "kill", target: "wolf", count: 3 },
    ],
  },
  {
    id: "secret",
    title: "Secret path",
    prerequisites: ["missing-quest"],
    objectives: [{ id: "reach", type: "reach", target: "cave", count: 1 }],
  },
];

describe("QuestSystem", () => {
  it("starts quests and enforces prerequisites", () => {
    const log = new QuestSystem(quests);
    expect(log.size).toBe(3);
    expect(log.available()).toEqual(["herbs"]);
    expect(log.start("cure")).toBe(false);
    expect(log.start("secret")).toBe(false);
    expect(log.start("herbs")).toBe(true);
    expect(log.start("herbs")).toBe(false);
    expect(log.status("herbs")).toBe("active");
    expect(log.activeQuests()).toEqual(["herbs"]);
    expect(() => log.start("unknown")).toThrow(RangeError);
  });

  it("tracks objective progress and completes quests", () => {
    const log = new QuestSystem(quests);
    log.start("herbs");
    expect(log.notify({ type: "collect", target: "herb", count: 2 })).toEqual(["herbs"]);
    expect(log.progress("herbs", "collect")).toBe(2);
    expect(log.objectiveDone("herbs", "collect")).toBe(false);
    log.notify({ type: "collect", target: "herb", count: 3 });
    expect(log.objectiveDone("herbs", "collect")).toBe(true);
    expect(log.isComplete("herbs")).toBe(true);
    expect(log.status("herbs")).toBe("completed");
    expect(log.completedQuests()).toEqual(["herbs"]);
    expect(log.notify({ type: "collect", target: "herb" })).toEqual([]);
    expect(log.progress("herbs", "collect")).toBe(5);
  });

  it("keeps optional objectives non-blocking and multi-objective quests gated", () => {
    const log = new QuestSystem(quests);
    log.start("herbs");
    log.notify({ type: "collect", target: "herb", count: 5 });
    expect(log.isComplete("herbs")).toBe(true);
    expect(log.objectiveDone("herbs", "bonus")).toBe(false);

    expect(log.start("cure")).toBe(true);
    log.notify({ type: "talk", target: "elder" });
    expect(log.isComplete("cure")).toBe(false);
    log.notify({ type: "kill", target: "wolf", count: 2 });
    expect(log.isComplete("cure")).toBe(false);
    log.notify({ type: "kill", target: "wolf", count: 1 });
    expect(log.isComplete("cure")).toBe(true);
  });

  it("hands out rewards once and tracks flags", () => {
    const log = new QuestSystem(quests);
    log.start("herbs");
    expect(log.claimRewards("herbs")).toBe(null);
    log.notify({ type: "collect", target: "herb", count: 5 });
    const rewards = log.claimRewards("herbs");
    expect(rewards?.items).toEqual([{ id: "coin", count: 10 }]);
    expect(log.hasFlag("herbs_done")).toBe(true);
    expect(log.claimRewards("herbs")).toBe(null);
  });

  it("exposes branching follow-ups", () => {
    const log = new QuestSystem(quests);
    log.start("herbs");
    expect(log.followUps("herbs")).toEqual(["cure"]);
    expect(log.followUps("cure")).toEqual([]);
    expect(log.definition("herbs")?.title).toBe("Gather herbs");
  });

  it("fails and abandons active quests", () => {
    const log = new QuestSystem(quests);
    log.start("herbs");
    expect(log.fail("herbs")).toBe(true);
    expect(log.status("herbs")).toBe("failed");
    expect(log.fail("herbs")).toBe(false);
    expect(log.start("herbs")).toBe(false);

    const other = new QuestSystem(quests);
    other.start("herbs");
    expect(other.abandon("herbs")).toBe(true);
    expect(other.status("herbs")).toBe("inactive");
    expect(other.start("herbs")).toBe(true);
  });

  it("serializes and restores quest state", () => {
    const log = new QuestSystem(quests);
    log.start("herbs");
    log.notify({ type: "collect", target: "herb", count: 5 });
    log.claimRewards("herbs");
    const snapshot = log.serialize();

    const restored = new QuestSystem(quests);
    restored.restore(snapshot);
    expect(restored.status("herbs")).toBe("completed");
    expect(restored.progress("herbs", "collect")).toBe(5);
    expect(restored.hasFlag("herbs_done")).toBe(true);
    expect(restored.claimRewards("herbs")).toBe(null);

    const partial = JSON.parse(snapshot);
    partial.version = 99;
    expect(() => restored.restore(JSON.stringify(partial))).toThrow(RangeError);
    expect(QUEST_SNAPSHOT_VERSION).toBe(1);
    const empty = new QuestSystem();
    expect(empty.available()).toEqual([]);
    expect(empty.notify({ type: "kill", target: "x" })).toEqual([]);
  });

  it("rejects invalid quest definitions", () => {
    expect(() => new QuestSystem([{ id: "x", title: "x", objectives: [] }])).toThrow(RangeError);
    const log = new QuestSystem();
    expect(() =>
      log.define({
        id: "dup",
        title: "d",
        objectives: [
          { id: "a", type: "flag", target: "t", count: 1 },
          { id: "a", type: "flag", target: "t", count: 1 },
        ],
      }),
    ).toThrow(RangeError);
  });
});
