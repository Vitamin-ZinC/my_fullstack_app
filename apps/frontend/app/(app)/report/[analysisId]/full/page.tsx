"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ReportFull } from "@levelup/contracts";
import { IkigaiPremiumMap } from "@/components/IkigaiPremiumMap";
import { api } from "@/lib/api";
import { useSiteText } from "@/lib/useSiteText";

export default function FullReportPage({ params }: { params: { analysisId: string } }) {
  const siteText = useSiteText();
  const text = siteText.report.full;
  const habitsText = siteText.habits;
  const [report, setReport] = useState<ReportFull | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.getFullReport(params.analysisId)
      .then((result) => setReport(result.reportFull))
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Не удалось загрузить отчёт"));
  }, [params.analysisId]);

  if (error) {
    return (
      <article className="stack">
        <div>
          <div className="eyebrow">{text.eyebrow}</div>
          <h1 className="ub">{text.needsPayment}</h1>
          <p className="muted">{error}</p>
        </div>
        <Link className="button" href={`/pay/${params.analysisId}`}>{text.pay}</Link>
      </article>
    );
  }

  return (
    <article className="report-page stack" data-testid="full-report-page">
      <section className="report-hero">
        <div className="report-eyebrow">{text.eyebrow}</div>
        <h1 className="report-title">{text.title}</h1>
        <p className="report-lead">{report?.profession ?? text.loading}</p>
        <nav className="report-toc">
          {text.toc.map((item, index) => (
            <a key={item} href={`#section-${index}`}>{item}</a>
          ))}
        </nav>
      </section>

      <section id="section-0" className="report-section">
        <h2>{text.sections[0]}</h2>
        <img className="report-visual" src="/assets/ikigai-cones-transparent.png" alt="" />
        <IkigaiPremiumMap />
      </section>

      {report && (
        <>
          <section id="section-1" className="report-section">
            <h2>{text.sections[1]}</h2>
            <p className="report-lead">{report.summary}</p>
          </section>
          <section id="section-2" className="report-section">
            <h2>{text.sections[2]}</h2>
            <div className="metric-grid">
              {Object.entries(report.voice_analysis).map(([key, value]) => (
                <div className="metric-card" key={key}>
                  <h3>{key}</h3>
                  <p>{value}</p>
                </div>
              ))}
            </div>
          </section>
          <section id="section-3" className="report-section">
            <h2>{text.sections[3]}</h2>
            <div className="metric-grid">
              {Object.entries(report.face_analysis).map(([key, value]) => (
                <div className="metric-card" key={key}>
                  <h3>{key}</h3>
                  <p>{value}</p>
                </div>
              ))}
            </div>
          </section>
          <section id="section-4" className="report-section">
            <h2>{text.sections[4]}</h2>
            <div className="roles-grid">
              {report.top_roles.map((role) => (
                <div className="role-card" key={role.name}>
                  <div className="role-head">
                    <h3>{role.name}</h3>
                    <span>{role.match}% {text.match}</span>
                  </div>
                  <p>{role.why}</p>
                  <div className="reason-item">{role.strengths}</div>
                  <div className="reason-item">{role.risks}</div>
                </div>
              ))}
            </div>
          </section>
          <section id="section-5" className="report-section">
            <h2>{text.sections[5]}</h2>
            <p className="report-lead">{report.top_roles.map((role) => role.risks).join(" ")}</p>
          </section>
          <section id="section-6" className="report-section">
            <h2>{text.sections[6]}</h2>
            <div className="highlight-box">{report.career_action}</div>
          </section>
          <section id="section-7" className="report-section">
            <h2>{text.sections[7]}</h2>
            <p className="report-lead">{report.final_insight}</p>
          </section>
          <section className="habit-bridge-card">
            <div className="habit-bridge-kicker">{habitsText.trial}</div>
            <div className="habit-bridge-title">{habitsText.currentHabit.title}</div>
            <div className="habit-bridge-text">{habitsText.currentHabit.essence}</div>
            <div className="habit-bridge-grid">
              <div className="habit-bridge-item"><strong>{habitsText.currentHabit.focus}</strong>{habitsText.currentHabit.practice}</div>
              <div className="habit-bridge-item"><strong>{habitsText.currentHabit.book}</strong>{habitsText.currentHabit.why}</div>
              <div className="habit-bridge-item"><strong>{habitsText.dashboardTitle}</strong>{habitsText.dashboardCopy}</div>
            </div>
            <Link className="button" href="/habits">{habitsText.trialButton}</Link>
          </section>
          <div className="print-actions">
            <button className="button" onClick={() => window.print()}>{text.savePdf}</button>
          </div>
        </>
      )}
    </article>
  );
}
