"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  BriefcaseBusiness,
  Check,
  ChevronDown,
  Compass,
  FileText,
  Handshake,
  LifeBuoy,
  Mail,
  Menu,
  ScanFace,
  ShieldCheck,
  Sparkles,
  UserCircle,
  UserRound,
  UsersRound,
  X
} from "lucide-react";
import { api } from "@/lib/api";
import { SUPPORT_EMAIL } from "@/lib/legal";
import { useSiteText } from "@/lib/useSiteText";

const cabinetLinks = [
  { href: "/account", label: "Кабинет пользователя", Icon: UserCircle },
  { href: "/habits", label: "Кабинет клиента", Icon: UserRound },
  { href: "/coach", label: "Кабинет коуча", Icon: UsersRound },
  { href: "/partners", label: "Кабинет партнёра", Icon: Handshake }
] as const;

export default function LandingPage() {
  const text = useSiteText();
  const landing = text.landing.v2;
  const [reportPriceLabel, setReportPriceLabel] = useState("$3");
  const [habitPriceLabel, setHabitPriceLabel] = useState("$8");
  const [habitTrialDays, setHabitTrialDays] = useState(14);

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
          setHabitTrialDays(14);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div id="app" className="landing-shell landing-v2-shell">
      <LandingNav />
      <main className="screen landing-v2-screen">
        <section id="about" className="landing-v2-hero">
          <div className="landing-v2-container landing-v2-hero-grid">
            <div className="landing-v2-hero-copy">
              <p className="landing-v2-eyebrow">{landing.kicker}</p>
              <h1>
                {landing.titlePrefix}
                <span>{landing.titleAccent}</span>
              </h1>
              <p className="landing-v2-lead">{landing.heroCopy}</p>
              <div className="landing-v2-pains" aria-label={landing.problemListLabel}>
                {landing.problemItems.map((item) => (
                  <p key={item}>
                    <Sparkles size={17} strokeWidth={2.2} aria-hidden="true" />
                    <strong>{item}</strong>
                  </p>
                ))}
              </div>
              <div className="landing-v2-hero-actions">
                {landing.heroTools.map((tool, index) => (
                  <div className="landing-v2-action-row" key={tool.cta}>
                    <span>{tool.prefix} <strong>{tool.accent}</strong></span>
                    <Link
                      className="landing-v2-button"
                      data-testid={index === 0 ? "landing-start-primary" : undefined}
                      href={index === 0 ? "/flow/voice" : "/habits"}
                    >
                      {tool.cta}
                      <ArrowRight size={17} aria-hidden="true" />
                    </Link>
                  </div>
                ))}
              </div>
            </div>
            <div className="landing-v2-hero-art" aria-label="Визуализация анализа лица">
              <img src="/assets/ai-face-hero.jpg" alt="Цифровая модель лица в неоновом интерфейсе ORKEN" />
              <span className="landing-v2-scan-line" aria-hidden="true" />
            </div>
          </div>
        </section>

        <section id="diagnostic" className="landing-v2-section">
          <div className="landing-v2-container">
            <div className="landing-v2-section-head">
              <p className="landing-v2-eyebrow"><Activity size={15} aria-hidden="true" /> {landing.productsTitle}</p>
              <h2>{landing.productsSubtitle}</h2>
              <p>Начните с понимания текущего вектора или поддерживайте изменения ежедневно.</p>
            </div>
            <div className="landing-v2-product-grid">
              <ProductCard
                ctaHref="/flow/voice"
                description={landing.diagnosisProduct.copy}
                Icon={ScanFace}
                items={landing.diagnosisProduct.items}
                price={landing.diagnosisProduct.price}
                priceNote={formatTemplate(landing.diagnosisProduct.fullReport, { price: reportPriceLabel })}
                title={landing.diagnosisProduct.title}
                cta={landing.diagnosisProduct.cta}
                tone="cyan"
              />
              <ProductCard
                ctaHref="/habits"
                description={landing.habitsProduct.copy}
                Icon={Compass}
                items={landing.habitsProduct.items}
                price={formatTemplate(landing.habitsProduct.price, { price: habitPriceLabel })}
                priceNote={habitTrialDays > 0 ? formatTemplate(landing.habitsProduct.trial, { days: habitTrialDays }) : ""}
                title={landing.habitsProduct.title}
                cta={landing.habitsProduct.cta}
                tone="violet"
                id="navigator"
              />
            </div>
          </div>
        </section>

        <section id="coaches" className="landing-v2-band landing-v2-band-violet">
          <div className="landing-v2-container landing-v2-band-inner">
            <p className="landing-v2-eyebrow"><UsersRound size={15} aria-hidden="true" /> {landing.coaches.eyebrow}</p>
            <h2>{landing.coaches.title}</h2>
            <p className="landing-v2-band-copy">{landing.coaches.copy}</p>
            <div className="landing-v2-feature-grid">
              {landing.coaches.features.map((feature, index) => (
                <div key={feature}>
                  {index === 0 ? <UsersRound size={20} aria-hidden="true" /> : index === 1 ? <Activity size={20} aria-hidden="true" /> : <FileText size={20} aria-hidden="true" />}
                  <strong>{feature}</strong>
                </div>
              ))}
            </div>
            <Link className="landing-v2-button landing-v2-button-inline" href="/coach">
              {landing.coaches.cta}
              <ArrowRight size={17} aria-hidden="true" />
            </Link>
          </div>
        </section>

        <section id="partners" className="landing-v2-band landing-v2-band-gold">
          <div className="landing-v2-container landing-v2-band-inner">
            <p className="landing-v2-eyebrow"><Handshake size={15} aria-hidden="true" /> {landing.partners.eyebrow}</p>
            <h2>{landing.partners.title}</h2>
            <p className="landing-v2-band-copy">{landing.partners.copy}</p>
            <div className="landing-v2-partner-grid">
              {landing.partners.programs.map((program, index) => (
                <article key={program.title}>
                  {index === 0 ? <Handshake size={22} aria-hidden="true" /> : <BriefcaseBusiness size={22} aria-hidden="true" />}
                  <h3>{program.title}</h3>
                  <p>{program.copy}</p>
                </article>
              ))}
            </div>
            <Link className="landing-v2-button landing-v2-button-inline" href="/partners">
              {landing.partners.cta}
              <ArrowRight size={17} aria-hidden="true" />
            </Link>
          </div>
        </section>

        <footer id="feedback" className="landing-v2-footer">
          <div className="landing-v2-container landing-v2-footer-inner">
            <Link className="landing-v2-footer-brand" href="#about">
              <img src="/assets/orken-penguin-transparent.png" alt="" />
              <span>ORKEN.LIFE</span>
            </Link>
            <nav aria-label="Юридические документы и поддержка">
              <Link href="/offer"><FileText size={15} aria-hidden="true" /> Публичная оферта</Link>
              <Link href="/privacy"><ShieldCheck size={15} aria-hidden="true" /> Политика конфиденциальности</Link>
              <a href={`mailto:${SUPPORT_EMAIL}`}><Mail size={15} aria-hidden="true" /> {SUPPORT_EMAIL}</a>
            </nav>
          </div>
        </footer>
      </main>
    </div>
  );
}

