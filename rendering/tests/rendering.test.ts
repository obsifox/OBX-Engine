import { describe, expect, it } from "vitest";
import { Color, Colors, Vec2, Vec3 } from "@obx/math";
import {
  Camera2D,
  FLOATS_PER_QUAD,
  RecordingBackend,
  Renderer2D,
  SoftwareBackend,
  SpriteAnimator,
  SpriteBatcher,
  SpriteSheet,
  Texture,
  encodePng,
  fullUv,
  uvRect,
} from "@obx/rendering";

function decodeStoredPng(png: Uint8Array): { width: number; height: number; pixels: Uint8Array } {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  expect(Array.from(png.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  let offset = 8;
  let width = 0;
  let height = 0;
  let idat: Uint8Array | null = null;
  while (offset < png.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(...png.subarray(offset + 4, offset + 8));
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(0);
      height = new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(4);
    }
    if (type === "IDAT") idat = data;
    offset += 12 + length;
    if (type === "IEND") break;
  }
  expect(idat).not.toBeNull();
  const raw = idat as Uint8Array;
  expect(raw[0]).toBe(0x78);
  expect(raw[1]).toBe(0x01);
  const blocks: Uint8Array[] = [];
  let cursor = 2;
  for (;;) {
    const header = raw[cursor]!;
    const len = raw[cursor + 1]! | (raw[cursor + 2]! << 8);
    blocks.push(raw.subarray(cursor + 5, cursor + 5 + len));
    cursor += 5 + len;
    if (header & 1) break;
  }
  const scanlines = new Uint8Array(blocks.reduce((sum, b) => sum + b.length, 0));
  let write = 0;
  for (const block of blocks) {
    scanlines.set(block, write);
    write += block.length;
  }
  const stride = width * 4;
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    pixels.set(scanlines.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), y * stride);
  }
  return { width, height, pixels };
}

describe("Texture", () => {
  it("creates solid and checker textures with sampling", () => {
    const red = Texture.solid(Colors.foxOrange, 4, 4);
    expect(red.width).toBe(4);
    expect(red.sampleNearest(0.5, 0.5).toHex()).toBe("#FF6A1A");
    expect(red.getPixel(10, 10).toHex()).toBe("#FF6A1A");

    const checker = Texture.checker(Colors.black, Colors.white, 4, 8, 8);
    expect(checker.getPixel(0, 0).toHex()).toBe("#000000");
    expect(checker.getPixel(5, 0).toHex()).toBe("#FFFFFF");
    expect(checker.sampleNearest(0.01, 0.01).toHex()).toBe("#000000");
    expect(checker.sampleNearest(0.99, 0.01).toHex()).toBe("#FFFFFF");
  });

  it("clamps uv coordinates and supports repeat wrap", () => {
    const texture = Texture.solid(Colors.white, 2, 2);
    texture.setPixel(0, 0, Colors.foxOrange);
    expect(texture.sampleNearest(-5, -5).toHex()).toBe("#FF6A1A");
    texture.wrap = "repeat";
    expect(texture.sampleNearest(1.01, 0.01).toHex()).toBe("#FF6A1A");
  });

  it("validates dimensions and clones", () => {
    expect(() => new Texture(0, 4)).toThrowError("positive");
    expect(() => new Texture(2, 2, new Uint8ClampedArray(3))).toThrowError("length mismatch");
    const t = Texture.solid(Colors.white, 2, 2);
    const clone = t.clone();
    clone.setPixel(0, 0, Colors.black);
    expect(t.getPixel(0, 0).toHex()).toBe("#FFFFFF");
    expect(clone.getPixel(0, 0).toHex()).toBe("#000000");
  });
});

describe("SpriteSheet", () => {
  it("computes grid uvs and animations", () => {
    const texture = new Texture(64, 32);
    const sheet = new SpriteSheet(texture, { frameWidth: 16, frameHeight: 16 });
    expect(sheet.columns).toBe(4);
    expect(sheet.rows).toBe(2);
    expect(sheet.frameCount).toBe(8);
    expect(sheet.frameUv(1)).toEqual({ u0: 0.25, v0: 0, u1: 0.5, v1: 0.5 });
    expect(sheet.frameUv(5)).toEqual({ u0: 0.25, v0: 0.5, u1: 0.5, v1: 1 });
    expect(() => sheet.frameUv(99)).toThrowError("out of range");

    const clip = sheet.defineAnimation("walk", [0, 1, 2, 3], 10, true);
    expect(clip.frames).toHaveLength(4);
    expect(clip.fps).toBe(10);
    expect(sheet.animation("walk")).toBe(clip);
    expect(() => sheet.animation("nope")).toThrowError("Unknown animation");
  });

  it("supports margin and spacing", () => {
    const texture = new Texture(36, 18);
    const sheet = new SpriteSheet(texture, { frameWidth: 16, frameHeight: 16, margin: 1, spacing: 2 });
    expect(sheet.columns).toBe(2);
    expect(sheet.rows).toBe(1);
    expect(sheet.frameUv(0)).toEqual({ u0: 1 / 36, v0: 1 / 18, u1: 17 / 36, v1: 17 / 18 });
    expect(() => new SpriteSheet(texture, { frameWidth: 64, frameHeight: 64 })).toThrowError(
      "exceeds texture size",
    );
  });
});

