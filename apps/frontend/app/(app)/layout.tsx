"use client";
import { uiText, getFormatLocale, useUiLocale } from "@/lib/locale";


import Link from "next/link";
import { useSiteText } from "@/lib/useSiteText";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  useUiLocale();
  const text = useSiteText();

  return (
    <>
      <div className="glow-tl" />
      <div className="glow-br" />
      <div id="app">
        <nav className="app-nav">
          <Link className="logo-wrap" href="/">
            <div className="logo-mark" aria-hidden="true">
          <img src="/assets/orken-penguin-mark-clean.png" alt="" />
            </div>
            <div className="logo-text">
              <div className="brand">{text.nav.brand}</div>
            </div>
          </Link>
          <div className="nav-actions">
            <Link className="btn-back" href="/">{text.nav.backHome}</Link>
            <Link className="btn-back" href="/account">{uiText("Кабинет")}</Link>
          </div>
        </nav>
        <main className="screen app-screen">{children}</main>
      </div>
    </>
  );
}
