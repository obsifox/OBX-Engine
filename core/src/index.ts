/**
 * @obsifox/core — ObsiFox Engine core foundation.
 *
 * Roadmap coverage: §2 Core Foundation (Engine services layer).
 */

export * from "./errors.js";
export * from "./logger.js";
export * from "./events.js";
export * from "./time.js";
export * from "./scheduler.js";
export * from "./config.js";
export * from "./memory.js";
export * from "./lifecycle.js";

/** Engine-wide semantic version of the core API. */
export const CORE_VERSION = "0.1.0";
