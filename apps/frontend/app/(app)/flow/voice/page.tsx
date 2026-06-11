"use client";

import { Mic, RotateCcw, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api, storeAnalysisDraft, uploadMedia } from "@/lib/api";
import { useSiteText } from "@/lib/useSiteText";

type VoiceMetrics = {
  duration: number;
  mime: string;
  size: number;
};

export default function VoicePage() {
  const text = useSiteText().flow.voice;
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<number | null>(null);
  const secondsRef = useRef(0);
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(false);
  const [ready, setReady] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [audioUrl, setAudioUrl] = useState("");
  const [metrics, setMetrics] = useState<VoiceMetrics | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setReady(true);
  }, []);

  useEffect(() => () => {
    stopTimer();
    stopStream();
    if (audioUrl) URL.revokeObjectURL(audioUrl);
  }, [audioUrl]);

  async function start() {
    setError("");

    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setError(text.unsupported);
      return;
    }

    resetRecording(false);
    setUploading(true);
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
      stream.current = mediaStream;

      const draft = await api.createAnalysis();
      storeAnalysisDraft(draft);

      const mimeType = getRecorderMimeType();
      const mediaRecorder = new MediaRecorder(mediaStream, mimeType ? { mimeType } : undefined);
      recorder.current = mediaRecorder;
      chunks.current = [];
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size) chunks.current.push(event.data);
      };
      mediaRecorder.onerror = () => {
        setError(text.failed);
        stopTimer();
        stopStream();
        setRecording(false);
        setUploading(false);
      };
      mediaRecorder.onstop = () => {
        void uploadRecording(draft.audioUploadUrl, mediaRecorder.mimeType || mimeType || "audio/webm");
      };
      mediaRecorder.start(250);
      setRecording(true);
      setDone(false);
      secondsRef.current = 0;
      setSeconds(0);
      startTimer();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : text.failed);
      stopStream();
    } finally {
      setUploading(false);
    }
  }

  function stop() {
    stopTimer();
    setRecording(false);
    setUploading(true);
    if (recorder.current && recorder.current.state !== "inactive") {
      recorder.current.stop();
    } else {
      stopStream();
      setUploading(false);
    }
  }

  async function uploadRecording(uploadUrl: string, mime: string) {
    try {
      const blob = new Blob(chunks.current, { type: mime });
      const duration = secondsRef.current;
      const validation = validateVoiceRecording(blob, duration);
      if (!validation.ok) throw new Error(validation.message);

      await uploadMedia(uploadUrl, blob);
      const nextUrl = URL.createObjectURL(blob);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioUrl(nextUrl);
      setMetrics({ duration, mime, size: blob.size });
      window.sessionStorage.setItem("levelup_voice_ready", "1");
      setDone(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : text.failed);
      setDone(false);
    } finally {
      stopStream();
      setUploading(false);
    }
  }

  function resetRecording(clearError = true) {
    stopTimer();
    if (recorder.current && recorder.current.state !== "inactive") {
      recorder.current.onstop = null;
      recorder.current.stop();
    }
    stopStream();
    chunks.current = [];
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl("");
    setMetrics(null);
    setDone(false);
    setRecording(false);
    secondsRef.current = 0;
    setSeconds(0);
    setUploading(false);
    if (clearError) setError("");
  }

  function startTimer() {
    stopTimer();
    timer.current = window.setInterval(() => {
      setSeconds((value) => {
        const next = value + 1;
        secondsRef.current = next;
        if (next >= 60) window.setTimeout(stop, 0);
        return next;
      });
    }, 1000);
  }

  function stopTimer() {
    if (timer.current) window.clearInterval(timer.current);
    timer.current = null;
  }

  function stopStream() {
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
  }

  const progress = Math.min(100, (seconds / 60) * 100);
  const sizeKb = metrics ? Math.round(metrics.size / 1024) : 0;
  const canContinue = done && !uploading;

  return (
    <div className="flow-inner" data-testid="voice-page">
      <div className="stepbar">
        <div className="step-done" />
        <div className="step-pending" />
        <span>{text.step}</span>
      </div>

      <h1 className="ub flow-title">{text.title}</h1>
      <p className="muted flow-copy">{text.copy}</p>

      <div className="voice-stage">
        <div className={`voice-video-ring ${recording ? "recording" : done ? "done" : "idle"}`}>
          <video src="/assets/voice-analysis.mp4" autoPlay muted loop playsInline />
          <div className="voice-state">{done ? "✓" : recording ? "●" : "🎙️"}</div>
        </div>
        {recording && (
          <div className="voice-timer">
            <div className="ub cyan voice-time">{formatTime(seconds)}</div>
            <div className="progress-bg">
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}
        {done && metrics && (
          <div className="voice-status">
            <div className="cyan">{text.saved.replace("{seconds}", String(metrics.duration))}</div>
            {audioUrl && <audio className="voice-audio" controls src={audioUrl} />}
            <div className="very-muted">{text.fileInfo.replace("{size}", String(sizeKb)).replace("{mime}", metrics.mime)}</div>
          </div>
        )}
      </div>

      <div className="card instruction-card">
        <div className="ub muted instruction-title">{text.instructionsTitle}</div>
        <div className="instruction-copy">
          {text.instructions.map((item) => (
            <div key={item}>{item}</div>
          ))}
        </div>
      </div>

      <div>
        <div className="very-muted topics-title">{text.topicsTitle}</div>
        <div className="chip-row">
          {text.topics.map((topic) => <span className="chip" key={topic}>{topic}</span>)}
        </div>
      </div>

      {error && <div className="card error-card">{error}</div>}

      {!recording && !done && (
        <button className="button" data-testid="voice-record-button" onClick={start} disabled={!ready || uploading}>
          <Mic size={18} /> {uploading ? text.busy : text.start}
        </button>
      )}
      {recording && (
        <button className="button btn-danger" data-testid="voice-stop-button" onClick={stop}>
          <Square size={18} /> {text.stop}
        </button>
      )}
      {done && (
        <>
          <button className="button" data-testid="voice-next-link" onClick={() => window.location.assign("/flow/face")} disabled={!canContinue}>{text.next}</button>
          <button className="button secondary" data-testid="voice-reset-button" onClick={() => resetRecording()} disabled={uploading}>
            <RotateCcw size={18} /> {text.reset}
          </button>
        </>
      )}
    </div>
  );
}

function getRecorderMimeType() {
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  return types.find((type) => window.MediaRecorder?.isTypeSupported(type)) || "";
}

function validateVoiceRecording(blob: Blob, duration: number) {
  if (!blob || blob.size < 2500) return { ok: false, message: "Голос не распознан: запись слишком короткая или пустая. Запишите фразу голосом, а не тишину." };
  if (duration < 5) return { ok: false, message: "Для анализа нужно минимум 5 секунд речи. Скажите 2-3 предложения о себе и повторите запись." };
  return { ok: true, message: "" };
}

function formatTime(totalSeconds: number) {
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}
