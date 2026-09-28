import { rmSync, readdirSync } from "node:fs";
import { join } from "node:path";

const packages = ["core", "runtime", "ecs", "engine", "math", "input", "rendering", "scene"];
for (const pkg of packages) {
  rmSync(join(pkg, "dist"), { recursive: true, force: true });
  for (const entry of readdirSync(pkg)) {
    if (entry.endsWith(".tsbuildinfo")) {
      rmSync(join(pkg, entry), { force: true });
    }
  }
}
rmSync("examples/twod-demo/output", { recursive: true, force: true });
console.log("clean complete");
