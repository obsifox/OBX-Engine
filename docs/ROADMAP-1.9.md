# OBX Engine — Roadmap from v1.0.0 to v1.9.0

## Purpose

This roadmap defines the planned continuation of OBX Engine after the v1.0.0 baseline.

The objective is to transform the existing engine foundations into a production-capable, cross-platform game engine and development environment without unnecessarily rebuilding systems that already exist.

The roadmap is based on the v1.0.0 audit and is organized as a sequence of major engineering milestones.

---

# 1.0.0 — Foundation Baseline

## Status

v1.0.0 is the baseline release.

The existing implementation should be preserved and treated as the foundation for all future versions.

### Current baseline

- 36 packages
- 164 TypeScript files
- Approximately 20,000 lines of source code
- 513 tests
- Existing tests passing
- ECS
- 2D systems
- 3D systems
- Physics
- Animation
- Audio
- UI
- AI
- Navigation
- World systems
- Gameplay systems
- ObsiScript
- Scripting
- Native/WASM foundations
- Editor model
- Project system
- Extensions
- Networking simulation
- Server runtime
- Build system
- CLI
- Multiplayer framework
- Plugin system
- Registry

## Important Rule

Do not recreate systems that are already implemented.

Future releases should extend, integrate, optimize, test, and productionize the existing architecture.

---

# 1.1.0 — Runtime & Platform Foundation

## Objective

Transform the existing runtime foundations into a real cross-platform runtime layer.

## Platform Abstraction

Implement a unified platform API supporting:

- Windows
- Linux
- macOS
- Android
- iOS
- Web

### Required systems

```text
Platform
├── Window
├── Surface
├── Input
├── FileSystem
├── Timing
├── Threads
├── NativeEvents
├── Clipboard
├── ApplicationLifecycle
└── PlatformCapabilities
```

## Runtime Host

Implement a real native runtime host.

Required functionality:

- Application bootstrap
- Engine initialization
- Main loop
- Frame timing
- Runtime startup
- Runtime shutdown
- Error handling
- Application lifecycle
- Window creation
- Rendering surface creation
- Input initialization

The engine must no longer depend exclusively on Node.js/headless execution for runtime behavior.

## Job System

Implement production-oriented asynchronous execution:

```text
JobSystem
├── WorkerPool
├── ThreadPool
├── TaskGraph
├── JobHandle
├── JobFence
├── WorkStealing
└── Synchronization
```

Required capabilities:

- Parallel jobs
- Worker threads
- Job dependencies
- Synchronization
- Cancellation where appropriate
- Main-thread synchronization
- Deterministic testing

## Virtual File System

Implement:

```text
VFS
├── PhysicalFileSystem
├── MemoryFileSystem
├── PackageFileSystem
├── VirtualPath
└── MountSystem
```

The engine should be able to access resources through virtual paths instead of depending directly on operating-system paths.

## Resource Management

Implement:

```text
Resource
ResourceHandle
ResourceLoader
ResourceCache
ResourceLifetime
ResourceManager
```

Required features:

- Resource loading
- Resource caching
- Reference management
- Lifetime management
- Async loading
- Unloading
- Dependency tracking

## 1.1 Completion Criteria

- Real application runtime exists
- Platform layer is usable
- Native runtime host exists
- Job system is functional
- VFS is functional
- Resource manager is functional
- Existing systems can run through the new runtime layer
- Automated tests cover platform-independent behavior

---

# 1.2.0 — GPU Rendering Foundation

## Objective

Replace the current predominantly software/CPU rendering architecture with a real GPU rendering abstraction while preserving the software renderer.

## Renderer Architecture

Implement:

```text
GraphicsDevice
├── GraphicsAdapter
├── Surface
├── Buffer
├── Texture
├── Sampler
├── Pipeline
├── Shader
├── CommandList
├── Fence
└── RenderTarget
```

## Backend Strategy

Recommended architecture:

