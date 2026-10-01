import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Quat, Vec3 } from "@obx/math";
import {
  AnimationEditorPanel,
  AiEditorPanel,
  goapAction,
} from "@obx/editor";
import {
  AnimationEditor,
  BlendTree2D,
  EventTrack,
  SkeletonEditor,
  ccdSolve,
  chainLengths,
  fabrikSolve,
  rootMotion,
} from "@obx/animation";
import {
  Cloth,
  ConvexHull,
  Ragdoll,
  SoftBody,
  TriangleMesh,
  boxHull,
  conservativeAdvance,
  destroyBoxBody,
  humanoidRagdoll,
  sweepSphereBox,
  voronoiFracture,
  Body,
  boxShape,
} from "@obx/physics";
import {
  DynamicNavMesh,
  NavAgent,
  NavMesh,
  NavRegion,
  OffMeshLink,
  navPoint,
} from "@obx/navigation";
import {
  BtAction,
  BtSelector,
  BtSequence,
  BtTree,
  PerceptionSystem,
  UtilityScorer,
  consideration,
  createBlackboard,
} from "@obx/ai";
import {
  GlyphRenderer,
  MessageCatalog,
  FocusManager,
  TextScaler,
  UiDocument,
  a11yNode,
  accessibilityAudit,
  arabicForms,
  checkContrast,
  localeInfo,
  resolveBidi,
} from "@obx/ui";
import {
  applyPostChain,
  createFrameBuffer,
  defaultPostSettings,
  encodePng,
} from "@obx/rendering";
import { renderScene } from "./render.js";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "output");
mkdirSync(outDir, { recursive: true });

const report = { version: "1.7.0", demo: "v170-demo", errors: 0, scenarios: {} };

const panel = new AnimationEditorPanel();
panel.addBone("root", null, new Vec3(0, 0, 0));
panel.addBone("spine", "root", new Vec3(0, 0.4, 0));
panel.addBone("head", "spine", new Vec3(0, 0.35, 0));
panel.createClip("walk", 1);
panel.setKey("root.position", 0, new Vec3(0, 0, 0));
panel.setKey("root.position", 1, new Vec3(0, 0, 1.2));
panel.addEvent({ time: 0.25, name: "footstep", payload: { foot: "left" } });
panel.addEvent({ time: 0.75, name: "footstep", payload: { foot: "right" } });

const clipEditor = new AnimationEditor("idle", 1);
clipEditor.setKey("root.position", 0, new Vec3(0, 0, 0));
const runEditor = new AnimationEditor("run", 1);
runEditor.setKey("root.position", 0, new Vec3(0, 0, 2.4));
const tree = new BlendTree2D([
  { x: 0, y: 0, clip: clipEditor.build() },
  { x: 1, y: 0, clip: runEditor.build() },
]);
const blended = tree.sample(0.5, 0.5, 0);
const blendedZ = blended.get("root.position").z;

const walkClip = panel.activeClip.build();
const rootDelta = rootMotion(walkClip, 0, 0.5);
const chain = { positions: [new Vec3(0, 0, 0), new Vec3(0, 0.5, 0), new Vec3(0, 1, 0)], lengths: [] };
chain.lengths = chainLengths(chain.positions);
const ikSolved = fabrikSolve(chain, new Vec3(0.6, 0.8, 0), 16, 1e-4);
const ccdJoints = [
  { rotation: Quat.identity(), position: new Vec3(0, 0, 0) },
  { rotation: Quat.identity(), position: new Vec3(0.5, 0, 0) },
  { rotation: Quat.identity(), position: new Vec3(1, 0, 0) },
];
const ccdSolved = ccdSolve(ccdJoints, new Vec3(0.5, 0.8, 0), 20, 1e-4);
const eventsFired = panel.eventTrack().eventsInRange(0, 0.6).length;
report.scenarios.animation = {
  authoredClips: panel.clips.size,
  skeletonBones: panel.skeleton.build().bones.length,
  eventsFired,
  rootMotionZ: rootDelta.position.z,
  blendTreeX: blendedZ,
  ikEndX: ikSolved[ikSolved.length - 1].x,
  ikEndY: ikSolved[ikSolved.length - 1].y,
  ccdEndY: ccdSolved[ccdSolved.length - 1].position.y,
  validationErrors: panel.validate().length,
};

