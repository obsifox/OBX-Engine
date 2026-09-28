import type { Texture } from "./texture.js";

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = CRC_TABLE[(crc ^ bytes[i]!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (let i = 0; i < bytes.length; i += 1) {
    a = (a + bytes[i]!) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function writeChunk(parts: Uint8Array[], type: string, data: Uint8Array): void {
  const length = data.length;
  const chunk = new Uint8Array(12 + length);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, length);
  for (let i = 0; i < 4; i += 1) {
    chunk[4 + i] = type.charCodeAt(i);
  }
  chunk.set(data, 8);
  view.setUint32(8 + length, crc32(chunk.subarray(4, 8 + length)));
  parts.push(chunk);
}

function buildScanlines(texture: Texture): Uint8Array {
  const stride = texture.width * 4;
  const raw = new Uint8Array((stride + 1) * texture.height);
  for (let y = 0; y < texture.height; y += 1) {
    raw[y * (stride + 1)] = 0;
    raw.set(texture.data.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }
  return raw;
}

function storedDeflate(raw: Uint8Array): Uint8Array {
  const maxBlock = 65535;
  const blockCount = Math.max(1, Math.ceil(raw.length / maxBlock));
  const out = new Uint8Array(2 + blockCount * 5 + raw.length);
  let offset = 0;
  for (let block = 0; block < blockCount; block += 1) {
    const start = block * maxBlock;
    const end = Math.min(raw.length, start + maxBlock);
    const len = end - start;
    out[offset] = block === blockCount - 1 ? 1 : 0;
    out[offset + 1] = len & 0xff;
    out[offset + 2] = (len >>> 8) & 0xff;
    out[offset + 3] = ~len & 0xff;
    out[offset + 4] = (~len >>> 8) & 0xff;
    out.set(raw.subarray(start, end), offset + 5);
    offset += 5 + len;
  }
  return out.subarray(0, offset);
}

export function encodePng(texture: Texture): Uint8Array {
  const raw = buildScanlines(texture);
  const deflate = storedDeflate(raw);
  const idatData = new Uint8Array(2 + deflate.length + 4);
  idatData[0] = 0x78;
  idatData[1] = 0x01;
  idatData.set(deflate, 2);
  const adler = adler32(raw);
  const idatView = new DataView(idatData.buffer);
  idatView.setUint32(2 + deflate.length, adler);

  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, texture.width);
  ihdrView.setUint32(4, texture.height);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const parts: Uint8Array[] = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])];
  writeChunk(parts, "IHDR", ihdr);
  writeChunk(parts, "IDAT", idatData);
  writeChunk(parts, "IEND", new Uint8Array(0));

  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const png = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    png.set(part, offset);
    offset += part.length;
  }
  return png;
}
