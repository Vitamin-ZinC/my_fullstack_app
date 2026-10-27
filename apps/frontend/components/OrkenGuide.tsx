"use client";

import Link from "next/link";
import { ArrowRight, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useSiteText } from "@/lib/useSiteText";
import { GUIDE_PREFERENCE_EVENT, guideIsDue, guidePreferenceKey, readGuidePreference, saveGuidePreference, type GuideContext } from "@/lib/orkenGuide";
import styles from "./OrkenGuide.module.css";

type GuideAction = { label: string } & ({ href: string; onClick?: never } | { onClick: () => void; href?: never });

export function OrkenGuide({ context, scope, message, actions, suspended = false }: {
  context: GuideContext;
  scope: string;
  message?: string;
  actions: GuideAction[];
  suspended?: boolean;
}) {
  const text = useSiteText().guide;
  const key = guidePreferenceKey(context, scope);
  const panelId = useId();
  const titleId = useId();
  const launcher = useRef<HTMLButtonElement>(null);
  const [ready, setReady] = useState(false);
  const [blocked, setBlocked] = useState(true);
  const [open, setOpen] = useState(false);
  const [present, setPresent] = useState(false);
  const [disabled, setDisabled] = useState(false);

  useEffect(() => {
    setReady(false);
    setOpen(false);
    setDisabled(readGuidePreference(context, key).disabled);
    const sync = () => setDisabled(readGuidePreference(context, key).disabled);
    const storage = (event: StorageEvent) => { if (event.key === key || event.key === null) sync(); };
    window.addEventListener(GUIDE_PREFERENCE_EVENT, sync);
    window.addEventListener("storage", storage);
    return () => { window.removeEventListener(GUIDE_PREFERENCE_EVENT, sync); window.removeEventListener("storage", storage); };
  }, [context, key]);

  useEffect(() => {
    let active = true;
    const sync = () => {
      if (!active) return;
      const typing = document.activeElement?.matches('textarea, select, input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]), [contenteditable="true"]');
      setBlocked(document.visibilityState !== "visible" || Boolean(typing) || Boolean(document.querySelector('[data-orken-guide-blocker], dialog[open], [aria-modal="true"], details[name="landing-nav-menu"][open]')));
    };
    const focus = () => queueMicrotask(sync);
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["open", "aria-modal", "data-orken-guide-blocker"] });
    document.addEventListener("focusin", focus);
    document.addEventListener("focusout", focus);
    document.addEventListener("visibilitychange", sync);
    sync();
    return () => {
      active = false;
      observer.disconnect();
      document.removeEventListener("focusin", focus);
      document.removeEventListener("focusout", focus);
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  useEffect(() => {
    if (blocked || suspended) return;
    const timer = window.setTimeout(() => {
      const now = new Date();
      const preference = readGuidePreference(context, key);
      setReady(true);
      if (!guideIsDue(context, preference, now)) return;
      saveGuidePreference(context, key, { ...preference, lastShownAt: now.getTime() });
      setOpen(true);
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [blocked, suspended, disabled, context, key]);

  useEffect(() => {
    if (open) { setPresent(true); return; }
    const timer = window.setTimeout(() => setPresent(false), 200);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open || blocked || suspended) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      setOpen(false);
      if (launcher.current?.parentElement?.contains(document.activeElement)) launcher.current.focus({ preventScroll: true });
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [open, blocked, suspended]);

  function close() {
    setOpen(false);
    launcher.current?.focus({ preventScroll: true });
  }

  function toggle() {
    if (open) { close(); return; }
    const preference = readGuidePreference(context, key);
    saveGuidePreference(context, key, { ...preference, lastShownAt: Date.now() });
    setOpen(true);
  }

  return ready && !blocked && !suspended ? (
    <aside className={styles.guide} data-context={context} aria-label={text.title}
      onKeyDown={event => { if (event.key === "Escape" && open) { event.stopPropagation(); close(); } }}>
      {present && <section id={panelId} className={`${styles.bubble}${open ? ` ${styles.open}` : ""}`} aria-labelledby={titleId} aria-hidden={!open}>
        <header><strong id={titleId}>{text.title}</strong><button type="button" className={styles.close} onClick={close} title={text.close} aria-label={text.close} tabIndex={open ? 0 : -1}><X size={18} aria-hidden="true" /></button></header>
        <p>{message ?? text[context]}</p>
        <div className={styles.actions}>
          {actions.map((action, index) => action.href ? (
            <Link key={action.label} href={action.href} className={index === 0 ? styles.primary : styles.secondary} onClick={() => setOpen(false)} tabIndex={open ? 0 : -1}>{action.label}<ArrowRight size={16} aria-hidden="true" /></Link>
          ) : (
            <button key={action.label} type="button" className={index === 0 ? styles.primary : styles.secondary} onClick={() => { close(); action.onClick?.(); }} tabIndex={open ? 0 : -1}>{action.label}<ArrowRight size={16} aria-hidden="true" /></button>
          ))}
        </div>
        <label className={styles.preference}><input type="checkbox" checked={disabled} tabIndex={open ? 0 : -1} onChange={event => {
          const next = event.target.checked;
          saveGuidePreference(context, key, { ...readGuidePreference(context, key), disabled: next });
          setDisabled(next);
        }} />{text.disableAutomatic}</label>
      </section>}
      <button ref={launcher} type="button" className={styles.launcher} onClick={toggle} aria-expanded={open} aria-controls={present ? panelId : undefined} aria-label={open ? text.close : text.open} title={open ? text.close : text.open}>
        <img src="/assets/orken-penguin-transparent.png" width="512" height="596" alt="" draggable={false} />
        <span className={styles.tooltip}>{text.open}</span>
      </button>
    </aside>
  ) : null;
}