const ragdoll = new Ragdoll(humanoidRagdoll());
ragdoll.applyImpulse("torso", new Vec3(0, 180, 0));
for (let i = 0; i < 45; i += 1) ragdoll.step(1 / 60);
const cloth = new Cloth(6, 6, 0.2);
cloth.pinRow(0);
cloth.settle(45, new Vec3(0.6, 0, 0.2));
const soft = SoftBody.box(new Vec3(0, 1.4, 0), new Vec3(0.3, 0.3, 0.3), 1);
soft.pin(0);
for (let i = 0; i < 30; i += 1) soft.step(1 / 60);
const hull = boxHull(new Vec3(1, 1, 1));
const hullHit = hull.raycast(new Vec3(-3, 0, 0), new Vec3(1, 0, 0));
const sweepHit = sweepSphereBox(new Vec3(-3, 0, 0), new Vec3(3, 0, 0), 0.5, new Vec3(0, 0, 0), new Vec3(1, 1, 1));
const advance = conservativeAdvance(new Vec3(-3, 0, 0), new Vec3(3, 0, 0), 0.5, (point) => Math.max(point.length() - 1, 0));
const mesh = TriangleMesh.grid(3, 3, 1);
const meshHit = mesh.raycast(new Vec3(1, 4, 1), new Vec3(0, -1, 0));
const fracture = voronoiFracture(new Vec3(1, 1, 1), [new Vec3(0, 0, 0), new Vec3(0.5, 0.5, 0.5), new Vec3(-0.5, 0, 0.5)]);
const debris = destroyBoxBody(new Body({ shape: boxShape(new Vec3(1, 1, 1)), position: new Vec3(0, 0, 0), mass: 8 }), [new Vec3(0.5, 0, 0), new Vec3(-0.5, 0, 0)], 1);
report.scenarios.physics = {
  ragdollBones: ragdoll.bodies.size,
  ragdollTorsoY: ragdoll.pose().find((entry) => entry.name === "torso").position.y,
  ragdollEnergy: ragdoll.totalKineticEnergy(),
  clothLowestY: cloth.lowestPoint().y,
  softCenterY: soft.center().y,
  hullVolume: hull.volume(),
  hullRayDistance: hullHit.distance,
  sweepToi: sweepHit.toi,
  ccdStopped: advance.hit,
  meshHitY: meshHit.point.y,
  fractureCells: fracture.cells.length,
  debrisBodies: debris.length,
};

const regionA = new NavRegion("plaza");
for (let x = 0; x < 3; x += 1) {
  for (let z = 0; z < 3; z += 1) {
    regionA.addPolygon([navPoint(x, 0, z), navPoint(x + 1, 0, z), navPoint(x + 1, 0, z + 1), navPoint(x, 0, z + 1)]);
  }
}
const regionB = new NavRegion("island");
regionB.addPolygon([navPoint(8, 0, 0), navPoint(9, 0, 0), navPoint(9, 0, 1), navPoint(8, 0, 1)]);
const navMesh = new NavMesh();
navMesh.addRegion(regionA);
navMesh.addRegion(regionB);
navMesh.addLink(new OffMeshLink(navPoint(3, 0, 0.5), navPoint(8, 0, 0.5), 1.5, true));
const path = navMesh.findPath(navPoint(0.5, 0, 0.5), navPoint(8.5, 0, 0.5));
const dynamicMesh = new DynamicNavMesh();
const dynRegion = new NavRegion("ground");
for (let x = 0; x < 3; x += 1) dynRegion.addPolygon([navPoint(x, 0, 0), navPoint(x + 1, 0, 0), navPoint(x + 1, 0, 1), navPoint(x, 0, 1)]);
dynamicMesh.addRegion(dynRegion);
dynamicMesh.addObstacle("crate", navPoint(0.2, 0, 0.2), navPoint(0.8, 0, 0.8));
const blocked = dynamicMesh.blockedPolygons().length;
const agent = new NavAgent(navMesh, navPoint(0.5, 0, 0.5), { speed: 3 });
agent.setDestination(navPoint(2.5, 0, 2.5));
for (let i = 0; i < 60; i += 1) agent.step(1 / 60);
report.scenarios.navigation = {
  polygons: navMesh.allPolygons().length,
  pathWaypoints: path.length,
  viaLink: path.some((entry) => entry.viaLink),
  dynamicBlocked: blocked,
  agentState: agent.state,
  agentDistance: agent.distanceToDestination(),
};

