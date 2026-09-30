export function extensionOf(path: string): string {
  const index = path.lastIndexOf(".");
  return index === -1 ? "" : path.slice(index + 1).toLowerCase();
}

export function decodeText(source: Uint8Array): string {
  return new TextDecoder().decode(source);
}

export function viewOf(source: Uint8Array): DataView {
  return new DataView(source.buffer, source.byteOffset, source.byteLength);
}

export function ascii(source: Uint8Array, offset: number, length: number): string {
  let out = "";
  for (let index = 0; index < length && offset + index < source.length; index += 1) {
    out += String.fromCharCode(source[offset + index]!);
  }
  return out;
}

