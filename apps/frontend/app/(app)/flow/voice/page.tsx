"use client";

import Link from "next/link";
import { Mic, Square } from "lucide-react";
import { useRef, useState } from "react";
import { api, storeAnalysisDraft, uploadMedia } from "@/lib/api";
import { useSiteText } from "@/lib/useSiteText";

export default function VoicePage() {
  const text = useSiteText().flow.voice;
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const [recording, setRecording] = useState(false);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function start() {
    setError("");
    setBusy(true);
    try {
      const draft = await api.createAnalysis();
      storeAnalysisDraft(draft);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunks.current = [];
      recorder.current = new MediaRecorder(stream);
      recorder.current.ondataavailable = (event) => event.data.size && chunks.current.push(event.data);
      recorder.current.onstop = () => {
        void uploadRecording(draft.audioUploadUrl, stream);
      };
      recorder.current.start();
      setRecording(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : text.failed);
    } finally {
      setBusy(false);
    }
  }

  async function uploadRecording(uploadUrl: string, stream: MediaStream) {
    try {
      const blob = new Blob(chunks.current, { type: recorder.current?.mimeType || "audio/webm" });
      if (blob.size <= 2048) throw new Error(text.tooShort);
      await uploadMedia(uploadUrl, blob);
      window.sessionStorage.setItem("levelup_voice_ready", "1");
      setDone(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : text.failed);
      setDone(false);
    } finally {
      stream.getTracks().forEach((track) => track.stop());
    }
  }

  function stop() {
    recorder.current?.stop();
    setRecording(false);
  }

  return (
    <div className="stack" data-testid="voice-page">
      <div>
        <div className="eyebrow">{text.eyebrow}</div>
        <h1 className="ub">{text.title}</h1>
        <p className="muted">{text.copy}</p>
      </div>
      <div className={`voice-video-ring ${recording ? "recording" : done ? "done" : ""}`}>
        <video src="/assets/voice-analysis.mp4" autoPlay muted loop playsInline />
        <div className="voice-state">{recording ? "●" : done ? "✓" : "🎤"}</div>
      </div>
      {error && <div className="card" style={{ borderColor: "var(--danger)" }}>{error}</div>}
      <button className="button" data-testid="voice-record-button" onClick={recording ? stop : start} disabled={busy}>
        {recording ? <Square size={18} /> : <Mic size={18} />} {recording ? text.stop : busy ? text.busy : text.start}
      </button>
      {done && <Link className="button secondary" data-testid="voice-next-link" href="/flow/face">{text.next}</Link>}
    </div>
  );
}
