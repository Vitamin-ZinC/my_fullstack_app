"use client";

import Link from "next/link";
import { Camera } from "lucide-react";
import { useRef, useState } from "react";
import { getAnalysisDraft, uploadMedia } from "@/lib/api";
import { useSiteText } from "@/lib/useSiteText";

export default function FacePage() {
  const text = useSiteText().flow.face;
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
      setError(reason instanceof Error ? reason.message : text.cameraError);
    }
  }

  async function capture() {
    if (!video.current) return;
    const draft = getAnalysisDraft();
    if (!draft) {
      setError(text.noVoice);
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
      setError(text.uploadError);
      return;
    }

    try {
      await uploadMedia(draft.photoUploadUrl, blob);
      window.sessionStorage.setItem("levelup_face_ready", "1");
      streamRef.current?.getTracks().forEach((track) => track.stop());
      setUploaded(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : text.uploadError);
    }
  }

  return (
    <div className="stack" data-testid="face-page">
      <div>
        <div className="eyebrow">{text.eyebrow}</div>
        <h1 className="ub">{text.title}</h1>
        <p className="muted">{text.copy}</p>
      </div>
      <div className="face-visual-card">
        {preview ? <img src={preview} alt="" /> : <video ref={video} autoPlay muted playsInline />}
        <div className="face-scan-frame" />
      </div>
      {error && <div className="card" style={{ borderColor: "var(--danger)" }}>{error}</div>}
      <button className="button" data-testid="face-capture-button" onClick={cameraReady ? capture : openCamera}>
        <Camera size={18} /> {cameraReady ? text.capture : text.openCamera}
      </button>
      {uploaded && <Link className="button secondary" data-testid="face-next-link" href="/flow/ikigai">{text.next}</Link>}
    </div>
  );
}