```text
Graphics API
├── WebGPU
├── WebGL2
└── Software
```

The Software renderer should remain available for:

- CI
- Headless execution
- Deterministic tests
- Compatibility
- Debugging

## Shader System

Implement:

```text
ShaderSource
ShaderCompiler
ShaderVariant
ShaderCache
ShaderReflection
ShaderPipeline
```

Required functionality:

- Shader compilation
- Shader variants
- Shader caching
- Reflection
- Uniform discovery
- Resource binding
- Compilation errors
- Runtime shader management

## GPU 2D

Implement:

- GPU sprite rendering
- Texture batching
- Sprite atlas
- Instancing
- GPU animation
- GPU particles
- Render sorting
- Layering
- Texture regions

## GPU 3D

Implement:

- Vertex buffers
- Index buffers
- Uniform buffers
- Textures
- Materials
- Depth testing
- Face culling
- Instancing
- Camera rendering
- Mesh rendering

## 1.2 Completion Criteria

- GPU backend is functional
- 2D rendering works on GPU
- 3D rendering works on GPU
- Software renderer remains functional
- Rendering API is backend-independent
- Shader compilation and caching work
- GPU resources have proper lifetime management

---

# 1.3.0 — Asset & Scene Pipeline

## Objective

Convert the existing asset records/index architecture into a complete production asset pipeline.

## Asset Database

Implement:

```text
AssetDatabase
├── AssetGUID
├── AssetRecord
├── AssetImporter
├── AssetDependency
├── AssetCache
├── AssetWatcher
└── AssetMetadata
```

## Import Pipeline

The target pipeline should be:

```text
Source Asset
      ↓
Importer
      ↓
Intermediate Data
      ↓
Processed Asset
      ↓
Runtime Resource
```

## Importers

Target support:

- PNG
- JPG/JPEG
- WEBP
- BMP
- SVG
- WAV
- OGG
- MP3
- GLTF
- GLB
- OBJ
- FBX where dependencies/tooling permit
- TTF
- OTF
- JSON
- TXT

## Asset Dependencies

Implement:

- Dependency graph
- Dependency invalidation
- Dependency tracking
- Circular dependency detection
- Asset GUIDs
- Import metadata
- Cache invalidation

## Scene Files

Introduce production scene formats such as:

```text
.scene
.prefab
.material
.animation
.shader
.asset
```

## Scene Serialization

Required:

- Entity serialization
- Component serialization
- Resource references
- GUID references
- Scene loading
- Scene saving
- Scene validation
- Versioning
- Migration support

## Prefab System

Implement:

- Prefab creation
- Prefab instantiation
- Prefab overrides
- Nested prefabs
- Prefab dependencies
- Prefab serialization
- Prefab validation

## Hot Reload

Support hot reload for:

- Textures
- Materials
- Shaders
- Scenes
- Scripts
- Audio
- Other reloadable resources

## 1.3 Completion Criteria

- Assets can be imported automatically
- Imported assets are cached
- Dependencies are tracked
- Scenes can be saved and loaded
- Prefabs work
- Hot reload works
- Asset changes are detected automatically

---

# 1.4.0 — ObsiFox Studio

## Objective

Transform the existing editor model into a real visual development environment.

## Editor Shell

Implement:

```text
ObsiFox Studio
├── Project Manager
├── Scene View
├── Hierarchy
├── Inspector
├── Asset Browser
├── Console
├── Toolbar
├── Status Bar
└── Docking System
```

## Scene Editor

Required functionality:

- Create entities
- Delete entities
- Rename entities
- Reparent entities
- Duplicate entities
- Multi-select
- Transform tools
- Move
- Rotate
- Scale
- Local/world coordinates
- Grid snapping
- Vertex/point snapping where applicable
- Gizmos
- Camera controls
- Scene navigation

## Inspector

Implement:

- Property editing
- Resource assignment
- Arrays
- Enums
- References
- Component editing
- Default values
- Validation
- Reset-to-default
- Multi-object editing where practical