const aiPanel = new AiEditorPanel();
aiPanel.setTree({
  kind: "selector",
  name: "root",
  children: [
    {
      kind: "sequence",
      name: "combat",
      children: [
        { kind: "condition", name: "threat?", key: "threat", equals: true },
        { kind: "action", name: "attack", effectKey: "engaged", effectValue: true },
      ],
    },
    { kind: "action", name: "patrol", effectKey: "engaged", effectValue: false },
  ],
});
const aiSnapshot = aiPanel.tick(new Map([["threat", true]]));
aiPanel.addUtilityAction("attack", [{ name: "threat", key: "threatLevel", curve: "quadratic" }]);
aiPanel.addUtilityAction("patrol", [{ name: "threat", key: "threatLevel", curve: "inverse" }]);
const utilityBest = new UtilityScorer(aiPanel.utilityActions).select(new Map([["threatLevel", 0.8]]));
const perception = new PerceptionSystem({ sightRange: 12, sightAngleDegrees: 100 });
const sensed = perception.sense({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, [
  { id: "bandit", kind: "enemy", position: { x: 3, y: 0, z: 1 }, strength: 1 },
], 0.5);
aiPanel.blackboard.set("hasAxe", true);
aiPanel.setGoal({ fireLit: true });
const plan = aiPanel.plan([
  goapAction("chop-tree", 1, { hasAxe: true }, { hasWood: true }),
  goapAction("make-fire", 1, { hasWood: true }, { fireLit: true }),
]);
report.scenarios.ai = {
  treeStatus: aiSnapshot.lastStatus,
  debuggerFrames: aiPanel.debugger.frames.length,
  utilityChoice: utilityBest.actionId,
  sensedAwareness: sensed[0].awareness,
  planSteps: plan.actions.map((action) => action.name),
  planCost: plan.cost,
};

const fontRenderer = new GlyphRenderer(undefined, 18);
const word = fontRenderer.rasterizeText("OBX 1.7");
const rtl = resolveBidi("שלום עולם");
const arabic = arabicForms("باب");
const catalog = new MessageCatalog(["en"]);
catalog.addBundle("en", { apples: "{count, plural, 0 no apples, # {count} apples}" });
catalog.addBundle("fa", { greeting: "سلام {name}" });
const localized = catalog.format("greeting", { values: { name: "ObsiFox" }, locale: "fa" });
const appleLine = catalog.format("apples", { values: { count: 3 } });
const contrast = checkContrast([11, 14, 20], [232, 236, 242]);
const document = new UiDocument();
document.apply({ kind: "add", parentId: "root", node: { id: "title", type: "label", style: {}, text: localized, value: 0, children: [] } });
document.apply({ kind: "add", parentId: "root", node: { id: "cta", type: "button", style: {}, text: appleLine, value: 0, children: [] } });
const focus = new FocusManager(a11yNode("root", "custom", "window", {
  children: [
    a11yNode("cta", "button", appleLine, { live: "polite" }),
    a11yNode("title", "label", localized),
  ],
}));
focus.focus("cta");
focus.focusNext();
const audit = accessibilityAudit(a11yNode("x", "custom", ""));
const scaler = new TextScaler();
scaler.setScale(1.5);
report.scenarios.ui = {
  glyphsRasterized: word.width * word.height > 0 && word.coverage.some((value) => value > 0),
  rtlVisual: rtl.visual,
  rtlDirection: rtl.direction,
  arabicForms: arabic.map((entry) => entry.form),
  localized,
  appleLine,
  localeDirection: localeInfo("fa").direction,
  contrastRatio: contrast.ratio,
  contrastAAA: contrast.passesAAA,
  focusTarget: focus.focusedId,
  announcements: focus.announcements.length,
  auditIssues: audit.length,
  scaledFont: scaler.apply(14),
  documentNodes: 3,
};

if (report.errors > 0) throw new Error("demo errors");

const WIDTH = 1280;
const HEIGHT = 560;
const startedAt = Date.now();
const scene = renderScene(WIDTH, HEIGHT, 2);
const renderMs = Date.now() - startedAt;

const frameBuffer = createFrameBuffer(WIDTH, HEIGHT);
frameBuffer.color.set(scene.color);
const renderPost = defaultPostSettings();
renderPost.bloom = { enabled: true, threshold: 0.9, intensity: 0.5, radius: 3 };
renderPost.toneMap = "aces";
renderPost.grade = { exposure: 1.0, contrast: 1.06, saturation: 1.12, lift: 0, gamma: 1, gain: 1 };
renderPost.vignette = { strength: 0.22, radius: 0.9 };
renderPost.fxaaEnabled = true;
applyPostChain(frameBuffer, renderPost, null);

const ldr = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
for (let i = 0; i < ldr.length; i += 1) {
  ldr[i] = Math.round(Math.min(1, Math.max(0, frameBuffer.color[i])) * 255);
}
writeFileSync(join(outDir, "frame.png"), encodePng({ width: WIDTH, height: HEIGHT, data: ldr }));

report.render = {
  width: WIDTH,
  height: HEIGHT,
  supersample: "2x2",
  samplesPerPixel: 4,
  renderMs,
  postChain: ["bloom(0.9/0.5/3)", "aces", "grade(1.06/1.12)", "fxaa", "vignette(0.22/0.9)"],
};

writeFileSync(join(outDir, "stats.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
