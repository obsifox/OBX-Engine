import { Signal } from "@obx/core";
import { type AssetWatcherEvent } from "../database/types.js";
import { type AssetGUID } from "../guid.js";

export class AssetWatcher {
  readonly onChange = new Signal<[AssetWatcherEvent]>();
  readonly #hashes = new Map<string, string>();
  #detected = 0;

  watch(path: string, sourceHash: string): void {
    this.#hashes.set(path, sourceHash);
  }

  unwatch(path: string): void {
    this.#hashes.delete(path);
  }

  notifyChange(path: string, sourceHash: string, guid: AssetGUID | null): AssetWatcherEvent {
    this.#hashes.set(path, sourceHash);
    this.#detected += 1;
    const event: AssetWatcherEvent = { path, guid, sourceHash };
    this.onChange.emit(event);
    return event;
  }

  scan(entries: Iterable<{ path: string; sourceHash: string; guid: AssetGUID | null }>): AssetWatcherEvent[] {
    const events: AssetWatcherEvent[] = [];
    for (const entry of entries) {
      const known = this.#hashes.get(entry.path);
      if (known !== undefined && known !== entry.sourceHash) {
        events.push(this.notifyChange(entry.path, entry.sourceHash, entry.guid));
      } else {
        this.#hashes.set(entry.path, entry.sourceHash);
      }
    }
    return events;
  }

  get detected(): number {
    return this.#detected;
  }

  get watched(): number {
    return this.#hashes.size;
  }
}