## Asset Browser

Implement:

- Folder navigation
- Search
- Filtering
- Sorting
- Preview
- Import
- Reimport
- Drag and drop
- Asset metadata
- Asset context menus

## Editor Infrastructure

Implement:

```text
CommandSystem
UndoRedo
Transactions
Shortcuts
CommandPalette
Search
Preferences
LayoutPersistence
```

## Script Editor

Implement:

- Syntax highlighting
- Tabs
- Search
- Replace
- Diagnostics
- Script execution
- Reload
- Error display

## 1.4 Completion Criteria

A developer should be able to:

1. Create a project
2. Open it in ObsiFox Studio
3. Create a scene
4. Add entities
5. Modify components
6. Import assets
7. Save the scene
8. Run the project
9. Edit scripts
10. Debug basic errors

---

# 1.5.0 — Production Graphics

## Objective

Expand the GPU renderer into a modern production-oriented graphics system.

## Lighting

Implement:

- Directional lights
- Point lights
- Spot lights
- Area lights
- Ambient lighting

## Shadows

Implement:

- Shadow maps
- Cascaded shadow maps
- PCF
- Shadow bias
- Shadow filtering
- Configurable shadow quality

## PBR

Implement:

- Albedo
- Normal maps
- Metallic
- Roughness
- Ambient occlusion
- Emission

## Environment

Implement:

- Sky
- Environment lighting
- Image-based lighting
- Reflection probes
- Environment probes

## Post Processing

Implement:

- Bloom
- Tone mapping
- Color grading
- Vignette
- FXAA
- TAA
- SSAO
- Depth of field
- Motion blur

Features should be modular and configurable.

## Rendering Optimization

Implement:

- GPU instancing
- Frustum culling
- Occlusion culling
- LOD
- HLOD
- Render sorting
- Render graph

## VFX

Implement:

```text
VFX
├── GPU Particles
├── Trails
├── GPU Effects
├── Material Graph
└── VFX Graph
```

## 1.5 Completion Criteria

- Production 3D lighting works
- Shadows work
- PBR materials work
- Environment lighting works
- Post-processing works
- GPU particles work
- Major rendering bottlenecks are measurable
- Rendering architecture supports scalable quality levels

---

# 1.6.0 — Real Networking & Multiplayer

## Objective

Upgrade the current networking simulation/framework into real networking infrastructure.

## Transport Layer

Implement:

```text
Network Transport
├── UDP
├── TCP
├── WebSocket
└── WebRTC
```

Each transport should have a consistent abstraction.

## Network Core

Implement:

```text
Socket
Connection
Packet
Channel
ReliableChannel
UnreliableChannel
Serializer
NetworkClock
```

## Multiplayer Runtime

Implement:

```text
Client
Server
DedicatedServer
Lobby
Room
Matchmaking
```

## Replication

Implement:

- Entity replication
- Component replication
- Ownership
- Authority
- RPC
- State synchronization
- Network spawning
- Network destruction

## Network Optimization

Implement:

- Delta compression
- Interpolation
- Client prediction
- Server reconciliation
- Interest management
- Snapshot systems
- Bandwidth budgeting

## Security

Implement:

- Authentication
- Session tokens
- Encryption
- Rate limiting
- Packet validation
- Input validation
- Server-side authority

## 1.6 Completion Criteria

- Real network connections work
- Dedicated server runtime works
- Client/server communication works
- Entities can replicate
- RPC works
- Prediction/reconciliation works where required
- Network traffic can be profiled
- Basic network abuse protections exist

---

# 1.7.0 — Advanced Gameplay Platform

## Objective

Expand existing gameplay foundations into production-level systems.

## Animation

Implement:

- Animation editor
- Animation events
- Blend trees
- Animation layers
- IK
- Retargeting
- Root motion
- Skeleton editor

## Physics

Expand the existing physics architecture with:

