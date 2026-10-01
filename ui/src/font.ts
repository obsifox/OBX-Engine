export type GlyphCommandKind = "move" | "line" | "quad";

export interface GlyphCommand {
  kind: GlyphCommandKind;
  points: [number, number][];
}

export interface GlyphMetric {
  advance: number;
  commands: GlyphCommand[];
}

export interface BitmapGlyph {
  width: number;
  height: number;
  advance: number;
  coverage: Uint8Array;
}

const STROKE_FONT: Record<string, number[][]> = {
  " ": [],
  "!": [[0.5, 0, 0.5, 0.7], [0.5, 0.85, 0.5, 0.9]],
  "\"": [[0.3, 0.9, 0.3, 0.7], [0.7, 0.9, 0.7, 0.7]],
  "#": [[0.3, 0, 0.35, 0.9], [0.7, 0, 0.75, 0.9], [0.1, 0.3, 0.9, 0.3], [0.1, 0.6, 0.9, 0.6]],
  "%": [[0.15, 0, 0.85, 0.9], [0.2, 0.75, 0.35, 0.9], [0.65, 0, 0.8, 0.15]],
  "(": [[0.6, 0, 0.35, 0.25, 0.35, 0.65, 0.6, 0.9]],
  ")": [[0.4, 0, 0.65, 0.25, 0.65, 0.65, 0.4, 0.9]],
  "*": [[0.5, 0.15, 0.5, 0.75], [0.25, 0.3, 0.75, 0.6], [0.75, 0.3, 0.25, 0.6]],
  "+": [[0.5, 0.15, 0.5, 0.75], [0.2, 0.45, 0.8, 0.45]],
  ",": [[0.55, 0.1, 0.45, -0.15]],
  "-": [[0.2, 0.45, 0.8, 0.45]],
  ".": [[0.45, 0, 0.55, 0]],
  "/": [[0.15, 0, 0.85, 0.9]],
  "0": [[0.25, 0, 0.75, 0, 0.75, 0.9, 0.25, 0.9, 0.25, 0]],
  "1": [[0.3, 0.75, 0.55, 0.9, 0.55, 0], [0.3, 0, 0.8, 0]],
  "2": [[0.2, 0.75, 0.25, 0.9, 0.75, 0.9, 0.8, 0.75, 0.8, 0.55, 0.2, 0.15, 0.2, 0, 0.85, 0]],
  "3": [[0.2, 0.9, 0.8, 0.9, 0.45, 0.55, 0.8, 0.55, 0.8, 0.15, 0.7, 0, 0.25, 0, 0.15, 0.12]],
  "4": [[0.65, 0, 0.65, 0.9], [0.65, 0.9, 0.15, 0.3, 0.85, 0.3]],
  "5": [[0.8, 0.9, 0.2, 0.9, 0.2, 0.55, 0.7, 0.55, 0.8, 0.45, 0.8, 0.15, 0.65, 0, 0.25, 0, 0.15, 0.1]],
  "6": [[0.75, 0.9, 0.3, 0.9, 0.2, 0.75, 0.2, 0.15, 0.3, 0, 0.7, 0, 0.8, 0.15, 0.8, 0.35, 0.7, 0.5, 0.3, 0.5, 0.2, 0.35]],
  "7": [[0.15, 0.9, 0.85, 0.9, 0.4, 0]],
  "8": [[0.3, 0.5, 0.2, 0.65, 0.2, 0.8, 0.3, 0.9, 0.7, 0.9, 0.8, 0.8, 0.8, 0.65, 0.7, 0.5, 0.3, 0.5, 0.2, 0.35, 0.2, 0.15, 0.3, 0, 0.7, 0, 0.8, 0.15, 0.8, 0.35, 0.7, 0.5]],
  "9": [[0.85, 0.15, 0.7, 0, 0.3, 0, 0.2, 0.15, 0.2, 0.35, 0.3, 0.5, 0.7, 0.5, 0.8, 0.65, 0.8, 0.85, 0.7, 1, 0.3, 1]],
  ":": [[0.5, 0.15, 0.5, 0.2], [0.5, 0.6, 0.5, 0.65]],
  ";": [[0.5, 0.6, 0.5, 0.65], [0.55, 0.15, 0.45, -0.1]],
  "<": [[0.75, 0.8, 0.25, 0.45, 0.75, 0.1]],
  "=": [[0.2, 0.3, 0.8, 0.3], [0.2, 0.6, 0.8, 0.6]],
  ">": [[0.25, 0.8, 0.75, 0.45, 0.25, 0.1]],
  "?": [[0.2, 0.75, 0.25, 0.9, 0.75, 0.9, 0.8, 0.75, 0.8, 0.6, 0.5, 0.4, 0.5, 0.25], [0.5, 0.1, 0.5, 0.12]],
  "@": [[0.7, 0.25, 0.4, 0.25, 0.4, 0.55, 0.7, 0.55, 0.7, 0.25, 0.8, 0.35, 0.8, 0.75, 0.6, 0.9, 0.3, 0.9, 0.15, 0.75, 0.15, 0.2, 0.3, 0.05, 0.6, 0.05, 0.85, 0.2]],
  "A": [[0.5, 0.9, 0.15, 0, 0.85, 0], [0.5, 0.9, 0.28, 0.35]],
  "B": [[0.2, 0, 0.2, 0.9, 0.7, 0.9, 0.8, 0.8, 0.8, 0.62, 0.7, 0.52, 0.2, 0.52], [0.7, 0.52, 0.82, 0.42, 0.82, 0.12, 0.7, 0, 0.2, 0]],
  "C": [[0.82, 0.75, 0.7, 0.9, 0.35, 0.9, 0.18, 0.72, 0.18, 0.22, 0.35, 0.04, 0.7, 0.04, 0.82, 0.18]],
  "D": [[0.2, 0, 0.2, 0.9, 0.62, 0.9, 0.82, 0.7, 0.82, 0.22, 0.62, 0.02, 0.2, 0.02]],
  "E": [[0.8, 0.9, 0.2, 0.9, 0.2, 0, 0.8, 0], [0.2, 0.5, 0.65, 0.5]],
  "F": [[0.8, 0.9, 0.2, 0.9, 0.2, 0], [0.2, 0.5, 0.65, 0.5]],
  "G": [[0.82, 0.75, 0.7, 0.9, 0.35, 0.9, 0.18, 0.72, 0.18, 0.22, 0.35, 0.04, 0.7, 0.04, 0.82, 0.2, 0.82, 0.45, 0.55, 0.45]],
  "H": [[0.2, 0.9, 0.2, 0], [0.8, 0.9, 0.8, 0], [0.2, 0.5, 0.8, 0.5]],
  "I": [[0.5, 0, 0.5, 0.9], [0.3, 0, 0.7, 0], [0.3, 0.9, 0.7, 0.9]],
  "J": [[0.75, 0.9, 0.75, 0.2, 0.6, 0.02, 0.35, 0.02, 0.2, 0.18]],
  "K": [[0.2, 0.9, 0.2, 0], [0.8, 0.9, 0.2, 0.42], [0.4, 0.55, 0.85, 0]],
  "L": [[0.2, 0.9, 0.2, 0, 0.8, 0]],
  "M": [[0.15, 0, 0.15, 0.9, 0.5, 0.35, 0.85, 0.9, 0.85, 0]],
  "N": [[0.2, 0, 0.2, 0.9, 0.8, 0, 0.8, 0.9]],
  "O": [[0.3, 0, 0.18, 0.2, 0.18, 0.7, 0.3, 0.9, 0.7, 0.9, 0.82, 0.7, 0.82, 0.2, 0.7, 0, 0.3, 0]],
  "P": [[0.2, 0, 0.2, 0.9, 0.7, 0.9, 0.8, 0.8, 0.8, 0.6, 0.7, 0.5, 0.2, 0.5]],
  "Q": [[0.3, 0, 0.18, 0.2, 0.18, 0.7, 0.3, 0.9, 0.7, 0.9, 0.82, 0.7, 0.82, 0.2, 0.7, 0, 0.3, 0], [0.6, 0.25, 0.88, -0.05]],
  "R": [[0.2, 0, 0.2, 0.9, 0.7, 0.9, 0.8, 0.8, 0.8, 0.6, 0.7, 0.5, 0.2, 0.5], [0.5, 0.5, 0.85, 0]],
  "S": [[0.82, 0.75, 0.7, 0.9, 0.32, 0.9, 0.18, 0.78, 0.18, 0.62, 0.32, 0.5, 0.7, 0.5, 0.82, 0.38, 0.82, 0.18, 0.68, 0.03, 0.32, 0.03, 0.18, 0.15]],
  "T": [[0.5, 0, 0.5, 0.9], [0.15, 0.9, 0.85, 0.9]],
  "U": [[0.2, 0.9, 0.2, 0.2, 0.32, 0.03, 0.68, 0.03, 0.8, 0.2, 0.8, 0.9]],
  "V": [[0.15, 0.9, 0.5, 0, 0.85, 0.9]],
  "W": [[0.1, 0.9, 0.3, 0, 0.5, 0.55, 0.7, 0, 0.9, 0.9]],
  "X": [[0.15, 0.9, 0.85, 0], [0.85, 0.9, 0.15, 0]],
  "Y": [[0.15, 0.9, 0.5, 0.45, 0.85, 0.9], [0.5, 0.45, 0.5, 0]],
  "Z": [[0.15, 0.9, 0.85, 0.9, 0.15, 0, 0.85, 0]],
  "[": [[0.65, 0, 0.35, 0, 0.35, 0.9, 0.65, 0.9]],
  "]": [[0.35, 0, 0.65, 0, 0.65, 0.9, 0.35, 0.9]],
  "_": [[0.1, -0.08, 0.9, -0.08]],
  "a": [[0.7, 0.65, 0.3, 0.65, 0.25, 0.5, 0.25, 0.15, 0.35, 0.02, 0.65, 0.02, 0.72, 0.15], [0.72, 0.65, 0.72, 0]],
  "b": [[0.25, 0.9, 0.25, 0], [0.25, 0.55, 0.45, 0.68, 0.65, 0.68, 0.72, 0.55, 0.72, 0.15, 0.6, 0.02, 0.4, 0.02, 0.25, 0.15]],
  "c": [[0.72, 0.55, 0.6, 0.68, 0.4, 0.68, 0.26, 0.55, 0.26, 0.15, 0.4, 0.02, 0.6, 0.02, 0.72, 0.15]],
  "d": [[0.72, 0.9, 0.72, 0], [0.72, 0.55, 0.58, 0.68, 0.38, 0.68, 0.26, 0.55, 0.26, 0.15, 0.38, 0.02, 0.58, 0.02, 0.72, 0.15]],
  "e": [[0.26, 0.35, 0.74, 0.35, 0.74, 0.55, 0.6, 0.68, 0.4, 0.68, 0.26, 0.55, 0.26, 0.15, 0.4, 0.02, 0.72, 0.1]],
  "f": [[0.7, 0.85, 0.55, 0.9, 0.45, 0.9, 0.4, 0.8, 0.4, 0], [0.25, 0.55, 0.65, 0.55]],
  "g": [[0.72, 0.68, 0.72, -0.12, 0.6, -0.25, 0.35, -0.25, 0.25, -0.15], [0.72, 0.55, 0.58, 0.68, 0.38, 0.68, 0.26, 0.55, 0.26, 0.15, 0.38, 0.02, 0.58, 0.02, 0.72, 0.15]],
  "h": [[0.25, 0.9, 0.25, 0], [0.25, 0.5, 0.42, 0.68, 0.6, 0.68, 0.72, 0.55, 0.72, 0]],
  "i": [[0.5, 0.65, 0.5, 0], [0.5, 0.82, 0.5, 0.85]],
  "j": [[0.6, 0.65, 0.6, -0.12, 0.48, -0.25, 0.32, -0.22], [0.6, 0.82, 0.6, 0.85]],
  "k": [[0.25, 0.9, 0.25, 0], [0.68, 0.65, 0.25, 0.28], [0.42, 0.4, 0.72, 0]],
  "l": [[0.5, 0.9, 0.5, 0.1, 0.6, 0.02]],
  "m": [[0.2, 0.65, 0.2, 0], [0.2, 0.52, 0.32, 0.68, 0.45, 0.68, 0.52, 0.52, 0.52, 0], [0.52, 0.52, 0.64, 0.68, 0.78, 0.68, 0.85, 0.52, 0.85, 0]],
  "n": [[0.25, 0.65, 0.25, 0], [0.25, 0.52, 0.4, 0.68, 0.58, 0.68, 0.72, 0.52, 0.72, 0]],
  "o": [[0.4, 0.68, 0.28, 0.55, 0.28, 0.15, 0.4, 0.02, 0.6, 0.02, 0.72, 0.15, 0.72, 0.55, 0.6, 0.68, 0.4, 0.68]],
  "p": [[0.25, 0.65, 0.25, -0.25], [0.25, 0.55, 0.4, 0.68, 0.6, 0.68, 0.72, 0.55, 0.72, 0.15, 0.6, 0.02, 0.4, 0.02, 0.25, 0.15]],
  "q": [[0.72, 0.65, 0.72, -0.25], [0.72, 0.55, 0.58, 0.68, 0.38, 0.68, 0.26, 0.55, 0.26, 0.15, 0.38, 0.02, 0.58, 0.02, 0.72, 0.15]],
  "r": [[0.3, 0.65, 0.3, 0], [0.3, 0.45, 0.45, 0.65, 0.68, 0.68]],
  "s": [[0.7, 0.58, 0.58, 0.68, 0.38, 0.68, 0.28, 0.58, 0.28, 0.48, 0.4, 0.4, 0.62, 0.35, 0.72, 0.25, 0.72, 0.12, 0.6, 0.02, 0.38, 0.02, 0.26, 0.12]],
  "t": [[0.45, 0.9, 0.45, 0.15, 0.58, 0.02, 0.7, 0.05], [0.25, 0.65, 0.68, 0.65]],
  "u": [[0.25, 0.65, 0.25, 0.15, 0.38, 0.02, 0.58, 0.02, 0.72, 0.15], [0.72, 0.65, 0.72, 0]],
  "v": [[0.2, 0.65, 0.5, 0, 0.8, 0.65]],
  "w": [[0.15, 0.65, 0.32, 0, 0.5, 0.45, 0.68, 0, 0.85, 0.65]],
  "x": [[0.22, 0.65, 0.78, 0], [0.78, 0.65, 0.22, 0]],
  "y": [[0.2, 0.65, 0.5, 0], [0.8, 0.65, 0.45, -0.22]],
  "z": [[0.22, 0.65, 0.78, 0.65, 0.22, 0, 0.78, 0]],
  "{": [[0.65, 0, 0.45, 0, 0.45, 0.35, 0.3, 0.45, 0.45, 0.55, 0.45, 0.9, 0.65, 0.9]],
  "|": [[0.5, 0, 0.5, 0.9]],
  "}": [[0.35, 0, 0.55, 0, 0.55, 0.35, 0.7, 0.45, 0.55, 0.55, 0.55, 0.9, 0.35, 0.9]],
};

