export {
  ExtensionError,
  ExtensionRegistry,
  NativeAbi,
  WasmInstance,
  WasmModule,
  generateCHeader,
  generateRustBindings,
  parseSignature,
  type Capability,
  type ExtensionContext,
  type ExtensionModule,
  type ExtensionRegistryOptions,
  type NativeHandler,
  type NativeSignature,
  type NativeSymbol,
  type NativeType,
} from "./native.js";
export const NATIVE_VERSION = "0.9.0";
