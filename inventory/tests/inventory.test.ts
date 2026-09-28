import { describe, expect, it } from "vitest";
import {
  Container,
  Equipment,
  Inventory,
  ItemRegistry,
} from "../src/index.js";

function registry(): ItemRegistry {
  const items = new ItemRegistry();
  items.define({ id: "herb", name: "Herb", maxStack: 10, weight: 0.2, tags: ["consumable"] });
  items.define({ id: "sword", name: "Sword", weight: 3, maxDurability: 100, tags: ["weapon"], equipmentSlot: "main" });
  items.define({ id: "helmet", name: "Helmet", weight: 1.5, maxDurability: 60, equipmentSlot: "head" });
  items.define({ id: "coin", name: "Coin", maxStack: 99, weight: 0.01, metadata: { value: 1 } });
  return items;
}

describe("ItemRegistry and Item", () => {
  it("defines and creates items with merged metadata", () => {
    const items = registry();
    expect(items.size).toBe(4);
    expect(items.has("herb")).toBe(true);
    const coin = items.create("coin", 5, { value: 3 });
    expect(coin.count).toBe(5);
    expect(coin.weight).toBeCloseTo(0.05, 6);
    expect(coin.metadata.value).toBe(3);
    expect(coin.stackable).toBe(true);
    expect(items.create("sword").stackable).toBe(false);
    expect(() => items.define({ id: "herb", name: "Dup" })).toThrow(RangeError);
    expect(() => items.create("missing")).toThrow(RangeError);
  });

  it("splits stacks and tracks kind", () => {
    const items = registry();
    const stack = items.create("herb", 7);
    const piece = stack.split(3);
    expect(piece.count).toBe(3);
    expect(stack.count).toBe(4);
    expect(piece.sameKind(stack)).toBe(true);
    expect(piece.sameKind(items.create("coin"))).toBe(false);
    expect(stack.split(99).count).toBe(4);
    expect(stack.count).toBe(0);
  });

  it("damages, destroys and repairs durable items", () => {
    const items = registry();
    const sword = items.create("sword");
    expect(sword.durability).toBe(100);
    expect(sword.damage(30)).toBe(false);
    expect(sword.durability).toBe(70);
    sword.repair(50);
    expect(sword.durability).toBe(100);
    expect(sword.damage(100)).toBe(true);
    expect(sword.destroyed).toBe(true);
    expect(items.create("herb").damage(5)).toBe(false);
    const herb = items.create("herb");
    herb.repair(5);
    expect(herb.durability).toBe(0);
  });
});

describe("Inventory", () => {
  it("stacks items and reports leftovers", () => {
    const items = registry();
    const bag = new Inventory({ slots: 1 });
    const leftover = bag.add(items.create("herb", 12));
    expect(leftover).toBe(2);
    expect(bag.usedSlots).toBe(1);
    expect(bag.count("herb")).toBe(10);

    const wide = new Inventory({ slots: 2 });
    wide.add(items.create("herb", 8));
    wide.add(items.create("herb", 5));
    expect(wide.usedSlots).toBe(2);
    expect(wide.count("herb")).toBe(13);
    expect(wide.add(items.create("coin", 1))).toBe(1);
  });

  it("enforces the weight limit", () => {
    const items = registry();
    const bag = new Inventory({ slots: 10, maxWeight: 4 });
    bag.add(items.create("sword"));
    expect(bag.weight).toBeCloseTo(3, 6);
    const leftover = bag.add(items.create("helmet"));
    expect(leftover).toBe(1);
    expect(bag.weight).toBeCloseTo(3, 6);
  });

  it("removes, finds and counts items", () => {
    const items = registry();
    const bag = new Inventory({ slots: 4 });
    bag.add(items.create("herb", 8));
    bag.add(items.create("coin", 20));
    expect(bag.find("coin")?.item.count).toBe(20);
    expect(bag.find("sword")).toBe(null);
    const removed = bag.remove(bag.find("herb")!.index, 3);
    expect(removed?.count).toBe(3);
    expect(bag.count("herb")).toBe(5);
    expect(bag.removeById("coin", 25)).toBe(20);
    expect(bag.count("coin")).toBe(0);
    expect(bag.remove(1)).toBe(undefined);
    expect(bag.hasTag("consumable")).toBe(true);
    expect(bag.hasTag("weapon")).toBe(false);
  });

  it("swaps slots and transfers between inventories", () => {
    const items = registry();
    const bag = new Inventory({ slots: 3 });
    const chest = new Inventory({ slots: 1, maxWeight: 0.07 });
    bag.add(items.create("sword"));
    bag.add(items.create("coin", 10));
    bag.swap(0, 1);
    expect(bag.itemAt(0)?.id).toBe("coin");
    const moved = bag.transferTo(chest, 0, 6);
    expect(moved).toBe(6);
    expect(chest.count("coin")).toBe(6);
    expect(bag.count("coin")).toBe(4);
    expect(bag.transferTo(chest, 0, 10)).toBe(0);
    expect(bag.count("coin")).toBe(4);
  });

  it("supports custom logic hooks", () => {
    const items = registry();
    const bag = new Inventory({ slots: 4 });
    bag.onAdd = (item) => item.id !== "coin";
    bag.onRemove = (item) => item.id !== "sword";
    expect(bag.add(items.create("coin", 3))).toBe(3);
    bag.add(items.create("sword"));
    expect(bag.remove(bag.find("sword")!.index)).toBe(undefined);
    expect(bag.remove(bag.find("sword")!.index)).toBe(undefined);
    bag.onRemove = null;
    expect(bag.remove(bag.find("sword")!.index)?.id).toBe("sword");
    expect(() => new Inventory({ slots: 0 })).toThrow(RangeError);
  });
});

describe("Container and Equipment", () => {
  it("opens and closes with its own inventory", () => {
    const items = registry();
    const chest = new Container({ slots: 5 });
    expect(chest.isOpen).toBe(false);
    chest.open();
    chest.inventory.add(items.create("herb", 2));
    expect(chest.inventory.count("herb")).toBe(2);
    chest.close();
    expect(chest.isOpen).toBe(false);
  });

  it("equips and unequips valid slots", () => {
    const items = registry();
    const gear = new Equipment({ slots: ["main", "head"] });
    const sword = items.create("sword");
    expect(gear.equip(sword, "main")).toBe(null);
    expect(gear.get("main")?.id).toBe("sword");
    expect(gear.weight).toBeCloseTo(3, 6);
    expect(gear.hasTag("weapon")).toBe(true);
    const replacement = items.create("sword");
    const previous = gear.equip(replacement, "main");
    expect(previous?.id).toBe("sword");
    expect(gear.unequip("main")?.id).toBe("sword");
    expect(gear.get("head")).toBe(null);
    gear.equip(items.create("helmet"), "head");
    expect(gear.totalDurability()).toBe(60);
    expect(() => gear.equip(items.create("helmet"), "main")).toThrow(RangeError);
    expect(() => gear.equip(items.create("sword"), "back")).toThrow(RangeError);
  });
});
