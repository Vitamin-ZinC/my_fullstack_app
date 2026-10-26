"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { BarChart3, X } from "lucide-react";
import { trafficPageForPath, type TrafficConfig } from "@levelup/contracts";
import { API_URL } from "@/lib/api";
import { uiText, useUiLocale } from "@/lib/locale";
import { prepareTrafficView, readTrafficChoice, saveTrafficChoice, trafficPrivacySignal, TRAFFIC_CHOICE_EVENT, TRAFFIC_CONSENT_KEY } from "@/lib/webTraffic";
import styles from "./TrafficAnalytics.module.css";

export function TrafficAnalytics() {
  useUiLocale();
  const pathname = usePathname();
  const [choice, setChoice] = useState<"allow" | "deny" | null>(null);
  const [config, setConfig] = useState<TrafficConfig | null>(null);
  const [open, setOpen] = useState(false);
  const [privacySignal, setPrivacySignal] = useState(false);
  const lastView = useRef("");
  const eligible = trafficPageForPath(pathname) !== null;

  useEffect(() => {
    const sync = () => { setChoice(readTrafficChoice()); setPrivacySignal(trafficPrivacySignal()); };
    const storage = (event: StorageEvent) => { if (event.key === TRAFFIC_CONSENT_KEY || event.key === null) sync(); };
    sync();
    window.addEventListener(TRAFFIC_CHOICE_EVENT, sync);
    window.addEventListener("storage", storage);
    return () => { window.removeEventListener(TRAFFIC_CHOICE_EVENT, sync); window.removeEventListener("storage", storage); };
  }, []);

  useEffect(() => {
    if (!eligible) return;
    const controller = new AbortController();
    void fetch(`${API_URL}/api/traffic/config`, { credentials: "omit", referrerPolicy: "no-referrer", signal: controller.signal })
      .then(response => response.ok ? response.json() : null).then(setConfig).catch(() => {});
    return () => controller.abort();
  }, [eligible]);

  useEffect(() => {
    if (!eligible || choice !== "allow" || !config?.enabled) { lastView.current = ""; return; }
    const controller = new AbortController();
    const view = async (rotate = false) => {
      if (controller.signal.aborted || document.visibilityState !== "visible") return;
      const input = prepareTrafficView(pathname, rotate);
      if (!input) return;
      const key = `${input.visitId}:${pathname}`;
      if (lastView.current === key) return;
      lastView.current = key;
      try {
        const response = await fetch(`${API_URL}/api/traffic/views`, { method: "POST", credentials: "omit", referrerPolicy: "no-referrer",
          headers: { "Content-Type": "application/json" }, body: JSON.stringify(input), signal: controller.signal });
        if (response.ok && (await response.json()).rotateVisit && !rotate) { lastView.current = ""; await view(true); }
        else if (!response.ok) lastView.current = "";
      } catch { lastView.current = ""; }
    };
    const start = window.setTimeout(() => void view(), 0);
    const visible = () => void view();
    document.addEventListener("visibilitychange", visible);
    return () => { window.clearTimeout(start); controller.abort(); document.removeEventListener("visibilitychange", visible); };
  }, [pathname, eligible, choice, config?.enabled]);

  if (!eligible || !config || (!config.enabled && choice === null && !open)) return null;
  const show = open || (config.enabled && choice === null);
  function decide(value: "allow" | "deny") { saveTrafficChoice(value); setOpen(false); }
  return <>
    <footer className={styles.control}><button type="button" onClick={() => setOpen(true)}><BarChart3 size={14} />{uiText("Настройки аналитики")}</button></footer>
    {show && <section className={styles.banner} role="region" aria-label={uiText("Настройки аналитики")}>
      <div><h2>{uiText("Помочь улучшить ORKEN?")}</h2><p>{uiText("Разрешите подсчёт посещений и действий на сайте. Без содержимого дневника, фото, аудио и сторонних счётчиков. Отказ не ограничивает сервис.")} <a href="/privacy">{uiText("Политика конфиденциальности")}</a></p>
        {privacySignal && <p>{uiText("В браузере включён запрет отслеживания. Аналитика отключена.")}</p>}</div>
      <div className={styles.actions}>
        <button type="button" onClick={() => decide("deny")}>{uiText("Не разрешать")}</button>
        <button type="button" className={styles.accept} disabled={privacySignal || !config.enabled} onClick={() => decide("allow")}>{uiText("Разрешить аналитику")}</button>
        {choice !== null && <button type="button" className={styles.close} title={uiText("Закрыть")} aria-label={uiText("Закрыть")} onClick={() => setOpen(false)}><X size={18} /></button>}
      </div>
    </section>}
  </>;
}
