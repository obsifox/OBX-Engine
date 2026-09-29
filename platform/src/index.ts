export * from "./types.js";
export * from "./errors.js";
export * from "./platform.js";
export * from "./node.js";

import { ManualPlatform } from "./platform.js";
import { NodePlatform } from "./node.js";
import type { Platform, PlatformKind } from "./types.js";

export function createPlatform(kind: PlatformKind): Platform {
  if (kind === "manual") return new ManualPlatform();
  return new NodePlatform();
}
