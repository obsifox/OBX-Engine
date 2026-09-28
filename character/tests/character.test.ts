import { describe, expect, it } from "vitest";
import { Vec3 } from "@obx/math";
import { PhysicsWorld, planeShape, characterInput, Body, sphereShape } from "@obx/physics";
import {
  Character,
  Equipment,
  Health,
  InteractionSystem,
  Stamina,
} from "../src/index.js";

describe("Health", () => {
  it("takes damage and dies", () => {
    const health = new Health(100);
    let deaths = 0;
    health.onDeath.push(() => {
      deaths += 1;
    });
    expect(health.damage(30)).toBe(30);
    expect(health.current).toBe(70);
    expect(health.heal(50)).toBe(30);
    expect(health.current).toBe(100);
    health.damage(1000);
    expect(health.isDead).toBe(true);
    expect(deaths).toBe(1);
    expect(health.damage(5)).toBe(0);
  });
});

describe("Stamina", () => {
  it("drains, exhausts and regenerates", () => {
    const stamina = new Stamina(100, 50, 20);
    stamina.update(1, true);
    expect(stamina.current).toBeCloseTo(50, 12);
    stamina.update(1, true);
    expect(stamina.exhausted).toBe(true);
    stamina.update(1, false);
    expect(stamina.current).toBeCloseTo(20, 12);
    stamina.update(1, false);
    expect(stamina.exhausted).toBe(false);
    expect(stamina.trySpend(5)).toBe(true);
    expect(stamina.current).toBeCloseTo(35, 12);
    expect(stamina.trySpend(100)).toBe(false);
  });
});

describe("Equipment", () => {
  it("stacks modifiers per slot", () => {
    const equipment = new Equipment();
    equipment.equip({ id: "boots", slot: "feet", modifiers: { moveSpeedMultiplier: 1.2 } });
    equipment.equip({ id: "sword", slot: "hand", modifiers: { damageMultiplier: 2, armor: 5 } });
    const previous = equipment.equip({ id: "swift-boots", slot: "feet", modifiers: { moveSpeedMultiplier: 1.5 } });
    expect(previous!.id).toBe("boots");
    const mods = equipment.modifiers();
    expect(mods.moveSpeedMultiplier).toBeCloseTo(1.5, 12);
    expect(mods.damageMultiplier).toBe(2);
    expect(mods.armor).toBe(5);
    expect(equipment.unequip("hand")!.id).toBe("sword");
    expect(equipment.get("hand")).toBeNull();
  });
});

describe("InteractionSystem", () => {
  it("finds and triggers the nearest interactable", () => {
    const system = new InteractionSystem();
    const used: string[] = [];
    system.register({
      id: "chest",
      position: new Vec3(3, 0, 0),
      radius: 1,
      onInteract: (id) => used.push(id),
    });
    system.register({
      id: "door",
      position: new Vec3(1, 0, 0),
      radius: 1,
      onInteract: (id) => used.push(id),
    });
    expect(system.query(new Vec3(0, 0, 0), 2).map((entry) => entry.id)).toEqual(["door", "chest"]);
    expect(system.interactNearest(new Vec3(0, 0, 0), 2)).toBe("door");
    expect(used).toEqual(["door"]);
    system.unregister("door");
    expect(system.interactNearest(new Vec3(0, 0, 0), 3)).toBe("chest");
    expect(system.interact("missing")).toBe(false);
  });
});

describe("Character", () => {
  it("combines locomotion with health and stamina", () => {
    const world = new PhysicsWorld({ gravity: new Vec3(0, -12, 0) });
    world.addBody(new Body({ type: "static", shape: planeShape(new Vec3(0, 1, 0), 0) }));
    world.addBody(new Body({ type: "static", shape: sphereShape(1), position: new Vec3(4, 1, 0) }));
    const character = new Character(world, {
      position: new Vec3(0, 0.4, 0),
      walkSpeed: 4,
      runSpeed: 8,
    });
    for (let i = 0; i < 10; i += 1) {
      character.update(1 / 60, characterInput({ move: new Vec3(1, 0, 0) }), world);
      world.step(1 / 60);
    }
    expect(character.state).toBe("grounded");
    expect(character.position.x).toBeGreaterThan(0.4);
    const walked = character.position.x;
    for (let i = 0; i < 30; i += 1) {
      character.update(1 / 60, characterInput({ move: new Vec3(1, 0, 0), run: true }), world);
      world.step(1 / 60);
    }
    expect(character.position.x).toBeGreaterThan(walked + 1);
    expect(character.stamina.current).toBeLessThan(100);
    character.equipment.equip({ id: "armor", slot: "body", modifiers: { armor: 10 } });
    expect(character.takeDamage(15)).toBe(5);
    expect(character.health.current).toBe(95);
  });
});
