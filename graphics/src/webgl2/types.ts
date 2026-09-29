export interface WebGL2ContextLike {
  createBuffer(): unknown;
  bindBuffer(target: number, buffer: unknown): void;
  bufferData(target: number, data: ArrayBufferView, usage: number): void;
  createTexture(): unknown;
  bindTexture(target: number, texture: unknown): void;
  texImage2D(target: number, level: number, internalFormat: number, width: number, height: number, border: number, format: number, type: number, pixels: ArrayBufferView | null): void;
  createShader(type: number): unknown;
  shaderSource(shader: unknown, source: string): void;
  compileShader(shader: unknown): void;
  getShaderParameter(shader: unknown, pname: number): unknown;
  createProgram(): unknown;
  attachShader(program: unknown, shader: unknown): void;
  linkProgram(program: unknown): void;
  getProgramParameter(program: unknown, pname: number): unknown;
  useProgram(program: unknown): void;
  deleteProgram(program: unknown): void;
  getUniformLocation(program: unknown, name: string): unknown;
  uniformMatrix4fv(location: unknown, transpose: boolean, data: ArrayBufferView): void;
  uniform1i(location: unknown, value: number): void;
  vertexAttribPointer(index: number, size: number, type: number, normalized: boolean, stride: number, offset: number): void;
  enableVertexAttribArray(index: number): void;
  drawArrays(mode: number, first: number, count: number): void;
  drawElements(mode: number, count: number, type: number, offset: number): void;
  clear(mask: number): void;
  clearColor(r: number, g: number, b: number, a: number): void;
  createVertexArray(): unknown;
  bindVertexArray(vao: unknown): void;
  fenceSync(condition: number, flags: number): unknown;
  clientWaitSync(sync: unknown, flags: number, timeout: number): number;
  deleteSync(sync: unknown): void;
}

export const GL = {
  ARRAY_BUFFER: 34962,
  ELEMENT_ARRAY_BUFFER: 34963,
  STATIC_DRAW: 35044,
  TEXTURE_2D: 3553,
  RGBA: 6408,
  UNSIGNED_BYTE: 5121,
  VERTEX_SHADER: 35633,
  FRAGMENT_SHADER: 35632,
  COMPILE_STATUS: 35713,
  LINK_STATUS: 35714,
  TRIANGLES: 4,
  UNSIGNED_SHORT: 5123,
  COLOR_BUFFER_BIT: 16384,
  TEXTURE0: 33984,
  ALREADY_SIGNALED: 37146,
  CONDITION_SATISFIED: 37148,
} as const;

