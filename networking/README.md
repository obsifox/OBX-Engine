# @obx/networking

Networking stack for OBX Engine — protocol profiles, simulated transports with
latency/jitter/loss, reliable channels, RPC, entity replication, client prediction,
interpolation, lag compensation, interest management and the client/server architecture.

```ts
import { MemoryNetwork, GameServer, GameClient, RpcSystem, ReliableChannel } from "@obx/networking";

const network = new MemoryNetwork();
const [clientWire, serverWire] = network.createPair({ latencyTicks: 2, dropRate: 0.05, seed: 7 });
const server = new GameServer({ reducer: (state, input) => ({ ...state, x: state.x + (input.fields.dx ?? 0) }) });
server.replication.track("hero", { x: 0 });
server.addClient("hero", serverWire);
```

See `docs/releases/v0.95.md` for the full API tour. License: MIT.
