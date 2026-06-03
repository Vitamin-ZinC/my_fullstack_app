"use client";

import Link from "next/link";
import { Mic, Square } from "lucide-react";
import { useRef, useState } from "react";

export default function VoicePage() {
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const [recording, setRecording] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function start() {
    setError("");
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    chunks.current = [];
    recorder.current = new MediaRecorder(stream);
    recorder.current.ondataavailable = (event) => event.data.size && chunks.current.push(event.data);
    recorder.current.onstop = () => {
      const blob = new Blob(chunks.current, { type: recorder.current?.mimeType || "audio/webm" });
      window.sessionStorage.setItem("levelup_voice_ready", blob.size > 2048 ? "1" : "");
      setDone(blob.size > 2048);
      stream.getTracks().forEach((track) => track.stop());
    };
    recorder.current.start();
    setRecording(true);
  }

  function stop() {
    recorder.current?.stop();
    setRecording(false);
  }

  return (
    <div className="stack">
      <div>
        <div className="eyebrow">Шаг 1</div>
        <h1>Анализ голоса</h1>
        <p className="muted">Запишите короткий фрагмент речи. Frontend проверит, что звук действительно был записан, а backend получит аудио через presigned upload.</p>
      </div>
      <div className="video-frame card">
        <video src="/assets/voice-analysis.mp4" autoPlay muted loop playsInline />
      </div>
      {error && <div className="card" style={{ borderColor: "var(--danger)" }}>{error}</div>}
      <button className="button" onClick={recording ? stop : start}>
        {recording ? <Square size={18} /> : <Mic size={18} />} {recording ? "Остановить запись" : "Записать голос"}
      </button>
      {done && <Link className="button secondary" href="/flow/face">Продолжить к анализу лица</Link>}
    </div>
  );
}
