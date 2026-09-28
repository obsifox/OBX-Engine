import { describe, expect, it } from "vitest";
import { CombatBrain, WildlifeBrain } from "../src/index.js";

describe("CombatBrain", () => {
  it("chooses tactics from utility scores", () => {
    const brain = new CombatBrain({ health: 100, aggression: 0.8 });
    expect(brain.perceive({ distance: 8, threat: 0.2, allies: 1, ammo: 20 })).toBe("engage");
    expect(brain.perceive({ distance: 30, threat: 0.1, allies: 0, ammo: 20 })).toBe("idle");
    expect(brain.perceive({ distance: 5, threat: 0.3, allies: 0, ammo: 1 })).toBe("reload");
    brain.damage(90);
    expect(brain.health).toBe(10);
    expect(brain.perceive({ distance: 8, threat: 0.5, allies: 0, ammo: 20 })).toBe("flee");
    brain.heal(50);
    expect(brain.health).toBe(60);
    expect(brain.scores.map((entry) => entry.action).sort()).toEqual(["engage", "flank", "flee", "idle", "reload"]);
  });

  it("flanks when hurt but supported", () => {
    const brain = new CombatBrain({ health: 55, aggression: 0.9 });
    expect(brain.perceive({ distance: 10, threat: 0.15, allies: 2, ammo: 30 })).toBe("flank");
  });
});

describe("WildlifeBrain", () => {
  it("flees predators and grazes near food", () => {
    const brain = new WildlifeBrain({ seed: 5, fear: 0.9, hunger: 0.8, fleeRadius: 12 });
    expect(brain.perceive({ predatorDistance: 3, foodDistance: 10, herdSize: 1 })).toBe("flee");
    expect(brain.perceive({ predatorDistance: 40, foodDistance: 1, herdSize: 1 })).toBe("graze");
    expect(brain.perceive({ predatorDistance: 40, foodDistance: 30, herdSize: 4 })).toBe("herd");
    const wander = brain.perceive({ predatorDistance: 40, foodDistance: 30, herdSize: 0 });
    expect(["wander", "graze", "herd", "flee"]).toContain(wander);
    expect(brain.recent.length).toBe(4);
    const same = new WildlifeBrain({ seed: 5, fear: 0.9, hunger: 0.8, fleeRadius: 12 });
    const a = [];
    const b = [];
    for (let i = 0; i < 3; i += 1) {
      a.push(brain.perceive({ predatorDistance: 40, foodDistance: 30, herdSize: 0 }));
      b.push(same.perceive({ predatorDistance: 40, foodDistance: 30, herdSize: 0 }));
    }
    expect(a).toEqual(b);
  });
});
