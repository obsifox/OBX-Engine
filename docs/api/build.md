# Build Documentation

`@obx/build` (directory `builder/`) — build pipeline and export targets.

## Graph and analysis

`BuildGraph` (topological order, cycle detection, dirty incremental rebuilds),
`parseImports`, `analyzeDependencies`, `bundleModules` (dependency-first registry).

## Pipeline

`BuildPipeline.run(input, target)` executes analyze -> compile -> bundle -> assets ->
optimize -> runtime -> package -> sign -> release. `BuildCache` keys on content hashes;
`processAssets`/`extractAsset` compress with packBits; `optimizeCode` strips comments.

## Export targets

`exportTarget(name)` for `windows | linux | android | web | server` defines entry file,
runtime glue files and platform config. `packageProject` emits a package manifest.
