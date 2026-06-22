"use client";

import { Camera, ImagePlus, Upload } from "lucide-react";
import type { ChangeEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { api, getAnalysisDraft, uploadMedia } from "@/lib/api";
import { useSiteText } from "@/lib/useSiteText";

type FaceMetrics = {
  brightness: number;
  contrast: number;
  sharpness: number;
  tone: number;
};

export default function FacePage() {
  const text = useSiteText().flow.face;
  const fileInput = useRef<HTMLInputElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [preview, setPreview] = useState("");
  const [cameraReady, setCameraReady] = useState(false);
  const [uploaded, setUploaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [metrics, setMetrics] = useState<FaceMetrics | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setReady(true);
  }, []);

  useEffect(() => {
    if (cameraReady && video.current && streamRef.current) {
      video.current.srcObject = streamRef.current;
    }
  }, [cameraReady]);

  useEffect(() => () => stopCamera(), []);

  function triggerFileInput() {
    fileInput.current?.click();
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError(text.fileTypeError);
      return;
    }

    const dataUrl = await blobToDataUrl(file);
    await uploadPhoto(file, dataUrl);
  }

  async function openCamera() {
    setError("");
    setBusy(true);
    try {
      stopCamera();
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 720 } },
        audio: false
      });
      streamRef.current = mediaStream;
      setPreview("");
      setCameraReady(true);
      setUploaded(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : text.cameraError);
    } finally {
      setBusy(false);
    }
  }

  async function capture() {
    if (!video.current || !video.current.videoWidth) {
      setError(text.cameraNotReady);
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.current.videoWidth;
    canvas.height = video.current.videoHeight;
    canvas.getContext("2d")?.drawImage(video.current, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    if (!blob) {
      setError(text.uploadError);
      return;
    }
    await uploadPhoto(blob, dataUrl);
  }

  async function uploadPhoto(blob: Blob, dataUrl: string) {
    const draft = getAnalysisDraft();
    if (!draft) {
      setError(text.noVoice);
      return;
    }

    setBusy(true);
    setError("");
    try {
      await uploadMedia(draft.photoUploadUrl, blob);
      setPreview(dataUrl);
      setMetrics(await analyzeImage(dataUrl));
      setUploaded(true);
      setCameraReady(false);
      stopCamera();
      window.sessionStorage.setItem("levelup_face_ready", "1");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : text.uploadError);
      setUploaded(false);
    } finally {
      setBusy(false);
    }
  }

  async function launchAnalysis() {
    const draft = getAnalysisDraft();
    if (!draft) {
      setError(text.noVoice);
      return;
    }

    setBusy(true);
    setError("");
    const ikigaiAnswers = {
      love: [],
      good_at: [],
      world_needs: [],
      paid_for: []
    };

    try {
      window.sessionStorage.setItem("levelup_ikigai_answers", JSON.stringify(ikigaiAnswers));
      await api.confirmAnalysis(draft.analysisId, ikigaiAnswers, getStoredVoiceMetrics());
      window.location.assign("/flow/analysis");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось запустить анализ");
    } finally {
      setBusy(false);
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (video.current) video.current.srcObject = null;
  }

  return (
    <div className="flow-inner" data-testid="face-page">
      <div className="stepbar">
        <div className="step-done" />
        <div className="step-done" />
        <span>{text.step}</span>
      </div>

      <h1 className="ub flow-title">{text.title}</h1>
      <p className="muted flow-copy">{text.copy}</p>

      <div className="face-visual-card" aria-label={text.visualLabel}>
        <video src="/assets/processing-analysis.mp4" autoPlay muted loop playsInline />
        <div className="face-scan-frame"><div className="face-scan-line" /></div>
      </div>

      <div className="face-upload-panel">
        <button className={`photo-zone ${preview || cameraReady ? "filled" : "empty"}`} data-testid="face-upload-zone" type="button" onClick={cameraReady ? undefined : triggerFileInput} disabled={!ready || busy}>
          {preview && (
            <>
              <img src={preview} alt={text.previewAlt} />
              <div className="photo-check">✓</div>
            </>
          )}
          {cameraReady && !preview && <video ref={video} autoPlay muted playsInline />}
          {!preview && !cameraReady && (
            <span className="photo-zone-copy">
              <ImagePlus size={28} />
              <strong>{text.uploadTitle}</strong>
              <small>{text.uploadSubtitle}</small>
            </span>
          )}
        </button>
      </div>
      <input ref={fileInput} data-testid="face-file-input" type="file" accept="image/*" hidden onChange={handleFile} />

      {metrics && (
        <div className="face-metrics" data-testid="face-metrics">
          <div className="ub muted instruction-title">{text.metricsTitle}</div>
          <div className="face-metric-grid">
            <Metric label={text.metricLabels.brightness} value={metrics.brightness} />
            <Metric label={text.metricLabels.contrast} value={metrics.contrast} />
            <Metric label={text.metricLabels.sharpness} value={metrics.sharpness} />
            <Metric label={text.metricLabels.tone} value={metrics.tone} />
          </div>
        </div>
      )}

      <div className="face-hint-row">
        {text.hints.map(([title, copy]) => (
          <div className="face-hint" key={title}>
            <strong>{title}</strong>
            {copy}
          </div>
        ))}
      </div>

      {error && <div className="card error-card">{error}</div>}

      <div className="flow-actions">
        <button className="button" data-testid="face-file-button" type="button" onClick={triggerFileInput} disabled={!ready || busy}>
          <Upload size={18} /> {text.uploadButton}
        </button>
        <button className="button secondary" data-testid="face-capture-button" type="button" onClick={cameraReady ? capture : openCamera} disabled={!ready || busy}>
          <Camera size={18} /> {cameraReady ? text.capture : text.openCamera}
        </button>
      </div>

      {uploaded && (
        <button className="button" data-testid="face-next-link" type="button" onClick={launchAnalysis} disabled={busy}>
          {busy ? "Запускаем анализ..." : "Узнать результат"}
        </button>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}%</strong>
    </div>
  );
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function analyzeImage(dataUrl: string): Promise<FaceMetrics> {
  const image = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  const size = 160;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { brightness: 70, contrast: 65, sharpness: 64, tone: 62 };
  ctx.drawImage(image, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);
  let luminanceSum = 0;
  let toneHits = 0;
  const luminances: number[] = [];

  for (let index = 0; index < data.length; index += 4) {
    const red = data[index];
    const green = data[index + 1];
    const blue = data[index + 2];
    const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    luminances.push(luminance);
    luminanceSum += luminance;
    if (red > 75 && green > 45 && blue > 30 && red > blue && red - green > 8) toneHits += 1;
  }

  const average = luminanceSum / luminances.length;
  const variance = luminances.reduce((sum, value) => sum + (value - average) ** 2, 0) / luminances.length;
  let sharpness = 0;
  for (let row = 1; row < size; row += 1) {
    for (let col = 1; col < size; col += 1) {
      const idx = row * size + col;
      sharpness += Math.abs(luminances[idx] - luminances[idx - 1]) + Math.abs(luminances[idx] - luminances[idx - size]);
    }
  }

  return {
    brightness: clamp(Math.round((average / 255) * 100)),
    contrast: clamp(Math.round(Math.sqrt(variance) * 2.1)),
    sharpness: clamp(Math.round((sharpness / (size * size)) * 1.8)),
    tone: clamp(Math.round((toneHits / luminances.length) * 240))
  };
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, value));
}

function getStoredVoiceMetrics() {
  const voiceDurationSeconds = Number(window.sessionStorage.getItem("levelup_voice_duration_seconds"));
  return Number.isFinite(voiceDurationSeconds) && voiceDurationSeconds > 0 ? { voiceDurationSeconds } : undefined;
}
