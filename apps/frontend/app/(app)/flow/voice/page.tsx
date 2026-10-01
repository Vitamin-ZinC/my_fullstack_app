"use client";

import { ExternalLink, FileAudio, Mic, RotateCcw, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api, storeAnalysisDraft, uploadMedia } from "@/lib/api";
import { useSiteText } from "@/lib/useSiteText";

type VoiceMetrics = {
  duration: number;
  mime: string;
  size: number;
};

type MicrophoneIssue = "permission" | "unavailable" | "busy" | "unsupported" | "insecure" | "generic" | null;

const MIN_RECORDING_SECONDS = 30;
const MAX_RECORDING_SECONDS = 60;
const TOPIC_ROTATION_SECONDS = 7;

export default function VoicePage() {
  const text = useSiteText().flow.voice;
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const fileInput = useRef<HTMLInputElement | null>(null);
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
  const [microphoneIssue, setMicrophoneIssue] = useState<MicrophoneIssue>(null);
  const [restrictedContext, setRestrictedContext] = useState(false);
  const [externalUrl, setExternalUrl] = useState("");
  const [validationMessage, setValidationMessage] = useState("");
  const [consent, setConsent] = useState(false);

  useEffect(() => {
    setReady(true);
    setRestrictedContext(isRestrictedBrowserContext());
    setExternalUrl(window.location.href);
  }, []);

  useEffect(() => () => {
    stopTimer();
    stopStream();
    if (audioUrl) URL.revokeObjectURL(audioUrl);
  }, [audioUrl]);

  async function start() {
    setError("");
    setMicrophoneIssue(null);
    setValidationMessage("");

    if (!consent) {
      setError(text.consentRequired);
      return;
    }

    if (!window.isSecureContext) {
      setMicrophoneIssue("insecure");
      setError(text.insecureContext);
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setMicrophoneIssue("unsupported");
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

      const recorderMimeType = getRecorderMimeType();
      const audioMimeType = normalizeAudioMimeType(recorderMimeType) ?? "audio/webm";
      const draft = await api.createAnalysis(audioMimeType);
      storeAnalysisDraft(draft);

      const mediaRecorder = new MediaRecorder(mediaStream, recorderMimeType ? { mimeType: recorderMimeType } : undefined);
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
        const mimeType = normalizeAudioMimeType(mediaRecorder.mimeType) ?? audioMimeType;
        const blob = new Blob(chunks.current, { type: mimeType });
        void uploadRecording(draft.analysisId, draft.audioUploadUrl, blob, secondsRef.current, mimeType);
      };
      mediaRecorder.start(250);
      setRecording(true);
      setDone(false);
      secondsRef.current = 0;
      setSeconds(0);
      startTimer();
    } catch (reason) {
      const issue = classifyMicrophoneIssue(reason);
      setMicrophoneIssue(issue);
      setError(microphoneIssueMessage(issue, text));
      stopStream();
    } finally {
      setUploading(false);
    }
  }

  function stop() {
    if (secondsRef.current < MIN_RECORDING_SECONDS) return;
    stopRecording();
  }

  function stopRecording() {
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

  async function uploadRecording(analysisId: string, uploadUrl: string, blob: Blob, duration: number, mime: string) {
    try {
      const validation = validateVoiceRecording(blob, duration);
      if (!validation.ok) throw new Error(validation.message);

      await uploadMedia(uploadUrl, blob);
      setValidationMessage(text.checkingVoice);
      await api.validateAnalysisAudio(analysisId);
      const nextUrl = URL.createObjectURL(blob);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioUrl(nextUrl);
      setMetrics({ duration, mime, size: blob.size });
      window.sessionStorage.setItem("levelup_voice_ready", "1");
      window.sessionStorage.setItem("levelup_voice_duration_seconds", String(duration));
      setDone(true);
      setValidationMessage(text.voiceAccepted);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : text.failed);
      setValidationMessage("");
      setDone(false);
      window.sessionStorage.removeItem("levelup_voice_ready");
      window.sessionStorage.removeItem("levelup_voice_duration_seconds");
    } finally {
      stopStream();
      setUploading(false);
    }
  }

  async function selectAudioFile(event: React.ChangeEvent<HTMLInputElement>) {
    const selectedFile = event.target.files?.[0];
    event.target.value = "";
    if (!selectedFile) return;

    setError("");
    setMicrophoneIssue(null);
    setValidationMessage("");

    if (!consent) {
      setError(text.consentRequired);
      return;
    }

    const mimeType = normalizeAudioMimeType(selectedFile.type, selectedFile.name);
    if (!mimeType) {
      setError(text.uploadUnsupported);
      return;
    }

    resetRecording(false);
    setUploading(true);
    setValidationMessage(text.readingFile);
    try {
      const duration = await readAudioDuration(selectedFile);
      const blob = new Blob([selectedFile], { type: mimeType });
      const validation = validateVoiceRecording(blob, duration);
      if (!validation.ok) throw new Error(validation.message);

      const draft = await api.createAnalysis(mimeType);
      storeAnalysisDraft(draft);
      await uploadRecording(draft.analysisId, draft.audioUploadUrl, blob, duration, mimeType);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : text.failed);
      setValidationMessage("");
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
    setValidationMessage("");
    window.sessionStorage.removeItem("levelup_voice_ready");
    window.sessionStorage.removeItem("levelup_voice_duration_seconds");
    if (clearError) setError("");
    if (clearError) setMicrophoneIssue(null);
  }

  function startTimer() {
    stopTimer();
    timer.current = window.setInterval(() => {
      setSeconds((value) => {
        const next = value + 1;
        secondsRef.current = next;
        if (next >= MAX_RECORDING_SECONDS) window.setTimeout(stopRecording, 0);
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

  const progress = Math.min(100, (seconds / MAX_RECORDING_SECONDS) * 100);
  const sizeKb = metrics ? Math.round(metrics.size / 1024) : 0;
  const canContinue = done && !uploading && consent;
  const canStop = recording && seconds >= MIN_RECORDING_SECONDS;
  const secondsUntilStop = Math.max(0, MIN_RECORDING_SECONDS - seconds);
  const activeTopicIndex = text.topics.length
    ? (recording ? Math.floor(seconds / TOPIC_ROTATION_SECONDS) % text.topics.length : 0)
    : -1;
  const activeTopic = activeTopicIndex >= 0 ? text.topics[activeTopicIndex] : "";

  return (
    <div className="flow-inner" data-testid="voice-page">
      <div className="stepbar">
        <div className="step-done" />
        <div className="step-pending" />
        <span>{text.step}</span>
      </div>

      <h1 className="ub flow-title">{text.title}</h1>
      <p className="muted flow-copy">{text.copy}</p>

      <label className="media-consent-card" data-testid="voice-consent">
        <input
          type="checkbox"
          checked={consent}
          onChange={(event) => {
            setConsent(event.target.checked);
            if (event.target.checked) setError("");
          }}
        />
        <span>
          {text.consentPrefix}{" "}
          <a href="/offer" target="_blank" rel="noreferrer">{text.consentOffer}</a>
          {" "}{text.consentAnd}{" "}
          <a href="/privacy" target="_blank" rel="noreferrer">{text.consentPrivacy}</a>
        </span>
      </label>

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
            <div className="very-muted">
              {canStop ? text.stopAvailable : text.minimumHint.replace("{seconds}", String(secondsUntilStop))}
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
        {activeTopic && (
          <div className="voice-topic-current" data-testid="voice-active-topic">
            <span>{text.topicNow}</span>
            <strong>{activeTopic}</strong>
          </div>
        )}
        <div className="chip-row">
          {text.topics.map((topic, index) => (
            <span className={`chip ${index === activeTopicIndex ? "active" : ""}`} key={topic}>
              {topic}
            </span>
          ))}
        </div>
      </div>

      {error && (
        <div className="card error-card voice-error-card" role="alert">
          <strong>{error}</strong>
          {microphoneIssue === "permission" && <span>{text.permissionHelp}</span>}
          {restrictedContext && microphoneIssue && externalUrl && (
            <a className="button secondary compact" href={externalUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={16} /> {text.openBrowser}
            </a>
          )}
        </div>
      )}
      {validationMessage && <p className="auth-message" role="status">{validationMessage}</p>}

      {!recording && !done && (
        <button className="button" data-testid="voice-record-button" onClick={start} disabled={!ready || uploading || !consent}>
          <Mic size={18} /> {uploading ? text.busy : microphoneIssue ? text.retryAccess : text.start}
        </button>
      )}
      {!recording && !done && (
        <div className="voice-upload-area">
          <span className="very-muted">{text.orUpload}</span>
          <button
            className="button secondary"
            type="button"
            data-testid="voice-file-button"
            onClick={() => fileInput.current?.click()}
            disabled={uploading || !consent}
          >
            <FileAudio size={18} /> {text.uploadFile}
          </button>
          <input
            ref={fileInput}
            data-testid="voice-file-input"
            type="file"
            accept="audio/webm,audio/mp4,audio/ogg,audio/mpeg,audio/wav,.webm,.m4a,.mp4,.ogg,.mp3,.wav"
            onChange={selectAudioFile}
            disabled={uploading || !consent}
          />
          <span className="very-muted">{text.uploadHint}</span>
        </div>
      )}
      {recording && !canStop && (
        <div className="voice-minimum-hint" data-testid="voice-stop-locked">
          {text.minimumHint.replace("{seconds}", String(secondsUntilStop))}
        </div>
      )}
      {recording && canStop && (
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

function normalizeAudioMimeType(value: string, fileName = "") {
  const mimeType = value.toLowerCase().split(";", 1)[0].trim();
  if (["audio/webm", "audio/mp4", "audio/ogg", "audio/mpeg", "audio/wav"].includes(mimeType)) return mimeType;
  if (["audio/x-m4a", "audio/m4a", "video/mp4"].includes(mimeType)) return "audio/mp4";
  if (mimeType === "audio/x-wav") return "audio/wav";

  const extension = fileName.toLowerCase().split(".").pop();
  return ({ webm: "audio/webm", m4a: "audio/mp4", mp4: "audio/mp4", ogg: "audio/ogg", mp3: "audio/mpeg", wav: "audio/wav" } as Record<string, string>)[extension ?? ""] ?? null;
}

function classifyMicrophoneIssue(reason: unknown): Exclude<MicrophoneIssue, null> {
  const name = reason instanceof DOMException || reason instanceof Error ? reason.name : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError" || name === "SecurityError") return "permission";
  if (name === "NotFoundError" || name === "DevicesNotFoundError" || name === "OverconstrainedError") return "unavailable";
  if (name === "NotReadableError" || name === "TrackStartError" || name === "AbortError") return "busy";
  return "generic";
}

function microphoneIssueMessage(issue: Exclude<MicrophoneIssue, null>, text: ReturnType<typeof useSiteText>["flow"]["voice"]) {
  if (issue === "permission") return text.permissionDenied;
  if (issue === "unavailable") return text.microphoneUnavailable;
  if (issue === "busy") return text.microphoneBusy;
  if (issue === "unsupported") return text.unsupported;
  if (issue === "insecure") return text.insecureContext;
  return text.failed;
}

function isRestrictedBrowserContext() {
  const userAgent = navigator.userAgent.toLowerCase();
  return window.self !== window.top || /(telegram|instagram|fban|fbav|; wv\)|line\/)/i.test(userAgent);
}

function readAudioDuration(file: File) {
  return new Promise<number>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const audio = document.createElement("audio");
    const timeout = window.setTimeout(() => finish(() => reject(new Error("Не удалось прочитать длительность аудио. Выберите другой файл."))), 10000);

    const finish = (callback: () => void) => {
      window.clearTimeout(timeout);
      audio.removeAttribute("src");
      audio.load();
      URL.revokeObjectURL(url);
      callback();
    };

    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      if (!Number.isFinite(audio.duration) || audio.duration <= 0) {
        finish(() => reject(new Error("Не удалось прочитать длительность аудио. Выберите другой файл.")));
        return;
      }
      finish(() => resolve(Math.round(audio.duration)));
    };
    audio.onerror = () => finish(() => reject(new Error("Формат аудио не поддерживается браузером. Выберите MP3, M4A, WAV, WEBM или OGG.")));
    audio.src = url;
  });
}

function validateVoiceRecording(blob: Blob, duration: number) {
  if (!blob || blob.size < 2500) return { ok: false, message: "Голос не распознан: запись слишком короткая или пустая. Запишите фразу голосом, а не тишину." };
  if (duration < MIN_RECORDING_SECONDS) return { ok: false, message: "Для анализа нужно минимум 30 секунд речи. Расскажите о себе по подсказкам и повторите запись." };
  if (duration > 300) return { ok: false, message: "Запись длиннее 5 минут. Выберите фрагмент длительностью 30–60 секунд." };
  return { ok: true, message: "" };
}

function formatTime(totalSeconds: number) {
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}