- Continuous collision detection
- Convex hulls
- Mesh colliders
- Full joint systems
- Ragdolls
- Soft bodies
- Cloth
- Destruction systems

Features should only be implemented where they fit the selected physics architecture and runtime constraints.

## Navigation

Implement:

```text
NavMesh
NavRegion
OffMeshLink
DynamicNavMesh
NavAgent
```

## AI

Expand AI tooling:

- Behavior Tree Editor
- Utility AI Editor
- Perception Editor
- AI debugger
- GOAP/planning layer where appropriate

## UI

Implement:

- Glyph renderer
- Font system
- Unicode support
- RTL support
- Localization
- Accessibility
- UI editor
- UI animation

## 1.7 Completion Criteria

- Animation can be authored in the editor
- Animation events work
- Advanced navigation works
- AI can be visually authored/debugged
- UI supports international text
- RTL layouts are supported
- Accessibility architecture exists

---

# 1.8.0 — Production Toolchain

## Objective

Build the professional development, debugging, profiling, and build infrastructure required for production projects.

## Debugger

Implement:

- Breakpoints
- Step into
- Step over
- Step out
- Call stack
- Variables
- Watch expressions
- Exception handling
- Runtime diagnostics
- Remote debugging

## Profiler

Implement:

```text
Profiler
├── CPU
├── Memory
├── GPU
├── Rendering
├── ECS
├── Physics
├── Audio
├── Network
└── Assets
```

## Build Pipeline

Implement:

```text
Project Source
      ↓
Dependency Resolution
      ↓
Asset Cooking
      ↓
Code Compilation
      ↓
Runtime Linking
      ↓
Packaging
      ↓
Signing
      ↓
Final Build
```

## Asset Cooking

Implement:

- Compression
- Texture processing
- Texture format conversion
- Mipmap generation
- Mesh optimization
- Shader compilation
- Dependency stripping
- Runtime asset packaging

## CI/CD

Implement:

- Build matrix
- Test matrix
- Platform tests
- Regression tests
- Performance tests
- Package validation
- Artifact generation

## 1.8 Completion Criteria

- Production builds can be generated
- Debugging tools work
- CPU profiling works
- Memory profiling works
- GPU profiling works where backend support allows
- Asset cooking works
- CI validates engine releases
- Build artifacts are reproducible where practical

---

# 1.8.5 — Security & Ecosystem Hardening

## Objective

Strengthen the engine's plugin, package, runtime, and distribution security before the 1.9 production release.

## Plugin Security

Implement permission systems for:

- Filesystem access
- Network access
- Process execution
- Resource consumption

## Resource Quotas

Implement configurable limits for:

- Memory
- CPU
- File access
- Network requests
- Script execution
- Asset size

## Cryptography

Introduce appropriate cryptographic primitives such as:

- Ed25519
- SHA-256
- SHA-512

Use established, audited libraries rather than implementing cryptographic algorithms from scratch.

## Package Security

Implement:

- Signed packages
- Package hashes
- Trusted publishers
- Lockfile verification
- Dependency auditing
- Package integrity validation

## Runtime Security

Implement limits for:

- Memory
- Script execution
- Recursion
- Asset size
- Serialization depth
- Resource loading
- Plugin execution

## 1.8.5 Completion Criteria

- Plugins have explicit permissions
- Packages can be verified
- Dependencies can be audited
- Runtime resources can be limited
- Security failures are reported clearly
- Production builds can enforce security policies

---

# 1.9.0 — Production Release Platform

## Objective

Turn OBX Engine into a complete production-oriented engine capable of exporting projects for supported platforms.

## Native Export

Target:

- Windows
- Linux
- macOS

## Mobile Export

Target:

- Android
- iOS

The mobile pipeline must be a real export/build workflow rather than only configuration definitions.

## Web Export

Support:

- WebGPU
- WebGL fallback
- WASM

## Packaging

The final package should be able to contain:

