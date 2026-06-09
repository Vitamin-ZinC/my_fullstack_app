"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ReportFull } from "@levelup/contracts";
import { IkigaiPremiumMap } from "@/components/IkigaiPremiumMap";
import { api } from "@/lib/api";

export default function FullReportPage({ params }: { params: { analysisId: string } }) {
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
          <div className="eyebrow">PRO-отчёт</div>
          <h1 className="ub">Нужна оплата</h1>
          <p className="muted">{error}</p>
        </div>
        <Link className="button" href={`/pay/${params.analysisId}`}>Перейти к оплате</Link>
      </article>
    );
  }

  return (
    <article className="stack" data-testid="full-report-page">
      <section>
        <div className="eyebrow">PRO-отчёт</div>
        <h1 className="ub">{report?.profession ?? "Загружаем полный отчёт..."}</h1>
        <nav className="toc">
          <a href="#map">Карта</a>
          <a href="#voice">Голос</a>
          <a href="#face">Лицо</a>
          <a href="#roles">Роли</a>
          <a href="#plan">План</a>
        </nav>
      </section>
      <section id="map"><IkigaiPremiumMap /></section>
      {report && (
        <>
          <section id="voice" className="card"><h2>Анализ голоса</h2><p className="muted">{report.voice_analysis.confidence}</p><p>{report.voice_analysis.communication}</p></section>
          <section id="face" className="card"><h2>Анализ лица</h2><p className="muted">{report.face_analysis.confidence}</p><p>{report.face_analysis.thinkingType}</p></section>
          <section id="roles" className="grid grid-2">
            {report.top_roles.map((role) => (
              <div className="card" key={role.name}>
                <div className="eyebrow">{role.match}% совпадение</div>
                <h2>{role.name}</h2>
                <p className="muted">{role.why}</p>
              </div>
            ))}
          </section>
          <section id="plan" className="card"><h2>Карьерное действие</h2><p>{report.career_action}</p><p className="muted">{report.final_insight}</p></section>
        </>
      )}
    </article>
  );
}
