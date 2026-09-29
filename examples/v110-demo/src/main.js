import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SoftwareBackend, Renderer2D, Camera2D, encodePng, Texture } from "@obx/rendering";
import { Colors } from "@obx/math";
import { NodePlatform, ManualPlatform } from "@obx/platform";
import { JobSystem, WorkerPool, TaskGraph, InlineExecutor } from "@obx/jobs";
import {
  VirtualFileSystem,
  MemoryFileSystem,
  PackageFileSystem,
  PhysicalFileSystem,
  normalizeVirtualPath,
} from "@obx/vfs";
import { ResourceManager } from "@obx/resources";
import { RuntimeHost } from "@obx/runtime";
import { World, defineComponent } from "@obx/ecs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const platform = new NodePlatform();
const vfs = new VirtualFileSystem();
const memoryFs = new MemoryFileSystem();
const packFs = new PackageFileSystem({
  "/palette.json": JSON.stringify({ primary: "#FF6A1A", secondary: "#41E0FF" }),
});
vfs.mount("/mem", memoryFs);
vfs.mount("/pack", packFs);
const physicalRoot = join(root, "..", "..", "templates");
const physicalAdapter = new PhysicalFileSystem({
  root: physicalRoot,
  files: platform.files,
});
vfs.mount("/templates", physicalAdapter);

vfs.writeText("/mem/config/game.json", JSON.stringify({ dep: "/pack/palette.json", level: 3 }));
const pathCheck = normalizeVirtualPath("/mem/../mem/config/game.json");

const textLoader = {
  type: "text",
  extensions: ["txt", "js", "md"],
  load: (path, fs) => fs.readText(path),
};
const jsonLoader = {
  type: "json",
  extensions: ["json"],
  load: (path, fs) => {
    const value = JSON.parse(fs.readText(path));
    return { value, dependencies: typeof value.dep === "string" ? [value.dep] : [] };
  },
};
const resources = new ResourceManager(vfs);
resources.registerLoader(textLoader);
resources.registerLoader(jsonLoader);

const config = resources.load("/mem/config/game.json");
const palette = resources.load("/pack/palette.json");
const template = resources.load("/templates/fps/template.json");
const cachedAgain = resources.load("/mem/config/game.json");
resources.invalidate("/pack/palette.json");

const pool = new WorkerPool(platform, { workers: 2 });
const jobs = new JobSystem({ executor: pool });
const workload = [
  systemHandle(jobs, "f", (payload) => payload.n * payload.n, { n: 12 }),
  systemHandle(jobs, "f", (payload) => payload.n * payload.n, { n: 7 }),
  systemHandle(jobs, "f", (payload) => payload.n * payload.n, { n: 21 }),
];
function systemHandle(system, name, fn, payload) {
  return system.schedule(name, fn, payload, "(payload) => payload.n * payload.n");
}
const fence = jobs.fence(workload);
const inline = new JobSystem({ executor: new InlineExecutor() });

const Position = defineComponent("Demo.Position", { defaults: () => ({ x: 0, y: 0 }) });
const world = new World("v110");
for (let i = 0; i < 24; i += 1) world.createEntity([Position, { x: i * 3, y: i }]);

const W = 640, H = 360;
const backend = new SoftwareBackend(W, H);
const renderer = new Renderer2D(backend);
const camera = new Camera2D({ viewportWidth: W, viewportHeight: H });

let frames = 0;
const host = new RuntimeHost({
  platform,
  title: "OBX v1.1 Runtime Host",
  width: W,
  height: H,
  onFrame: (deltaMs) => {
    frames += 1;
    for (const id of world.query(Position).entities()) {
      const pos = world.getComponent(id, Position);
      if (pos) pos.x += deltaMs * 0.001;
    }
    if (frames % 2 === 0) return;
    renderer.begin(camera, Colors.obsidian);
    renderer.drawRect({ x: 0, y: 0, width: W, height: 8, color: Colors.foxOrange });
    renderer.drawRect({ x: 0, y: 8, width: W, height: 2, color: Colors.ember });
    let index = 0;
    for (const id of world.query(Position).entities()) {
      const pos = world.getComponent(id, Position);
      if (!pos) continue;
      renderer.drawSprite({
        texture: Texture.solid(index % 2 === 0 ? Colors.foxOrange : Colors.signalCyan, 8, 8),
        x: 40 + pos.x * 1.4,
        y: 60 + index * 10,
        width: 18,
        height: 8,
      });
      index += 1;
    }
    renderer.drawRect({ x: 40, y: 300, width: 240, height: 12, color: Colors.surface });
    renderer.drawRect({ x: 40, y: 300, width: 40 + frames, height: 12, color: Colors.ember });
    renderer.end();
  },
});

host.start();
host.step(16);
host.step(16);
host.step(16);
host.stop();
await fence.wait();
const poolResults = fence.results();
const inlineHandle = inline.schedule("inline", (payload) => payload.a + payload.b, { a: 20, b: 22 });
await jobs.shutdown();

const frame = { width: W, height: H, data: backend.pixels };
const outDir = join(root, "output");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "frame.png"), encodePng(frame));

const stats = {
  version: "1.1.0",
  platform: {
    kind: platform.kind,
    capabilities: platform.capabilities,
    threads: platform.threads.count,
    lifecycle: platform.lifecycle.phase,
  },
  host: host.stats(),
  vfs: {
    mounts: vfs.mounts().map((record) => record.prefix),
    normalizedPath: pathCheck,
    templateListed: vfs.list("/templates").slice(0, 4),
    packEntry: vfs.readText("/pack/palette.json").slice(0, 30),
  },
  resources: {
    configValue: config.value,
    paletteType: palette.type,
    templateName: template.value.name,
    cacheHit: cachedAgain === config,
    stats: resources.stats(),
  },
  jobs: {
    poolResults,
    inlineResult: inlineHandle.result,
    poolStats: jobs.stats(),
    graph: await graphDemo(),
  },
  ecs: { entities: [...world.query(Position)].length },
};
async function graphDemo() {
  const graph = new TaskGraph();
  graph.addTask("a", [], () => 3);
  graph.addTask("b", ["a"], (payload) => payload.deps.a * 14);
  const result = await graph.run(new JobSystem());
  return result.get("b");
}
writeFileSync(join(outDir, "stats.json"), JSON.stringify(stats, null, 2));
console.log(JSON.stringify(stats, null, 2));