```text
Game/
├── Executable
├── Runtime
├── Assets
├── Shaders
├── Configuration
├── Metadata
└── Dependencies
```

## Build Configurations

Support:

```text
Development
Debug
Profiling
Release
Shipping
```

Each configuration should have clearly defined behavior.

## Diagnostics

Implement:

- Crash reporting
- Stack traces
- Runtime logs
- Error reports
- Diagnostic packages
- Build diagnostics

## Version Compatibility

Implement compatibility between:

```text
Engine Version
Project Version
Asset Version
Plugin Version
Script Version
Package Version
```

## Migration System

Support migrations from:

```text
1.0 → 1.1
1.1 → 1.2
1.2 → 1.3
1.3 → 1.4
1.4 → 1.5
1.5 → 1.6
1.6 → 1.7
1.7 → 1.8
1.8 → 1.8.5
1.8.5 → 1.9
```

Migration tools should preserve project data wherever possible.

---

# Final OBX Engine 1.9 Architecture

```text
OBX ENGINE 1.9
│
├── CORE
│   ├── Lifecycle
│   ├── ECS
│   ├── Math
│   ├── Jobs
│   ├── Threads
│   └── Serialization
│
├── RUNTIME
│   ├── Scene
│   ├── Resources
│   ├── Save
│   ├── Input
│   └── Platform
│
├── GRAPHICS
│   ├── Software
│   ├── WebGPU
│   ├── WebGL
│   ├── 2D
│   ├── 3D
│   ├── PBR
│   ├── Lighting
│   ├── Shadows
│   ├── VFX
│   └── Post Processing
│
├── GAMEPLAY
│   ├── Physics
│   ├── Animation
│   ├── Character
│   ├── Vehicle
│   ├── AI
│   ├── Navigation
│   ├── Inventory
│   ├── Dialogue
│   └── Quest
│
├── AUDIO
│   ├── Mixer
│   ├── Streaming
│   ├── 2D
│   └── 3D
│
├── UI
│   ├── Layout
│   ├── Text
│   ├── Fonts
│   ├── RTL
│   ├── Localization
│   └── Accessibility
│
├── NETWORK
│   ├── TCP
│   ├── UDP
│   ├── WebSocket
│   ├── WebRTC
│   ├── Replication
│   ├── RPC
│   └── Multiplayer
│
├── SCRIPTING
│   ├── ObsiScript
│   ├── JavaScript
│   ├── WASM
│   ├── Native
│   ├── Debugger
│   └── Hot Reload
│
├── ASSETS
│   ├── Importers
│   ├── Database
│   ├── Cache
│   ├── Cooking
│   ├── Dependencies
│   └── Hot Reload
│
├── EDITOR
│   └── ObsiFox Studio
│       ├── Scene
│       ├── Inspector
│       ├── Assets
│       ├── Animation
│       ├── Materials
│       ├── Shaders
│       ├── UI
│       ├── VFX
│       ├── Physics
│       ├── Navigation
│       ├── Script
│       ├── Debugger
│       └── Profiler
│
├── EXTENSIONS
│   ├── Plugins
│   ├── Registry
│   ├── Packages
│   └── Marketplace
│
└── EXPORT
    ├── Windows
    ├── Linux
    ├── macOS
    ├── Android
    ├── iOS
    └── Web
```

---

# Version Dependency Chain

