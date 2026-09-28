import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@obx/core": path.join(root, "core/src/index.ts"),
      "@obx/runtime": path.join(root, "runtime/src/index.ts"),
      "@obx/ecs": path.join(root, "ecs/src/index.ts"),
      "@obx/engine": path.join(root, "engine/src/index.ts"),
      "@obx/math": path.join(root, "math/src/index.ts"),
      "@obx/input": path.join(root, "input/src/index.ts"),
      "@obx/rendering": path.join(root, "rendering/src/index.ts"),
      "@obx/scene": path.join(root, "scene/src/index.ts"),
    },
  },
  test: {
    include: [
      "core/tests/**/*.test.ts",
      "runtime/tests/**/*.test.ts",
      "ecs/tests/**/*.test.ts",
      "engine/tests/**/*.test.ts",
      "math/tests/**/*.test.ts",
      "input/tests/**/*.test.ts",
      "rendering/tests/**/*.test.ts",
      "scene/tests/**/*.test.ts",
      "tests/**/*.test.ts",
    ],
    environment: "node",
    globals: false,
  },
});
