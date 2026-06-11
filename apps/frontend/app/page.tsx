"use client";

import Link from "next/link";
import { IkigaiPremiumMap } from "@/components/IkigaiPremiumMap";
import { useSiteText } from "@/lib/useSiteText";

export default function LandingPage() {
  const text = useSiteText();
  const landing = text.landing;

  return (
    <>
      <div className="glow-tl" />
      <div className="glow-br" />
      <div id="app">
        <AppNav />
        <main className="screen">
          <div className="landing-flow">
            <section className="landing-hero">
              <div className="hero-video-wrap float">
                <video src="/assets/paid-report-animation.mp4" autoPlay muted loop playsInline poster="/assets/levelup-logo.jpg" aria-label={`${text.nav.brand} preview`} />
              </div>
              <div className="ub very-muted landing-kicker">{landing.kicker}</div>
              <h1 className="ub landing-title">
                {landing.titlePrefix}
                <br />
                <span className="cyan cyan-glow">{landing.titleAccent}</span>
              </h1>
              <p className="muted landing-sub">{landing.subtitle}</p>
              <p className="very-muted landing-lead">{landing.lead}</p>
              <a className="btn-primary" data-testid="landing-start-primary" href="/flow/voice">{landing.cta}</a>
              <p className="very-muted landing-note">{landing.note}</p>
            </section>

            <div className="divider landing-divider" />

            <section className="landing-section">
              <div className="card card-lg">
                <h2 className="ub landing-card-title">{landing.problemTitle}</h2>
                {landing.problemItems.map((item) => (
                  <div className="landing-list-row" key={item}>
                    <span className="cyan">-</span>
                    <span>{item}</span>
                  </div>
                ))}
                <div className="divider" />
                <p className="landing-small-copy">{landing.problemCopy}</p>
              </div>
            </section>

            <section className="landing-section compact">
              <h2 className="ub landing-section-title">{landing.signalsTitle}</h2>
              <div className="landing-two-col">
                <SignalCard tone="cyan" title={landing.faceTitle} icon="📷" items={landing.faceSignals} />
                <SignalCard tone="violet" title={landing.voiceTitle} icon="🎤" items={landing.voiceSignals} />
              </div>
            </section>

            <section className="landing-section compact">
              <h2 className="ub landing-section-title">{landing.howTitle}</h2>
              {landing.steps.map(([number, title, description]) => (
                <a className="card landing-step" href="/flow/voice" key={number}>
                  <span className="landing-step-number">{number}</span>
                  <div>
                    <div className="ub landing-step-title">{title}</div>
                    <div className="landing-step-copy">{description}</div>
                  </div>
                </a>
              ))}
            </section>

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
              <a className="btn-primary" data-testid="landing-start-final" href="/flow/voice">{landing.cta}</a>
              <p className="very-muted landing-note center">{landing.finalNote}</p>
            </section>
          </div>
        </main>
      </div>
    </>
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
