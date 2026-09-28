export type ItemMetadata = Record<string, string | number | boolean>;

export interface ItemDefinition {
  id: string;
  name: string;
  maxStack: number;
  weight: number;
  maxDurability: number;
  tags: string[];
  metadata: ItemMetadata;
  equipmentSlot?: string;
}

export interface ItemDefinitionInput {
  id: string;
  name: string;
  maxStack?: number;
  weight?: number;
  maxDurability?: number;
  tags?: string[];
  metadata?: ItemMetadata;
  equipmentSlot?: string;
}

export class Item {
  count: number;
  durability: number;
  metadata: ItemMetadata;

  constructor(
    readonly definition: ItemDefinition,
    count = 1,
    durability?: number,
    metadata: ItemMetadata = {},
  ) {
    this.count = Math.max(0, Math.floor(count));
    this.durability = durability ?? definition.maxDurability;
    this.metadata = { ...definition.metadata, ...metadata };
  }

  get id(): string {
    return this.definition.id;
  }

  get stackable(): boolean {
    return this.definition.maxStack > 1;
  }

  get weight(): number {
    return this.definition.weight * this.count;
  }

  get destroyed(): boolean {
    return this.definition.maxDurability > 0 && this.durability <= 0;
  }

  sameKind(other: Item): boolean {
    return this.definition.id === other.definition.id && this.durability === other.durability;
  }

  split(count: number): Item {
    const taken = Math.min(Math.max(0, Math.floor(count)), this.count);
    this.count -= taken;
    return new Item(this.definition, taken, this.durability, { ...this.metadata });
  }

  damage(amount: number): boolean {
    if (this.definition.maxDurability <= 0) return false;
    this.durability = Math.max(0, this.durability - Math.max(0, amount));
    return this.destroyed;
  }

  repair(amount: number): void {
    if (this.definition.maxDurability <= 0) return;
    this.durability = Math.min(this.definition.maxDurability, this.durability + Math.max(0, amount));
  }
}

export class ItemRegistry {
  private readonly definitions = new Map<string, ItemDefinition>();

  define(input: ItemDefinitionInput): ItemDefinition {
    if (this.definitions.has(input.id)) throw new RangeError(`duplicate item ${input.id}`);
    const definition: ItemDefinition = {
      id: input.id,
      name: input.name,
      maxStack: input.maxStack ?? 1,
      weight: input.weight ?? 0,
      maxDurability: input.maxDurability ?? 0,
      tags: [...(input.tags ?? [])],
      metadata: { ...(input.metadata ?? {}) },
      equipmentSlot: input.equipmentSlot,
    };
    this.definitions.set(definition.id, definition);
    return definition;
  }

  get(id: string): ItemDefinition | undefined {
    return this.definitions.get(id);
  }

  has(id: string): boolean {
    return this.definitions.has(id);
  }

  create(id: string, count = 1, metadata?: ItemMetadata): Item {
    const definition = this.definitions.get(id);
    if (!definition) throw new RangeError(`unknown item ${id}`);
    return new Item(definition, count, undefined, metadata ?? {});
  }

  get size(): number {
    return this.definitions.size;
  }
}

export interface InventoryOptions {
  slots: number;
  maxWeight?: number;
}

export interface SlotEntry {
  index: number;
  item: Item;
}

export type InventoryHook = (item: Item, count: number, inventory: Inventory) => boolean;

export class Inventory {
  readonly slots: Array<Item | undefined>;
  maxWeight: number;
  onAdd: InventoryHook | null = null;
  onRemove: InventoryHook | null = null;

  constructor(options: InventoryOptions) {
    if (options.slots <= 0) throw new RangeError("inventory needs slots");
    this.slots = new Array<Item | undefined>(options.slots).fill(undefined);
    this.maxWeight = options.maxWeight ?? Infinity;
  }

  get capacity(): number {
    return this.slots.length;
  }

  get usedSlots(): number {
    return this.slots.reduce((total, slot) => total + (slot ? 1 : 0), 0);
  }

  get isFull(): boolean {
    return this.usedSlots >= this.capacity;
  }

  get weight(): number {
    return this.slots.reduce((total, slot) => total + (slot?.weight ?? 0), 0);
  }

  itemAt(index: number): Item | undefined {
    return this.slots[index];
  }

