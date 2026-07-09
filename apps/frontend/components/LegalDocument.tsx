"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatLegalText, type LegalDocumentData } from "@/lib/legal";

type LegalValues = {
  reportPrice: string;
  habitPrice: string;
};

export function LegalDocument({ document }: { document: LegalDocumentData }) {
  const [values, setValues] = useState<LegalValues>({
    reportPrice: "$3",
    habitPrice: "$8"
  });

  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([api.getPaymentConfig(), api.habitConfig()])
      .then(([paymentConfig, habitConfig]) => {
        if (cancelled) return;
        setValues((current) => ({
          reportPrice: paymentConfig.status === "fulfilled" ? paymentConfig.value.priceLabel : current.reportPrice,
          habitPrice: habitConfig.status === "fulfilled" ? habitConfig.value.priceLabel : current.habitPrice
        }));
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="legal-page">
      <nav className="legal-nav">
        <Link className="logo-wrap" href="/">
          <div className="logo-mark" aria-hidden="true">
            <img src="/assets/levelup-logo.jpg" alt="" />
          </div>
          <div className="logo-text">
            <div className="brand">ORKEN.LIFE</div>
            <div className="sub">AI Ikigai</div>
          </div>
        </Link>
        <div className="legal-nav-links">
          <Link href="/privacy">Политика</Link>
          <Link href="/offer">Оферта</Link>
          <Link className="btn-back" href="/">На главную</Link>
        </div>
      </nav>

      <article className="legal-document">
        <header className="legal-hero">
          <div className="eyebrow">Legal</div>
          <h1>{document.title}</h1>
          <p>{document.dateLabel}</p>
        </header>

        <div className="legal-sections">
          {document.sections.map((section) => (
            <section className="legal-section" key={section.title}>
              <h2>{section.title}</h2>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph}>{formatLegalText(paragraph, values)}</p>
              ))}
            </section>
          ))}
        </div>
      </article>
    </main>
  );
}
