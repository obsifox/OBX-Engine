/**
 * @obsifox/engine — the ObsiFox Engine facade.
 *
 * Composes @obsifox/core, @obsifox/runtime and @obsifox/ecs into the
 * Engine/Application entry points described in §2 of the roadmap.
 */

export * from "./engine.js";
export * from "./application.js";

// Re-export the building blocks so consumers can depend on one package.
export * from "@obsifox/core";
export * from "@obsifox/runtime";
export * from "@obsifox/ecs";

export const ENGINE_VERSION = "0.1.0";
