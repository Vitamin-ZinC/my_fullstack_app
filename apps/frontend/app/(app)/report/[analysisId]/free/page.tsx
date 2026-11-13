"use client";
import { uiText, getFormatLocale, useUiLocale } from "@/lib/locale";


import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { ReportFree } from "@levelup/contracts";
import { IkigaiPremiumMap } from "@/components/IkigaiPremiumMap";
import { api, restoreSessionFromUrl } from "@/lib/api";
import { useSiteText } from "@/lib/useSiteText";
import { Check } from "lucide-react";

export default function FreeReportPage() {
  useUiLocale();
  const text = useSiteText().report.free;
  const { analysisId } = useParams<{ analysisId: string }>();
  const [report, setReport] = useState<ReportFree | null>(null);
  const [error, setError] = useState("");
  const [priceLabel, setPriceLabel] = useState<string | null>(null);

  useEffect(() => {
    restoreSessionFromUrl();
    api.getFreeReport(analysisId)
      .then((result) => setReport(result.reportFree))
      .catch((reason) => setError(reason instanceof Error ? reason.message : text.loadError));
    let active = true;
    api.getPaymentConfig().then(config => { if (active) setPriceLabel(config.priceLabel); }).catch(() => undefined);
    return () => { active = false; };
  }, [analysisId, text.loadError]);

  return (
    <article className="stack free-report-layout" data-testid="free-report-page">
      <div className="free-report-intro">
        <div className="eyebrow">{text.eyebrow}</div>
        <h1 className="ub">{report ? text.title : text.loading}</h1>
        <p className="muted">{report ? text.subtitle : text.pending}</p>
      </div>
      {error && <div className="card" style={{ borderColor: "var(--danger)" }}>{error}</div>}
      {report && (
        <div className="card cyan-border free-status-card">
          <div className="ub">{text.statusTitle}</div>
          <p>{text.statusIntro}</p>
          <h2 className="ub cyan">{report.profession}</h2>
          <p>{report.summary}</p>
          {report.key_insight && (
            <div className="free-key-insight">
              <div className="ub cyan">{text.insightTitle}</div>
              <p>{report.key_insight}</p>
            </div>
          )}
        </div>
      )}
      {report && <div className="free-report-map-card">
        <h2>{text.intersectionsTitle}</h2>
        <IkigaiPremiumMap freeMode showPanel={false} />
        <p className="muted">{text.mapMeaning}</p>
      </div>}
      {report && (
        <div className="card cyan-border free-upgrade-card">
          <h2>{text.premiumTitle}{priceLabel && <span className="cyan"> · {priceLabel}</span>}</h2>
          <ul className="premium-benefits" data-testid="premium-benefits">{text.premiumBenefits.map((item, index) => <li key={index}><Check size={18} aria-hidden="true" /><span>{item}</span></li>)}</ul>
          <button className="button" data-testid="open-pro-report-link" onClick={() => window.location.assign(`/pay/${analysisId}`)}>
            {priceLabel ? text.premiumButton.replace("{price}", priceLabel) : text.openPremium}
          </button>
          <div className="very-muted free-upgrade-note">{text.upgradeNote}</div>
        </div>
      )}
    </article>
  );
}
