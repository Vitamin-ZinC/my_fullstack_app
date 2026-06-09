"use client";

import Link from "next/link";
import { Camera } from "lucide-react";
import { useRef, useState } from "react";
import { getAnalysisDraft, uploadMedia } from "@/lib/api";

export default function FacePage() {
  const video = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [preview, setPreview] = useState("");
  const [cameraReady, setCameraReady] = useState(false);
  const [uploaded, setUploaded] = useState(false);
  const [error, setError] = useState("");

  async function openCamera() {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      streamRef.current = stream;
      if (video.current) video.current.srcObject = stream;
      setCameraReady(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Камера недоступна");
    }
  }

  async function capture() {
    if (!video.current) return;
    const draft = getAnalysisDraft();
    if (!draft) {
      setError("Сначала запиши голос");
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.current.videoWidth || 720;
    canvas.height = video.current.videoHeight || 720;
    canvas.getContext("2d")?.drawImage(video.current, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    setPreview(dataUrl);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    if (!blob) {
      setError("Не удалось подготовить снимок");
      return;
    }

    try {
      await uploadMedia(draft.photoUploadUrl, blob);
      window.sessionStorage.setItem("levelup_face_ready", "1");
      streamRef.current?.getTracks().forEach((track) => track.stop());
      setUploaded(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось загрузить фото");
    }
  }

  return (
    <div className="stack" data-testid="face-page">
      <div>
        <div className="eyebrow">Шаг 2</div>
        <h1 className="ub">Анализ лица</h1>
        <p className="muted">Сделай спокойный снимок при хорошем освещении. Это нужно для оценки паттернов внимания и энергии.</p>
      </div>
      <div className="face-visual-card">
        {preview ? <img src={preview} alt="" /> : <video ref={video} autoPlay muted playsInline />}
        <div className="face-scan-frame" />
      </div>
      {error && <div className="card" style={{ borderColor: "var(--danger)" }}>{error}</div>}
      <button className="button" data-testid="face-capture-button" onClick={cameraReady ? capture : openCamera}>
        <Camera size={18} /> {cameraReady ? "Сделать снимок" : "Открыть камеру"}
      </button>
      {uploaded && <Link className="button secondary" data-testid="face-next-link" href="/flow/ikigai">Перейти к модели Икигай</Link>}
    </div>
  );
}
