import { Vec3 } from "@obx/math";
import {
  CharacterController,
  type CharacterControllerOptions,
  type CharacterInput,
  type LocomotionState,
  type PhysicsWorld,
} from "@obx/physics";

export class Health {
  current: number;
  readonly onDamage: Array<(amount: number, remaining: number) => void> = [];
  readonly onDeath: Array<() => void> = [];

  constructor(
    readonly max = 100,
    current?: number,
  ) {
    this.current = current ?? max;
  }

  damage(amount: number): number {
    if (amount <= 0 || this.current <= 0) return 0;
    const applied = Math.min(amount, this.current);
    this.current -= applied;
    for (const listener of this.onDamage) listener(applied, this.current);
    if (this.current <= 0) {
      for (const listener of this.onDeath) listener();
    }
    return applied;
  }

  heal(amount: number): number {
    if (amount <= 0) return 0;
    const applied = Math.min(amount, this.max - this.current);
    this.current += applied;
    return applied;
  }

  get ratio(): number {
    return this.current / this.max;
  }

  get isDead(): boolean {
    return this.current <= 0;
  }
}

export class Stamina {
  current: number;
  exhausted = false;

  constructor(
    readonly max = 100,
    readonly drainPerSecond = 15,
    readonly regenPerSecond = 10,
    current?: number,
  ) {
    this.current = current ?? max;
  }

  update(dt: number, draining: boolean): void {
    if (draining && !this.exhausted) {
      this.current = Math.max(0, this.current - this.drainPerSecond * dt);
      if (this.current <= 0) this.exhausted = true;
    } else {
      this.current = Math.min(this.max, this.current + this.regenPerSecond * dt);
      if (this.exhausted && this.current >= this.max * 0.3) this.exhausted = false;
    }
  }

  trySpend(amount: number): boolean {
    if (this.exhausted || this.current < amount) return false;
    this.current -= amount;
    return true;
  }
}

export interface StatModifiers {
  moveSpeedMultiplier: number;
  damageMultiplier: number;
  armor: number;
}

export interface EquipmentItem {
  id: string;
  slot: string;
  modifiers?: Partial<StatModifiers>;
}

export class Equipment {
  private readonly slots = new Map<string, EquipmentItem>();

  equip(item: EquipmentItem): EquipmentItem | null {
    const previous = this.slots.get(item.slot) ?? null;
    this.slots.set(item.slot, item);
    return previous;
  }

  unequip(slot: string): EquipmentItem | null {
    const item = this.slots.get(slot) ?? null;
    if (item) this.slots.delete(slot);
    return item;
  }

  get(slot: string): EquipmentItem | null {
    return this.slots.get(slot) ?? null;
  }

  modifiers(): StatModifiers {
    const result: StatModifiers = { moveSpeedMultiplier: 1, damageMultiplier: 1, armor: 0 };
    for (const item of this.slots.values()) {
      const mod = item.modifiers ?? {};
      result.moveSpeedMultiplier *= mod.moveSpeedMultiplier ?? 1;
      result.damageMultiplier *= mod.damageMultiplier ?? 1;
      result.armor += mod.armor ?? 0;
    }
    return result;
  }
}

export interface Interactable {
  id: string;
  position: Vec3;
  radius: number;
  onInteract: (id: string) => void;
}

export class InteractionSystem {
  private readonly entries = new Map<string, Interactable>();

  register(entry: Interactable): void {
    this.entries.set(entry.id, entry);
  }

  unregister(id: string): void {
    this.entries.delete(id);
  }

  query(position: Vec3, range = 1.5): Interactable[] {
    const found: Interactable[] = [];
    for (const entry of this.entries.values()) {
      if (entry.position.distanceTo(position) <= entry.radius + range) found.push(entry);
    }
    found.sort((a, b) => a.position.distanceTo(position) - b.position.distanceTo(position));
    return found;
  }

  interact(id: string): boolean {
    const entry = this.entries.get(id);
    if (!entry) return false;
    entry.onInteract(id);
    return true;
  }

  interactNearest(position: Vec3, range = 1.5): string | null {
    const nearest = this.query(position, range)[0];
    if (!nearest) return null;
    nearest.onInteract(nearest.id);
    return nearest.id;
  }
}

export interface CharacterOptions extends CharacterControllerOptions {
  maxHealth?: number;
  maxStamina?: number;
}

export class Character {
  readonly controller: CharacterController;
  readonly health: Health;
  readonly stamina: Stamina;
  readonly equipment = new Equipment();
  readonly interaction = new InteractionSystem();
  moveIntent: Vec3 = new Vec3(0, 0, 0);

  constructor(world: PhysicsWorld, options: CharacterOptions = {}) {
    this.controller = new CharacterController(world, options);
    this.health = new Health(options.maxHealth ?? 100);
    this.stamina = new Stamina(options.maxStamina ?? 100);
  }

  get position(): Vec3 {
    return this.controller.body.position;
  }

  get state(): LocomotionState {
    return this.controller.state;
  }

  takeDamage(amount: number): number {
    const armor = this.equipment.modifiers().armor;
    return this.health.damage(Math.max(0, amount - armor));
  }

  update(dt: number, input: CharacterInput, world: PhysicsWorld): void {
    const modifiers = this.equipment.modifiers();
    const running = input.run && input.move.lengthSq() > 0 && !this.stamina.exhausted;
    this.stamina.update(dt, running);
    const scaled: CharacterInput = {
      ...input,
      run: running && input.run,
      move: input.move.clone(),
    };
    const previousWalk = this.controller.walkSpeed;
    const previousRun = this.controller.runSpeed;
    this.controller.walkSpeed = previousWalk * modifiers.moveSpeedMultiplier;
    this.controller.runSpeed = previousRun * modifiers.moveSpeedMultiplier;
    this.controller.update(dt, scaled, world);
    this.controller.walkSpeed = previousWalk;
    this.controller.runSpeed = previousRun;
    this.moveIntent.copy(input.move);
  }
}
