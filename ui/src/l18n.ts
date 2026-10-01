import type { ParagraphDirection } from "./bidi.js";
import { detectParagraphDirection } from "./bidi.js";

export interface LocaleInfo {
  code: string;
  direction: ParagraphDirection;
  pluralForm: "one-other" | "zero-one-other" | "other";
  numberSeparators: { decimal: string; group: string };
}

const RTL_LOCALES = new Set(["ar", "he", "fa", "ur", "ps", "sd", "yi", "dv", "ckb"]);

export function localeInfo(code: string): LocaleInfo {
  const language = code.split("-")[0]!.toLowerCase();
  const direction: ParagraphDirection = RTL_LOCALES.has(language) ? "rtl" : "ltr";
  let pluralForm: LocaleInfo["pluralForm"] = "one-other";
  if (language === "ar" || language === "ps") pluralForm = "zero-one-other";
  if (language === "ja" || language === "zh" || language === "ko" || language === "vi") pluralForm = "other";
  return {
    code,
    direction,
    pluralForm,
    numberSeparators: language === "fa" || language === "ar" ? { decimal: "٫", group: "٬" } : { decimal: ".", group: "," },
  };
}

export type MessageValue = string | number | boolean;

export interface MessageFormatContext {
  values?: Record<string, MessageValue>;
  locale?: string;
}

export class MessageCatalog {
  #messages = new Map<string, Map<string, string>>();
  #fallbacks: string[] = [];

  constructor(fallbacks: string[] = []) {
    this.#fallbacks = [...fallbacks];
  }

  add(locale: string, key: string, template: string): void {
    const messages = this.#messages.get(locale) ?? new Map<string, string>();
    messages.set(key, template);
    this.#messages.set(locale, messages);
  }

  addBundle(locale: string, bundle: Record<string, string>): void {
    for (const [key, template] of Object.entries(bundle)) this.add(locale, key, template);
  }

  has(locale: string, key: string): boolean {
    return this.#messages.get(locale)?.has(key) ?? false;
  }

  resolveLocale(key: string, preferred: string): string | null {
    if (this.has(preferred, key)) return preferred;
    const language = preferred.split("-")[0]!;
    for (const locale of this.#messages.keys()) {
      if (locale === language || locale.startsWith(`${language}-`)) {
        if (this.has(locale, key)) return locale;
      }
    }
    for (const fallback of this.#fallbacks) {
      if (this.has(fallback, key)) return fallback;
    }
    return null;
  }

  format(key: string, context: MessageFormatContext = {}): string {
    const preferred = context.locale ?? "en";
    const locale = this.resolveLocale(key, preferred);
    if (!locale) return key;
    const template = this.#messages.get(locale)!.get(key)!;
    return formatMessage(template, context.values ?? {}, localeInfo(locale));
  }
}

export function formatMessage(template: string, values: Record<string, MessageValue>, info: LocaleInfo = localeInfo("en")): string {
  let result = "";
  let index = 0;
  while (index < template.length) {
    const open = template.indexOf("{", index);
    if (open < 0) {
      result += template.slice(index);
      break;
    }
    result += template.slice(index, open);
    let depth = 0;
    let close = -1;
    for (let i = open; i < template.length; i += 1) {
      if (template[i] === "{") depth += 1;
      else if (template[i] === "}") {
        depth -= 1;
        if (depth === 0) {
          close = i;
          break;
        }
      }
    }
    if (close < 0) {
      result += template.slice(open);
      break;
    }
    const body = template.slice(open + 1, close);
    result += evaluatePlaceholder(body, values, info);
    index = close + 1;
  }
  return result;
}

function evaluatePlaceholder(body: string, values: Record<string, MessageValue>, info: LocaleInfo): string {
  const parts = body.split(",").map((part) => part.trim());
  const name = parts[0]!;
  const value = values[name];
  if (parts.length === 1) {
    return typeof value === "number" ? formatNumber(value, info) : String(value ?? "");
  }
  const keyword = parts[1]!;
  if (keyword === "number") return typeof value === "number" ? formatNumber(value, info) : String(value ?? "");
  if (keyword === "plural") {
    const count = typeof value === "number" ? value : Number(value ?? 0);
    const category = pluralCategory(count, info);
    for (let i = 2; i < parts.length; i += 1) {
      const option = parts[i]!;
      const equals = option.indexOf("=");
      if (equals > 0) {
        if (Number(option.slice(0, equals)) === count) return option.slice(equals + 1);
      } else if (option.startsWith(`${count} `)) {
        return option.slice(String(count).length + 1).replace("{count}", formatNumber(count, info));
      } else if (option.startsWith("#")) {
        return option.slice(1).trim().replace("{count}", formatNumber(count, info));
      } else if (option.startsWith(`${category} `)) {
        return option.slice(category.length + 1).replace("{count}", formatNumber(count, info));
      }
    }
    return String(count);
  }
  if (keyword === "select") {
    for (let i = 2; i < parts.length; i += 1) {
      const option = parts[i]!;
      const equals = option.indexOf("=");
      const optionName = equals > 0 ? option.slice(0, equals) : option.split(" ")[0]!;
      const optionValue = equals > 0 ? option.slice(equals + 1) : option.slice(optionName.length + 1);
      if (String(value) === optionName || (optionName === "other" && i === parts.length - 1)) return optionValue;
    }
  }
  return String(value ?? "");
}

export function pluralCategory(count: number, info: LocaleInfo = localeInfo("en")): "zero" | "one" | "other" {
  if (info.pluralForm === "other") return "other";
  if (info.pluralForm === "zero-one-other") {
    if (count === 0) return "zero";
    if (count === 1) return "one";
    return "other";
  }
  if (count === 1) return "one";
  return "other";
}

export function formatNumber(value: number, info: LocaleInfo = localeInfo("en")): string {
  const raw = Number.isInteger(value) ? String(Math.abs(value)) : Math.abs(value).toFixed(2);
  const [integerPart, decimalPart] = raw.split(".");
  const sign = value < 0 ? "-" : "";
  const grouped = integerPart!.replace(/\B(?=(\d{3})+(?!\d))/g, info.numberSeparators.group);
  return `${sign}${grouped}${decimalPart ? info.numberSeparators.decimal + decimalPart : ""}`;
}

export function layoutDirectionForText(text: string, localeCode = "en"): ParagraphDirection {
  const info = localeInfo(localeCode);
  if (info.direction === "rtl") return "rtl";
  return detectParagraphDirection(text);
}
