# Playbook: Game Engine TypeScript

## Common Mistakes
- GC pressure in game loop, blocking render thread, memory leaks in assets, no delta time, input lag, no asset cleanup.

## Security Checklist
- No eval of mod scripts without sandbox, validate asset paths (no traversal), no secrets in client bundle.

## Performance Checklist
- Object pooling, fixed timestep, spatial partitioning, cull off-screen, texture atlas, measure FPS, memory via perf hooks.

## Recommended Structure
```
src/
  engine/ core, renderer, physics, audio, input
  game/
  assets/
  editor/ (if needed)
tests/
```

## Verification
- `npm run build` exit 0
- `npm test` log
- Run dev server, check FPS counter, memory not growing unbounded (if can run else NOT TESTED)
- Bundle size check
