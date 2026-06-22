"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { IkigaiScores, ReportFull } from "@levelup/contracts";
import { IkigaiPremiumMap } from "@/components/IkigaiPremiumMap";
import { api, restoreSessionFromUrl } from "@/lib/api";
import { useSiteText } from "@/lib/useSiteText";

type DiagnosticMapKey = keyof Pick<IkigaiScores, "love" | "good_at" | "paid_for" | "world_needs">;

export default function FullReportPage() {
  const siteText = useSiteText();
  const text = siteText.report.full;
  const habitsText = siteText.habits;
  const { analysisId } = useParams<{ analysisId: string }>();
  const [report, setReport] = useState<ReportFull | null>(null);
  const [error, setError] = useState("");
  const visibleToc = text.toc;
  const visibleSections = text.sections;

  useEffect(() => {
    restoreSessionFromUrl();
    api.getFullReport(analysisId)
      .then((result) => setReport(result.reportFull))
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Не удалось загрузить отчет"));
  }, [analysisId]);

  if (error) {
    return (
      <article className="stack">
        <div>
          <div className="eyebrow">{text.eyebrow}</div>
          <h1 className="ub">{text.needsPayment}</h1>
          <p className="muted">{error}</p>
        </div>
        <Link className="button" href={`/pay/${analysisId}`}>{text.pay}</Link>
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
          {visibleToc.map((item, index) => (
            <a key={item} href={`#section-${index}`}>{item}</a>
          ))}
        </nav>
      </section>

      {report && (
        <>
          <section id="section-0" className="report-section report-map-section">
            <h2>{visibleSections[0]}</h2>
            <p className="report-map-hint">{text.mapHint}</p>
            <IkigaiPremiumMap zoneOverrides={report.ikigai_zones} />
          </section>
          <section id="section-1" className="report-section">
            <h2>{visibleSections[1]}</h2>
            <p className="report-lead">{report.summary}</p>
          </section>
          <section id="section-2" className="report-section">
            <h2>{visibleSections[2]}</h2>
            <div className="metric-grid">
              {Object.entries(report.voice_analysis).map(([key, value]) => {
                const label = getMetricLabel(text.voiceLabels, key);
                return (
                  <div className="metric-card" key={key}>
                    <h3>{label}</h3>
                    <p>{formatDiagnosticValue(label, value)}</p>
                  </div>
                );
              })}
            </div>
          </section>
          <section id="section-3" className="report-section">
            <h2>{visibleSections[3]}</h2>
            <div className="metric-grid">
              {Object.entries(report.face_analysis).map(([key, value]) => {
                const label = getMetricLabel(text.faceLabels, key);
                return (
                  <div className="metric-card" key={key}>
                    <h3>{label}</h3>
                    <p>{formatDiagnosticValue(label, value)}</p>
                  </div>
                );
              })}
            </div>
          </section>
          <section id="section-4" className="report-section">
            <h2>{visibleSections[4]}</h2>
            <div className="roles-grid">
              {report.top_roles.map((role) => (
                <div className="role-card" key={role.name}>
                  <div className="role-head">
                    <h3>{role.name}</h3>
                    <span>{role.match}% {text.match}</span>
                  </div>
                  <p>{role.why}</p>
                  <div className="reason-item">{role.voiceEvidence}</div>
                  <div className="reason-item">{role.faceEvidence}</div>
                  <div className="reason-item">{role.strengths}</div>
                  <div className="reason-item">{role.risks}</div>
                </div>
              ))}
            </div>
          </section>
          <section id="section-5" className="report-section">
            <h2>{visibleSections[5]}</h2>
            <p className="report-lead">{report.top_roles.map((role) => role.risks).join(" ")}</p>
          </section>
          <section id="section-6" className="report-section">
            <h2>{visibleSections[6]}</h2>
            <div className="highlight-box">{report.career_action}</div>
          </section>
          <section id="section-7" className="report-section">
            <h2>{visibleSections[7]}</h2>
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
            <Link
              className="button"
              data-testid="activate-habits-link"
              href="/habits?from=ikigai"
              onClick={() => storeHabitProfile(report)}
            >
              {habitsText.trialButton}
            </Link>
          </section>
          <div className="print-actions">
            <button className="button" data-testid="save-report-pdf-button" type="button" onClick={() => requestAnimationFrame(() => window.print())}>{text.savePdf}</button>
          </div>
        </>
      )}
    </article>
  );
}

function getMetricLabel(labels: Record<string, string>, key: string) {
  return labels[key] ?? key;
}

function formatDiagnosticValue(label: string, value: string) {
  const trimmed = value.trim();
  if (trimmed.length > 24 && trimmed.toLowerCase() !== label.toLowerCase()) return value;

  return `По параметру "${label}" для старых отчетов не было сохранено развернутое пояснение. Новые диагностики ORKEN.LIFE формируют здесь персональную интерпретацию: что сигнал может означать в работе, где он помогает, какой риск создает и какой шаг развития выбрать.`;
}

function storeHabitProfile(report: ReportFull) {
  if (typeof window === "undefined") return;

  const topRole = report.top_roles[0];
  const weakZone = weakestIkigaiZone(report.ikigai_scores);
  const profile = {
    source: "orken-life-full-report",
    weakZone,
    archetype: report.profession,
    topRole: topRole?.name || report.profession,
    strengths: splitStrengths(topRole?.strengths || report.summary),
    faceInsight: topRole?.faceEvidence || report.face_analysis.communication,
    voiceInsight: topRole?.voiceEvidence || report.voice_analysis.communication,
    careerAction: report.career_action,
    finalInsight: report.final_insight,
    subscriptionPrice: "$8"
  };

  window.localStorage.setItem("levelup_habit_profile", JSON.stringify(profile));
}

function weakestIkigaiZone(scores: IkigaiScores) {
  const zoneByScore: Record<DiagnosticMapKey, "passion" | "mission" | "profession" | "vocation"> = {
    love: "passion",
    world_needs: "mission",
    good_at: "profession",
    paid_for: "vocation"
  };
  const weakest = (Object.entries(scores) as Array<[DiagnosticMapKey, number]>)
    .sort((a, b) => a[1] - b[1])[0]?.[0] ?? "paid_for";
  return zoneByScore[weakest];
}

function splitStrengths(value: string) {
  const parts = value
    .split(/[,.]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 4);
  return parts.length > 0 ? parts : ["ясность", "структурирование", "практическая польза"];
}
