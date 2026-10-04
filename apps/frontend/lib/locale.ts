"use client";

import { useEffect, useSyncExternalStore } from "react";
import { translateGeneratedSystemText, type UiLocale } from "@levelup/contracts";

const STORAGE_KEY = "levelup_locale";
const COOKIE_KEY = "orken_locale";
const listeners = new Set<() => void>();
let activeLocale: UiLocale = "ru";
let initialized = false;

export function getUiLocale() { return activeLocale; }
export function getFormatLocale() { return activeLocale === "en" ? "en-US" : "ru-RU"; }

export function getStoredLocale(): UiLocale {
  if (typeof window === "undefined") return "ru";
  const query = new URL(window.location.href).searchParams.get("lang");
  if (query === "ru" || query === "en") return query;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "ru" || stored === "en") return stored;
  } catch { /* The language picker also works when storage is blocked. */ }
  const cookie = document.cookie.split("; ").find(value => value.startsWith(`${COOKIE_KEY}=`))?.slice(COOKIE_KEY.length + 1);
  if (cookie === "ru" || cookie === "en") return cookie;
  return navigator.language.toLowerCase().startsWith("en") ? "en" : "ru";
}

export function setStoredLocale(locale: UiLocale) {
  activeLocale = locale;
  if (typeof window !== "undefined") {
    try { window.localStorage.setItem(STORAGE_KEY, locale); } catch { /* Cookie is the fallback. */ }
    document.cookie = `${COOKIE_KEY}=${locale}; Path=/; Max-Age=31536000; SameSite=Lax${window.location.protocol === "https:" ? "; Secure" : ""}`;
    document.documentElement.lang = locale;
    document.title = locale === "en" ? "Ikigai - ORKEN.LIFE" : "Икигай — ORKEN.LIFE";
    const url = new URL(window.location.href);
    if (url.searchParams.has("lang")) {
      url.searchParams.set("lang", locale);
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    }
  }
  listeners.forEach(listener => listener());
}

export function useUiLocale(): UiLocale {
  const locale = useSyncExternalStore<UiLocale>(subscribe, getUiLocale, () => "ru");
  useEffect(() => {
    if (initialized) return;
    initialized = true;
    setStoredLocale(getStoredLocale());
    const sync = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY && (event.newValue === "ru" || event.newValue === "en")) setStoredLocale(event.newValue);
    };
    window.addEventListener("storage", sync);
    // One listener belongs to the application, rather than each mounted screen.
  }, []);
  return locale;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function uiText(source: string, values: Record<string, unknown> = {}) {
  const template = translateGeneratedSystemText(source, activeLocale);
  return template.replace(/\{(v\d+)\}/g, (match, key: string) => key in values ? String(values[key] ?? "") : match);
}

export function localizedOptions<T>(source: T): T {
  if (typeof source === "string") return uiText(source) as T;
  if (Array.isArray(source)) return source.map(localizedOptions) as T;
  if (source && typeof source === "object") {
    return Object.fromEntries(Object.entries(source).map(([key, value]) => [key, localizedOptions(value)])) as T;
  }
  return source;
}
