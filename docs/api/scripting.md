# Scripting API

`@obx/obsiscript` + `@obx/scripting` — the ObsiScript language and script hosts.

## ObsiScript

`tokenize` -> `parse` -> `typeCheck` -> `Interpreter.run`. Closures, classes, modules
(`ModuleLoader`, `runModule`), `Scheduler` for `spawn`, breakpoint hooks.

## Hosts

`JavaScriptEngine` (allowlisted bindings injected as identifiers), `ObsiScriptEngine`
(persistent `state` bag with index access), `ScriptHost` managing lifecycle
(init/update/dispose), hot reload preserving state and dependency-ordered loading.
`generateDts` emits TypeScript definitions; `validateApi` checks bindings.

## Sandboxing

`Sandbox.scan` + `assert` reject disallowed globals (`SandboxViolation`).
