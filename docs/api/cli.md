# CLI Documentation

`@obx/cli` — the `obsifox` command line over an injectable `CliHost`.

## Commands

`create <name>`, `dev`, `editor`, `build [target]`, `export <windows|linux|android|web|
server>`, `run`, `test`, `clean`, `doctor`, `assets <list|check>`, `package`,
`plugin <list|check>`, `config <get|set|list>`, `help`, `version`.

## Parsing

`parseArgs(argv)` yields `{ command, positionals, flags }` supporting `--flag`,
`--key=value`, `--key value` and short `-x` flags.

## Programmatic use

```ts
import { runCli, createCliHost } from "@obx/cli";
const result = runCli(["export", "web"], createCliHost());
// result.code: 0 ok, 1 failure, 2 usage error
```
