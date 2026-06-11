"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import type { AnalysisProgressEvent } from "@levelup/contracts";
import { api, createProgressSource, getAnalysisDraft } from "@/lib/api";
import { useSiteText } from "@/lib/useSiteText";

export default function AnalysisPage() {
  const text = useSiteText().flow.analysis;
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("QUEUED");
  const [log, setLog] = useState(text.waiting);
  const [analysisId, setAnalysisId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const draft = getAnalysisDraft();
    if (!draft) {
      setError(text.noAnalysis);
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
      if (next.status === "DONE") setLog(text.ready);
      if (next.status === "FAILED") setError(next.errorMessage || text.failed);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : text.failed);
    }
  }

  const normalizedProgress = Math.max(0, Math.min(100, Math.round(progress)));
  const activeStage = useMemo(() => {
    if (status === "DONE") return text.stages.length;
    return Math.min(text.stages.length - 1, Math.floor(normalizedProgress / Math.max(1, 100 / text.stages.length)));
  }, [normalizedProgress, status, text.stages.length]);

  return (
    <div className="flow-inner" data-testid="analysis-page">
      <div className="ub very-muted analysis-kicker">{text.eyebrow}</div>
      <h1 className="ub flow-title">{text.title}</h1>
      <p className="muted flow-copy">{status}</p>

      <div className="analysis-video-card">
        <video src="/assets/processing-analysis.mp4" autoPlay muted loop playsInline />
      </div>

      <div className="analysis-progress-card">
        <div className="analysis-orb" style={{ "--progress": `${normalizedProgress * 3.6}deg` } as CSSProperties}>
          <span className="ub">{normalizedProgress}%</span>
        </div>
        <p className="muted">{log}</p>
      </div>

      <div className="card">
        <div className="ub muted instruction-title">{text.stagesTitle}</div>
        <div className="analysis-stage-list">
          {text.stages.map((stage, index) => (
            <div className={`analysis-stage ${index < activeStage ? "done" : index === activeStage ? "active" : ""}`} key={stage}>
              <span>{index < activeStage ? "✓" : index === activeStage ? "●" : "○"}</span>
              {stage}
            </div>
          ))}
        </div>
      </div>

      <div className="neuro-log">
        <div className="ub muted instruction-title">{text.logTitle}</div>
        {[text.waiting, log, status === "DONE" ? text.ready : text.processing].map((item, index) => (
          <div className="neuro-log-item" key={`${item}-${index}`}>
            <span className="neuro-log-dot" />
            {item}
          </div>
        ))}
      </div>

      {error && <div className="card error-card">{error}</div>}
      {status === "DONE" && analysisId && (
        <button className="button" data-testid="free-report-link" onClick={() => window.location.assign(`/report/${analysisId}/free`)}>
          {text.openReport}
        </button>
      )}
    </div>
  );
}
