import type { IkigaiAnswers, ReportFull } from "@levelup/contracts";
import type { MediaAsset } from "@prisma/client";
import { basename } from "node:path";
import { z } from "zod";
import { env } from "../env.js";
import { readMediaAssetBuffer } from "./media.js";

type ReportContext = {
  analysisId: string;
  locale: string;
  answers: IkigaiAnswers;
  mediaAssets: MediaAsset[];
};

export type GeneratedReport = {
  report: ReportFull;
  model: string;
  usedOpenAI: boolean;
  mediaSignals: {
    audioTranscript: boolean;
    photoInput: boolean;
  };
};

const scoreSchema = z.object({
  love: z.number().int().min(0).max(100),
  good_at: z.number().int().min(0).max(100),
  paid_for: z.number().int().min(0).max(100),
  world_needs: z.number().int().min(0).max(100)
});

export const reportFullSchema = z.object({
  profession: z.string().min(2),
  summary: z.string().min(20),
  ikigai_scores: scoreSchema,
  voice_analysis: z.object({
    timbre: z.string(),
    emotionality: z.string(),
    confidence: z.string(),
    pace: z.string(),
    energy: z.string(),
    leadership: z.string(),
    anxiety: z.string(),
    communication: z.string(),
    charisma: z.string(),
    analytical: z.string(),
    sociality: z.string(),
    persuasion: z.string(),
    motivation: z.string()
  }),
  face_analysis: z.object({
    emotionality: z.string(),
    leadership: z.string(),
    confidence: z.string(),
    thinkingType: z.string(),
    sociality: z.string(),
    stressTolerance: z.string(),
    analytical: z.string(),
    motivation: z.string(),
    empathy: z.string(),
    openness: z.string(),
    communication: z.string(),
    discipline: z.string(),
    ambition: z.string()
  }),
  top_roles: z.array(z.object({
    name: z.string(),
    match: z.number().int().min(0).max(100),
    why: z.string(),
    voiceEvidence: z.string(),
    faceEvidence: z.string(),
    strengths: z.string(),
    risks: z.string()
  })),
  career_action: z.string(),
  final_insight: z.string()
});

const reportJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "profession",
    "summary",
    "ikigai_scores",
    "voice_analysis",
    "face_analysis",
    "top_roles",
    "career_action",
    "final_insight"
  ],
  properties: {
    profession: { type: "string" },
    summary: { type: "string" },
    ikigai_scores: {
      type: "object",
      additionalProperties: false,
      required: ["love", "good_at", "paid_for", "world_needs"],
      properties: {
        love: { type: "integer" },
        good_at: { type: "integer" },
        paid_for: { type: "integer" },
        world_needs: { type: "integer" }
      }
    },
    voice_analysis: textMapSchema([
      "timbre",
      "emotionality",
      "confidence",
      "pace",
      "energy",
      "leadership",
      "anxiety",
      "communication",
      "charisma",
      "analytical",
      "sociality",
      "persuasion",
      "motivation"
    ]),
    face_analysis: textMapSchema([
      "emotionality",
      "leadership",
      "confidence",
      "thinkingType",
      "sociality",
      "stressTolerance",
      "analytical",
      "motivation",
      "empathy",
      "openness",
      "communication",
      "discipline",
      "ambition"
    ]),
    top_roles: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "match", "why", "voiceEvidence", "faceEvidence", "strengths", "risks"],
        properties: {
          name: { type: "string" },
          match: { type: "integer" },
          why: { type: "string" },
          voiceEvidence: { type: "string" },
          faceEvidence: { type: "string" },
          strengths: { type: "string" },
          risks: { type: "string" }
        }
      }
    },
    career_action: { type: "string" },
    final_insight: { type: "string" }
  }
} as const;

function textMapSchema(keys: string[]) {
  return {
    type: "object",
    additionalProperties: false,
    required: keys,
    properties: Object.fromEntries(keys.map((key) => [key, { type: "string" }]))
  };
}

function isLikelyImage(buffer: Buffer) {
  if (buffer.length < 8) return false;
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isPng = buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  return isJpeg || isPng;
}

function isLikelyAudio(buffer: Buffer) {
  if (buffer.length < 4) return false;
  const isWebm = buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3;
  const isMp3 = buffer.subarray(0, 3).toString("latin1") === "ID3" || (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0);
  const isWav = buffer.subarray(0, 4).toString("latin1") === "RIFF";
  return isWebm || isMp3 || isWav;
}

