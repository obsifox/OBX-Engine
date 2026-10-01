import { bidiClass, codePoints, fromCodePoints, mirrorCodePoint, isRtlCodePoint } from "./unicode.js";
import type { BidiClass } from "./unicode.js";

export type ParagraphDirection = "ltr" | "rtl";

export interface BidiRun {
  start: number;
  end: number;
  direction: ParagraphDirection;
  level: number;
}

export interface BidiResult {
  direction: ParagraphDirection;
  runs: BidiRun[];
  visual: string;
  logicalToVisual: number[];
  visualToLogical: number[];
}

export function detectParagraphDirection(text: string): ParagraphDirection {
  for (const point of codePoints(text)) {
    const kind = bidiClass(point);
    if (kind === "L") return "ltr";
    if (kind === "R" || kind === "AL") return "rtl";
  }
  return "ltr";
}

function resolveLevels(points: readonly number[], base: ParagraphDirection): number[] {
  const baseLevel = base === "rtl" ? 1 : 0;
  return points.map((point) => {
    const kind = bidiClass(point);
    if (kind === "R" || kind === "AL") return baseLevel === 0 ? 1 : baseLevel;
    if (kind === "L") return baseLevel === 1 ? 2 : baseLevel;
    if (kind === "EN" || kind === "AN") return baseLevel + 1;
    return baseLevel;
  });
}

function buildRuns(levels: readonly number[]): BidiRun[] {
  const runs: BidiRun[] = [];
  let start = 0;
  for (let i = 1; i <= levels.length; i += 1) {
    if (i === levels.length || levels[i] !== levels[start]) {
      const level = levels[start]!;
      runs.push({ start, end: i, direction: level % 2 === 1 ? "rtl" : "ltr", level });
      start = i;
    }
  }
  return runs;
}

export function resolveBidi(text: string, base?: ParagraphDirection): BidiResult {
  const direction = base ?? detectParagraphDirection(text);
  const points = codePoints(text);
  const levels = resolveLevels(points, direction);
  const mirrored = points.map((point, index) => (levels[index]! % 2 === 1 ? mirrorCodePoint(point) : point));
  const order = points.map((_, index) => index);
  const maxLevel = levels.length > 0 ? Math.max(...levels) : 0;
  for (let level = maxLevel; level >= 1; level -= 1) {
    let runStart = 0;
    while (runStart < order.length) {
      if (levels[order[runStart]!]! < level) {
        runStart += 1;
        continue;
      }
      let runEnd = runStart;
      while (runEnd < order.length && levels[order[runEnd]!]! >= level) runEnd += 1;
      for (let left = runStart, right = runEnd - 1; left < right; left += 1, right -= 1) {
        const swap = order[left]!;
        order[left] = order[right]!;
        order[right] = swap;
      }
      runStart = runEnd;
    }
  }
  const visualPoints = order.map((index) => mirrored[index]!);
  const logicalToVisual = new Array<number>(order.length).fill(0);
  for (let visual = 0; visual < order.length; visual += 1) {
    logicalToVisual[order[visual]!] = visual;
  }
  return {
    direction,
    runs: buildRuns(levels),
    visual: fromCodePoints(visualPoints),
    logicalToVisual,
    visualToLogical: order,
  };
}

export function visualLines(text: string, maxVisualWidth: number, base?: ParagraphDirection): string[] {
  const resolved = resolveBidi(text, base);
  const lines: string[] = [];
  let current: number[] = [];
  for (const point of codePoints(resolved.visual)) {
    current.push(point);
    if (current.length >= maxVisualWidth) {
      lines.push(fromCodePoints(current));
      current = [];
    }
  }
  if (current.length > 0) lines.push(fromCodePoints(current));
  return lines;
}

export function isRtlText(text: string): boolean {
  return detectParagraphDirection(text) === "rtl";
}

export function logicalOrderRuns(text: string, base?: ParagraphDirection): { text: string; direction: ParagraphDirection }[] {
  const resolved = resolveBidi(text, base);
  const points = codePoints(text);
  return resolved.runs.map((run) => ({
    text: fromCodePoints(points.slice(run.start, run.end).map((point) => (run.direction === "rtl" ? mirrorCodePoint(point) : point))),
    direction: run.direction,
  }));
}

export function strongestDirection(text: string): { ltr: number; rtl: number } {
  let ltr = 0;
  let rtl = 0;
  for (const point of codePoints(text)) {
    const kind: BidiClass = bidiClass(point);
    if (kind === "L" || kind === "EN") ltr += 1;
    if (kind === "R" || kind === "AL" || kind === "AN") rtl += 1;
    if (isRtlCodePoint(point)) rtl += 0;
  }
  return { ltr, rtl };
}
