"use client";

import type { PartnerCommissionTerm, PartnerCommissionTerms as Terms } from "@levelup/contracts";
import { getFormatLocale, useUiLocale } from "@/lib/locale";
import styles from "./PartnerCommissionTerms.module.css";

export function CommissionSummary({ term }: { term: PartnerCommissionTerm }) {
  const en = useUiLocale() === "en";
  const labels = en ? { program: "Program standard", partner: "Partner terms", referral_link: "Link terms" }
    : { program: "Стандарт программы", partner: "Условия партнёра", referral_link: "Условия ссылки" };
  return <div className={styles.summary} data-testid="commission-summary">
    <strong>{new Intl.NumberFormat(getFormatLocale(), { maximumFractionDigits: 2 }).format(term.effectiveRateBps / 100)}%</strong>
    <span>{labels[term.source]}</span>
    <span>{en ? "Effective from: " : "Действует с: "}<time dateTime={term.effectiveAt}>{new Date(term.effectiveAt).toLocaleString(getFormatLocale())}</time></span>
  </div>;
}

export function PartnerCommissionTerms({ terms, partnerAccountId }: { terms?: Terms; partnerAccountId?: string }) {
  const en = useUiLocale() === "en";
  const own = terms?.partners.filter(term => term.partnerAccountId === partnerAccountId) ?? [];
  if (!own.length) return null;
  return <section className="partner-panel" data-testid="partner-commission-terms">
    <div className="partner-panel-head"><h2>{en ? "Your commission terms" : "Ваши условия комиссии"}</h2></div>
    {own.map(term => <div className={styles.program} key={term.programId}>
      {own.length > 1 && <span>{term.programId}</span>}
      <CommissionSummary term={term} />
    </div>)}
  </section>;
}
