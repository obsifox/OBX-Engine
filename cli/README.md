# @obx/cli

The `obsifox` command line — project generation, development server, build, export,
run, test, clean, diagnostics, assets, packaging, plugins and configuration over an
injectable in-memory host.

```ts
import { runCli, createCliHost } from "@obx/cli";

const host = createCliHost();
runCli(["create", "MyGame"], host);
runCli(["doctor"], host);
runCli(["export", "web"], host);
```

See `docs/releases/v0.95.md` for the full API tour. License: MIT.
