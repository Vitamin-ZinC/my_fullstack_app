"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Camera, Compass } from "lucide-react";
import { IkigaiPremiumMap } from "@/components/IkigaiPremiumMap";
import { api } from "@/lib/api";
import { useSiteText } from "@/lib/useSiteText";

export default function LandingPage() {
  const text = useSiteText();
  const landing = text.landing;
  const [reportPriceLabel, setReportPriceLabel] = useState("$3");
  const [habitPriceLabel, setHabitPriceLabel] = useState("$8");
  const [habitTrialDays, setHabitTrialDays] = useState(0);

  useEffect(() => {
    let cancelled = false;

    api.getPaymentConfig()
      .then((config) => {
        if (!cancelled) setReportPriceLabel(config.priceLabel);
      })
      .catch(() => {
        if (!cancelled) setReportPriceLabel("$3");
      });

    api.habitConfig()
      .then((config) => {
        if (!cancelled) {
          setHabitPriceLabel(config.priceLabel);
          setHabitTrialDays(config.trialDays);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHabitPriceLabel("$8");
          setHabitTrialDays(0);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <div className="glow-tl" />
      <div className="glow-br" />
      <div id="app" className="landing-shell">
        <AppNav />
        <main className="screen">
          <div className="landing-flow">
            <section className="landing-hero">
              <div className="hero-video-wrap float">
                <video src="/assets/paid-report-animation.mp4" autoPlay muted loop playsInline preload="auto" poster="/assets/levelup-logo.jpg" aria-label={`${text.nav.brand} preview`} />
              </div>
              <div className="ub very-muted landing-kicker">{landing.kicker}</div>
              <h1 className="ub landing-title">
                {landing.titlePrefix}
                <br />
                <span className="landing-gradient-text">{landing.titleAccent}</span>
              </h1>
              <div className="landing-pain-list" aria-label={landing.problemListLabel}>
                {landing.problemItems.map((item) => (
                  <div className="landing-pain-row" key={item}>
                    <span aria-hidden="true">—</span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
              <HeroToolCard />
            </section>

            <div className="divider landing-divider" />

            <section className="landing-section compact">
              <h2 className="ub landing-section-title">{landing.signalsTitle}</h2>
              <div className="landing-two-col">
                <SignalCard tone="cyan" title={landing.faceTitle} icon="📷" items={landing.faceSignals} />
                <SignalCard tone="violet" title={landing.voiceTitle} icon="🎤" items={landing.voiceSignals} />
              </div>
            </section>

            <ProductSection
              reportPriceLabel={reportPriceLabel}
              habitPriceLabel={habitPriceLabel}
              habitTrialDays={habitTrialDays}
            />

            <section className="landing-section compact">
              <div className="card cyan-border card-lg">
                <h2 className="ub cyan landing-card-title">{landing.freeTitle}</h2>
                {landing.freeItems.map((item) => (
                  <div className="landing-bullet" key={item}>
                    <span className="cyan">✦</span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="landing-section compact">
              <div className="card cyan-border card-lg ikigai-landing-card">
                <h2 className="ub cyan landing-card-title">{landing.modelTitle}</h2>
                <IkigaiPremiumMap allActive landingMode />
                <p className="landing-model-copy">{landing.modelCopy}</p>
                <div className="ikigai-factor-list">
                  {landing.modelFactors.map((factor) => <div key={factor}>{factor}</div>)}
                </div>
                <div className="highlight-box">{landing.modelHighlight}</div>
              </div>
            </section>

            <section className="landing-section compact">
              <div className="card green-border">
                <h2 className="ub landing-privacy-title">{landing.privacyTitle}</h2>
                {landing.privacyItems.map((item) => (
                  <div className="landing-safe-row" key={item}>
                    <span>✓</span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="landing-section final">
              <h2 className="ub landing-final-title">{landing.finalTitle}</h2>
              <p className="landing-final-copy">{landing.finalCopy}</p>
              <div className="landing-final-actions">
                <a className="btn-primary" data-testid="landing-start-final" href="/flow/voice">{landing.cta}</a>
                <a className="btn-primary" href="/habits">{landing.habitsCta}</a>
              </div>
            </section>
            <footer className="landing-footer">
              <span>{text.nav.brand}</span>
              <a href="https://www.threads.com/@orken.ai?igshid=NTc4MTIwNjQ2YQ==" target="_blank" rel="noreferrer">Threads</a>
              <a href="https://www.instagram.com/orken.ai?igsh=ZXBuMXJzcmtjNDBl&utm_source=qr" target="_blank" rel="noreferrer">Instagram</a>
            </footer>
          </div>
        </main>
      </div>
    </>
  );
}

function HeroToolCard() {
  const { landing } = useSiteText();

  return (
    <div className="landing-tool-card">
      {landing.heroTools.map((tool, index) => (
        <div className="landing-tool-row" key={tool.cta}>
          <div className="landing-tool-copy">
            {tool.prefix} <strong>{tool.accent}</strong>
          </div>
          <a className="btn-primary landing-tool-button" data-testid={index === 0 ? "landing-start-primary" : undefined} href={index === 0 ? "/flow/voice" : "/habits"}>
            {tool.cta}
          </a>
        </div>
      ))}
    </div>
  );
}

function ProductSection({ habitPriceLabel, habitTrialDays, reportPriceLabel }: { habitPriceLabel: string; habitTrialDays: number; reportPriceLabel: string }) {
  const { landing } = useSiteText();

  return (
    <section className="landing-section compact">
      <div className="landing-section-head">
        <h2 className="ub landing-section-title">{landing.productsTitle}</h2>
        <p className="landing-small-copy">{landing.productsSubtitle}</p>
      </div>
      <div className="landing-branch" aria-hidden="true">
        <svg viewBox="0 0 520 92" role="presentation" focusable="false">
          <defs>
            <linearGradient id="landingBranchLeft" x1="260" x2="96" y1="14" y2="78" gradientUnits="userSpaceOnUse">
              <stop stopColor="#ffb800" />
              <stop offset="1" stopColor="#00d4ff" />
            </linearGradient>
            <linearGradient id="landingBranchRight" x1="260" x2="424" y1="14" y2="78" gradientUnits="userSpaceOnUse">
              <stop stopColor="#ffb800" />
              <stop offset="1" stopColor="#9b5de5" />
            </linearGradient>
          </defs>
          <path d="M260 18 C228 34 182 70 96 78" stroke="url(#landingBranchLeft)" />
          <path d="M260 18 C292 34 338 70 424 78" stroke="url(#landingBranchRight)" />
          <circle className="branch-dot top" cx="260" cy="16" r="6" />
          <circle className="branch-dot left" cx="96" cy="78" r="6" />
          <circle className="branch-dot right" cx="424" cy="78" r="6" />
        </svg>
      </div>
      <div className="landing-product-grid">
        <article className="card cyan-border landing-product-card">
          <div className="landing-product-icon"><Camera size={20} strokeWidth={2.3} aria-hidden="true" /></div>
          <h3 className="ub">{landing.diagnosisProduct.title}</h3>
          <p>{landing.diagnosisProduct.copy}</p>
          <div className="landing-product-list">
            {landing.diagnosisProduct.items.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
          <div className="landing-product-price">
            <strong>{landing.diagnosisProduct.price}</strong>
            <small>{formatTemplate(landing.diagnosisProduct.fullReport, { price: reportPriceLabel })}</small>
          </div>
          <a className="btn-primary" href="/flow/voice">{landing.diagnosisProduct.cta}</a>
        </article>
        <article className="card violet-border landing-product-card">
          <div className="landing-product-icon violet"><Compass size={20} strokeWidth={2.3} aria-hidden="true" /></div>
          <h3 className="ub">{landing.habitsProduct.title}</h3>
          <p>{landing.habitsProduct.copy}</p>
          <div className="landing-product-list accent">
            {landing.habitsProduct.items.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
          <div className="landing-product-price">
            <strong>{formatTemplate(landing.habitsProduct.price, { price: habitPriceLabel })}</strong>
            {habitTrialDays > 0 && <small>{formatTemplate(landing.habitsProduct.trial, { days: habitTrialDays })}</small>}
          </div>
          <a className="btn-primary" href="/habits">{landing.habitsProduct.cta}</a>
        </article>
      </div>
    </section>
  );
}

function AppNav() {
  const text = useSiteText();

  return (
    <nav className="app-nav">
      <Link className="logo-wrap" href="/">
        <div className="logo-mark" aria-hidden="true">
          <img src="/assets/levelup-logo.jpg" alt="" />
        </div>
        <div className="logo-text">
          <div className="brand">{text.nav.brand}</div>
          <div className="sub">{text.nav.sub}</div>
        </div>
      </Link>
      <Link className="btn-back" href="/account">Кабинет</Link>
    </nav>
  );
}

function SignalCard({ icon, items, title, tone }: { icon: string; items: readonly string[]; title: string; tone: "cyan" | "violet" }) {
  return (
    <div className={`card ${tone === "cyan" ? "cyan-border" : "violet-border"}`}>
      <div className="signal-icon">{icon}</div>
      <div className={`ub ${tone} signal-title`}>{title}</div>
      {items.map((item) => (
        <div className="signal-item" key={item}>· {item}</div>
      ))}
    </div>
  );
}

function formatTemplate(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce((result, [key, value]) => result.replaceAll(`{${key}}`, String(value)), template);
}
