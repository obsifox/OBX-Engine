import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@obsifox/core": path.join(root, "core/src/index.ts"),
      "@obsifox/runtime": path.join(root, "runtime/src/index.ts"),
      "@obsifox/ecs": path.join(root, "ecs/src/index.ts"),
      "@obsifox/engine": path.join(root, "engine/src/index.ts"),
    },
  },
  test: {
    include: [
      "core/tests/**/*.test.ts",
      "runtime/tests/**/*.test.ts",
      "ecs/tests/**/*.test.ts",
      "engine/tests/**/*.test.ts",
      "tests/**/*.test.ts",
    ],
    environment: "node",
    globals: false,
  },
});