describe("SpriteAnimator", () => {
  const sheet = new SpriteSheet(new Texture(64, 16), { frameWidth: 16, frameHeight: 16 });
  const clip = sheet.defineAnimation("run", [0, 1, 2, 3], 4, true);

  it("advances frames and loops", () => {
    const animator = new SpriteAnimator(clip);
    animator.play();
    animator.update(0.25);
    expect(animator.frameIndex).toBe(1);
    animator.update(0.5);
    expect(animator.frameIndex).toBe(3);
    animator.update(0.5);
    expect(animator.frameIndex).toBe(1);
    expect(animator.currentUv()).toEqual(sheet.frameUv(1));
    animator.pause();
    animator.update(10);
    expect(animator.frameIndex).toBe(1);
  });

  it("stops at the end when not looping", () => {
    const once = sheet.defineAnimation("once", [0, 1], 2, false);
    const animator = new SpriteAnimator(once);
    animator.play();
    animator.update(5);
    expect(animator.frameIndex).toBe(1);
    expect(animator.finished).toBe(true);
    expect(animator.playing).toBe(false);
    animator.stop();
    expect(animator.frameIndex).toBe(0);
    expect(animator.currentUv()).toEqual(sheet.frameUv(0));
    expect(new SpriteAnimator().currentUv()).toEqual(fullUv());
  });
});

describe("Camera2D", () => {
  it("round-trips world and screen coordinates", () => {
    const camera = new Camera2D({
      position: new Vec2(3, -2),
      rotation: 0.7,
      zoom: 2.5,
      viewportWidth: 800,
      viewportHeight: 600,
    });
    for (const point of [new Vec2(0, 0), new Vec2(50, -20), new Vec2(-13.5, 7.25)]) {
      const screen = camera.worldToScreen(point);
      const world = camera.screenToWorld(screen);
      expect(world.equals(point, 1e-9)).toBe(true);
    }
  });

  it("centers the camera position in the viewport", () => {
    const camera = new Camera2D({ viewportWidth: 100, viewportHeight: 100, position: new Vec2(5, 5) });
    const screen = camera.worldToScreen(new Vec2(5, 5));
    expect(screen.equals(new Vec2(50, 50), 1e-9)).toBe(true);
  });

  it("view matrix matches worldToScreen", () => {
    const camera = new Camera2D({
      position: new Vec2(2, 3),
      rotation: -0.4,
      zoom: 1.7,
      viewportWidth: 320,
      viewportHeight: 240,
    });
    const point = new Vec2(-7, 11);
    const viaMatrix = camera.viewMatrix().transformPoint(new Vec3(point.x, point.y, 0));
    const direct = camera.worldToScreen(point);
    expect(viaMatrix.x).toBeCloseTo(direct.x, 6);
    expect(viaMatrix.y).toBeCloseTo(direct.y, 6);
    camera.setViewport(640, 480);
    expect(camera.viewportWidth).toBe(640);
  });
});

describe("SpriteBatcher", () => {
  const makeQuad = (texture: Texture, layer: number, marker: number): Parameters<SpriteBatcher["add"]>[0] => ({
    texture,
    layer,
    vertexData: new Float64Array(FLOATS_PER_QUAD).fill(marker),
  });

  it("sorts by layer and merges same-texture runs", () => {
    const texA = Texture.solid(Colors.white, 1, 1, "a");
    const texB = Texture.solid(Colors.black, 1, 1, "b");
    const batcher = new SpriteBatcher();
    batcher.add(makeQuad(texA, 1, 1));
    batcher.add(makeQuad(texB, 0, 2));
    batcher.add(makeQuad(texA, 1, 3));
    batcher.add(makeQuad(texB, 0, 4));

    const commands = batcher.build();
    expect(commands).toHaveLength(2);
    expect(commands[0]?.type).toBe("drawQuads");
    if (commands[0]?.type === "drawQuads") {
      expect(commands[0].texture).toBe(texB);
      expect(commands[0].quadCount).toBe(2);
      expect(commands[0].layer).toBe(0);
    }
    if (commands[1]?.type === "drawQuads") {
      expect(commands[1].texture).toBe(texA);
      expect(commands[1].quadCount).toBe(2);
      expect(commands[1].layer).toBe(1);
    }
    expect(batcher.stats.sprites).toBe(4);
    batcher.reset();
    expect(batcher.build()).toHaveLength(0);
  });

  it("rejects malformed vertex data", () => {
    const batcher = new SpriteBatcher();
    expect(() =>
      batcher.add({ texture: Texture.solid(Colors.white), layer: 0, vertexData: new Float64Array(3) }),
    ).toThrowError("exactly one quad");
  });
});

