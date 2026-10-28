"use client";

import { useEffect, useMemo, useState } from "react";
import { presentLandingCopy, presentStaticCopy } from "./interfaceCopy";
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

  const current = text.locale === resolvedLocale ? text.value : defaultSiteText[resolvedLocale];
  return useMemo(() => {
    const value = presentStaticCopy(current);
    const defaults = defaultSiteText[resolvedLocale];
    const legacyCoaching = value.landing.v2.coaches.features.some(item => /Переключение|Switch.*Coach|Coach.*Client/i.test(item));
    return {
      ...value,
      landing: presentLandingCopy({ ...value.landing, v2: {
        ...value.landing.v2,
        menu: { ...value.landing.v2.menu, coaches: defaults.landing.v2.menu.coaches },
        coaches: legacyCoaching ? defaults.landing.v2.coaches : value.landing.v2.coaches,
        partners: {
          ...value.landing.v2.partners,
          eyebrow: defaults.landing.v2.partners.eyebrow,
          programs: value.landing.v2.partners.programs.length < 4 ? defaults.landing.v2.partners.programs : value.landing.v2.partners.programs
        }
      } }),
      habits: { ...value.habits, app: { ...value.habits.app,
        nav: { ...value.habits.app.nav, navigator: defaults.habits.app.nav.navigator },
        navigator: { ...value.habits.app.navigator, title: defaults.habits.app.navigator.title }
      } }
    };
  }, [current, resolvedLocale]);
}
