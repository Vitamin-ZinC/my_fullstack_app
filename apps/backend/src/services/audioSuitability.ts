import { createHash } from "node:crypto";
import { prisma } from "../lib/prisma.js";
import type { AudioTranscription } from "./audioMetrics.js";
import { readMediaAssetBuffer } from "./media.js";
import { isLikelyAudio, transcribeAudioBuffer } from "./audioTranscription.js";
import { hasOpenAiClient } from "./openaiClient.js";

export type AudioSuitabilityCode =
  | "AUDIO_INVALID"
  | "AUDIO_SPEECH_REQUIRED"
  | "AUDIO_VALIDATION_UNAVAILABLE";

export type AudioSuitabilityResult =
  | {
      ok: true;
      cached: boolean;
      wordCount: number;
    }
  | {
      ok: false;
      cached: boolean;
      code: AudioSuitabilityCode;
      message: string;
      retryable: boolean;
    };

export function hasDetectableSpeech(text: string | null | undefined) {
  if (!text) return false;
  const words = text.match(/[\p{L}\p{N}]+/gu) ?? [];
  return words.length >= 2;
}

export function isDetectableTranscription(transcript: AudioTranscription | null | undefined) {
  if (!hasDetectableSpeech(transcript?.text)) return false;
  const segments = transcript?.segments ?? [];
  if (segments.length === 0) return true;

  return segments.some((segment) => {
    if (!hasDetectableSpeech(segment.text)) return false;
    const noSpeechProbability = segment.noSpeechProbability;
    const averageLogProbability = segment.averageLogProbability;
    if (typeof noSpeechProbability === "number" && noSpeechProbability >= 0.8) return false;
    if (typeof averageLogProbability === "number" && averageLogProbability <= -1.5) return false;
    return true;
  });
}

export async function validateAnalysisAudioSuitability(
  analysisId: string,
  locale = "ru"
): Promise<AudioSuitabilityResult> {
  const audio = await prisma.mediaAsset.findFirst({
    where: { analysisId, type: "AUDIO" }
  });
  if (!audio) return failure(locale, "AUDIO_INVALID", false);

  let buffer: Buffer | null = null;
  try {
    buffer = await readMediaAssetBuffer(audio.key);
  } catch {
    buffer = null;
  }
  if (!buffer || !isLikelyAudio(buffer)) {
    return failure(locale, "AUDIO_INVALID", false);
  }

  const checksum = createHash("sha256").update(buffer).digest("hex");
  if (audio.checksum === checksum && audio.status === "VERIFIED") {
    return { ok: true, cached: true, wordCount: 2 };
  }
  if (audio.checksum === checksum && audio.status === "REJECTED") {
    return failure(locale, "AUDIO_SPEECH_REQUIRED", true);
  }
  if (!hasOpenAiClient()) {
    return failure(locale, "AUDIO_VALIDATION_UNAVAILABLE", false);
  }

  await prisma.mediaAsset.update({
    where: { id: audio.id },
    data: {
      checksum,
      size: buffer.length,
      status: "UPLOADED",
      verifiedAt: null
    }
  });

  let transcript: Awaited<ReturnType<typeof transcribeAudioBuffer>>;
  try {
    transcript = await transcribeAudioBuffer(buffer, audio.key, audio.mimeType);
  } catch {
    return failure(locale, "AUDIO_VALIDATION_UNAVAILABLE", false);
  }

  if (!isDetectableTranscription(transcript)) {
    await prisma.mediaAsset.update({
      where: { id: audio.id },
      data: {
        checksum,
        status: "REJECTED",
        verifiedAt: new Date()
      }
    });
    return failure(locale, "AUDIO_SPEECH_REQUIRED", false);
  }

  const wordCount = transcript?.text.match(/[\p{L}\p{N}]+/gu)?.length ?? 0;
  await prisma.mediaAsset.update({
    where: { id: audio.id },
    data: {
      checksum,
      status: "VERIFIED",
      verifiedAt: new Date()
    }
  });
  return { ok: true, cached: false, wordCount };
}

export function audioSuitabilityHttpStatus(result: Exclude<AudioSuitabilityResult, { ok: true }>) {
  return result.retryable ? 503 : 422;
}

export function audioSuitabilityMessage(locale: string, code: AudioSuitabilityCode) {
  const isEnglish = locale.toLowerCase().startsWith("en");
  const messages = isEnglish ? {
    AUDIO_INVALID: "Voice was not detected. Please record it again.",
    AUDIO_SPEECH_REQUIRED: "Voice was not detected. Please record it again.",
    AUDIO_VALIDATION_UNAVAILABLE: "We could not check the recording right now. Please try again in a minute."
  } : {
    AUDIO_INVALID: "Голос не обнаружен. Пожалуйста, повторите запись",
    AUDIO_SPEECH_REQUIRED: "Голос не обнаружен. Пожалуйста, повторите запись",
    AUDIO_VALIDATION_UNAVAILABLE: "Сейчас не удалось проверить запись. Повторите попытку через минуту."
  };
  return messages[code];
}

function failure(
  locale: string,
  code: AudioSuitabilityCode,
  cached: boolean
): Exclude<AudioSuitabilityResult, { ok: true }> {
  return {
    ok: false,
    cached,
    code,
    message: audioSuitabilityMessage(locale, code),
    retryable: code === "AUDIO_VALIDATION_UNAVAILABLE"
  };
}