describe("Renderer2D + SoftwareBackend", () => {
  it("renders sprites to exact pixels", () => {
    const backend = new SoftwareBackend(64, 64);
    const renderer = new Renderer2D(backend);
    const camera = new Camera2D({
      viewportWidth: 64,
      viewportHeight: 64,
      position: new Vec2(32, 32),
    });
    const white = Texture.solid(Colors.white, 4, 4);

    renderer.begin(camera, Colors.black);
    renderer.drawSprite({ texture: white, x: 32, y: 32, width: 16, height: 16 });
    const stats = renderer.end();

    expect(stats.sprites).toBe(1);
    expect(stats.drawCalls).toBe(1);
    expect(backend.readPixel(32, 32).toHex()).toBe("#FFFFFF");
    expect(backend.readPixel(24, 24).toHex()).toBe("#FFFFFF");
    expect(backend.readPixel(23, 23).toHex()).toBe("#000000");
    expect(backend.readPixel(40, 40).toHex()).toBe("#000000");
  });

  it("blends alpha and applies tint", () => {
    const backend = new SoftwareBackend(4, 4);
    const renderer = new Renderer2D(backend);
    const camera = new Camera2D({ viewportWidth: 4, viewportHeight: 4 });
    const white = Texture.solid(Colors.white, 2, 2);

    renderer.begin(camera, Colors.black);
    renderer.drawSprite({
      texture: white,
      x: 2,
      y: 2,
      width: 4,
      height: 4,
      tint: new Color(1, 0, 0, 0.5),
    });
    renderer.end();
    const pixel = backend.readPixel(2, 2);
    expect(pixel.r).toBeCloseTo(0.5, 2);
    expect(pixel.g).toBeCloseTo(0, 2);
    expect(pixel.b).toBeCloseTo(0, 2);

    renderer.begin(camera);
    renderer.drawRect({ x: 2, y: 2, width: 4, height: 4, color: new Color(0, 1, 0, 1) });
    renderer.end();
    expect(backend.readPixel(2, 2).toHex()).toBe("#00FF00");
  });

  it("honors layers for painter ordering", () => {
    const backend = new SoftwareBackend(4, 4);
    const renderer = new Renderer2D(backend);
    const camera = new Camera2D({ viewportWidth: 4, viewportHeight: 4 });
    const white = Texture.solid(Colors.white, 2, 2);

    renderer.begin(camera, Colors.black);
    renderer.drawSprite({
      texture: white,
      x: 2,
      y: 2,
      width: 4,
      height: 4,
      tint: Colors.foxOrange,
      layer: 1,
    });
    renderer.drawSprite({
      texture: white,
      x: 2,
      y: 2,
      width: 4,
      height: 4,
      tint: new Color(0, 0, 1, 1),
      layer: 0,
    });
    renderer.end();
    expect(backend.readPixel(2, 2).toHex()).toBe("#FF6A1A");
  });

  it("maps sprite uvs to texture regions", () => {
    const texture = new Texture(2, 1);
    texture.setPixel(0, 0, new Color(1, 0, 0, 1));
    texture.setPixel(1, 0, new Color(0, 1, 0, 1));

    const backend = new SoftwareBackend(8, 4);
    const renderer = new Renderer2D(backend);
    const camera = new Camera2D({
      viewportWidth: 8,
      viewportHeight: 4,
      position: new Vec2(4, 2),
    });

    renderer.begin(camera, Colors.black);
    renderer.drawSprite({ texture, x: 2, y: 2, width: 4, height: 4, uv: uvRect(0, 0, 0.5, 1) });
    renderer.drawSprite({ texture, x: 6, y: 2, width: 4, height: 4, uv: uvRect(0.5, 0, 1, 1) });
    renderer.end();

    expect(backend.readPixel(2, 2).toHex()).toBe("#FF0000");
    expect(backend.readPixel(6, 2).toHex()).toBe("#00FF00");
  });

  it("follows camera movement and rotation", () => {
    const texture = Texture.solid(Colors.white, 2, 2);
    const render = (camera: Camera2D): Color => {
      const backend = new SoftwareBackend(16, 16);
      const renderer = new Renderer2D(backend);
      renderer.begin(camera, Colors.black);
      renderer.drawSprite({ texture, x: 0, y: 0, width: 4, height: 4, tint: Colors.foxOrange });
      renderer.end();
      return backend.readPixel(8, 8);
    };

    const centered = render(new Camera2D({ viewportWidth: 16, viewportHeight: 16 }));
    expect(centered.toHex()).toBe("#FF6A1A");

    const moved = render(
      new Camera2D({ viewportWidth: 16, viewportHeight: 16, position: new Vec2(100, 0) }),
    );
    expect(moved.toHex()).toBe("#000000");
  });

  it("rotates sprites around their pivot", () => {
    const texture = new Texture(2, 2);
    texture.setPixel(0, 0, new Color(1, 0, 0, 1));
    texture.setPixel(1, 0, new Color(0, 1, 0, 1));
    texture.setPixel(0, 1, new Color(0, 0, 1, 1));
    texture.setPixel(1, 1, new Color(1, 1, 0, 1));

    const backend = new SoftwareBackend(16, 16);
    const renderer = new Renderer2D(backend);
    const camera = new Camera2D({
      viewportWidth: 16,
      viewportHeight: 16,
      position: new Vec2(8, 8),
    });
    renderer.begin(camera, Colors.black);
    renderer.drawSprite({
      texture,
      x: 8,
      y: 8,
      width: 8,
      height: 8,
      rotation: Math.PI / 2,
    });
    renderer.end();

    expect(backend.readPixel(6, 6).toHex()).toBe("#0000FF");
    expect(backend.readPixel(10, 5).toHex()).toBe("#FF0000");
    expect(backend.readPixel(5, 10).toHex()).toBe("#FFFF00");
    expect(backend.readPixel(10, 10).toHex()).toBe("#00FF00");
  });

  it("draws through a recording backend with batching stats", () => {
    const recording = new RecordingBackend(32, 32);
    const renderer = new Renderer2D(recording);
    const camera = new Camera2D({ viewportWidth: 32, viewportHeight: 32 });
    const texture = Texture.solid(Colors.white, 2, 2);

    renderer.begin(camera, Colors.obsidian);
    renderer.drawSprite({ texture, x: 4, y: 4, width: 2, height: 2 });
    renderer.drawSprite({ texture, x: 8, y: 8, width: 2, height: 2 });
    renderer.end();

    expect(recording.clears).toBe(1);
    expect(recording.drawCalls).toBe(1);
    expect(recording.quads).toBe(2);
    expect(recording.frameLog).toHaveLength(1);
    expect(() => renderer.drawSprite({ texture, x: 0, y: 0, width: 1, height: 1 })).toThrowError(
      "outside begin()/end()",
    );
  });
});

