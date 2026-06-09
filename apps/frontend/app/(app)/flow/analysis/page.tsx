"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { AnalysisProgressEvent } from "@levelup/contracts";
import { api, createProgressSource, getAnalysisDraft } from "@/lib/api";

export default function AnalysisPage() {
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("QUEUED");
  const [log, setLog] = useState("Ожидаем обработку...");
  const [analysisId, setAnalysisId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const draft = getAnalysisDraft();
    if (!draft) {
      setError("Анализ не был создан");
      return;
    }

    setAnalysisId(draft.analysisId);
    const source = createProgressSource(draft.analysisId);
    source.onmessage = (event) => {
      const data = JSON.parse(event.data) as AnalysisProgressEvent;
      if (typeof data.progress === "number") setProgress(data.progress);
      if (data.status) setStatus(data.status);
      if (data.log) setLog(data.log);
      if (data.status === "DONE" || data.status === "FAILED") source.close();
    };
    source.onerror = () => {
      source.close();
      void poll(draft.analysisId);
    };

    const interval = window.setInterval(() => void poll(draft.analysisId), 2500);
    return () => {
      source.close();
      window.clearInterval(interval);
    };
  }, []);

  async function poll(id: string) {
    try {
      const next = await api.getStatus(id);
      setStatus(next.status);
      setProgress(next.progress);
      if (next.errorMessage) setLog(next.errorMessage);
      if (next.status === "DONE") setLog("Отчёт готов");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось загрузить статус анализа");
    }
  }

  return (
    <div className="stack" data-testid="analysis-page">
      <div>
        <div className="eyebrow">AI-анализ</div>
        <h1 className="ub">Идёт обработка</h1>
        <p className="muted">{status}</p>
      </div>
      <div className="video-frame">
        <video src="/assets/processing-analysis.mp4" autoPlay muted loop playsInline />
      </div>
      {error && <div className="card" style={{ borderColor: "var(--danger)" }}>{error}</div>}
      <div className="card">
        <div style={{ height: 12, borderRadius: 999, background: "rgba(255,255,255,.08)", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${progress}%`, background: "linear-gradient(90deg, var(--cyan), var(--violet))" }} />
        </div>
        <h2>{progress}%</h2>
        <p className="muted">{log}</p>
      </div>
      {status === "DONE" && analysisId && <Link className="button" data-testid="free-report-link" href={`/report/${analysisId}/free`}>Открыть бесплатный отчёт</Link>}
    </div>
  );
}
