import { ascii, decodeText, viewOf } from "../importers/paths.js";
import { ImportError, type AssetImporter } from "../importers/types.js";

export const pngImporter: AssetImporter = {
  name: "png",
  extensions: ["png"],
  version: 1,
  import(context) {
    const { source } = context;
    if (source.length < 26 || ascii(source, 1, 3) !== "PNG") throw new ImportError("not a png file", context.path);
    const view = viewOf(source);
    const width = view.getUint32(16);
    const height = view.getUint32(20);
    return {
      type: "image",
      data: { format: "png", width, height, bitDepth: source[24], colorType: source[25] },
      dependencies: [],
      metadata: { width, height, format: "png" },
    };
  },
};

export const bmpImporter: AssetImporter = {
  name: "bmp",
  extensions: ["bmp"],
  version: 1,
  import(context) {
    const { source } = context;
    if (source.length < 26 || ascii(source, 0, 2) !== "BM") throw new ImportError("not a bmp file", context.path);
    const view = viewOf(source);
    const width = view.getInt32(18, true);
    const height = Math.abs(view.getInt32(22, true));
    return {
      type: "image",
      data: { format: "bmp", width, height },
      dependencies: [],
      metadata: { width, height, format: "bmp" },
    };
  },
};

export const jpgImporter: AssetImporter = {
  name: "jpg",
  extensions: ["jpg", "jpeg"],
  version: 1,
  import(context) {
    const { source } = context;
    if (source.length < 4 || source[0] !== 0xff || source[1] !== 0xd8) throw new ImportError("not a jpeg file", context.path);
    let offset = 2;
    let width = 0;
    let height = 0;
    while (offset + 9 < source.length) {
      if (source[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = source[offset + 1]!;
      const length = (source[offset + 2]! << 8) | source[offset + 3]!;
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        height = (source[offset + 5]! << 8) | source[offset + 6]!;
        width = (source[offset + 7]! << 8) | source[offset + 8]!;
        break;
      }
      offset += 2 + length;
    }
    return {
      type: "image",
      data: { format: "jpg", width, height },
      dependencies: [],
      metadata: { width, height, format: "jpg" },
    };
  },
};

export const webpImporter: AssetImporter = {
  name: "webp",
  extensions: ["webp"],
  version: 1,
  import(context) {
    const { source } = context;
    if (source.length < 16 || ascii(source, 0, 4) !== "RIFF" || ascii(source, 8, 4) !== "WEBP") {
      throw new ImportError("not a webp file", context.path);
    }
    const chunk = ascii(source, 12, 4);
    let width = 0;
    let height = 0;
    if (chunk === "VP8 " && source.length >= 30) {
      width = ((source[26]! << 8) | source[25]!) & 0x3fff;
      height = ((source[28]! << 8) | source[27]!) & 0x3fff;
    } else if (chunk === "VP8L" && source.length >= 25) {
      const bits = source[21]! | (source[22]! << 8) | (source[23]! << 16) | (source[24]! << 24);
      width = (bits & 0x3fff) + 1;
      height = ((bits >> 14) & 0x3fff) + 1;
    } else if (chunk === "VP8X" && source.length >= 30) {
      width = (source[24]! | (source[25]! << 8) | (source[26]! << 16)) + 1;
      height = (source[27]! | (source[28]! << 8) | (source[29]! << 16)) + 1;
    }
    return {
      type: "image",
      data: { format: "webp", width, height, chunk },
      dependencies: [],
      metadata: { width, height, format: "webp" },
    };
  },
};

export const svgImporter: AssetImporter = {
  name: "svg",
  extensions: ["svg"],
  version: 1,
  import(context) {
    const text = decodeText(context.source);
    const width = /<svg[^>]*\swidth="([\d.]+)/.exec(text);
    const height = /<svg[^>]*\sheight="([\d.]+)/.exec(text);
    const viewBox = /viewBox="([\d.\s-]+)"/.exec(text);
    return {
      type: "image",
      data: {
        format: "svg",
        width: width ? Number(width[1]) : 0,
        height: height ? Number(height[1]) : 0,
        viewBox: viewBox ? viewBox[1]!.trim() : null,
      },
      dependencies: [],
      metadata: { format: "svg", vector: true },
    };
  },
};