describe("PNG export", () => {
  it("encodes textures to valid PNG data", () => {
    const texture = new Texture(3, 2);
    texture.setPixel(0, 0, new Color(1, 0, 0, 1));
    texture.setPixel(1, 0, new Color(0, 1, 0, 1));
    texture.setPixel(2, 0, new Color(0, 0, 1, 1));
    texture.setPixel(0, 1, new Color(1, 1, 1, 0.5));

    const png = encodePng(texture);
    const decoded = decodeStoredPng(png);
    expect(decoded.width).toBe(3);
    expect(decoded.height).toBe(2);
    expect(Array.from(decoded.pixels.subarray(0, 4))).toEqual([255, 0, 0, 255]);
    expect(Array.from(decoded.pixels.subarray(4, 8))).toEqual([0, 255, 0, 255]);
    expect(Array.from(decoded.pixels.subarray(8, 12))).toEqual([0, 0, 255, 255]);
    expect(decoded.pixels[15]).toBe(128);
  });

  it("encodes larger images across deflate blocks", () => {
    const texture = Texture.checker(Colors.black, Colors.white, 1, 200, 2);
    const png = encodePng(texture);
    const decoded = decodeStoredPng(png);
    expect(decoded.width).toBe(200);
    expect(decoded.height).toBe(2);
    expect(Array.from(decoded.pixels.subarray(0, 4))).toEqual([0, 0, 0, 255]);
    expect(Array.from(decoded.pixels.subarray(4, 8))).toEqual([255, 255, 255, 255]);
  });
});
