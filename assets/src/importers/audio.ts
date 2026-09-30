import { ascii, viewOf } from "../importers/paths.js";
import { ImportError, type AssetImporter } from "../importers/types.js";

export const wavImporter: AssetImporter = {
  name: "wav",
  extensions: ["wav"],
  version: 1,
  import(context) {
    const { source } = context;
    if (source.length < 44 || ascii(source, 0, 4) !== "RIFF" || ascii(source, 8, 4) !== "WAVE") {
      throw new ImportError("not a wav file", context.path);
    }
    const view = viewOf(source);
    let offset = 12;
    let channels = 0;
    let sampleRate = 0;
    let bitsPerSample = 0;
    while (offset + 8 <= source.length) {
      const id = ascii(source, offset, 4);
      const size = view.getUint32(offset + 4, true);
      if (id === "fmt ") {
        channels = view.getUint16(offset + 10, true);
        sampleRate = view.getUint32(offset + 12, true);
        bitsPerSample = view.getUint16(offset + 22, true);
      }
      offset += 8 + size + (size % 2);
    }
    return {
      type: "audio",
      data: { format: "wav", channels, sampleRate, bitsPerSample },
      dependencies: [],
      metadata: { format: "wav", channels, sampleRate },
    };
  },
};

export const oggImporter: AssetImporter = {
  name: "ogg",
  extensions: ["ogg"],
  version: 1,
  import(context) {
    const { source } = context;
    if (source.length < 36 || ascii(source, 0, 4) !== "OggS") throw new ImportError("not an ogg file", context.path);
    const view = viewOf(source);
    return {
      type: "audio",
      data: { format: "ogg", channels: source[39] ?? 0, sampleRate: view.getUint32(40, true) },
      dependencies: [],
      metadata: { format: "ogg" },
    };
  },
};

export const mp3Importer: AssetImporter = {
  name: "mp3",
  extensions: ["mp3"],
  version: 1,
  import(context) {
    const { source } = context;
    if (source.length < 4) throw new ImportError("not an mp3 file", context.path);
    const hasId3 = ascii(source, 0, 3) === "ID3";
    const hasFrame = source[0] === 0xff && (source[1]! & 0xe0) === 0xe0;
    if (!hasId3 && !hasFrame) throw new ImportError("not an mp3 file", context.path);
    return {
      type: "audio",
      data: { format: "mp3", id3: hasId3 },
      dependencies: [],
      metadata: { format: "mp3" },
    };
  },
};

