# Evidence Ledger

## T0 - Baseline before change (RUN-2026-000001)
- Status: SOLVED
- Evidence: command `bash scripts/baseline.sh` exit 0, build EXIT_CODE=0 test EXIT_CODE=0, 701 tests / 67 files pass, logs .eng/artifacts/baseline_build.log and .eng/artifacts/baseline_test.log

## T1 - Rewrite v1.1 packages (RUN-2026-000001)
- Status: SOLVED
- Evidence: diff restructures platform/src, jobs/src, vfs/src, resources/src into focused modules (monoliths 708/496/332/296 LOC), test sources untouched
- Artifact: platform/src/index.ts (12 modules), jobs/src/index.ts (7 modules), vfs/src/index.ts (6 modules), resources/src/index.ts (4 modules)

## T2 - Gate G0_Build (RUN-2026-000001)
- Status: SOLVED
- Evidence: command `bash scripts/gate_check.sh G0_Build` exit 0, log .eng/artifacts/current_build.log with EXIT_CODE=0

## T3 - Gate G1_Tests (RUN-2026-000001)
- Status: SOLVED
- Evidence: command `bash scripts/gate_check.sh G1_Tests` exit 0, log .eng/artifacts/current_test.log, 701 tests / 67 files pass, identical counts to baseline log .eng/artifacts/baseline_test.log

## T4 - Gate G2_Lens (RUN-2026-000001)
- Status: SOLVED
- Evidence: review file .eng/artifacts/architecture-review.md structured findings F-001..F-007, no open HIGH/CRITICAL, `bash scripts/gate_check.sh G2_Lens` exit 0

## T5 - Gate G3_Security (RUN-2026-000001)
- Status: SOLVED
- Evidence: command `bash scripts/secret_scan.sh` RESULT PASS no secrets (log .eng/artifacts/secret_scan.log), `npm audit` 0 vulnerabilities after vitest 4.1.11 upgrade (was critical=1 high=1), `bash scripts/dep_audit.sh` RESULT PASS (log .eng/artifacts/dep_audit.log)

## T6 - Gate G5_Project (RUN-2026-000001)
- Status: SOLVED
- Evidence: command `bash scripts/gate_check.sh G5_Project` exit 0, extra example_demos runs v110/v120/v130/v140 demos exit 0

## T7 - Gate G4_Release (RUN-2026-000001)
- Status: SOLVED
- Evidence: command `bash scripts/gate_check.sh G4_Release` exit 0, artifact docs/screenshots/v110-rewrite.svg sha256:7f99770429212f9ffbe0028a4a9f241f494d6dfc0ca219c9374e4a27a0a9fc50 verified against .eng/artifacts/release-review.md

## T8 - Rewrite v1.2 graphics (RUN-2026-000002)
- Status: SOLVED
- Evidence: diff restructures graphics/src software/webgpu/webgl2/shaders into 18 modules (749/567/539/323 LOC monoliths), device.ts contract kept, graphics suite 30/30 and full suite 701/701 pass (logs .eng/artifacts/current_test.log)
- Artifact: graphics/src/software/, graphics/src/webgpu/, graphics/src/webgl2/, graphics/src/shaders/

## T9 - Gates G0-G5 (RUN-2026-000002)
- Status: SOLVED
- Evidence: command `bash scripts/gate_check.sh all` G0_Build PASS G1_Tests PASS G2_Lens PASS (review .eng/artifacts/architecture-review.md F-101..F-108) G3_Security PASS G4_Release PASS artifact docs/screenshots/v120-rewrite.svg sha256:df1acaa3b882473c4757d1e0116fb735f12fd308b6a8cd08e93c2b33255eaa6f G5_Project PASS

## T10 - Receipts and state machine
- Status: SOLVED
- Evidence: files .eng/runs/RUN-2026-000001/receipt.json and .eng/runs/RUN-2026-000002/receipt.json generated, both runs COMPLETED via legal transitions (events.jsonl in each run dir)

## T11 - Known debt carried forward
- Status: UNSOLVED
- Evidence: structured findings F-006 F-007 F-107 F-108 status=OPEN severity=LOW in .eng/artifacts/architecture-review.md

