"use client";

import { Languages } from "lucide-react";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { setStoredLocale, useUiLocale } from "@/lib/locale";

export function GlobalLanguageSwitcher() {
  const locale = useUiLocale();
  const pathname = usePathname();
  useEffect(() => {
    document.documentElement.lang = locale;
    const title = locale === "en" ? "Ikigai - ORKEN.LIFE" : "Икигай — ORKEN.LIFE";
    const syncTitle = () => { if (document.title !== title) document.title = title; };
    // Next's streamed metadata can arrive after language initialization.
    const observer = new MutationObserver(syncTitle);
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    syncTitle();
    return () => observer.disconnect();
  }, [locale, pathname]);
  if (pathname === "/") return null;
  return <div className="language-bar"><LanguageSwitcher /></div>;
}

export function LanguageSwitcher() {
  const locale = useUiLocale();
  return <div className="language-switcher" role="group" aria-label={locale === "en" ? "Interface language" : "Язык интерфейса"}>
    <Languages size={15} aria-hidden="true" />
    {(["ru", "en"] as const).map(value => <button key={value} type="button" lang={value}
      aria-label={value === "en" ? "English" : "Русский"} aria-pressed={locale === value}
      onClick={() => setStoredLocale(value)}>{value.toUpperCase()}</button>)}
  </div>;
}
