"use client";

import { Languages } from "lucide-react";
import { setStoredLocale, useUiLocale } from "@/lib/locale";

export function LanguageSwitcher() {
  const locale = useUiLocale();
  return <div className="language-switcher" role="group" aria-label={locale === "en" ? "Interface language" : "Язык интерфейса"}>
    <Languages size={15} aria-hidden="true" />
    {(["ru", "en"] as const).map(value => <button key={value} type="button" lang={value}
      aria-label={value === "en" ? "English" : "Русский"} aria-pressed={locale === value}
      onClick={() => setStoredLocale(value)}>{value.toUpperCase()}</button>)}
  </div>;
}
