export class Color {
  constructor(
    public r = 1,
    public g = 1,
    public b = 1,
    public a = 1,
  ) {}

  static fromRgba8(r: number, g: number, b: number, a = 255): Color {
    return new Color(r / 255, g / 255, b / 255, a / 255);
  }

  static fromHex(hex: string): Color {
    const value = hex.replace("#", "").trim();
    const full =
      value.length === 3 || value.length === 4
        ? value
            .split("")
            .map((c) => c + c)
            .join("")
        : value;
    const num = Number.parseInt(full, 16);
    if (Number.isNaN(num) || full.length < 6) {
      throw new RangeError(`Invalid hex color: ${hex}`);
    }
    const r = (num >> 16) & 0xff;
    const g = (num >> 8) & 0xff;
    const b = num & 0xff;
    const a = full.length >= 8 ? (num & 0xff) : 255;
    return Color.fromRgba8(r, g, b, a);
  }

  static lerp(a: Color, b: Color, t: number, out = new Color()): Color {
    return out.set(
      a.r + (b.r - a.r) * t,
      a.g + (b.g - a.g) * t,
      a.b + (b.b - a.b) * t,
      a.a + (b.a - a.a) * t,
    );
  }

  set(r: number, g: number, b: number, a = this.a): this {
    this.r = r;
    this.g = g;
    this.b = b;
    this.a = a;
    return this;
  }

  clone(): Color {
    return new Color(this.r, this.g, this.b, this.a);
  }

  copy(c: Color): this {
    return this.set(c.r, c.g, c.b, c.a);
  }

  multiply(c: Color): this {
    this.r *= c.r;
    this.g *= c.g;
    this.b *= c.b;
    this.a *= c.a;
    return this;
  }

  withAlpha(a: number): Color {
    return new Color(this.r, this.g, this.b, a);
  }

  toRgba8(): [number, number, number, number] {
    return [
      Math.round(Math.min(1, Math.max(0, this.r)) * 255),
      Math.round(Math.min(1, Math.max(0, this.g)) * 255),
      Math.round(Math.min(1, Math.max(0, this.b)) * 255),
      Math.round(Math.min(1, Math.max(0, this.a)) * 255),
    ];
  }

  toHex(): string {
    const [r, g, b] = this.toRgba8();
    return "#" + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1).toUpperCase();
  }

  toCss(): string {
    const [r, g, b] = this.toRgba8();
    const alpha = Math.min(Math.max(this.a, 0), 1);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  equals(c: Color, epsilon = 1e-9): boolean {
    return (
      Math.abs(c.r - this.r) <= epsilon &&
      Math.abs(c.g - this.g) <= epsilon &&
      Math.abs(c.b - this.b) <= epsilon &&
      Math.abs(c.a - this.a) <= epsilon
    );
  }
}

export const Colors = {
  black: new Color(0, 0, 0, 1),
  white: new Color(1, 1, 1, 1),
  transparent: new Color(0, 0, 0, 0),
  foxOrange: Color.fromHex("#FF6A1A"),
  ember: Color.fromHex("#FFB020"),
  signalCyan: Color.fromHex("#41E0FF"),
  obsidian: Color.fromHex("#0B0E14"),
  surface: Color.fromHex("#1B2333"),
  light: Color.fromHex("#E8ECF2"),
  slate: Color.fromHex("#8A94A6"),
} as const;
