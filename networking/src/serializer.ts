export class SerializerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SerializerError";
  }
}

export class Writer {
  #bytes: number[] = [];

  get length(): number {
    return this.#bytes.length;
  }

  u8(value: number): this {
    this.#bytes.push(value & 0xff);
    return this;
  }

  u16(value: number): this {
    this.#bytes.push((value >>> 8) & 0xff, value & 0xff);
    return this;
  }

  u32(value: number): this {
    this.#bytes.push((value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff);
    return this;
  }

  varint(value: number): this {
    let remaining = value >>> 0;
    while (remaining >= 0x80) {
      this.#bytes.push((remaining & 0x7f) | 0x80);
      remaining >>>= 7;
    }
    this.#bytes.push(remaining);
    return this;
  }

  f32(value: number): this {
    const buffer = new DataView(new ArrayBuffer(4));
    buffer.setFloat32(0, value, false);
    for (let i = 0; i < 4; i += 1) this.#bytes.push(buffer.getUint8(i));
    return this;
  }

  f64(value: number): this {
    const buffer = new DataView(new ArrayBuffer(8));
    buffer.setFloat64(0, value, false);
    for (let i = 0; i < 8; i += 1) this.#bytes.push(buffer.getUint8(i));
    return this;
  }

  bool(value: boolean): this {
    return this.u8(value ? 1 : 0);
  }

  string(value: string): this {
    const encoded = Array.from(new TextEncoder().encode(value));
    this.varint(encoded.length);
    for (const byte of encoded) this.#bytes.push(byte);
    return this;
  }

  bytes(value: Uint8Array): this {
    this.varint(value.length);
    for (const byte of value) this.#bytes.push(byte);
    return this;
  }

  finish(): Uint8Array {
    return Uint8Array.from(this.#bytes);
  }
}

export class Reader {
  #view: DataView;
  #offset = 0;

  constructor(source: Uint8Array) {
    this.#view = new DataView(source.buffer, source.byteOffset, source.byteLength);
  }

  get remaining(): number {
    return this.#view.byteLength - this.#offset;
  }

  u8(): number {
    if (this.remaining < 1) throw new SerializerError("unexpected end of buffer");
    const value = this.#view.getUint8(this.#offset);
    this.#offset += 1;
    return value;
  }

  u16(): number {
    if (this.remaining < 2) throw new SerializerError("unexpected end of buffer");
    const value = this.#view.getUint16(this.#offset, false);
    this.#offset += 2;
    return value;
  }

  u32(): number {
    if (this.remaining < 4) throw new SerializerError("unexpected end of buffer");
    const value = this.#view.getUint32(this.#offset, false);
    this.#offset += 4;
    return value;
  }

  varint(): number {
    let result = 0;
    let shift = 0;
    for (let step = 0; step < 5; step += 1) {
      const byte = this.u8();
      result |= (byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) return result >>> 0;
      shift += 7;
    }
    throw new SerializerError("varint overflow");
  }

  f32(): number {
    if (this.remaining < 4) throw new SerializerError("unexpected end of buffer");
    const value = this.#view.getFloat32(this.#offset, false);
    this.#offset += 4;
    return value;
  }

  f64(): number {
    if (this.remaining < 8) throw new SerializerError("unexpected end of buffer");
    const value = this.#view.getFloat64(this.#offset, false);
    this.#offset += 8;
    return value;
  }

  bool(): boolean {
    return this.u8() !== 0;
  }

  string(): string {
    const length = this.varint();
    if (this.remaining < length) throw new SerializerError("unexpected end of buffer");
    const slice = new Uint8Array(this.#view.buffer, this.#view.byteOffset + this.#offset, length);
    this.#offset += length;
    return new TextDecoder().decode(slice);
  }

  bytes(): Uint8Array {
    const length = this.varint();
    if (this.remaining < length) throw new SerializerError("unexpected end of buffer");
    const slice = new Uint8Array(this.#view.buffer, this.#view.byteOffset + this.#offset, length).slice();
    this.#offset += length;
    return slice;
  }
}

export function encodeVarint(value: number): Uint8Array {
  return new Writer().varint(value).finish();
}

export function decodeVarint(bytes: Uint8Array): number {
  return new Reader(bytes).varint();
}
