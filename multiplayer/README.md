# @obx/multiplayer

Multiplayer framework for OBX Engine — lobby with ready-state and chat, rooms with
capacity and host hand-off, skill-based matchmaking and anti-cheat audit hooks.

```ts
import { Lobby, RoomManager, Matchmaking, AntiCheatHooks } from "@obx/multiplayer";

const lobby = new Lobby();
lobby.join({ id: "ada", name: "Ada", skill: 1240, ready: false });
lobby.ready("ada");
const rooms = new RoomManager({ defaultCapacity: 4 });
rooms.create("ada", { name: "Dust2" });
```

See `docs/releases/v0.96.md` for the full API tour. License: MIT.