function strokesToCommands(strokes: number[][]): GlyphCommand[] {
  const commands: GlyphCommand[] = [];
  for (const stroke of strokes) {
    if (stroke.length < 4) continue;
    commands.push({ kind: "move", points: [[stroke[0]!, stroke[1]!]] });
    for (let i = 2; i + 1 < stroke.length; i += 2) {
      commands.push({ kind: "line", points: [[stroke[i]!, stroke[i + 1]!]] });
    }
  }
  return commands;
}

export class VectorFont {
  glyphs = new Map<string, GlyphMetric>();
  ascent = 0.92;
  descent = -0.12;

  constructor() {
    for (const [character, strokes] of Object.entries(STROKE_FONT)) {
      this.glyphs.set(character, { advance: character === " " ? 0.42 : 0.86, commands: strokesToCommands(strokes) });
    }
  }

  registerGlyph(character: string, metric: GlyphMetric): void {
    this.glyphs.set(character, metric);
  }

  getGlyph(character: string): GlyphMetric {
    return this.glyphs.get(character) ?? this.glyphs.get("?")!;
  }

  measure(text: string, fontSize: number): { width: number; height: number } {
    let width = 0;
    for (const character of text) {
      width += this.getGlyph(character).advance * fontSize;
    }
    return { width, height: (this.ascent - this.descent) * fontSize };
  }
}

