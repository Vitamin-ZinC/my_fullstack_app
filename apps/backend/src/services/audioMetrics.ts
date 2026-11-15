import { spawn } from "node:child_process";
import type { AudioSignalAnalysis } from "@levelup/contracts";
import { analyzeSignalPcm, MAX_SIGNAL_SECONDS, SIGNAL_SAMPLE_RATE } from "./audioSignal.js";

export type TranscriptionSegment = {
  start?: number;
  end?: number;
  text?: string;
  noSpeechProbability?: number;
  averageLogProbability?: number;
};

export type AudioTranscription = {
  text: string;
  durationSeconds?: number | null;
  segments?: TranscriptionSegment[];
};

export type VoiceSignalMetrics = {
  acoustics?: AudioSignalAnalysis | null;
  pauseSource?: "webrtc-vad" | "unavailable";
  durationSeconds: number | null;
  transcriptWordCount: number | null;
  speechRateWpm: number | null;
  speechRateLabel: string | null;
  activeSpeechSeconds: number | null;
  articulationRateWpm: number | null;
  silenceRatio: number | null;
  pauseCount: number | null;
  averagePauseMs: number | null;
  longestPauseMs: number | null;
  rmsDb: number | null;
  peakDb: number | null;
  loudnessVariationDb: number | null;
  clippingRatio: number | null;
  quality: "good" | "usable" | "weak" | "unknown";
  notes: string[];
};

const PCM_SAMPLE_RATE = SIGNAL_SAMPLE_RATE;
const PCM_BYTES_PER_SAMPLE = 2;
const FRAME_MS = 100;
const FRAME_SIZE = Math.round((PCM_SAMPLE_RATE * FRAME_MS) / 1000);

export async function analyzeAudioMetrics(
  buffer: Buffer,
  transcription: AudioTranscription | null,
  clientDurationSeconds?: number | null
): Promise<VoiceSignalMetrics> {
  const transcriptMetrics = buildTranscriptMetrics(transcription, clientDurationSeconds);
  const pcm = await decodeAudioToPcm(buffer);
  if (!pcm) {
    return {
      ...transcriptMetrics,
      speechRateLabel: null,
      activeSpeechSeconds: null, articulationRateWpm: null, silenceRatio: null,
      pauseCount: null, averagePauseMs: null, longestPauseMs: null,
      acoustics: null, pauseSource: "unavailable",
      rmsDb: null,
      peakDb: null,
      loudnessVariationDb: null,
      clippingRatio: null,
      quality: "unknown",
      notes: ["Акустические метрики недоступны: ffmpeg не смог декодировать запись."]
    };
  }

  const acousticMetrics = analyzePcm16le(pcm);
  const acoustics = await analyzeSignalPcm(pcm).catch(() => null);
  const durationSeconds = acousticMetrics.durationSeconds;
  const intervals = acoustics?.pauses.intervals ?? [];
  const measuredPauses = acoustics && acoustics.pauses.status !== "unavailable";
  const merged = {
    ...transcriptMetrics,
    durationSeconds,
    speechRateWpm: durationSeconds && transcriptMetrics.transcriptWordCount
      ? Math.round(transcriptMetrics.transcriptWordCount * 60 / durationSeconds) : null,
    // WPM is descriptive and language-dependent, not a universal personality norm.
    speechRateLabel: null,
    activeSpeechSeconds: measuredPauses ? acoustics.speechSeconds : null,
    articulationRateWpm: measuredPauses && acoustics.speechSeconds && transcriptMetrics.transcriptWordCount
      ? Math.round(transcriptMetrics.transcriptWordCount * 60 / acoustics.speechSeconds) : null,
    silenceRatio: measuredPauses ? roundTo(1 - acoustics.speechCoverage, 3) : null,
    pauseCount: measuredPauses ? acoustics.pauses.count : null,
    averagePauseMs: measuredPauses && intervals.length ? Math.round(intervals.reduce((sum, interval) => sum + (interval.endSeconds - interval.startSeconds) * 1000, 0) / intervals.length) : null,
    longestPauseMs: measuredPauses ? acoustics.pauses.longestMs : null,
    acoustics,
    pauseSource: acoustics ? "webrtc-vad" as const : "unavailable" as const,
    rmsDb: acousticMetrics.rmsDb,
    peakDb: acousticMetrics.peakDb,
    loudnessVariationDb: acousticMetrics.loudnessVariationDb,
    clippingRatio: acousticMetrics.clippingRatio,
    quality: "unknown" as VoiceSignalMetrics["quality"],
    notes: [...acousticMetrics.notes, ...(!acoustics ? ["Detailed acoustic measurements unavailable; do not infer pauses or pitch from ASR segments."] : [])]
  };
  merged.quality = scoreMetricQuality(merged, acousticMetrics);
  if (acoustics && (acoustics.speechSeconds < 10 || acoustics.loudness.status !== "usable")) merged.quality = "weak";
  return merged;
}