function getAsset(assets: MediaAsset[], type: "AUDIO" | "PHOTO") {
  return assets.find((asset) => asset.type === type && (asset.status === "UPLOADED" || asset.status === "VERIFIED")) ?? null;
}

async function transcribeAudio(asset: MediaAsset | null) {
  if (!asset || !env.OPENAI_API_KEY) return null;
  const buffer = await readMediaAssetBuffer(asset.key);
  if (!buffer) return null;
  if (!isLikelyAudio(buffer)) return null;

  const formData = new FormData();
  formData.set("model", env.OPENAI_TRANSCRIPTION_MODEL);
  formData.set("file", new Blob([buffer], { type: asset.mimeType || "application/octet-stream" }), basename(asset.key));

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`
    },
    body: formData
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI transcription failed with ${response.status}: ${body.slice(0, 240)}`);
  }

  const data = await response.json() as { text?: string };
  return data.text?.trim() || null;
}

async function buildPhotoInput(asset: MediaAsset | null) {
  if (!asset) return null;
  const buffer = await readMediaAssetBuffer(asset.key);
  if (!buffer) return null;
  if (!isLikelyImage(buffer)) return null;
  const mimeType = asset.mimeType?.startsWith("image/") ? asset.mimeType : "image/jpeg";
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

function buildPrompt(context: ReportContext, transcript: string | null, photoIncluded: boolean) {
  const language = context.locale.startsWith("en") ? "English" : "Russian";
  return [
    `Output language: ${language}.`,
    "Create a practical ikigai/career report for a consumer app.",
    "Use the questionnaire as the primary evidence. Treat voice transcript and image, when present, as weak presentation signals only.",
    "Do not identify the person, infer sensitive attributes, diagnose health, or claim deterministic traits from appearance or voice.",
    "If media evidence is unavailable, explicitly ground voice/face sections in limited available evidence.",
    "Return exactly the requested JSON shape. Use 3 to 5 top_roles. Keep every field useful and specific.",
    "",
    `Analysis ID: ${context.analysisId}`,
    `Questionnaire JSON: ${JSON.stringify(context.answers)}`,
    `Voice transcript: ${transcript || "unavailable"}`,
    `Photo input included: ${photoIncluded ? "yes" : "no"}`
  ].join("\n");
}

export async function generateOpenAiReport(context: ReportContext): Promise<GeneratedReport | null> {
  if (!env.OPENAI_API_KEY) return null;

  const audioAsset = getAsset(context.mediaAssets, "AUDIO");
  const photoAsset = getAsset(context.mediaAssets, "PHOTO");

  let transcript: string | null = null;
  try {
    transcript = await transcribeAudio(audioAsset);
  } catch {
    transcript = null;
  }

  const photoInput = await buildPhotoInput(photoAsset);
  const userContent: Array<Record<string, unknown>> = [
    { type: "text", text: buildPrompt(context, transcript, Boolean(photoInput)) }
  ];
  if (photoInput) {
    userContent.push({
      type: "image_url",
      image_url: { url: photoInput, detail: "low" }
    });
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: env.OPENAI_MODEL,
      temperature: 0.35,
      max_tokens: 4000,
      messages: [
        {
          role: "system",
          content: "You are a careful career-report writer. Generate useful, non-medical, non-deterministic guidance as valid JSON."
        },
        {
          role: "user",
          content: userContent
        }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "ikigai_report",
          strict: true,
          schema: reportJsonSchema
        }
      }
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI report generation failed with ${response.status}: ${body.slice(0, 240)}`);
  }

  const data = await response.json() as {
    choices?: Array<{
      message?: {
        content?: string | null;
        refusal?: string | null;
      };
    }>;
  };
  const message = data.choices?.[0]?.message;
  if (message?.refusal) throw new Error(`OpenAI refused report generation: ${message.refusal}`);
  if (!message?.content) throw new Error("OpenAI returned an empty report");

  return {
    report: reportFullSchema.parse(JSON.parse(message.content)),
    model: env.OPENAI_MODEL,
    usedOpenAI: true,
    mediaSignals: {
      audioTranscript: Boolean(transcript),
      photoInput: Boolean(photoInput)
    }
  };
}