let sharedFont: VectorFont | null = null;

export function defaultFont(): VectorFont {
  if (!sharedFont) sharedFont = new VectorFont();
  return sharedFont;
}

export class GlyphRenderer {
  font: VectorFont;
  scale: number;

  constructor(font: VectorFont = defaultFont(), scale = 24) {
    this.font = font;
    this.scale = scale;
  }

  rasterizeGlyph(character: string): BitmapGlyph {
    const metric = this.font.getGlyph(character);
    const size = this.scale;
    const width = Math.max(2, Math.ceil(metric.advance * size) + 2);
    const height = Math.max(2, Math.ceil((this.font.ascent - this.font.descent) * size) + 2);
    const coverage = new Uint8Array(width * height);
    for (const command of metric.commands) {
      if (command.kind === "move") continue;
      const previous = metric.commands[metric.commands.indexOf(command) - 1];
      const from = previous && previous.points.length > 0 ? previous.points[previous.points.length - 1]! : command.points[0]!;
      const to = command.points[0]!;
      this.#drawLine(coverage, width, height, from[0] * size + 1, height - this.font.ascent * size + from[1] * size * -1 + this.font.ascent * size - 1, to[0] * size + 1, height - this.font.ascent * size + to[1] * size * -1 + this.font.ascent * size - 1);
    }
    return { width, height, advance: Math.round(metric.advance * size), coverage };
  }

