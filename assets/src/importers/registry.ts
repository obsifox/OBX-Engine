import { mp3Importer, oggImporter, wavImporter } from "../importers/audio.js";
import { bmpImporter, jpgImporter, pngImporter, svgImporter, webpImporter } from "../importers/image.js";
import { fbxImporter, glbImporter, gltfImporter, objImporter } from "../importers/model.js";
import { extensionOf } from "../importers/paths.js";
import { jsonImporter, textImporter, ttfImporter } from "../importers/text.js";
import { ImportError, type AssetImporter } from "../importers/types.js";

export class ImporterRegistry {
  readonly #importers = new Map<string, AssetImporter>();
  readonly #byExtension = new Map<string, AssetImporter>();

  register(importer: AssetImporter): void {
    if (this.#importers.has(importer.name)) throw new ImportError(`importer already registered: ${importer.name}`, importer.name);
    this.#importers.set(importer.name, importer);
    for (const extension of importer.extensions) {
      this.#byExtension.set(extension.toLowerCase(), importer);
    }
  }

  unregister(name: string): boolean {
    const importer = this.#importers.get(name);
    if (!importer) return false;
    this.#importers.delete(name);
    for (const extension of importer.extensions) {
      if (this.#byExtension.get(extension.toLowerCase()) === importer) this.#byExtension.delete(extension.toLowerCase());
    }
    return true;
  }

  get(name: string): AssetImporter | null {
    return this.#importers.get(name) ?? null;
  }

  forPath(path: string): AssetImporter | null {
    return this.#byExtension.get(extensionOf(path)) ?? null;
  }

  names(): string[] {
    return [...this.#importers.keys()];
  }
}

export function createDefaultRegistry(): ImporterRegistry {
  const registry = new ImporterRegistry();
  for (const importer of [
    jsonImporter,
    textImporter,
    pngImporter,
    bmpImporter,
    jpgImporter,
    webpImporter,
    svgImporter,
    wavImporter,
    oggImporter,
    mp3Importer,
    gltfImporter,
    glbImporter,
    objImporter,
    ttfImporter,
    fbxImporter,
  ]) {
    registry.register(importer);
  }
  return registry;
}