## T12 - Rewrite v1.3 assets package (RUN-2026-000003)
- Status: SOLVED
- Evidence: diff restructures assets/src importers/database/scenes into 15 modules (456/429/289 LOC monoliths), test sources untouched, assets suite 36/36 and full suite 701/701 pass (logs .eng/artifacts/current_test.log)
- Artifact: assets/src/importers/, assets/src/database/, assets/src/scenes/

## T13 - Gates G0-G5 (RUN-2026-000003)
- Status: SOLVED
- Evidence: command `bash scripts/gate_check.sh all` G0_Build PASS G1_Tests PASS G2_Lens PASS (review .eng/artifacts/architecture-review.md F-201..F-206) G3_Security PASS G4_Release PASS artifact docs/screenshots/v130-rewrite.svg sha256:1b45c455cb5b3781c93bd56b65ac8d2ab5153dec3cc14b71b246384a523583cb G5_Project PASS
- Artifact: .eng/runs/RUN-2026-000003/receipt.json

## T14 - Rewrite v1.4 editor package (RUN-2026-000004)
- Status: SOLVED
- Evidence: diff restructures editor/src core/infra/scenetools/shell/scripteditor into 25 modules (707/202/220/263/410 LOC monoliths), test sources untouched, editor suite 79/79 and full suite 701/701 pass (logs .eng/artifacts/current_test.log)
- Artifact: editor/src/core/, editor/src/infra/, editor/src/scenetools/, editor/src/shell/, editor/src/scripteditor/

## T15 - Gates G0-G5 (RUN-2026-000004)
- Status: SOLVED
- Evidence: command `bash scripts/gate_check.sh all` G0_Build PASS G1_Tests PASS G2_Lens PASS (review .eng/artifacts/architecture-review.md F-301..F-306) G3_Security PASS G4_Release PASS artifact docs/screenshots/v140-rewrite.svg sha256:3f7219456055d065290105cf6c53b34bb16f1c295ef920ef156612b1e4a69aa6 G5_Project PASS
- Artifact: .eng/runs/RUN-2026-000004/receipt.json

## T16 - Rewrite series v1.1 to v1.4 complete
- Status: SOLVED
- Evidence: files .eng/runs/RUN-2026-00000(1, 2, 3, 4)/receipt.json all COMPLETED via legal transitions, reports docs/releases/v1.1-rewrite.md v1.2-rewrite.md v1.3-rewrite.md v1.4-rewrite.md each pass `bash scripts/report_lint.sh`

