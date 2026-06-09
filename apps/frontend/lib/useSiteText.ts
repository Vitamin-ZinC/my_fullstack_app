"use client";

import { useEffect, useState } from "react";
import { API_URL } from "@/lib/api";
import { defaultSiteText, mergeSiteText, parseLocale, type Locale, type SiteText } from "@/lib/messages";

export function useSiteText(locale: Locale = "ru"): SiteText {
  const resolvedLocale = parseLocale(locale);
  const [text, setText] = useState<SiteText>(defaultSiteText[resolvedLocale]);

  useEffect(() => {
    let cancelled = false;
    setText(defaultSiteText[resolvedLocale]);

    fetch(`${API_URL}/api/content/${resolvedLocale}`)
      .then((response) => response.ok ? response.json() : null)
      .then((payload) => {
        if (!cancelled && payload?.value) {
          setText(mergeSiteText(defaultSiteText[resolvedLocale], payload.value));
        }
      })
      .catch(() => {
        if (!cancelled) setText(defaultSiteText[resolvedLocale]);
      });

    return () => {
      cancelled = true;
    };
  }, [resolvedLocale]);

  return text;
}
