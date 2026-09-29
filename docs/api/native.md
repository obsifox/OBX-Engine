# Native API

`@obx/native` — FFI/ABI marshaling and WASM modules.

## Signatures and ABI

`parseSignature("i32(i32,i32)")` builds typed signatures; `NativeAbi.define`/`call`
marshal i32/i64/f32/f64/string/ptr with arity checks.

## Bindings

`generateCHeader(fn)` emits C headers; `generateRustBindings(fn)` emits extern decls.
`ExtensionRegistry` gates platforms and capabilities through plugin lifecycle.

## WASM

`WasmModule.compile(bytes)` validates magic/version; `instantiate` returns a
`WasmInstance` with typed export calls and memory views.
