# API Stability — v1.0

From v1.0.0 onward OBX Engine follows semantic versioning:

- **PATCH** — bug fixes, performance work, docs. No API changes.
- **MINOR** — additive APIs (new exports, optional parameters). Existing code keeps
  compiling and running.
- **MAJOR** — breaking changes only, with migration notes in `docs/releases/`.

## Stable surface (1.x)

These entry points are frozen for the 1.x line:

| Area | Package | Key exports |
|---|---|---|
| Core | `@obx/core` | Clock, EventBus, Logger, Random, EngineError |
| Math | `@obx/math` | Vec2, Vec3, Vec4, Mat3, Mat4, Quat, Color |
| ECS | `@obx/ecs` | World, defineComponent, defineSystem, query |
| Engine | `@obx/engine` | Application, GameLoop, ENGINE_VERSION |
| Rendering | `@obx/rendering` | Renderer2D, Renderer3D, SoftwareBackend, encodePng |
| Scene | `@obx/scene` | Scene, Node2D, Node3D, MeshRenderer |
| Physics | `@obx/physics` | PhysicsWorld, Body, shapes, casts |
| Audio | `@obx/audio` | AudioMixer, AudioVoice, Audio2D, Audio3D |
| UI | `@obx/ui` | UiNode tree, widgets, Theme |
| Save | `@obx/save` | SaveSystem, MemoryStorage, fnv1a |
| World/AI | `@obx/world`, `@obx/ai`, `@obx/navigation` | Heightfield, WorldSimulation, Brains, AStar |
| Scripting | `@obx/obsiscript`, `@obx/scripting`, `@obx/native` | tokenize/parse/run, ScriptHost, NativeAbi |
| Studio | `@obx/editor`, `@obx/project`, `@obx/extensions` | EditorSession, Project, ExtensionRegistry |
| Net | `@obx/networking`, `@obx/server`, `@obx/multiplayer` | GameServer/Client, DedicatedServer, Lobby |
| Build | `@obx/cli`, `@obx/build` | runCli, BuildPipeline, exportTargets |
| Platform | `@obx/plugins`, `@obx/registry` | PluginLoader, Registry, PackageManager |

Experimental (may change in MINOR releases): specialized editor panels, GPU backend
placeholders, bytecode compiler interfaces.
