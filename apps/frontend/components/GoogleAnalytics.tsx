"use client";

import { useLayoutEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { disableGoogleAnalytics, enableGoogleAnalytics, googleAnalyticsPage, recordGooglePage } from "@/lib/googleAnalytics";
import { readTrafficChoice, TRAFFIC_CHOICE_EVENT, TRAFFIC_CONSENT_KEY } from "@/lib/webTraffic";

export function GoogleAnalytics({ enabled }: { enabled: boolean }) {
  const pathname = usePathname();
  const lastPage = useRef("");
  useLayoutEffect(() => {
    const sync = () => {
      const allowed = readTrafficChoice() === "allow";
      const page = googleAnalyticsPage(pathname);
      if (!enabled || !allowed || !page) {
        disableGoogleAnalytics(!allowed);
        lastPage.current = "";
        return;
      }
      enableGoogleAnalytics();
      if (document.visibilityState !== "visible" || lastPage.current === page) return;
      lastPage.current = page;
      recordGooglePage(page);
    };
    const storage = (event: StorageEvent) => { if (!event.key || event.key === TRAFFIC_CONSENT_KEY) sync(); };
    sync();
    window.addEventListener(TRAFFIC_CHOICE_EVENT, sync);
    window.addEventListener("storage", storage);
    window.addEventListener("hashchange", sync);
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", sync);
    const timer = window.setInterval(sync, 30000);
    return () => {
      disableGoogleAnalytics();
      window.removeEventListener(TRAFFIC_CHOICE_EVENT, sync);
      window.removeEventListener("storage", storage);
      window.removeEventListener("hashchange", sync);
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", sync);
      window.clearInterval(timer);
    };
  }, [pathname, enabled]);
  return null;
}