export function buildTranscriptMetrics(
  transcription: AudioTranscription | null,
  clientDurationSeconds?: number | null
): Omit<VoiceSignalMetrics, "rmsDb" | "peakDb" | "loudnessVariationDb" | "clippingRatio" | "quality" | "notes"> {
  const text = transcription?.text?.trim() || "";
  const transcriptWordCount = text ? countWords(text) : null;
  const segmentStats = buildSegmentStats(transcription?.segments ?? []);
  const durationSeconds = normalizePositiveNumber(transcription?.durationSeconds)
    ?? normalizePositiveNumber(clientDurationSeconds)
    ?? segmentStats.lastSegmentEndSeconds;
  const speechRateWpm = durationSeconds && transcriptWordCount
    ? Math.round(transcriptWordCount / (durationSeconds / 60))
    : null;
  const activeSpeechSeconds = segmentStats.activeSpeechSeconds;
  const articulationRateWpm = activeSpeechSeconds && transcriptWordCount
    ? Math.round(transcriptWordCount / (activeSpeechSeconds / 60))
    : null;
  const silenceRatio = durationSeconds && activeSpeechSeconds !== null
    ? roundTo(Math.max(0, Math.min(1, (durationSeconds - activeSpeechSeconds) / durationSeconds)), 2)
    : null;

  return {
    durationSeconds: durationSeconds ? Math.round(durationSeconds) : null,
    transcriptWordCount,
    speechRateWpm,
    speechRateLabel: speechRateWpm === null ? null : labelSpeechRate(speechRateWpm),
    activeSpeechSeconds: activeSpeechSeconds === null ? null : roundTo(activeSpeechSeconds, 1),
    articulationRateWpm,
    silenceRatio,
    pauseCount: segmentStats.pauseCount,
    averagePauseMs: segmentStats.averagePauseMs,
    longestPauseMs: segmentStats.longestPauseMs
  };
}

export function countWords(value: string) {
  const words = value.match(/[\p{L}\p{N}]+(?:[-'][\p{L}\p{N}]+)?/gu);
  return words?.length ?? 0;
}

export function labelSpeechRate(wordsPerMinute: number) {
  if (wordsPerMinute >= 170) return "ускоренный темп (выше среднего)";
  if (wordsPerMinute >= 125) return "умеренно быстрый темп";
  if (wordsPerMinute >= 90) return "сбалансированный темп";
  return "замедленный темп";
}

function buildSegmentStats(segments: TranscriptionSegment[]) {
  const normalized = segments
    .map((segment) => ({
      start: normalizePositiveNumber(segment.start) ?? 0,
      end: normalizePositiveNumber(segment.end) ?? 0
    }))
    .filter((segment) => segment.end > segment.start)
    .sort((a, b) => a.start - b.start);

  if (!normalized.length) {
    return {
      activeSpeechSeconds: null,
      lastSegmentEndSeconds: null,
      pauseCount: null,
      averagePauseMs: null,
      longestPauseMs: null
    };
  }

  const activeSpeechSeconds = normalized.reduce((sum, segment) => sum + (segment.end - segment.start), 0);
  const pauses: number[] = [];
  for (let index = 1; index < normalized.length; index += 1) {
    const gap = normalized[index].start - normalized[index - 1].end;
    if (gap >= 0.25) pauses.push(gap);
  }

  return {
    activeSpeechSeconds,
    lastSegmentEndSeconds: normalized.at(-1)?.end ?? null,
    pauseCount: pauses.length,
    averagePauseMs: pauses.length ? Math.round((pauses.reduce((sum, pause) => sum + pause, 0) / pauses.length) * 1000) : 0,
    longestPauseMs: pauses.length ? Math.round(Math.max(...pauses) * 1000) : 0
  };
}

function decodeAudioToPcm(buffer: Buffer): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const child = spawn("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-protocol_whitelist",
      "pipe",
      "-i",
      "pipe:0",
      "-t",
      String(MAX_SIGNAL_SECONDS + 1),
      "-ac",
      "1",
      "-ar",
      String(PCM_SAMPLE_RATE),
      "-f",
      "s16le",
      "pipe:1"
    ], { stdio: ["pipe", "pipe", "pipe"] });

    const stdout: Buffer[] = [];
    let totalBytes = 0;
    let settled = false;
    const timeout = setTimeout(() => {
      if (!settled) child.kill("SIGKILL");
    }, 15000);

    child.stderr.resume();
    child.stdout.on("data", (chunk: Buffer) => {
      totalBytes += chunk.length;
      if (totalBytes > (MAX_SIGNAL_SECONDS + 1) * PCM_SAMPLE_RATE * PCM_BYTES_PER_SAMPLE) {
        child.kill("SIGKILL");
        return;
      }
      stdout.push(chunk);
    });
    child.stdin.on("error", () => {
      // ffmpeg can close stdin early for malformed input; close handling below converts it to null metrics.
    });
    child.on("error", () => {
      settled = true;
      clearTimeout(timeout);
      resolve(null);
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (code !== 0 || !stdout.length || totalBytes > MAX_SIGNAL_SECONDS * PCM_SAMPLE_RATE * PCM_BYTES_PER_SAMPLE) {
        resolve(null);
        return;
      }
      resolve(Buffer.concat(stdout));
    });
    child.stdin.end(buffer);
  });
}