  rasterizeText(text: string): { width: number; height: number; coverage: Uint8Array } {
    const height = Math.max(2, Math.ceil((this.font.ascent - this.font.descent) * this.scale) + 2);
    let totalAdvance = 0;
    const glyphs: BitmapGlyph[] = [];
    for (const character of text) {
      const glyph = this.rasterizeGlyph(character);
      glyphs.push(glyph);
      totalAdvance += glyph.advance;
    }
    const width = Math.max(2, totalAdvance + 2);
    const coverage = new Uint8Array(width * height);
    let cursor = 1;
    for (const glyph of glyphs) {
      for (let y = 0; y < glyph.height; y += 1) {
        for (let x = 0; x < glyph.width; x += 1) {
          const value = glyph.coverage[y * glyph.width + x]!;
          if (value === 0) continue;
          const index = y * width + cursor + x;
          if (index >= 0 && index < coverage.length) coverage[index] = Math.max(coverage[index]!, value);
        }
      }
      cursor += glyph.advance;
    }
    return { width, height, coverage };
  }

  #drawLine(coverage: Uint8Array, width: number, height: number, x0: number, y0: number, x1: number, y1: number): void {
    const steps = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2));
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const x = Math.round(x0 + (x1 - x0) * t);
      const y = Math.round(y0 + (y1 - y0) * t);
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const px = x + dx;
          const py = y + dy;
          if (px < 0 || py < 0 || px >= width || py >= height) continue;
          const strength = dx === 0 && dy === 0 ? 255 : 120;
          coverage[py * width + px] = Math.max(coverage[py * width + px]!, strength);
        }
      }
    }
  }
}