function LandingNav() {
  const { landing: landingText } = useSiteText();
  const landing = landingText.v2;
  const [mobileOpen, setMobileOpen] = useState(false);
  const closeMobile = () => setMobileOpen(false);

  const sectionLinks = [
    ["#about", landing.menu.about],
    ["#diagnostic", landing.menu.diagnostics],
    ["#navigator", landing.menu.navigator],
    ["#coaches", landing.menu.coaches],
    ["#partners", landing.menu.partners]
  ] as const;

  return (
    <header className="landing-v2-nav">
      <div className="landing-v2-container landing-v2-nav-inner">
        <Link className="landing-v2-brand" href="#about" onClick={closeMobile}>
          <img src="/assets/orken-penguin-transparent.png" alt="Пингвин ORKEN" />
          <span>ORKEN.LIFE</span>
        </Link>
        <button
          className="landing-v2-menu-button"
          type="button"
          aria-label={mobileOpen ? "Закрыть меню" : "Открыть меню"}
          aria-expanded={mobileOpen}
          aria-controls="landing-navigation"
          onClick={() => setMobileOpen((value) => !value)}
        >
          {mobileOpen ? <X size={21} aria-hidden="true" /> : <Menu size={21} aria-hidden="true" />}
        </button>
        <div id="landing-navigation" className={`landing-v2-nav-panel${mobileOpen ? " is-open" : ""}`}>
          <nav className="landing-v2-section-links" aria-label="Разделы сайта">
            {sectionLinks.map(([href, label]) => <a href={href} key={href} onClick={closeMobile}>{label}</a>)}
          </nav>
          <div className="landing-v2-nav-actions">
            <details className="landing-v2-dropdown" name="landing-nav-menu">
              <summary><LifeBuoy size={16} aria-hidden="true" /> {landing.menu.feedback} <ChevronDown size={14} aria-hidden="true" /></summary>
              <div className="landing-v2-dropdown-menu" role="menu">
                <Link href="/offer" role="menuitem" onClick={closeMobile}><FileText size={16} aria-hidden="true" /> Публичная оферта</Link>
                <Link href="/privacy" role="menuitem" onClick={closeMobile}><ShieldCheck size={16} aria-hidden="true" /> Политика конфиденциальности</Link>
                <a href={`mailto:${SUPPORT_EMAIL}`} role="menuitem" onClick={closeMobile}><Mail size={16} aria-hidden="true" /> Написать в поддержку</a>
              </div>
            </details>
            <details className="landing-v2-dropdown" name="landing-nav-menu">
              <summary><UserCircle size={16} aria-hidden="true" /> {landing.menu.cabinet} <ChevronDown size={14} aria-hidden="true" /></summary>
              <div className="landing-v2-dropdown-menu" role="menu">
                {cabinetLinks.map(({ href, label, Icon }) => (
                  <Link href={href} role="menuitem" key={href} onClick={closeMobile}><Icon size={16} aria-hidden="true" /> {label}</Link>
                ))}
              </div>
            </details>
          </div>
        </div>
      </div>
    </header>
  );
}

function ProductCard(props: {
  Icon: typeof ScanFace;
  cta: string;
  ctaHref: string;
  description: string;
  id?: string;
  items: readonly string[];
  price: string;
  priceNote: string;
  title: string;
  tone: "cyan" | "violet";
}) {
  const { Icon, cta, ctaHref, description, id, items, price, priceNote, title, tone } = props;

  return (
    <article id={id} className={`landing-v2-product landing-v2-product-${tone}`}>
      <span className="landing-v2-product-icon"><Icon size={24} strokeWidth={1.9} aria-hidden="true" /></span>
      <h3>{title}</h3>
      <p>{description}</p>
      <div className="landing-v2-checks">
        {items.map((item) => <span key={item}><Check size={15} strokeWidth={2.5} aria-hidden="true" /> {item}</span>)}
      </div>
      <div className="landing-v2-price">
        <strong>{price}</strong>
        {priceNote && <small>{priceNote}</small>}
      </div>
      <Link className="landing-v2-button" href={ctaHref}>{cta}<ArrowRight size={17} aria-hidden="true" /></Link>
    </article>
  );
}

function formatTemplate(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce((result, [key, value]) => result.replaceAll(`{${key}}`, String(value)), template);
}
