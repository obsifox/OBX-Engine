import { describe, expect, it } from "vitest";
import { AntiCheatHooks, Lobby, Matchmaking, RoomManager } from "../src/index.js";

describe("Lobby", () => {
  it("tracks readiness and chat", () => {
    const lobby = new Lobby();
    lobby.join({ id: "a", name: "Ada", skill: 1200, ready: false });
    lobby.join({ id: "b", name: "Bob", skill: 1100, ready: false });
    expect(() => lobby.join({ id: "a", name: "Ada", skill: 1, ready: false })).toThrow(RangeError);
    expect(lobby.allReady()).toBe(false);
    lobby.ready("a");
    lobby.ready("b");
    expect(lobby.allReady()).toBe(true);
    const entry = lobby.say("a", "gl hf");
    expect(entry).toMatchObject({ playerId: "a", message: "gl hf", order: 1 });
    expect(() => lobby.say("ghost", "hi")).toThrow(RangeError);
    expect(() => lobby.ready("ghost")).toThrow(RangeError);
    lobby.ready("b", false);
    expect(lobby.leave("a")).toBe(true);
    expect(lobby.members).toHaveLength(1);
    expect(lobby.allReady()).toBe(false);
  });
});

describe("RoomManager", () => {
  it("manages rooms with capacity and hosts", () => {
    const rooms = new RoomManager({ maxRooms: 2, defaultCapacity: 2 });
    const room = rooms.create("host", { name: "Arena" });
    expect(room).toMatchObject({ id: "room_1", name: "Arena", host: "host", players: ["host"] });
    rooms.join("room_1", "p2");
    expect(() => rooms.join("room_1", "p3")).toThrow(RangeError);
    rooms.create("other", { private: true });
    expect(() => rooms.create("third")).toThrow(RangeError);
    expect(rooms.list()).toHaveLength(1);
    expect(rooms.list(true)).toHaveLength(2);
    rooms.leave("room_1", "host");
    expect(rooms.get("room_1")!.host).toBe("p2");
    expect(rooms.leave("room_1", "p2")).toBe(true);
    expect(rooms.get("room_1")).toBeNull();
    expect(rooms.close("room_2")).toBe(true);
    expect(rooms.count).toBe(0);
    expect(rooms.leave("missing", "x")).toBe(false);
  });
});

describe("Matchmaking", () => {
  it("groups tickets by skill and cancels", () => {
    const matchmaking = new Matchmaking({ matchSize: 2, skillRange: 50 });
    matchmaking.enqueue({ id: "t1", skill: 1000 });
    matchmaking.enqueue({ id: "t2", skill: 1020 });
    matchmaking.enqueue({ id: "t3", skill: 1500 });
    expect(() => matchmaking.enqueue({ id: "t1", skill: 1 })).toThrow(RangeError);
    const matches = matchmaking.tick();
    expect(matches).toHaveLength(1);
    expect(matches[0]!.players).toEqual(["t1", "t2"]);
    expect(matches[0]!.averageSkill).toBe(1010);
    expect(matchmaking.queued).toEqual(["t3"]);
    expect(matchmaking.cancel("t3")).toBe(true);
    expect(matchmaking.cancel("t3")).toBe(false);
    expect(matchmaking.tick()).toEqual([]);
    matchmaking.enqueue({ id: "t4", skill: 2000 });
    matchmaking.enqueue({ id: "t5", skill: 2200 });
    expect(matchmaking.tick()).toEqual([]);
  });
});

describe("AntiCheatHooks", () => {
  it("audits events and logs violations", () => {
    const hooks = new AntiCheatHooks();
    hooks.register("speed", (event) => Number(event.data.speed ?? 0) <= 10);
    hooks.register("ammo", (event) => Number(event.data.ammo ?? 0) >= 0);
    hooks.register("boom", () => {
      throw new Error("validator crash");
    });
    const clean = hooks.audit({ playerId: "p1", type: "move", data: { speed: 5, ammo: 3 } });
    expect(clean.violations).toEqual(["boom"]);
    const cheat = hooks.audit({ playerId: "p2", type: "move", data: { speed: 99, ammo: -1 } });
    expect(cheat.ok).toBe(false);
    expect(cheat.violations.sort()).toEqual(["ammo", "boom", "speed"]);
    expect(hooks.violationsFor("p2")).toHaveLength(3);
    hooks.reset("p2");
    expect(hooks.violationsFor("p2")).toEqual([]);
    expect(hooks.hooks.sort()).toEqual(["ammo", "boom", "speed"]);
  });
});
