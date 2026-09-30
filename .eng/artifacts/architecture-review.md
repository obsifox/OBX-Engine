# Architecture review — RUN-2026-000005 (v1.5.0 Production Graphics)

- [F-307] severity=MEDIUM status=CLOSED review of shadow pipeline: CPU-reference rasterizer with PCF and bias is deterministic but not GPU-comparable in performance; classified SOLVED (reference), GPU shadow maps stay a backend concern.
- [F-308] severity=MEDIUM status=CLOSED review of post chain: TAA, depth-of-field, motion blur and SSAO are simplified deterministic reference forms (fixed kernels, no velocity reprojection history); documented as reference-quality, configurable via PostSettings.
- [F-309] severity=LOW status=CLOSED review of hierarchical LOD: HLOD cluster aggregation is ARCHITECTURE_ONLY; LOD tier selection, distance thresholds and occlusion coverage helpers are provided for backends to build HLOD on top.
- [F-310] severity=LOW status=CLOSED review of graph layers: MaterialGraph and VfxNodeGraph provide validated node graphs with topological compile but no shader/VFX bytecode generation; classified functional foundation.
- [F-311] severity=LOW status=CLOSED review of occlusion: OcclusionBuffer is a coarse depth-pyramid test (4 samples per AABB) suitable for large prop rejection, not per-triangle; intentional simplification with statistics.
- [F-312] severity=INFO status=CLOSED review of gpu particles: deterministic CPU simulation with explicit ParticleGpuDevice instance-buffer contract (stride 8) keeps Rule 4 determinism while exposing the exact upload path a GPU backend needs.