function analyzePcm16le(buffer: Buffer) {
  const sampleCount = Math.floor(buffer.length / PCM_BYTES_PER_SAMPLE);
  if (!sampleCount) {
    return {
      durationSeconds: null,
      rmsDb: null,
      peakDb: null,
      loudnessVariationDb: null,
      clippingRatio: null,
      notes: ["Декодированная аудиодорожка пустая."]
    };
  }

  let sumSquares = 0;
  let peak = 0;
  let clipped = 0;
  const frameDbValues: number[] = [];

  for (let offset = 0; offset < sampleCount; offset += 1) {
    const sample = buffer.readInt16LE(offset * PCM_BYTES_PER_SAMPLE);
    const abs = Math.abs(sample);
    peak = Math.max(peak, abs);
    sumSquares += sample * sample;
    if (abs >= 32700) clipped += 1;
  }

  for (let frameStart = 0; frameStart < sampleCount; frameStart += FRAME_SIZE) {
    const frameEnd = Math.min(sampleCount, frameStart + FRAME_SIZE);
    let frameSquares = 0;
    for (let offset = frameStart; offset < frameEnd; offset += 1) {
      const sample = buffer.readInt16LE(offset * PCM_BYTES_PER_SAMPLE);
      frameSquares += sample * sample;
    }
    const frameRms = Math.sqrt(frameSquares / Math.max(1, frameEnd - frameStart)) / 32768;
    const frameDb = amplitudeToDb(frameRms);
    if (frameDb > -55) frameDbValues.push(frameDb);
  }

  const rms = Math.sqrt(sumSquares / sampleCount) / 32768;
  const rmsDb = amplitudeToDb(rms);
  const peakDb = amplitudeToDb(peak / 32768);
  const loudnessVariationDb = frameDbValues.length >= 2 ? standardDeviation(frameDbValues) : null;
  const clippingRatio = clipped / sampleCount;
  const notes: string[] = [];
  if (rmsDb < -42) notes.push("Запись очень тихая: уровень сигнала зависит от микрофона и не измеряет энергию или уверенность человека.");
  if (clippingRatio > 0.01) notes.push("В записи есть клиппинг: микрофон мог перегружаться.");

  return {
    durationSeconds: roundTo(sampleCount / PCM_SAMPLE_RATE, 1),
    rmsDb: roundTo(rmsDb, 1),
    peakDb: roundTo(peakDb, 1),
    loudnessVariationDb: loudnessVariationDb === null ? null : roundTo(loudnessVariationDb, 1),
    clippingRatio: roundTo(clippingRatio, 4),
    notes
  };
}

function scoreMetricQuality(
  metrics: Pick<VoiceSignalMetrics, "transcriptWordCount" | "durationSeconds"> & Partial<Pick<VoiceSignalMetrics, "rmsDb" | "clippingRatio">>,
  acousticMetrics: ReturnType<typeof analyzePcm16le> | null
): VoiceSignalMetrics["quality"] {
  if (!metrics.transcriptWordCount || !metrics.durationSeconds) return "weak";
  if (metrics.transcriptWordCount < 25 || metrics.durationSeconds < 20) return "weak";
  const rmsDb = metrics.rmsDb;
  const clippingRatio = metrics.clippingRatio ?? 0;
  if (!acousticMetrics || rmsDb == null) return "usable";
  if (rmsDb < -42 || clippingRatio > 0.02) return "weak";
  return "good";
}

function normalizePositiveNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function amplitudeToDb(value: number) {
  if (value <= 0) return -100;
  return 20 * Math.log10(value);
}

function standardDeviation(values: number[]) {
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + ((value - average) ** 2), 0) / values.length;
  return Math.sqrt(variance);
}

function roundTo(value: number, precision: number) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}
