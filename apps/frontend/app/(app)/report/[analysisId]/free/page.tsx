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
      <div>
        <div className="eyebrow">{text.eyebrow}</div>
        <h1 className="ub">{report ? text.title : text.loading}</h1>
        <p className="muted">{report ? `${text.baseRole}: ${report.profession}. ${report.summary}` : text.pending}</p>
      </div>
      {error && <div className="card" style={{ borderColor: "var(--danger)" }}>{error}</div>}
      <IkigaiPremiumMap />
      {report && (
        <div className="grid grid-2">
          {Object.entries(report.ikigai_scores).map(([key, value]) => (
            <div className="card" key={key}>
              <div className="eyebrow">{key}</div>
              <h2>{value}%</h2>
            </div>
          ))}
        </div>
      )}
      {report && (
        <button className="button" data-testid="open-pro-report-link" onClick={() => window.location.assign(`/pay/${analysisId}`)}>
          {text.unlock}
        </button>
      )}
    </article>
  );
}
