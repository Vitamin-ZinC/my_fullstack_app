"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const logs = [
  "Анализируем микромимику...",
  "Оценка тембрального окраса...",
  "Сопоставление с базой 500+ профессий...",
  "Собираем premium-структуру отчёта..."
];

export default function AnalysisPage() {
  const [progress, setProgress] = useState(0);
  const [analysisId, setAnalysisId] = useState("local-preview");

  useEffect(() => {
    setAnalysisId(window.sessionStorage.getItem("levelup_analysis_id") || "local-preview");
    const timer = window.setInterval(() => setProgress((value) => Math.min(100, value + 7)), 500);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="stack">
      <div>
        <div className="eyebrow">Обработка</div>
        <h1>Идёт анализ</h1>
        <p className="muted">Production-версия подключает эту страницу к SSE `/api/analyses/:id/stream`.</p>
      </div>
      <div className="video-frame">
        <video src="/assets/processing-analysis.mp4" autoPlay muted loop playsInline />
      </div>
      <div className="card">
        <div style={{ height: 12, borderRadius: 999, background: "rgba(255,255,255,.08)", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${progress}%`, background: "linear-gradient(90deg, var(--cyan), var(--violet))" }} />
        </div>
        <h2>{progress}%</h2>
        <div className="stack">
          {logs.map((log, index) => <div className="muted" key={log}>{progress > index * 25 ? log : "Ожидает..."}</div>)}
        </div>
      </div>
      {progress >= 100 && <Link className="button" href={`/report/${analysisId}/free`}>Открыть бесплатный отчёт</Link>}
    </div>
  );
}
