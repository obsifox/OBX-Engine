# @obx/server

Headless server runtime for OBX Engine — validated server config, leveled logging with
sinks, metrics, plugin and script hosts with error isolation, and the dedicated server
fusing them with `@obx/networking`.

```ts
import { DedicatedServer, createServerConfig } from "@obx/server";

const server = new DedicatedServer(createServerConfig({ name: "arena", tickRate: 20 }));
server.plugins.register({ id: "motd", onMessage: () => "welcome" });
server.start();
server.step(10);
server.status();
```

See `docs/releases/v0.95.md` for the full API tour. License: MIT.
