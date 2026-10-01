export type BidiClass = "L" | "R" | "AL" | "EN" | "ES" | "ET" | "AN" | "CS" | "NSM" | "BN" | "B" | "S" | "WS" | "ON";

export function codePoints(text: string): number[] {
  const points: number[] = [];
  for (const character of text) {
    points.push(character.codePointAt(0)!);
  }
  return points;
}

export function fromCodePoints(points: readonly number[]): string {
  return String.fromCodePoint(...points);
}

export function isCombiningMark(codePoint: number): boolean {
  return (
    (codePoint >= 0x0300 && codePoint <= 0x036f) ||
    (codePoint >= 0x0483 && codePoint <= 0x0489) ||
    (codePoint >= 0x0591 && codePoint <= 0x05bd) ||
    (codePoint >= 0x0610 && codePoint <= 0x061a) ||
    (codePoint >= 0x064b && codePoint <= 0x065f) ||
    (codePoint >= 0x0670 && codePoint <= 0x0670) ||
    (codePoint >= 0x06d6 && codePoint <= 0x06dc)
  );
}

export function isRtlCodePoint(codePoint: number): boolean {
  return (
    (codePoint >= 0x0590 && codePoint <= 0x05ff) ||
    (codePoint >= 0x0600 && codePoint <= 0x06ff) ||
    (codePoint >= 0x0700 && codePoint <= 0x074f) ||
    (codePoint >= 0x0750 && codePoint <= 0x077f) ||
    (codePoint >= 0x08a0 && codePoint <= 0x08ff) ||
    (codePoint >= 0xfb1d && codePoint <= 0xfb4f) ||
    (codePoint >= 0xfb50 && codePoint <= 0xfdff) ||
    (codePoint >= 0xfe70 && codePoint <= 0xfeff)
  );
}

export function isArabicCodePoint(codePoint: number): boolean {
  return (codePoint >= 0x0600 && codePoint <= 0x06ff) || (codePoint >= 0xfb50 && codePoint <= 0xfdff) || (codePoint >= 0xfe70 && codePoint <= 0xfeff);
}

export function bidiClass(codePoint: number): BidiClass {
  if (codePoint === 0x000a || codePoint === 0x000d || codePoint === 0x001c || codePoint === 0x001d || codePoint === 0x001e || codePoint === 0x0085 || codePoint === 0x2029) return "B";
  if (codePoint === 0x0009 || codePoint === 0x000b || codePoint === 0x001f || codePoint === 0x2028) return "S";
  if (codePoint === 0x000c || codePoint === 0x0020) return "WS";
  if (codePoint >= 0x0030 && codePoint <= 0x0039) return "EN";
  if (codePoint === 0x002b || codePoint === 0x002d) return "ES";
  if (codePoint === 0x0023 || codePoint === 0x0024 || codePoint === 0x0025 || codePoint === 0x00a2 || codePoint === 0x00a3 || codePoint === 0x00a4 || codePoint === 0x00a5) return "ET";
  if (isCombiningMark(codePoint)) return "NSM";
  if (isRtlCodePoint(codePoint)) {
    if (isArabicCodePoint(codePoint) && !(codePoint >= 0x0660 && codePoint <= 0x0669) && !(codePoint >= 0x06f0 && codePoint <= 0x06f9)) return "AL";
    return "R";
  }
  if ((codePoint >= 0x0660 && codePoint <= 0x0669) || (codePoint >= 0x06f0 && codePoint <= 0x06f9)) return "AN";
  if (codePoint < 0x20 || (codePoint >= 0x7f && codePoint <= 0x9f)) return "BN";
  return "L";
}

export const MIRROR_PAIRS: Record<number, number> = {
  0x0028: 0x0029,
  0x0029: 0x0028,
  0x003c: 0x003e,
  0x003e: 0x003c,
  0x005b: 0x005d,
  0x005d: 0x005b,
  0x007b: 0x007d,
  0x007d: 0x007b,
  0x2039: 0x203a,
  0x203a: 0x2039,
};

export function mirrorCodePoint(codePoint: number): number {
  return MIRROR_PAIRS[codePoint] ?? codePoint;
}

export interface GraphemeCluster {
  codePoints: number[];
}

export function graphemeClusters(text: string): GraphemeCluster[] {
  const clusters: GraphemeCluster[] = [];
  for (const point of codePoints(text)) {
    if (clusters.length > 0 && isCombiningMark(point)) {
      clusters[clusters.length - 1]!.codePoints.push(point);
    } else {
      clusters.push({ codePoints: [point] });
    }
  }
  return clusters;
}

export type ArabicJoiningForm = "isolated" | "initial" | "medial" | "final";

const ARABIC_DUAL_JOINING = new Set([0x0628, 0x062a, 0x062b, 0x062c, 0x062d, 0x062e, 0x0633, 0x0634, 0x0635, 0x0636, 0x0639, 0x063a, 0x0642, 0x0644, 0x0645, 0x0646, 0x0647, 0x064a]);
const ARABIC_RIGHT_JOINING = new Set([0x0627, 0x0623, 0x0625, 0x0622, 0x062f, 0x0630, 0x0631, 0x0632, 0x0648, 0x0629]);

export function arabicJoiningForm(before: number | null, current: number, after: number | null): ArabicJoiningForm {
  const joinsRight = ARABIC_RIGHT_JOINING.has(current) || ARABIC_DUAL_JOINING.has(current);
  const joinsLeft = ARABIC_DUAL_JOINING.has(current);
  const beforeConnects = before !== null && ARABIC_DUAL_JOINING.has(before);
  const afterConnects = after !== null && joinsLeft && (ARABIC_DUAL_JOINING.has(after) || ARABIC_RIGHT_JOINING.has(after));
  if (joinsRight && joinsLeft) {
    if (beforeConnects && afterConnects) return "medial";
    if (beforeConnects) return "final";
    if (afterConnects) return "initial";
    return "isolated";
  }
  if (joinsRight) {
    return beforeConnects ? "final" : "isolated";
  }
  return "isolated";
}

export function arabicForms(text: string): { codePoint: number; form: ArabicJoiningForm }[] {
  const points = codePoints(text).filter((point) => !isCombiningMark(point));
  return points.map((current, index) => ({
    codePoint: current,
    form: arabicJoiningForm(points[index - 1] ?? null, current, points[index + 1] ?? null),
  }));
}