```text
1.0
 │
 ├── Foundation
 │
 ▼
1.1
 │
 ├── Runtime
 ├── Platform
 ├── Jobs
 ├── VFS
 └── Resources
 │
 ▼
1.2
 │
 ├── GPU
 ├── WebGPU
 ├── WebGL
 ├── Shaders
 └── GPU 2D/3D
 │
 ▼
1.3
 │
 ├── Assets
 ├── Importers
 ├── Scenes
 ├── Prefabs
 └── Hot Reload
 │
 ▼
1.4
 │
 ├── ObsiFox Studio
 ├── Scene Editor
 ├── Inspector
 ├── Asset Browser
 └── Script Editor
 │
 ▼
1.5
 │
 ├── PBR
 ├── Lighting
 ├── Shadows
 ├── Post Processing
 └── VFX
 │
 ▼
1.6
 │
 ├── Networking
 ├── Multiplayer
 ├── Replication
 └── Security
 │
 ▼
1.7
 │
 ├── Animation
 ├── Physics
 ├── AI
 ├── Navigation
 └── UI
 │
 ▼
1.8
 │
 ├── Debugger
 ├── Profiler
 ├── Build Pipeline
 ├── Asset Cooking
 └── CI/CD
 │
 ▼
1.8.5
 │
 ├── Security
 ├── Plugin Permissions
 ├── Package Verification
 └── Ecosystem Hardening
 │
 ▼
1.9
 │
 ├── Native Export
 ├── Mobile Export
 ├── Web Export
 ├── Packaging
 ├── Diagnostics
 └── Migration
```

---

# Engineering Rules for 1.0 → 1.9

## Rule 1 — Do Not Rebuild Existing Foundations

If a system is already implemented in v1.0, extend and productionize it.

Do not replace a working architecture merely to introduce a different architecture.

---

## Rule 2 — Separate Architecture from Implementation

Every feature must be classified as one of:

```text
FULL
PARTIAL
PROTOTYPE
ARCHITECTURE_ONLY
STUB
PLANNED
MISSING
```

A class, interface, configuration object, or documentation entry must not be treated as a completed production feature.

---

## Rule 3 — Every Major Feature Requires Tests

New systems should include appropriate:

- Unit tests
- Integration tests
- Runtime tests
- Regression tests
- Performance tests where relevant
- Platform tests where relevant

---

## Rule 4 — Preserve Headless Capability

The engine should continue supporting headless and deterministic execution for:

- CI
- Automated testing
- Servers
- Tools
- Asset processing
- Simulation
- Debugging

---

## Rule 5 — Backend Independence

Game code should not directly depend on a specific graphics backend.

The architecture should allow:

```text
Game
 ↓
OBX Rendering API
 ↓
Backend
 ├── WebGPU
 ├── WebGL
 └── Software
```

---

## Rule 6 — Runtime and Editor Separation

The editor must not become a mandatory dependency of exported games.

Target architecture:

```text
ObsiFox Studio
      │
      ▼
OBX Editor APIs
      │
      ▼
OBX Engine
      │
      ▼
Exported Runtime
```

A shipped game should contain only the runtime systems required by the project.

---

## Rule 7 — Production Features Must Be Measurable

Major systems should expose diagnostics and profiling information.

Examples:

```text
Renderer
CPU time
GPU time
Draw calls
Triangles
Textures
Memory
Shader compilation
```

```text
Networking
Bandwidth
Packets
Latency
Loss
Replication
RPC
```

```text
ECS
Entities
Systems
Queries
Execution time
Memory
```

---

# Definition of OBX Engine 1.9

OBX Engine 1.9 should represent the transition from an engine foundation/framework into a complete production platform.

At the end of this roadmap, the target is:

```text
Create Project
      ↓
Open in ObsiFox Studio
      ↓
Create Scene
      ↓
Import Assets
      ↓
Build Gameplay
      ↓
Write Scripts
      ↓
Use Physics / AI / Animation / Audio / UI
      ↓
Use GPU Rendering
      ↓
Test / Debug / Profile
      ↓
Cook Assets
      ↓
Build Project
      ↓
Package Project
      ↓
Export
      ↓
Windows / Linux / macOS / Android / iOS / Web
```

The primary goal is not simply to increase the number of APIs or packages.

The goal is to make every major subsystem move from:

```text
Architecture
    ↓
Implementation
    ↓
Integration
    ↓
Testing
    ↓
Tooling
    ↓
Optimization
    ↓
Production
```

and ultimately make OBX Engine 1.9 a coherent, integrated engine platform rather than a collection of independent subsystems.
