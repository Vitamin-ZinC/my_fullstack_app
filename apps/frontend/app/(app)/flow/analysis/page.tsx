"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import type { AnalysisProgressEvent } from "@levelup/contracts";
import { api, createProgressSource, getAnalysisDraft } from "@/lib/api";
import { useSiteText } from "@/lib/useSiteText";

const logThresholds = [5, 18, 32, 48, 64, 80, 94];
const emailPattern = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/;

export default function AnalysisPage() {
  const text = useSiteText().flow.analysis;
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("QUEUED");
  const [log, setLog] = useState(text.waiting);
  const [analysisId, setAnalysisId] = useState("");
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [contactBusy, setContactBusy] = useState(false);
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

  function stageState(index: number) {
    if (status === "DONE" || index < activeStage) return "done";
    if (index === activeStage) return "active";
    return "wait";
  }

  function logState(index: number) {
    const threshold = logThresholds[index] ?? 0;
    if (status === "DONE") return index === text.neuralLog.length - 1 ? "active" : "done";
    if (normalizedProgress > threshold + 12) return "done";
    if (normalizedProgress >= threshold) return "active";
    return "";
  }

  async function saveEmailAndOpen() {
    const trimmed = email.trim();
    if (!isValidEmail(trimmed)) {
      setEmailError(text.contactInvalid);
      return;
    }

    setContactBusy(true);
    setEmailError("");
    try {
      window.sessionStorage.setItem("levelup_contact_email", trimmed);
      await api.saveReportContact(analysisId, trimmed);
      window.location.assign(`/report/${analysisId}/free`);
    } catch (reason) {
      setEmailError(reason instanceof Error ? reason.message : text.contactSendError);
    } finally {
      setContactBusy(false);
    }
  }

  const done = status === "DONE";

  return (
    <div className="flow-inner" data-testid="analysis-page">
      <div className="ub very-muted analysis-kicker">{text.eyebrow}</div>
      <h1 className="ub flow-title">{done ? text.completeTitle : text.title}</h1>
      <p className="muted flow-copy">{done ? text.completeSubtitle : text.subtitle}</p>

      <div className="analysis-video-card">
        <video src="/assets/processing-analysis.mp4" autoPlay muted loop playsInline />
      </div>

      <div className="analysis-progress-card">
        <div className="analysis-orb" style={{ "--progress": `${normalizedProgress * 3.6}deg` } as CSSProperties}>
          <span className="ub">{normalizedProgress}%</span>
        </div>
        <p className="muted">{done ? text.ready : log}</p>
      </div>

      <div className="card">
        <div className="ub muted instruction-title">{text.stagesTitle}</div>
        <div className="analysis-stage-list">
          {text.stages.map((stage, index) => {
            const state = stageState(index);
            return (
            <div className={`analysis-stage ${state}`} key={stage}>
              <div className="analysis-stage-main">
                <span className="analysis-stage-dot" />
                {stage}
              </div>
              <span className={`analysis-stage-badge ${state}`}>
                {state === "done" ? text.stageDone : state === "active" ? text.stageActive : text.stageQueued}
              </span>
            </div>
            );
          })}
        </div>
      </div>

      <div className="neuro-log">
        <div className="ub muted instruction-title">{text.logTitle}</div>
        {text.neuralLog.map((item, index) => (
          <div className={`neuro-log-item ${logState(index)}`} key={item}>
            <span className="neuro-log-dot" />
            {item}
          </div>
        ))}
      </div>

      {error && <div className="card error-card">{error}</div>}
      {status === "DONE" && analysisId && (
        <div className="card cyan-border analysis-contact-card">
          <h2 className="ub">{text.contactTitle}</h2>
          <p className="muted">{text.contactCopy}</p>
          <input
            className="input"
            data-testid="analysis-email-input"
            inputMode="email"
            type="email"
            autoComplete="email"
            aria-invalid={Boolean(emailError)}
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setEmailError("");
            }}
            placeholder={text.contactPlaceholder}
          />
          {emailError && <div className="form-error">{emailError}</div>}
          <button className="button" data-testid="free-report-link" onClick={saveEmailAndOpen} disabled={contactBusy}>
            {contactBusy ? text.contactSaving : text.contactSubmit}
          </button>
        </div>
      )}
    </div>
  );
}

function isValidEmail(value: string) {
  if (!value || value.length > 254 || value.includes("..")) return false;
  const [local, domain, extra] = value.split("@");
  if (!local || !domain || extra) return false;
  if (local.startsWith(".") || local.endsWith(".")) return false;
  return emailPattern.test(value);
}
