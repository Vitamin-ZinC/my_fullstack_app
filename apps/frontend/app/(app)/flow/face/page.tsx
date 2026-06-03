"use client";

import Link from "next/link";
import { Camera } from "lucide-react";
import { useRef, useState } from "react";

export default function FacePage() {
  const video = useRef<HTMLVideoElement>(null);
  const [preview, setPreview] = useState("");
  const [cameraReady, setCameraReady] = useState(false);

  async function openCamera() {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
    if (video.current) video.current.srcObject = stream;
    setCameraReady(true);
  }

  function capture() {
    if (!video.current) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.current.videoWidth || 720;
    canvas.height = video.current.videoHeight || 720;
    canvas.getContext("2d")?.drawImage(video.current, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    window.sessionStorage.setItem("levelup_face_ready", "1");
    setPreview(dataUrl);
  }

  return (
    <div className="stack">
      <div>
        <div className="eyebrow">Шаг 2</div>
        <h1>Анализ лица</h1>
        <p className="muted">Селфи-камера и визир создают ощущение реального сканирования. Глубокий анализ выполняется backend worker.</p>
      </div>
      <div className="card" style={{ position: "relative", overflow: "hidden", aspectRatio: "1" }}>
        {preview ? <img src={preview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <video ref={video} autoPlay muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
        <div style={{ position: "absolute", inset: 28, border: "2px solid var(--cyan)", borderRadius: 24, boxShadow: "0 0 28px rgba(0,212,255,.55)" }} />
      </div>
      <button className="button" onClick={cameraReady ? capture : openCamera}>
        <Camera size={18} /> {cameraReady ? "Сделать селфи" : "Включить камеру"}
      </button>
      {preview && <Link className="button secondary" href="/flow/ikigai">Продолжить к Икигай</Link>}
    </div>
  );
}
