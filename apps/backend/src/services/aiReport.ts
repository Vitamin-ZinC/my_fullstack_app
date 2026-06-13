import type { IkigaiAnswers, ReportFree, ReportFull, ReportTier } from "@levelup/contracts";
import type { MediaAsset } from "@prisma/client";
import { basename } from "node:path";
import { z } from "zod";
import { env } from "../env.js";
import { readMediaAssetBuffer } from "./media.js";
import { buildReportPromptMessages } from "./reportPrompts.js";

type ReportContext = {
  analysisId: string;
  locale: string;
  answers: IkigaiAnswers;
  mediaAssets: MediaAsset[];
};

export type GeneratedReport = {
  reportFree: ReportFree;
  report: ReportFull;
  model: string;
  promptVersion: number;
  promptVersions: {
    free: number;
    full: number;
  };
  usedOpenAI: boolean;
  mediaSignals: {
    audioTranscript: boolean;
    photoInput: boolean;
  };
};

type CompletionResult<TReport> = {
  report: TReport;
  photoInputUsed: boolean;
  promptVersion: number;
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

export const reportFreeSchema = z.object({
  profession: z.string().min(2),
  summary: z.string().min(20),
  ikigai_scores: scoreSchema,
  key_insight: z.string().min(20),
  paid_report_teaser: z.string().min(20),
  paid_report_preview: z.array(z.string().min(3)).min(4).max(6)
});

const scoreJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["love", "good_at", "paid_for", "world_needs"],
  properties: {
    love: { type: "integer" },
    good_at: { type: "integer" },
    paid_for: { type: "integer" },
    world_needs: { type: "integer" }
  }
} as const;

const reportFreeJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "profession",
    "summary",
    "ikigai_scores",
    "key_insight",
    "paid_report_teaser",
    "paid_report_preview"
  ],
  properties: {
    profession: { type: "string" },
    summary: { type: "string" },
    ikigai_scores: scoreJsonSchema,
    key_insight: { type: "string" },
    paid_report_teaser: { type: "string" },
    paid_report_preview: {
      type: "array",
      items: { type: "string" }
    }
  }
} as const;

const reportFullJsonSchema = {
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
    ikigai_scores: scoreJsonSchema,
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
  const freeCompletion = await createReportCompletion({
    context,
    tier: "FREE",
    transcript,
    photoInput,
    schemaName: "ikigai_free_report",
    jsonSchema: reportFreeJsonSchema,
    parseReport: (content) => reportFreeSchema.parse(JSON.parse(content))
  });
  const fullCompletion = await createReportCompletion({
    context,
    tier: "FULL",
    transcript,
    photoInput,
    schemaName: "ikigai_full_report",
    jsonSchema: reportFullJsonSchema,
    parseReport: (content) => reportFullSchema.parse(JSON.parse(content))
  });
  const promptVersion = Math.max(freeCompletion.promptVersion, fullCompletion.promptVersion);

  return {
    reportFree: freeCompletion.report,
    report: fullCompletion.report,
    model: env.OPENAI_MODEL,
    promptVersion,
    promptVersions: {
      free: freeCompletion.promptVersion,
      full: fullCompletion.promptVersion
    },
    usedOpenAI: true,
    mediaSignals: {
      audioTranscript: Boolean(transcript),
      photoInput: freeCompletion.photoInputUsed || fullCompletion.photoInputUsed
    }
  };
}

async function buildCompletionInput(context: ReportContext, tier: ReportTier, transcript: string | null, photoInput: string | null) {
  const prompts = await buildReportPromptMessages(context, tier, transcript, Boolean(photoInput));
  const userContent: Array<Record<string, unknown>> = [
    { type: "text", text: prompts.userPrompt }
  ];
  if (photoInput) {
    userContent.push({
      type: "image_url",
      image_url: { url: photoInput, detail: "low" }
    });
  }
  return {
    userContent,
    systemPrompt: prompts.systemPrompt,
    promptVersion: prompts.promptVersion
  };
}

function isImageInputError(body: string) {
  return /image_parse_error|unsupported image|invalid image|invalid_image/i.test(body);
}

type ReportCompletionRequest<TReport> = {
  context: ReportContext;
  tier: ReportTier;
  transcript: string | null;
  photoInput: string | null;
  schemaName: string;
  jsonSchema: unknown;
  parseReport: (content: string) => TReport;
};

async function createReportCompletion<TReport>(request: ReportCompletionRequest<TReport>): Promise<CompletionResult<TReport>> {
  const input = await buildCompletionInput(request.context, request.tier, request.transcript, request.photoInput);
  try {
    return await requestReportCompletion(input, Boolean(request.photoInput), request.schemaName, request.jsonSchema, request.parseReport);
  } catch (error) {
    if (!request.photoInput || !(error instanceof Error) || !isImageInputError(error.message)) {
      throw error;
    }

    return requestReportCompletion(
      await buildCompletionInput(request.context, request.tier, request.transcript, null),
      false,
      request.schemaName,
      request.jsonSchema,
      request.parseReport
    );
  }
}

async function requestReportCompletion<TReport>(
  input: Awaited<ReturnType<typeof buildCompletionInput>>,
  photoInputUsed: boolean,
  schemaName: string,
  jsonSchema: unknown,
  parseReport: (content: string) => TReport
): Promise<CompletionResult<TReport>> {
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
          content: input.systemPrompt
        },
        {
          role: "user",
          content: input.userContent
        }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: schemaName,
          strict: true,
          schema: jsonSchema
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
    report: parseReport(message.content),
    photoInputUsed,
    promptVersion: input.promptVersion
  };
}
