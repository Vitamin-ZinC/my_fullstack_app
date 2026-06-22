"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { ReportFull, RoleFit } from "@levelup/contracts";
import { IkigaiPremiumMap, type IkigaiMapZone } from "@/components/IkigaiPremiumMap";
import { api } from "@/lib/api";
import { useSiteText } from "@/lib/useSiteText";

export default function FullReportPage() {
  const siteText = useSiteText();
  const text = siteText.report.full;
  const habitsText = siteText.habits;
  const { analysisId } = useParams<{ analysisId: string }>();
  const [report, setReport] = useState<ReportFull | null>(null);
  const [error, setError] = useState("");
  const personalizedZones = report ? buildReportIkigaiZones(report) : undefined;

  useEffect(() => {
    api.getFullReport(analysisId)
      .then((result) => setReport(result.reportFull))
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Не удалось загрузить отчёт"));
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
          {text.toc.map((item, index) => (
            <a key={item} href={`#section-${index}`}>{item}</a>
          ))}
        </nav>
      </section>

      <section id="section-0" className="report-section">
        <h2>{text.sections[0]}</h2>
        <p className="report-map-hint">{text.mapHint}</p>
        <IkigaiPremiumMap zoneOverrides={personalizedZones} />
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
                  <h3>{getMetricLabel(text.voiceLabels, key)}</h3>
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
                  <h3>{getMetricLabel(text.faceLabels, key)}</h3>
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
            <Link className="button" data-testid="activate-habits-link" href="/habits">{habitsText.trialButton}</Link>
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

function buildReportIkigaiZones(report: ReportFull): Record<"passion" | "mission" | "vocation" | "profession" | "ikigai", IkigaiMapZone> {
  const topRole = report.top_roles[0];
  const fallbackRole: RoleFit = {
    name: report.profession,
    match: Math.max(...Object.values(report.ikigai_scores)),
    why: report.summary,
    voiceEvidence: report.voice_analysis.communication,
    faceEvidence: report.face_analysis.communication,
    strengths: report.summary,
    risks: report.final_insight
  };
  const role = topRole ?? fallbackRole;

  return {
    passion: {
      title: "Passion / Страсть",
      insight: [
        "Эта зона показывает, где у вас появляется энергия и живой интерес.",
        `По голосу: ${report.voice_analysis.energy}`,
        `По мотивации: ${report.voice_analysis.motivation}`
      ].join(" "),
      recommendation: "Проверяйте задачи, где интерес не просто вдохновляет, а помогает держать фокус дольше обычного."
    },
    mission: {
      title: "Mission / Миссия",
      insight: [
        "Эта зона описывает пользу, которую вы можете давать людям и рынку.",
        `Коммуникационный сигнал: ${report.face_analysis.empathy}`,
        `Как это проявляется в контакте: ${report.face_analysis.communication}`
      ].join(" "),
      recommendation: "Формулируйте пользу через проблему клиента и измеримый результат, а не через абстрактный потенциал."
    },
    profession: {
      title: "Profession / Профессия",
      insight: [
        `Сейчас профессиональный вектор ближе всего к роли: ${report.profession}.`,
        role.why,
        `Сильная сторона: ${role.strengths}`
      ].join(" "),
      recommendation: `Начните с роли «${role.name}» и проверьте ее на маленьком платном или пилотном предложении.`
    },
    vocation: {
      title: "Vocation / Призвание",
      insight: [
        `Зона монетизации сильнее всего проявляется через ${role.match}% совпадение с направлением «${role.name}».`,
        `Голос: ${role.voiceEvidence}`,
        `Визуальный сигнал: ${role.faceEvidence}`
      ].join(" "),
      recommendation: `Главный риск при переходе к монетизации: ${role.risks}`
    },
    ikigai: {
      title: "Ikigai / Центр реализации",
      insight: report.final_insight,
      recommendation: report.career_action
    }
  };
}
