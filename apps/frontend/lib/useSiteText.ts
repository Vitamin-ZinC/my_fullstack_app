"use client";

import { useEffect, useState } from "react";
import { API_URL } from "@/lib/api";
import { defaultSiteText, mergeSiteText, parseLocale, type Locale, type SiteText } from "@/lib/messages";
import { useUiLocale } from "@/lib/locale";

export function useSiteText(locale?: Locale): SiteText {
  const selectedLocale = useUiLocale();
  const resolvedLocale = parseLocale(locale ?? selectedLocale);
  const [text, setText] = useState<{ locale: Locale; value: SiteText }>({ locale: resolvedLocale, value: defaultSiteText[resolvedLocale] });

  useEffect(() => {
    let cancelled = false;
    setText({ locale: resolvedLocale, value: defaultSiteText[resolvedLocale] });

    fetch(`${API_URL}/api/content/${resolvedLocale}`)
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => {
        if (!cancelled && payload?.value) {
          setText({ locale: resolvedLocale, value: mergeSiteText(defaultSiteText[resolvedLocale], payload.value) });
        }
      })
      .catch(() => {
        if (!cancelled) setText({ locale: resolvedLocale, value: defaultSiteText[resolvedLocale] });
      });

    return () => {
      cancelled = true;
    };
  }, [resolvedLocale]);

  return text.locale === resolvedLocale ? text.value : defaultSiteText[resolvedLocale];
}
