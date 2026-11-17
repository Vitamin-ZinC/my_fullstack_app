"use client";

import Link from "next/link";
import { AudioLines, ScanFace, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { api, getAnalysisDraft } from "@/lib/api";
import { useSiteText } from "@/lib/useSiteText";

export default function DiagnosticStartPage() {
  const text = useSiteText();
  const copy = text.flow.start;
  const [price, setPrice] = useState<string | null>(null);
  const [resume, setResume] = useState("");
  useEffect(() => {
    let active = true;
    api.getPaymentConfig().then(config => { if (active) setPrice(config.priceLabel); }).catch(() => undefined);
    try {
      const draft = getAnalysisDraft();
      if (draft) {
        setResume(window.sessionStorage.getItem("levelup_voice_ready") === "1" ? "/flow/face" : "/flow/voice");
        api.getStatus(draft.analysisId).then(result => {
          if (active && ["QUEUED", "TRANSCRIBING", "ANALYZING", "PROCESSING", "DONE"].includes(result.status)) setResume("/flow/analysis");
        }).catch(() => { if (active) setResume(""); });
      }
    } catch { /* Starting a new diagnostic does not require browser storage. */ }
    return () => { active = false; };
  }, []);
  const icons = [AudioLines, ScanFace, Sparkles];
  const consentParts = copy.consent.split(/(Оферт[а-яё]*|Политик[а-яё]*\s+конфиденциальности|\bTerms(?:\s+of\s+Service)?\b|\bPrivacy\s+Policy\b)/giu);
  return <article className="diagnostic-start stack" data-testid="diagnostic-start-page">
    <header className="diagnostic-start-header">
      <div><div className="eyebrow">{copy.eyebrow}</div><h1 className="ub">{copy.title}</h1><p className="muted">{copy.copy}</p></div>
      <img src="/assets/orken-penguin-transparent.png" alt="" width={160} height={180} />
    </header>
    <section aria-labelledby="diagnostic-steps-title">
      <h2 id="diagnostic-steps-title">{copy.stepsTitle}</h2>
      <ol className="diagnostic-start-steps">{copy.steps.map(([title, description], index) => {
        const Icon = icons[index] || Sparkles;
        return <li key={title}><Icon aria-hidden="true" size={28} /><h3>{index + 1}. {title}</h3><p>{description}</p></li>;
      })}</ol>
    </section>
    <section className="diagnostic-start-results" aria-labelledby="diagnostic-result-title">
      <h2 id="diagnostic-result-title">{copy.resultTitle}</h2>
      <p>{copy.free}</p>
      <h3>{price ? copy.premium.replace("{price}", price) : text.report.payment.title}</h3>
      <p>{copy.premiumCopy}</p>
    </section>
    <p className="muted" data-testid="diagnostic-consent-note">{consentParts.map((part, index) => index % 2
      ? <Link key={index} href={/^(Оферт|Terms)/iu.test(part) ? "/offer" : "/privacy"}>{part}</Link>
      : part)}</p>
    <Link className="button" data-testid="diagnostic-begin" href="/flow/voice">{copy.begin}</Link>
    {resume && <Link className="button secondary" href={resume}>{copy.resume}</Link>}
  </article>;
}
