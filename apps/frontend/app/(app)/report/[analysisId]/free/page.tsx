"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { ReportFree } from "@levelup/contracts";
import { IkigaiPremiumMap } from "@/components/IkigaiPremiumMap";
import { api } from "@/lib/api";
import { useSiteText } from "@/lib/useSiteText";

export default function FreeReportPage() {
  const text = useSiteText().report.free;
  const { analysisId } = useParams<{ analysisId: string }>();
  const [report, setReport] = useState<ReportFree | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.getFreeReport(analysisId)
      .then((result) => setReport(result.reportFree))
      .catch((reason) => setError(reason instanceof Error ? reason.message : text.loadError));
  }, [analysisId, text.loadError]);

  return (
    <article className="stack" data-testid="free-report-page">
      <div className="free-report-intro">
        <div className="eyebrow">{text.eyebrow}</div>
        <h1 className="ub">{report ? text.title : text.loading}</h1>
        <p className="muted">{report ? text.subtitle : text.pending}</p>
      </div>
      {error && <div className="card" style={{ borderColor: "var(--danger)" }}>{error}</div>}
      <div className="card free-report-map-card">
        <IkigaiPremiumMap freeMode />
      </div>
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
      {report && (
        <div className="card cyan-border free-upgrade-card">
          {report.paid_report_teaser && <p>{report.paid_report_teaser}</p>}
          {report.paid_report_preview && report.paid_report_preview.length > 0 && (
            <div className="free-paid-preview">
              <div className="ub cyan">{text.paidPreviewTitle}</div>
              {report.paid_report_preview.map((item) => (
                <div className="free-paid-preview-item" key={item}>{item}</div>
              ))}
            </div>
          )}
          <p>{text.upgradeCopy}</p>
          <button className="button" data-testid="open-pro-report-link" onClick={() => window.location.assign(`/pay/${analysisId}`)}>
            {text.unlock}
          </button>
          <div className="very-muted free-upgrade-note">{text.upgradeNote}</div>
        </div>
      )}
    </article>
  );
}
