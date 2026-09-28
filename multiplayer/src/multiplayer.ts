export interface LobbyPlayer {
  id: string;
  name: string;
  skill: number;
  ready: boolean;
}

export interface ChatEntry {
  playerId: string;
  message: string;
  order: number;
}

export class Lobby {
  private readonly players = new Map<string, LobbyPlayer>();
  private readonly chat: ChatEntry[] = [];
  private chatOrder = 0;

  join(player: LobbyPlayer): void {
    if (this.players.has(player.id)) throw new RangeError(`player ${player.id} already in lobby`);
    this.players.set(player.id, { ...player, ready: false });
  }

  leave(id: string): boolean {
    return this.players.delete(id);
  }

  ready(id: string, value = true): void {
    const player = this.players.get(id);
    if (!player) throw new RangeError(`unknown player ${id}`);
    player.ready = value;
  }

  say(playerId: string, message: string): ChatEntry {
    if (!this.players.has(playerId)) throw new RangeError(`unknown player ${playerId}`);
    this.chatOrder += 1;
    const entry: ChatEntry = { playerId, message, order: this.chatOrder };
    this.chat.push(entry);
    return entry;
  }

  allReady(): boolean {
    return this.players.size > 0 && [...this.players.values()].every((player) => player.ready);
  }

  get members(): LobbyPlayer[] {
    return [...this.players.values()].map((player) => ({ ...player }));
  }

  get messages(): ChatEntry[] {
    return [...this.chat];
  }
}

export interface RoomOptions {
  name?: string;
  private?: boolean;
  capacity?: number;
}

export interface Room {
  id: string;
  name: string;
  private: boolean;
  capacity: number;
  host: string;
  players: string[];
}

export class RoomManager {
  private readonly rooms = new Map<string, Room>();
  private counter = 0;

  constructor(readonly options: { maxRooms?: number; defaultCapacity?: number } = {}) {}

  create(hostId: string, options: RoomOptions = {}): Room {
    if (this.rooms.size >= (this.options.maxRooms ?? 16)) throw new RangeError("room limit reached");
    this.counter += 1;
    const room: Room = {
      id: `room_${this.counter}`,
      name: options.name ?? `Room ${this.counter}`,
      private: options.private ?? false,
      capacity: options.capacity ?? this.options.defaultCapacity ?? 8,
      host: hostId,
      players: [hostId],
    };
    this.rooms.set(room.id, room);
    return room;
  }

  join(roomId: string, playerId: string): Room {
    const room = this.rooms.get(roomId);
    if (!room) throw new RangeError(`unknown room ${roomId}`);
    if (room.players.includes(playerId)) return room;
    if (room.players.length >= room.capacity) throw new RangeError(`room ${roomId} is full`);
    room.players.push(playerId);
    return room;
  }

  leave(roomId: string, playerId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    const index = room.players.indexOf(playerId);
    if (index < 0) return false;
    room.players.splice(index, 1);
    if (room.players.length === 0) this.rooms.delete(roomId);
    else if (room.host === playerId) room.host = room.players[0]!;
    return true;
  }

  get(roomId: string): Room | null {
    const room = this.rooms.get(roomId);
    return room ? { ...room, players: [...room.players] } : null;
  }

  list(includePrivate = false): Room[] {
    return [...this.rooms.values()]
      .filter((room) => includePrivate || !room.private)
      .map((room) => ({ ...room, players: [...room.players] }));
  }

  close(roomId: string): boolean {
    return this.rooms.delete(roomId);
  }

  get count(): number {
    return this.rooms.size;
  }
}

export interface MatchTicket {
  id: string;
  skill: number;
}

export interface Match {
  id: string;
  players: string[];
  averageSkill: number;
}

export class Matchmaking {
  private readonly queue: MatchTicket[] = [];
  private counter = 0;

  constructor(readonly options: { matchSize?: number; skillRange?: number } = {}) {}

  enqueue(ticket: MatchTicket): void {
    if (this.queue.some((entry) => entry.id === ticket.id)) throw new RangeError(`ticket ${ticket.id} already queued`);
    this.queue.push({ ...ticket });
    this.queue.sort((a, b) => a.skill - b.skill);
  }

  cancel(id: string): boolean {
    const index = this.queue.findIndex((ticket) => ticket.id === id);
    if (index < 0) return false;
    this.queue.splice(index, 1);
    return true;
  }

  tick(): Match[] {
    const matchSize = this.options.matchSize ?? 2;
    const skillRange = this.options.skillRange ?? 100;
    const matches: Match[] = [];
    let index = 0;
    while (index + matchSize <= this.queue.length) {
      const group = this.queue.slice(index, index + matchSize);
      const spread = group[group.length - 1]!.skill - group[0]!.skill;
      if (spread > skillRange) {
        index += 1;
        continue;
      }
      this.counter += 1;
      matches.push({
        id: `match_${this.counter}`,
        players: group.map((ticket) => ticket.id),
        averageSkill: Number((group.reduce((total, ticket) => total + ticket.skill, 0) / group.length).toFixed(2)),
      });
      for (const ticket of group) this.cancel(ticket.id);
    }
    return matches;
  }

  get queued(): string[] {
    return this.queue.map((ticket) => ticket.id);
  }
}

export interface AuditEvent {
  playerId: string;
  type: string;
  data: Record<string, number | string | boolean>;
}

export interface AuditResult {
  ok: boolean;
  violations: string[];
}

export class AntiCheatHooks {
  private readonly validators = new Map<string, (event: AuditEvent) => boolean>();
  private readonly log = new Map<string, string[]>();

  register(name: string, validator: (event: AuditEvent) => boolean): void {
    this.validators.set(name, validator);
  }

  audit(event: AuditEvent): AuditResult {
    const violations: string[] = [];
    for (const [name, validator] of this.validators) {
      let passed = false;
      try {
        passed = validator(event);
      } catch {
        passed = false;
      }
      if (!passed) {
        violations.push(name);
        const list = this.log.get(event.playerId) ?? [];
        list.push(name);
        this.log.set(event.playerId, list);
      }
    }
    return { ok: violations.length === 0, violations };
  }

  violationsFor(playerId: string): string[] {
    return [...(this.log.get(playerId) ?? [])];
  }

  reset(playerId: string): void {
    this.log.delete(playerId);
  }

  get hooks(): string[] {
    return [...this.validators.keys()];
  }
}

export const MULTIPLAYER_VERSION = "0.96.0";
