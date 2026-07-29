import type { MediaAsset } from "@prisma/client";
import { basename } from "node:path";
import { toFile } from "openai";
import { env } from "../env.js";
import type { AudioTranscription } from "./audioMetrics.js";
import { readMediaAssetBuffer } from "./media.js";
import { getOpenAiClient } from "./openaiClient.js";

export function isLikelyAudio(buffer: Buffer) {
  if (buffer.length < 4) return false;
  const isWebm = buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3;
  const isMp3 = buffer.subarray(0, 3).toString("latin1") === "ID3" || (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0);
  const isWav = buffer.subarray(0, 4).toString("latin1") === "RIFF";
  const isOgg = buffer.subarray(0, 4).toString("latin1") === "OggS";
  const isMp4 = buffer.length >= 12 && buffer.subarray(4, 8).toString("latin1") === "ftyp";
  return isWebm || isMp3 || isWav || isOgg || isMp4;
}

export async function transcribeAudioBuffer(
  buffer: Buffer,
  fileName: string,
  mimeType = "application/octet-stream"
): Promise<AudioTranscription | null> {
  const client = getOpenAiClient();
  if (!client || !isLikelyAudio(buffer)) return null;

  const result = await client.audio.transcriptions.create({
    model: env.OPENAI_TRANSCRIPTION_MODEL,
    response_format: "verbose_json",
    file: await toFile(buffer, basename(fileName), { type: mimeType })
  }, {
    timeout: env.OPENAI_REQUEST_TIMEOUT_MS
  });

  const text = result.text?.trim();
  if (!text) return null;
  return {
    text,
    durationSeconds: result.duration,
    segments: Array.isArray(result.segments)
      ? result.segments.map((segment) => ({
          start: segment.start,
          end: segment.end,
          text: segment.text,
          noSpeechProbability: segment.no_speech_prob,
          averageLogProbability: segment.avg_logprob
        }))
      : []
  };
}

export async function transcribeAudioAsset(asset: MediaAsset | null) {
  if (!asset) return null;
  const buffer = await readMediaAssetBuffer(asset.key);
  if (!buffer) return null;
  return transcribeAudioBuffer(buffer, asset.key, asset.mimeType);
}
