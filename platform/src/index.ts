export * from "./platform.js";
export * from "./node.js";

import { ManualPlatform, type Platform, type PlatformKind } from "./platform.js";
import { NodePlatform } from "./node.js";

export function createPlatform(kind: PlatformKind): Platform {
  if (kind === "manual") return new ManualPlatform();
  return new NodePlatform();
}
