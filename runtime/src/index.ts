/**
 * @obsifox/runtime — ObsiFox Engine runtime layer.
 *
 * Roadmap coverage: §3 Game Loop (main/update/fixed/render loops, frame
 * limiter, FPS counter, tick system, background tasks) and §64 Platform
 * Abstraction (foundation).
 */

export * from "./loop-driver.js";
export * from "./game-loop.js";
export * from "./frame-limiter.js";
export * from "./fps-counter.js";
export * from "./tasks.js";
export * from "./platforms.js";

export const RUNTIME_VERSION = "0.1.0";
