import { englishCatalog } from "#english-catalog";

export type UiLocale = "ru" | "en";

export function normalizeUiLocale(value: string | null | undefined, fallback: UiLocale = "ru"): UiLocale {
  if (/^en(?:[-_]|$)/i.test(value ?? "")) return "en";
  if (/^ru(?:[-_]|$)/i.test(value ?? "")) return "ru";
  return fallback;
}

// Only explicitly selected system copy is translated. User records are never walked here.
export function translateSystemText(source: string, locale: UiLocale): string {
  if (locale !== "en") return source;
  const normalized = source.trim().replace(/\s+/g, " ");
  const translated = englishCatalog[normalized];
  if (translated === undefined) return source;
  const prefix = source.match(/^\s*/)?.[0] ?? "";
  const suffix = source.match(/\s*$/)?.[0] ?? "";
  return `${prefix}${translated}${suffix}`;
}

export function localizeStaticText<T>(source: T, locale: UiLocale): T {
  if (typeof source === "string") return translateGeneratedSystemText(source, locale) as T;
  if (Array.isArray(source)) return source.map(item => localizeStaticText(item, locale)) as T;
  if (source && typeof source === "object") {
    return Object.fromEntries(Object.entries(source).map(([key, value]) => [key, localizeStaticText(value, locale)])) as T;
  }
  return source;
}

const generatedTemplates = Object.entries(englishCatalog)
  .filter(([source]) => /\{v\d+\}/.test(source) && /[А-Яа-яЁё]/.test(source.replace(/\{v\d+\}/g, "")))
  .map(([source, target]) => {
    const keys: string[] = [];
    const escaped = source.split(/(\{v\d+\})/).map(part => {
      if (/^\{v\d+\}$/.test(part)) { keys.push(part.slice(1, -1)); return "([\\s\\S]*?)"; }
      return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }).join("");
    const anchor = source.split(/\{v\d+\}/).sort((left, right) => right.length - left.length)[0];
    return { pattern: new RegExp(`^${escaped}$`), anchor, keys, target };
  });

// For app-generated summaries only; never apply to messages, notes, reports or profile data.
export function translateGeneratedSystemText(source: string, locale: UiLocale, depth = 0): string {
  if (locale !== "en" || depth > 4 || source.length > 20000 || !/[А-Яа-яЁё]/.test(source)) return source;
  const exact = translateSystemText(source, locale);
  if (exact !== source) return exact;
  for (const template of generatedTemplates) {
    if (!source.includes(template.anchor)) continue;
    const match = source.match(template.pattern);
    if (!match) continue;
    const values = Object.fromEntries(template.keys.map((key, index) => [key, translateGeneratedSystemText(match[index + 1], locale, depth + 1)]));
    return template.target.replace(/\{(v\d+)\}/g, (placeholder, key: string) => values[key] ?? placeholder);
  }
  return source;
}
