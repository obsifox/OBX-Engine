import { Reader, Writer } from "@obx/networking";

export type AuthorityMode = "server" | "owner" | "shared";

export interface ReplicatedComponent {
  name: string;
  fields: Record<string, number | string | boolean>;
}

export interface NetworkEntity {
  netId: number;
  prefab: string;
  owner: string;
  components: Map<string, ReplicatedComponent>;
  authority: AuthorityMode;
  destroyed: boolean;
}

export interface SpawnRecord {
  netId: number;
  prefab: string;
  owner: string;
}

export interface ComponentDelta {
  netId: number;
  component: string;
  fields: Record<string, number | string | boolean>;
}

export class EntityRegistry {
  #entities = new Map<number, NetworkEntity>();
  #nextId = 1;
  #dirty = new Map<number, Set<string>>();
  #spawns: SpawnRecord[] = [];
  #despawns: number[] = [];

  get size(): number {
    return this.#entities.size;
  }

  spawn(prefab: string, owner: string, authority: AuthorityMode = "server"): NetworkEntity {
    const netId = this.#nextId;
    this.#nextId += 1;
    const entity: NetworkEntity = { netId, prefab, owner, components: new Map(), authority, destroyed: false };
    this.#entities.set(netId, entity);
    this.#spawns.push({ netId, prefab, owner });
    return entity;
  }

  destroy(netId: number): boolean {
    const entity = this.#entities.get(netId);
    if (!entity) return false;
    entity.destroyed = true;
    this.#entities.delete(netId);
    this.#dirty.delete(netId);
    this.#despawns.push(netId);
    return true;
  }

  get(netId: number): NetworkEntity | undefined {
    return this.#entities.get(netId);
  }

  setComponent(netId: number, component: string, fields: Record<string, number | string | boolean>): void {
    const entity = this.#entities.get(netId);
    if (!entity) throw new Error(`unknown entity ${netId}`);
    entity.components.set(component, { name: component, fields: { ...fields } });
    const entry = this.#dirty.get(netId) ?? new Set<string>();
    entry.add(component);
    this.#dirty.set(netId, entry);
  }

  patchFields(netId: number, component: string, patch: Record<string, number | string | boolean>): void {
    const entity = this.#entities.get(netId);
    if (!entity) throw new Error(`unknown entity ${netId}`);
    const existing = entity.components.get(component) ?? { name: component, fields: {} };
    Object.assign(existing.fields, patch);
    entity.components.set(component, existing);
    const entry = this.#dirty.get(netId) ?? new Set<string>();
    entry.add(component);
    this.#dirty.set(netId, entry);
  }

  drainSpawns(): SpawnRecord[] {
    const records = this.#spawns;
    this.#spawns = [];
    return records;
  }

  drainDespawns(): number[] {
    const records = this.#despawns;
    this.#despawns = [];
    return records;
  }

  drainDeltas(): ComponentDelta[] {
    const deltas: ComponentDelta[] = [];
    for (const [netId, components] of this.#dirty) {
      const entity = this.#entities.get(netId);
      if (!entity) continue;
      for (const name of components) {
        const component = entity.components.get(name);
        if (component) deltas.push({ netId, component: name, fields: { ...component.fields } });
      }
    }
    this.#dirty.clear();
    return deltas;
  }

  fullState(): ComponentDelta[] {
    const all: ComponentDelta[] = [];
    for (const entity of this.#entities.values()) {
      for (const component of entity.components.values()) {
        all.push({ netId: entity.netId, component: component.name, fields: { ...component.fields } });
      }
    }
    return all;
  }
}

export function encodeComponentDeltas(deltas: readonly ComponentDelta[]): Uint8Array {
  const writer = new Writer().varint(deltas.length);
  for (const delta of deltas) {
    writer.varint(delta.netId).string(delta.component).varint(Object.keys(delta.fields).length);
    for (const [key, value] of Object.entries(delta.fields)) {
      writer.string(key);
      if (typeof value === "number") {
        writer.u8(1).f64(value);
      } else if (typeof value === "boolean") {
        writer.u8(2).bool(value);
      } else {
        writer.u8(3).string(value);
      }
    }
  }
  return writer.finish();
}

export function decodeComponentDeltas(bytes: Uint8Array): ComponentDelta[] {
  const reader = new Reader(bytes);
  const count = reader.varint();
  const deltas: ComponentDelta[] = [];
  for (let i = 0; i < count; i += 1) {
    const netId = reader.varint();
    const component = reader.string();
    const fieldCount = reader.varint();
    const fields: Record<string, number | string | boolean> = {};
    for (let f = 0; f < fieldCount; f += 1) {
      const key = reader.string();
      const kind = reader.u8();
      if (kind === 1) fields[key] = reader.f64();
      else if (kind === 2) fields[key] = reader.bool();
      else fields[key] = reader.string();
    }
    deltas.push({ netId, component, fields });
  }
  return deltas;
}

export class OwnershipTracker {
  #owners = new Map<number, string>();

  assign(netId: number, subject: string): void {
    this.#owners.set(netId, subject);
  }

  release(netId: number): void {
    this.#owners.delete(netId);
  }

  ownerOf(netId: number): string | null {
    return this.#owners.get(netId) ?? null;
  }

  ownedBy(subject: string): number[] {
    const ids: number[] = [];
    for (const [netId, owner] of this.#owners) if (owner === subject) ids.push(netId);
    return ids;
  }

  transfer(netId: number, from: string, to: string): boolean {
    if (this.#owners.get(netId) !== from) return false;
    this.#owners.set(netId, to);
    return true;
  }
}