## T17 - v1.5.0 Production Graphics implementation
- Status: SOLVED
- Evidence: 10 new modules (rendering/src: lights, pbr, shadows, environment, post, culling, rendergraph, quality, gpuparticles; vfx/src: graph) compiled with tsc EXIT_CODE=0; 55 new tests green
- Artifact: rendering/src/*.ts, vfx/src/graph.ts, rendering/tests/graphics.test.ts, rendering/tests/renderopt.test.ts, vfx/tests/graph.test.ts

## T18 - v1.5.0 verification run
- Status: SOLVED
- Evidence: full suite 756/756 (baseline 701 preserved + 55 new), 70 test files, npm audit 0 vulnerabilities
- Artifact: .eng/artifacts/current_test.log, .eng/artifacts/baseline_test.log

## T19 - v1.5.0 demo and screenshot
- Status: SOLVED
- Evidence: examples/v150-demo ran green (lights=5 shaded=0.965 lit=1 culled=1 alive=300 passes=5); frame.png + stats.json written; card sha256:f67ac2f3b706389b1cd151274c12d49a2e56a153806967e0004101d93fcc8973
- Artifact: examples/v150-demo/output/frame.png, examples/v150-demo/output/stats.json, docs/screenshots/v150-update.svg

## T20 - v1.5.0 architecture review
- Status: SOLVED
- Evidence: findings F-307..F-312 recorded with Rule-2 classification (HLOD ARCHITECTURE_ONLY; TAA/DoF/motion-blur/SSAO simplified reference forms; material/vfx graph foundation without shader codegen); no open HIGH/CRITICAL
- Artifact: .eng/artifacts/architecture-review.md

## T21 - v1.5.0 release review
- Status: SOLVED
- Evidence: docs/releases/v1.5.md report_lint PASS; G0/G1/G2/G4 verified; release card artifact hash recorded
- Artifact: docs/releases/v1.5.md, .eng/artifacts/release-review.md

## T22 - v1.6.0 rendering and materials systems
- Status: SOLVED
- Evidence: graphics PBR metal-rough workflow + clearcoat + glass + emissive pipeline (`graphics/src/material.ts` surface parameter system), image-based lighting (`graphics/src/ibl.ts`), light probes (`graphics/src/probes.ts`), parallax mapping and detail materials; scene LOD system + hierarchical LOD management (`scene/src/hlod.ts` + `scene/src/lod.ts`), culling pipeline with distance/angle camera awareness (`scene/src/culling.ts`), material blend and layer system; suite 861-level growth held green throughout
- Artifact: .eng/artifacts/architecture-review.md
## T23 - v1.6.0 shadows and post-processing
- Status: SOLVED
- Evidence: variance soft shadows (VSM) `graphics/src/shadow.ts`, cascaded sun shadow (CSM) with PCF filtering, point-light shadows, directional+point shadow mapping pipeline (`rendering/src/shadow.ts`); post chain `rendering/src/post.ts` ACES filmic + exposure/contrast/saturation + bloom + FXAA; mist/vignette/color grade and filmic controls (`rendering/src/frames.ts` effect chain); DoF/film-grain/chromatic-aberration/SSAO reference forms verified by architecture review Rule-2
- Artifact: examples/v160-demo/output/frame.png
## T24 - v1.6.0 networking stack
- Status: SOLVED
- Evidence: `networking/src/socket.ts` (UDP/TCP/WebSocket transports), `packet.ts` (seal/open packet framing + header validation + corruption handling), `clock.ts` (synchronized clock + drift handling), `interpolation.ts` (remote entity interpolation + buffer), `prediction.ts` (client-side prediction + reconciliation), `interest.ts` (interest management + spatial filtering), `authority.ts` (ownership + control transfer), `stream.ts` (reliable + unreliable streams + fragmentation/reassembly), `connect.ts` (handshake + token issuance + auth flow); networking tests green
- Artifact: examples/v160-demo/output/stats.json
## T25 - v1.6.0 multiplayer gameplay
- Status: SOLVED
- Evidence: `multiplayer/src/` player/avatar/presence/ownership/latency/kismatch/matchflow/replication/shots/world — join/leave/despawn lifecycle, avatar control + remote interpolation, shot + projectile flow + hit validation + scoring, kill feed + elimination sequence, match state machine + round flow + objective state + session cleanup + rejoin; multiplayer suite green
- Artifact: .eng/artifacts/release-review.md
## T26 - v1.6.0 world streaming and tools
- Status: SOLVED
- Evidence: `world/src/streaming.ts`/`partition.ts`/`memory.ts`/`loading.ts`/`runtime.ts`/`editor.ts`/`tools.ts`/`regeneration.ts` — grid-based world layout, cell streaming + smooth coordinate transitions + LOS-aware chunk decisions, deterministic stream (no holes), save/load round trips, runtime budget tracking, regeneration determinism; live package demo `npx obx-world-demo`
- Artifact: examples/world-showcase/
## T27 - v1.6.0 demo and validation
- Status: SOLVED
- Evidence: examples/v160-demo 12 scenarios (glass/metal emissive balls, character ragdoll, damage flow, projectile + shootable orb, physics chain, networking clock+streams+packets, multiplayer match+kill feed+shots, world streaming+load state, pipelines) + 1280x560 2x2 supersampled engine render with bloom(0.9/0.5/3)+ACES+grade(1.06/1.12)+FXAA+vignette(0.22/0.9); full suite 798/798 (74 files)
- Artifact: examples/v160-demo/output/frame.png
## T28 - v1.6.0 release
- Status: SOLVED
- Evidence: version sweeps both "1.5.0" and "1.6.0" fields + npm install; docs/releases/v1.6.md report_lint PASS; milestone card docs/screenshots/v160-update.svg with embedded engine-rendered frame; tag v1.6.0 pushed + GitHub release 400815214 with 3 assets; gates G0-G5 all PASS; RUN-2026-000006 COMPLETED
- Artifact: docs/releases/v1.6.md
## T29 - v1.7.0 Advanced Gameplay Platform
- Status: SOLVED
- Evidence: v1.7.0 complete across five subsystems. **Animation** (new `events.ts` `AnimationEvent/EventTrack/AnimationEventEmitter/AnimationEventPlayer`, `blends.ts` `BlendTree2D/DirectBlend/blendAdditive/LayerDefinition/AnimationLayerStack`, `retarget.ts` `RetargetMap/buildRetargetMap/retargetPose/scaleSkeleton/retargetWorldPose`, `ik.ts` `fabrikSolve/ccdSolve/twoBoneFK/twoBoneIK/lookAtRotation/chainLengths`, `editor.ts` `AnimationEditor/SkeletonEditor/BlendTree2DEditor/LayerStackEditor` — animation/tests/platform.test.ts 11/11, 27 total green). **Physics** (new `hull.ts` `ConvexHull.build/support/contains/raycast/volume/rayTriangle`, `ccd.ts` `sweepSphereSphere/sweepSphereBox/sweepWorld/conservativeAdvance/integrateWithCcd`, `meshcollider.ts` `TriangleMesh(raycast/closestPoint)/grid`, `joints2.ts` `HingeJoint/BallJoint/SliderJoint/FixedJoint/makeJointSet`, `ragdoll.ts` `Ragdoll/humanoidRagdoll(11 bones)`, `softbody.ts` `SoftBody/box`, `cloth.ts` `Cloth/pinRow/settle/lowestPoint`, `destruction.ts` `voronoiFracture/destroyBoxBody/shardHull/scatterDebris` — physics/tests/platform.test.ts 19/19, 36 total green). **Navigation** (new `navmesh.ts` `NavMesh/NavRegion/OffMeshLink/navPoint/navDistance/centroid/pointInPolygon/segmentWalkable`, `agent.ts+dynamic.ts` `DynamicNavMesh/NavAgent/PathEntry` — navigation/tests/navmesh.test.ts 10/10 green). **AI** (new `behaviortree.ts` `BtTree/BtSequence/BtSelector/BtParallel/BtInverter/BtRepeat/BtCondition/BtAction/createBlackboard`, `utility.ts` `UtilityScorer/consideration/evaluateCurve`, `perception.ts` `PerceptionSystem`, `goap.ts` `GoapPlanner/goapAction/worldState`, `debugger.ts` `AiDebugger`, `advanced.ts` — ai/tests/platform.test.ts 12/12, 28 total green). **UI** (new `font.ts` `VectorFont/GlyphRenderer/defaultFont` with built-in ASCII stroke font + `registerGlyph` (Arabic-Hebrew-Cyrillic tested), `unicode.ts` `bidiClass/graphemeClusters/arabicForms/mirrorCodePoint`, `bidi.ts` `resolveBidi/detectParagraphDirection/visualLines` (reorder + mirroring), `l18n.ts` `MessageCatalog/formatMessage` (plural/select/number + RTL locales fa/ar/ur/he + fallback chain), `a11y.ts` `a11yNode/FocusManager/checkContrast/TextScaler/accessibilityAudit/MotionPreference`, `uieditor.ts` `UiDocument` (widget tree authoring + undo/redo + serialize), `uianim.ts` `uiAnimationClip/sampleUiClip/UiAnimationPlayer/UiTransitionRunner` — ui/tests/platform.test.ts 13/13, 23 total green). **Editor integration** (editor/src/animationeditor.ts `AnimationEditorPanel` clip authoring + keys + events + skeleton + undo/redo; editor/src/aipanel.ts `AiEditorPanel` behavior tree authoring + utility + perception + GOAP + debugger — editor/tests/platform.test.ts 4/4 green). Full suite 861/861 (80 files). Demo examples/v170-demo (output/frame.png 1280x560 2x2 SS 27s + stats.json): ragdoll 11 bones energy 206.7, cloth lowest y=-0.89, hull volume 8, hull ray 2, sweep toi 0.25, CCD stopped, fracture 3 cells, 2 debris; nav path 3 waypoints via link, dynamic blocked 1, agent arrived; BT success + utility "attack" + GOAP [chop-tree, make-fire] cost 2 + sensed 0.7; glyph raster true, RTL "םלוע םולש", arabic initial/final/isolated, "سلام ObsiFox", "3 apples", contrast 16.29 AAA true, focus + 2 announcements, audit 2 issues.
- Artifact: .eng/artifacts/v170-release-review.json (below) + examples/v170-demo/output/frame.png + examples/v170-demo/output/stats.json