  add(item: Item): number {
    if (item.count <= 0) return 0;
    if (this.onAdd && !this.onAdd(item, item.count, this)) return item.count;
    let remaining = item.count;
    if (item.stackable) {
      for (const slot of this.slots) {
        if (remaining <= 0) break;
        if (!slot || !slot.sameKind(item) || slot.count >= item.definition.maxStack) continue;
        const moved = Math.min(remaining, item.definition.maxStack - slot.count);
        const nextWeight = this.weight - slot.weight + (slot.count + moved) * item.definition.weight;
        if (nextWeight > this.maxWeight) break;
        slot.count += moved;
        remaining -= moved;
      }
    }
    while (remaining > 0 && !this.isFull) {
      const moved = Math.min(remaining, item.stackable ? item.definition.maxStack : 1);
      const nextWeight = this.weight + moved * item.definition.weight;
      if (nextWeight > this.maxWeight) break;
      const index = this.slots.indexOf(undefined);
      this.slots[index] = item.split(moved);
      remaining -= moved;
    }
    item.count = remaining;
    return remaining;
  }

  remove(index: number, count = Infinity): Item | undefined {
    const item = this.slots[index];
    if (!item) return undefined;
    const taken = Math.min(count, item.count);
    if (this.onRemove && !this.onRemove(item, taken, this)) return undefined;
    const removed = item.split(taken);
    if (item.count <= 0) this.slots[index] = undefined;
    return removed;
  }

  removeById(id: string, count = 1): number {
    let remaining = count;
    for (let index = 0; index < this.slots.length && remaining > 0; index += 1) {
      const item = this.slots[index];
      if (!item || item.id !== id) continue;
      const taken = Math.min(remaining, item.count);
      const removed = this.remove(index, taken);
      remaining -= removed?.count ?? 0;
    }
    return count - remaining;
  }

  find(id: string): SlotEntry | null {
    for (let index = 0; index < this.slots.length; index += 1) {
      const item = this.slots[index];
      if (item && item.id === id) return { index, item };
    }
    return null;
  }

  findAll(id: string): SlotEntry[] {
    const found: SlotEntry[] = [];
    for (let index = 0; index < this.slots.length; index += 1) {
      const item = this.slots[index];
      if (item && item.id === id) found.push({ index, item });
    }
    return found;
  }

  count(id: string): number {
    return this.findAll(id).reduce((total, entry) => total + entry.item.count, 0);
  }

  hasTag(tag: string): boolean {
    return this.slots.some((slot) => slot?.definition.tags.includes(tag));
  }

  swap(a: number, b: number): void {
    const first = this.slots[a];
    const second = this.slots[b];
    this.slots[a] = second;
    this.slots[b] = first;
  }

  transferTo(other: Inventory, index: number, count = Infinity): number {
    const item = this.slots[index];
    if (!item) return 0;
    const taken = Math.min(count, item.count);
    const moved = item.split(taken);
    const leftover = other.add(moved);
    item.count += leftover;
    if (item.count <= 0) this.slots[index] = undefined;
    return taken - leftover;
  }
}

export class Container {
  readonly inventory: Inventory;
  private opened = false;

  constructor(options: InventoryOptions) {
    this.inventory = new Inventory(options);
  }

  get isOpen(): boolean {
    return this.opened;
  }

  open(): void {
    this.opened = true;
  }

  close(): void {
    this.opened = false;
  }
}

export interface EquipmentOptions {
  slots: readonly string[];
}

export class Equipment {
  private readonly equipped = new Map<string, Item>();

  constructor(readonly options: EquipmentOptions) {}

  get slots(): readonly string[] {
    return this.options.slots;
  }

  equip(item: Item, slot: string): Item | null {
    if (!this.options.slots.includes(slot)) throw new RangeError(`unknown slot ${slot}`);
    if (item.definition.equipmentSlot !== slot) throw new RangeError(`item ${item.id} does not fit ${slot}`);
    const previous = this.equipped.get(slot) ?? null;
    this.equipped.set(slot, item);
    return previous;
  }

  unequip(slot: string): Item | null {
    const item = this.equipped.get(slot) ?? null;
    this.equipped.delete(slot);
    return item;
  }

  get(slot: string): Item | null {
    return this.equipped.get(slot) ?? null;
  }

  get weight(): number {
    let total = 0;
    for (const item of this.equipped.values()) total += item.weight;
    return total;
  }

  hasTag(tag: string): boolean {
    for (const item of this.equipped.values()) {
      if (item.definition.tags.includes(tag)) return true;
    }
    return false;
  }

  totalDurability(): number {
    let total = 0;
    for (const item of this.equipped.values()) total += item.durability;
    return total;
  }
}
