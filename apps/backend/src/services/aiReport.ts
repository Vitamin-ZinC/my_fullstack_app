import type { IkigaiAnswers, ReportFree, ReportFull, ReportTier } from "@levelup/contracts";
import type { MediaAsset } from "@prisma/client";
import type {
  ChatCompletion,
  ChatCompletionContentPart,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionMessageParam
} from "openai/resources/chat/completions";
import { z } from "zod";
import { env } from "../env.js";
import { getMediaAssetPublicUrl, readMediaAssetBuffer } from "./media.js";
import { buildReportPromptMessages } from "./reportPrompts.js";
import { analyzeAudioMetrics, type AudioTranscription, type VoiceSignalMetrics } from "./audioMetrics.js";
import { parseCompletionJson, parseGatewayJson } from "./completionJson.js";
import { getOpenAiApiKey, getOpenAiClient, hasOpenAiClient } from "./openaiClient.js";
import { isLikelyAudio, transcribeAudioAsset } from "./audioTranscription.js";
import {
  isAsyncCompletionPollingTimeoutError,
  isRetryableAsyncCompletionError,
  isTerminalAsyncProviderError,
  normalizeCompatibleChatMessages,
  stableRequestFingerprint,
  shouldFallbackToSyncCompletionAfterAsyncError
} from "./aiReportRouting.js";

type ReportContext = {
  analysisId: string;
  locale: string;
  answers: IkigaiAnswers;
  mediaAssets: MediaAsset[];
  onProgress?: (event: { progress: number; stage: string; log: string }) => void;
};

export type ReportCompletionTelemetry = {
  part: string;
  requestedTransport: "async" | "sync";
  durationMs: number;
  finishReason: string | null;
  outputCharacters: number;
  completionTokens: number | null;
  totalTokens: number | null;
  repairAttempts: number;
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
    audioMetrics: boolean;
    photoInput: boolean;
  };
  telemetry: ReportCompletionTelemetry[];
  roleGeneration: {
    initial: number;
    supplemented: number;
    fallback: number;
  };
};

type CompletionResult<TReport> = {
  report: TReport;
  photoInputUsed: boolean;
  promptVersion: number;
  telemetry: ReportCompletionTelemetry;
};

type OpenAiClient = NonNullable<ReturnType<typeof getOpenAiClient>>;
type ResponseFormat = NonNullable<ChatCompletionCreateParamsNonStreaming["response_format"]>;
type ChatCompletionParams = Omit<ChatCompletionCreateParamsNonStreaming, "response_format">;
type CompatibleChatCompletionParams = ChatCompletionParams & {
  thinking?: { type: "disabled" };
};
type AsyncCompletionJob = {
  id?: string;
  job_id?: string;
  jobId?: string;
  status?: string;
  response?: ChatCompletion | null;
  error?: unknown;
};

const scoreSchema = z.object({
  love: z.number().int().min(0).max(100),
  good_at: z.number().int().min(0).max(100),
  paid_for: z.number().int().min(0).max(100),
  world_needs: z.number().int().min(0).max(100)
});

const diagnosticLabels = {
  result: "Ваш результат:",
  meaning: "Что это значит:",
  recommendation: "Рекомендация:"
} as const;

const diagnosticTextSchema = z.string().min(20).refine((value) => {
  const normalized = value.trim().toLowerCase();
  return ![
    "low",
    "medium",
    "high",
    "unavailable",
    "n/a",
    "низкий",
    "средний",
    "высокий",
    "недоступно"
  ].includes(normalized);
}, "diagnostic parameters must be explanatory text").refine((value) => (
  value.includes(diagnosticLabels.result) &&
  value.includes(diagnosticLabels.meaning) &&
  value.includes(diagnosticLabels.recommendation)
), "diagnostic parameters must use the required result/meaning/recommendation format");

const ikigaiZoneSchema = z.object({
  title: z.string().min(2),
  insight: z.string().min(20),
  recommendation: z.string().min(20)
});

const voiceAnalysisKeys = [
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
] as const;

const faceAnalysisKeys = [
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
] as const;

const ikigaiZoneKeys = ["passion", "mission", "profession", "vocation", "ikigai"] as const;

const voiceAnalysisSchema = z.object({
    timbre: diagnosticTextSchema,
    emotionality: diagnosticTextSchema,
    confidence: diagnosticTextSchema,
    pace: diagnosticTextSchema,
    energy: diagnosticTextSchema,
    leadership: diagnosticTextSchema,
    anxiety: diagnosticTextSchema,
    communication: diagnosticTextSchema,
    charisma: diagnosticTextSchema,
    analytical: diagnosticTextSchema,
    sociality: diagnosticTextSchema,
    persuasion: diagnosticTextSchema,
    motivation: diagnosticTextSchema
});

const faceAnalysisSchema = z.object({
    emotionality: diagnosticTextSchema,
    leadership: diagnosticTextSchema,
    confidence: diagnosticTextSchema,
    thinkingType: diagnosticTextSchema,
    sociality: diagnosticTextSchema,
    stressTolerance: diagnosticTextSchema,
    analytical: diagnosticTextSchema,
    motivation: diagnosticTextSchema,
    empathy: diagnosticTextSchema,
    openness: diagnosticTextSchema,
    communication: diagnosticTextSchema,
    discipline: diagnosticTextSchema,
    ambition: diagnosticTextSchema
});

const topRoleSchema = z.object({
  name: z.string(),
  match: z.number().int().min(0).max(100),
  why: z.string(),
  voiceEvidence: z.string(),
  faceEvidence: z.string(),
  strengths: z.string(),
  risks: z.string()
});

const ikigaiZonesSchema = z.object({
    passion: ikigaiZoneSchema,
    mission: ikigaiZoneSchema,
    profession: ikigaiZoneSchema,
    vocation: ikigaiZoneSchema,
    ikigai: ikigaiZoneSchema
});

const reportDiagnosticsSchema = z.object({
  profession: z.string().min(2),
  summary: z.string().min(20),
  ikigai_scores: scoreSchema,
  voice_analysis: voiceAnalysisSchema,
  face_analysis: faceAnalysisSchema
});

const reportDirectionsSchema = z.object({
  top_roles: z.array(topRoleSchema).max(5),
  ikigai_zones: ikigaiZonesSchema,
  career_action: z.string(),
  final_insight: z.string()
});

export const reportFullSchema = reportDiagnosticsSchema.extend({
  top_roles: z.array(topRoleSchema).length(5),
  ikigai_zones: ikigaiZonesSchema,
  career_action: z.string(),
  final_insight: z.string()
});

type ReportDiagnostics = z.infer<typeof reportDiagnosticsSchema>;
type ReportDirections = z.infer<typeof reportDirectionsSchema>;

export const reportFreeSchema = z.object({
  profession: z.string().min(2),
  summary: z.string().min(20),
  ikigai_scores: scoreSchema,
  key_insight: z.string().min(20),
  paid_report_teaser: z.string().min(20),
  paid_report_preview: z.array(z.string().min(3)).min(4).max(6)
});

function normalizePaidReportPromise(value: string) {
  return value
    .replace(/топ\s*[-–—]?\s*3(?!\d)/giu, "ТОП-5")
    .replace(/три\s+(?:перспективн[а-яё]*\s+)?(?:професси[а-яё]*|рол[а-яё]*|направлени[а-яё]*)/giu, "5 профессиональных направлений")
    .replace(/\btop\s*[-–—]?\s*3\b/giu, "Top-5")
    .replace(/90\s*[-–—]?\s*дневн[а-яё]*/giu, "30-дневный")
    .replace(/90\s+д(?:ень|ня|ней)/giu, "30 дней")
    .replace(/девяносто\s+д(?:ень|ня|ней)/giu, "30 дней")
    .replace(/\b90\s*[-–—]?\s*days?\b/giu, "30-day");
}

function normalizePaidReportPreviewItem(value: string) {
  const normalized = normalizePaidReportPromise(value);
  if (/(?:топ|професси|рол|направлени)/iu.test(normalized)) {
    return "ТОП-5 профессиональных направлений с процентами совпадения, сильными сторонами и рисками";
  }
  if (/(?:маршрут|план).*(?:дн|недел)/iu.test(normalized)) {
    return "Персональный 30-дневный маршрут: четыре недели действий, результатов и проверок";
  }
  return normalized;
}

export function normalizeFreeReportValue(value: unknown): ReportFree {
  const report = reportFreeSchema.parse(value);
  return {
    ...report,
    paid_report_teaser: normalizePaidReportPromise(report.paid_report_teaser),
    paid_report_preview: report.paid_report_preview.map(normalizePaidReportPreviewItem)
  };
}

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

const ikigaiZoneJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "insight", "recommendation"],
  properties: {
    title: { type: "string" },
    insight: { type: "string" },
    recommendation: { type: "string" }
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
    "ikigai_zones",
    "career_action",
    "final_insight"
  ],
  properties: {
    profession: { type: "string" },
    summary: { type: "string" },
    ikigai_scores: scoreJsonSchema,
    voice_analysis: textMapSchema([...voiceAnalysisKeys]),
    face_analysis: textMapSchema([...faceAnalysisKeys]),
    top_roles: {
      type: "array",
      minItems: 5,
      maxItems: 5,
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
    ikigai_zones: {
      type: "object",
      additionalProperties: false,
      required: ["passion", "mission", "profession", "vocation", "ikigai"],
      properties: {
        passion: ikigaiZoneJsonSchema,
        mission: ikigaiZoneJsonSchema,
        profession: ikigaiZoneJsonSchema,
        vocation: ikigaiZoneJsonSchema,
        ikigai: ikigaiZoneJsonSchema
      }
    },
    career_action: { type: "string" },
    final_insight: { type: "string" }
  }
} as const;

const reportDiagnosticsJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["profession", "summary", "ikigai_scores", "voice_analysis", "face_analysis"],
  properties: {
    profession: reportFullJsonSchema.properties.profession,
    summary: reportFullJsonSchema.properties.summary,
    ikigai_scores: reportFullJsonSchema.properties.ikigai_scores,
    voice_analysis: reportFullJsonSchema.properties.voice_analysis,
    face_analysis: reportFullJsonSchema.properties.face_analysis
  }
} as const;

const reportDirectionsJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["top_roles", "ikigai_zones", "career_action", "final_insight"],
  properties: {
    top_roles: reportFullJsonSchema.properties.top_roles,
    ikigai_zones: reportFullJsonSchema.properties.ikigai_zones,
    career_action: reportFullJsonSchema.properties.career_action,
    final_insight: reportFullJsonSchema.properties.final_insight
  }
} as const;

function reportRoleSupplementJsonSchema(count: number) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["top_roles"],
    properties: {
      top_roles: {
        ...reportFullJsonSchema.properties.top_roles,
        minItems: count,
        maxItems: count
      }
    }
  };
}

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

function getAsset(assets: MediaAsset[], type: "AUDIO" | "PHOTO") {
  return assets.find((asset) => asset.type === type && (asset.status === "UPLOADED" || asset.status === "VERIFIED")) ?? null;
}

async function buildVoiceMetrics(asset: MediaAsset | null, transcription: AudioTranscription | null, clientDurationSeconds?: number | null) {
  if (!asset) return null;
  const buffer = await readMediaAssetBuffer(asset.key);
  if (!buffer) return null;
  if (!isLikelyAudio(buffer)) return null;
  return analyzeAudioMetrics(buffer, transcription, clientDurationSeconds);
}

async function buildPhotoInput(asset: MediaAsset | null) {
  if (!asset) return null;
  const buffer = await readMediaAssetBuffer(asset.key);
  if (!buffer) return null;
  if (!isLikelyImage(buffer)) return null;
  return getMediaAssetPublicUrl(asset.key);
}

const fullDiagnosticsSegmentInstruction = [
  "SEGMENT REQUEST: diagnostic profile.",
  "Return only profession, summary, ikigai_scores, voice_analysis, and face_analysis.",
  "Do not return top_roles, ikigai_zones, career_action, or final_insight in this segment.",
  "Keep all diagnostic safety, evidence hierarchy, language, and three-label requirements from the main prompt."
].join("\n");

const fullDirectionsSegmentInstruction = [
  "SEGMENT REQUEST: career directions and synthesis.",
  "Return only top_roles, ikigai_zones, career_action, and final_insight.",
  "top_roles must contain exactly five distinct, realistic, forward-looking directions sorted by match descending.",
  "career_action must cover exactly 30 days in four detailed weekly blocks. For every week include a goal, 2 to 3 concrete actions, a tangible deliverable, and a measurable completion check. Never call it a 90-day route.",
  "Do not return profession, summary, ikigai_scores, voice_analysis, or face_analysis in this segment.",
  "Keep all safety, personalization, language, and synthesis requirements from the main prompt."
].join("\n");

function reportProgress(context: ReportContext, progress: number, ru: string, en: string) {
  context.onProgress?.({
    progress,
    stage: "ai",
    log: context.locale.toLowerCase().startsWith("ru") ? ru : en
  });
}

export async function generateOpenAiReport(context: ReportContext): Promise<GeneratedReport | null> {
  if (!hasOpenAiClient()) return null;

  const audioAsset = getAsset(context.mediaAssets, "AUDIO");
  const photoAsset = getAsset(context.mediaAssets, "PHOTO");

  reportProgress(context, 8, "Подготавливаем аудио и изображение...", "Preparing audio and image...");
  let transcription: AudioTranscription | null = null;
  try {
    transcription = await transcribeAudioAsset(audioAsset);
  } catch {
    transcription = null;
  }
  reportProgress(context, 24, "Расшифровка голоса завершена...", "Voice transcription completed...");

  const clientDurationSeconds = extractClientVoiceDuration(context.answers);
  const [voiceMetrics, photoInput] = await Promise.all([
    buildVoiceMetrics(audioAsset, transcription, clientDurationSeconds).catch(() => null),
    buildPhotoInput(photoAsset).catch(() => null)
  ]);
  const transcript = transcription?.text ?? null;
  const useCompatibleAsync = env.OPENAI_ASYNC_REPORTS_ENABLED && supportsCompatibleAsyncCompletions();
  reportProgress(context, 42, "Формируем разделы отчёта параллельно...", "Generating report sections in parallel...");

  let generationProgress = 42;
  let completedParts = 0;
  const telemetry: ReportCompletionTelemetry[] = [];
  const heartbeat = setInterval(() => {
    generationProgress = Math.min(72, generationProgress + 2);
    reportProgress(context, generationProgress, "Нейросеть продолжает анализ, данные сохранены...", "AI analysis is still running; your data is saved...");
  }, 15_000);
  heartbeat.unref?.();

  const runPart = async <TReport>(labelRu: string, labelEn: string, factory: () => Promise<CompletionResult<TReport>>) => {
    const completion = await factory();
    telemetry.push(completion.telemetry);
    completedParts += 1;
    generationProgress = Math.max(generationProgress, 72 + completedParts * 6);
    reportProgress(context, generationProgress, labelRu, labelEn);
    return completion;
  };

  let freeCompletion: CompletionResult<ReportFree>;
  let diagnosticsCompletion: CompletionResult<ReportDiagnostics>;
  let directionsCompletion: CompletionResult<ReportDirections>;
  let diagnosticsParseAttempt = 0;
  try {
    [freeCompletion, diagnosticsCompletion, directionsCompletion] = await Promise.all([
      runPart("Бесплатная часть отчёта готова...", "Free report section completed...", () => createReportCompletion({
        context,
        tier: "FREE",
        transcript,
        voiceMetrics,
        photoInput,
        part: "free",
        schemaName: "ikigai_free_report",
        jsonSchema: reportFreeJsonSchema,
        useAsync: useCompatibleAsync,
        maxTokens: 3000,
        parseReport: (content) => normalizeFreeReportValue(parseCompletionJson(content))
      })),
      runPart("Анализ лица и голоса готов...", "Voice and face analysis completed...", () => createReportCompletion({
        context,
        tier: "FULL",
        transcript,
        voiceMetrics,
        photoInput,
        part: "full_diagnostics",
        schemaName: "ikigai_full_diagnostics",
        jsonSchema: reportDiagnosticsJsonSchema,
        useAsync: useCompatibleAsync,
        maxTokens: 8000,
        segmentInstruction: fullDiagnosticsSegmentInstruction,
        parseReport: (content) => {
          diagnosticsParseAttempt += 1;
          const parsed = parseCompletionJson(content);
          return diagnosticsParseAttempt < 3
            ? reportDiagnosticsSchema.parse(parsed)
            : normalizeDiagnosticsValue(parsed);
        }
      })),
      runPart("Профессиональные направления готовы...", "Career directions completed...", () => createReportCompletion({
        context,
        tier: "FULL",
        transcript,
        voiceMetrics,
        photoInput,
        part: "full_directions",
        schemaName: "ikigai_full_directions",
        jsonSchema: reportDirectionsJsonSchema,
        useAsync: useCompatibleAsync,
        maxTokens: 6000,
        segmentInstruction: fullDirectionsSegmentInstruction,
        parseReport: (content) => {
          const parsed = parseCompletionJson(content);
          if (!isRecord(parsed)) throw new Error("Career report segment must be a JSON object");
          return reportDirectionsSchema.parse(parsed);
        }
      }))
    ]);
  } finally {
    clearInterval(heartbeat);
  }

  const diagnostics = diagnosticsCompletion.report;
  const directions = normalizeDirectionsValue(directionsCompletion.report, diagnostics);
  const initialRoles = uniqueTopRoles(directions.top_roles);
  const missingRoleCount = Math.max(0, 5 - initialRoles.length);
  let supplementedRoles: ReportFull["top_roles"] = [];
  let supplementPromptVersion = 0;

  if (missingRoleCount > 0) {
    reportProgress(context, 92, "Дополняем недостающие профессиональные направления...", "Completing missing career directions...");
    const existingNames = initialRoles.map((role) => role.name);
    const supplementInstruction = [
      "SEGMENT REQUEST: alternative career directions only.",
      `Return exactly five new top_roles candidates that are distinct from these existing directions: ${existingNames.join(", ")}.`,
      `The backend will select the best ${missingRoleCount} candidates needed to complete the final five-item list.`,
      "Return only the top_roles object requested by the attached schema.",
      "Keep every role realistic, forward-looking, personalized, evidence-specific, and written in the requested output language."
    ].join("\n");

    try {
      const supplement = await createReportCompletion({
        context,
        tier: "FULL",
        transcript,
        voiceMetrics,
        photoInput,
        part: "full_roles_supplement",
        schemaName: "ikigai_full_roles_supplement",
        jsonSchema: reportRoleSupplementJsonSchema(5),
        useAsync: useCompatibleAsync,
        maxTokens: 5000,
        segmentInstruction: supplementInstruction,
        parseReport: (content) => {
          const parsed = parseCompletionJson(content);
          if (!isRecord(parsed)) throw new Error("Role supplement must be a JSON object");
          const roles = uniqueTopRoles(
            normalizeTopRoleCandidates(parsed.top_roles, { ...parsed, summary: diagnostics.summary }, diagnostics.voice_analysis, diagnostics.face_analysis),
            existingNames
          );
          return z.object({ top_roles: z.array(topRoleSchema).length(5) }).parse({ top_roles: roles });
        }
      });
      supplementedRoles = supplement.report.top_roles.slice(0, missingRoleCount);
      supplementPromptVersion = supplement.promptVersion;
      telemetry.push(supplement.telemetry);
    } catch {
      reportProgress(context, 94, "Завершаем отчёт с безопасным резервным дополнением...", "Finishing report with a safe fallback...");
    }
  }

  const aiRoleCount = uniqueTopRoles([...initialRoles, ...supplementedRoles]).length;
  const fallbackRoleCount = Math.max(0, 5 - aiRoleCount);
  const report = mergeFullReportParts(diagnostics, { ...directions, top_roles: initialRoles }, supplementedRoles);
  const fullPromptVersion = Math.max(diagnosticsCompletion.promptVersion, directionsCompletion.promptVersion, supplementPromptVersion);
  const promptVersion = Math.max(freeCompletion.promptVersion, fullPromptVersion);
  reportProgress(context, 96, "Собираем итоговый отчёт...", "Assembling the final report...");

  return {
    reportFree: freeCompletion.report,
    report,
    model: env.OPENAI_MODEL,
    promptVersion,
    promptVersions: {
      free: freeCompletion.promptVersion,
      full: fullPromptVersion
    },
    usedOpenAI: true,
    mediaSignals: {
      audioTranscript: Boolean(transcript),
      audioMetrics: Boolean(voiceMetrics),
      photoInput: freeCompletion.photoInputUsed || diagnosticsCompletion.photoInputUsed || directionsCompletion.photoInputUsed
    },
    telemetry,
    roleGeneration: {
      initial: initialRoles.length,
      supplemented: supplementedRoles.length,
      fallback: fallbackRoleCount
    }
  };
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(source: UnknownRecord, ...keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function numberValue(source: UnknownRecord, key: string, fallback: number) {
  const value = Number(source[key]);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function safeLongText(value: unknown, fallback: string, minLength = 20) {
  if (typeof value === "string" && value.trim().length >= minLength) return value.trim();
  return fallback;
}

function diagnosticSourceValue(source: UnknownRecord, key: string) {
  const aliases: Record<string, string[]> = {
    thinkingType: ["thinkingType", "thinking_type"],
    stressTolerance: ["stressTolerance", "stress_tolerance"]
  };
  for (const candidate of [key, ...(aliases[key] ?? [])]) {
    const value = source[candidate];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function diagnosticFallback(kind: "voice" | "face", key: string) {
  const parameter = key.replace(/([A-Z])/g, " $1").toLowerCase();
  if (kind === "voice") {
    return `${diagnosticLabels.result} Параметр "${parameter}" оценивается осторожно: в записи достаточно данных для рабочей гипотезы, но не для жёсткого вывода. ${diagnosticLabels.meaning} Основной вывод строится на анкете и содержании речи, а голосовой сигнал используется только как дополнительный признак подачи. ${diagnosticLabels.recommendation} Проверьте это в коротком рабочем выступлении: запишите 60 секунд речи, отметьте темп, паузы и ясность главной мысли.`;
  }
  return `${diagnosticLabels.result} Параметр "${parameter}" оценивается как мягкий визуальный сигнал по загруженному изображению. ${diagnosticLabels.meaning} Это не вывод о личности или здоровье, а осторожная гипотеза о том, как может считываться подача в коммуникации. ${diagnosticLabels.recommendation} Проверьте эффект на практике: обновите фото/кадр, попросите нейтральную обратную связь и сравните, стало ли сообщение понятнее.`;
}

function completeDiagnosticMap(source: unknown, keys: readonly string[], kind: "voice" | "face") {
  const record = isRecord(source) ? source : {};
  return Object.fromEntries(keys.map((key) => {
    const value = diagnosticSourceValue(record, key);
    if (value && diagnosticTextSchema.safeParse(value).success) return [key, value];
    if (value) {
      return [key, `${diagnosticLabels.result} ${value}. ${diagnosticLabels.meaning} Этот вывод рассматривается как осторожная рабочая гипотеза, а не как диагноз или неизменная черта. ${diagnosticLabels.recommendation} Проверьте его на одном практическом действии и сравните с обратной связью.`];
    }
    return [key, diagnosticFallback(kind, key)];
  }));
}

function completeIkigaiZones(source: unknown, summary: string) {
  const record = isRecord(source) ? source : {};
  return Object.fromEntries(ikigaiZoneKeys.map((key) => {
    const zone = isRecord(record[key]) ? record[key] as UnknownRecord : {};
    const title = stringValue(zone, "title") ?? {
      passion: "То, что даёт энергию",
      mission: "То, чем полезно делиться",
      profession: "То, что можно упаковать в работу",
      vocation: "То, где есть запрос",
      ikigai: "Точка соединения"
    }[key];
    return [key, {
      title,
      insight: safeLongText(zone.insight, `Эта зона опирается на общий вывод отчёта: ${summary}`),
      recommendation: safeLongText(zone.recommendation, "Выберите один маленький эксперимент на ближайшие 24 часа и проверьте, даёт ли он больше энергии, ясности и пользы для других.")
    }];
  }));
}

function normalizeTopRoleCandidates(source: unknown, candidate: UnknownRecord, voiceAnalysis: UnknownRecord, faceAnalysis: UnknownRecord) {
  return Array.isArray(source) ? source.filter(isRecord).slice(0, 5).map((role, index) => ({
    name: stringValue(role, "name", "role") ?? `Профессиональная роль ${index + 1}`,
    match: numberValue(role, "match", Math.max(55, 82 - index * 5)),
    why: safeLongText(role.why, safeLongText(candidate.summary, "Роль подходит как рабочая гипотеза по анкете и общему профилю пользователя.")),
    voiceEvidence: safeLongText(stringValue(role, "voiceEvidence", "voice_evidence"), String(voiceAnalysis.communication ?? diagnosticFallback("voice", "communication"))),
    faceEvidence: safeLongText(stringValue(role, "faceEvidence", "face_evidence"), String(faceAnalysis.communication ?? diagnosticFallback("face", "communication"))),
    strengths: safeLongText(role.strengths, "Сильная сторона роли - соединять личный интерес, структуру действий и понятную пользу для других."),
    risks: safeLongText(role.risks, "Риск роли - слишком долго оставаться в анализе и не проверять гипотезу через маленький рыночный или рабочий эксперимент.")
  })) : [];
}

function uniqueTopRoles(roles: ReportFull["top_roles"], excludedNames: string[] = []) {
  const seen = new Set(excludedNames.map((name) => name.trim().toLocaleLowerCase()).filter(Boolean));
  return roles.filter((role) => {
    const key = role.name.trim().toLocaleLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function completeTopRoles(source: unknown, candidate: UnknownRecord, voiceAnalysis: UnknownRecord, faceAnalysis: UnknownRecord) {
  const roles = normalizeTopRoleCandidates(source, candidate, voiceAnalysis, faceAnalysis);

  const fallbackNames = [
    "Стратег развития",
    "Методолог практики",
    "Консультант по ясности",
    "Навигатор изменений",
    "Автор экспертного продукта"
  ];

  while (roles.length < 5) {
    const index = roles.length;
    roles.push({
      name: fallbackNames[index] ?? `Профессиональная роль ${index + 1}`,
      match: Math.max(55, 78 - index * 5),
      why: safeLongText(candidate.summary, "Роль добавлена как осторожная рабочая гипотеза по анкете и общему профилю."),
      voiceEvidence: String(voiceAnalysis.communication ?? diagnosticFallback("voice", "communication")),
      faceEvidence: String(faceAnalysis.communication ?? diagnosticFallback("face", "communication")),
      strengths: "Сильная сторона роли - переводить наблюдения в понятные действия и проверяемые решения.",
      risks: "Риск роли - распыляться между вариантами, если не выбрать один короткий эксперимент."
    });
  }

  return roles;
}

function normalizeDiagnosticsValue(value: unknown): ReportDiagnostics {
  if (!isRecord(value)) throw new Error("Diagnostic report segment must be a JSON object");
  return reportDiagnosticsSchema.parse(completeFullReportCandidate(value));
}

function normalizeDirectionsValue(value: unknown, diagnostics: ReportDiagnostics): ReportDirections {
  if (!isRecord(value)) throw new Error("Career report segment must be a JSON object");
  const completed = completeFullReportCandidate({ ...diagnostics, ...value });
  if (!isRecord(completed)) throw new Error("Career report segment could not be normalized");
  const roles = uniqueTopRoles(normalizeTopRoleCandidates(
    value.top_roles,
    { ...value, summary: diagnostics.summary },
    diagnostics.voice_analysis,
    diagnostics.face_analysis
  ));

  return reportDirectionsSchema.parse({
    top_roles: roles,
    ikigai_zones: completed.ikigai_zones,
    career_action: completed.career_action,
    final_insight: completed.final_insight
  });
}

export function mergeFullReportParts(
  diagnostics: ReportDiagnostics,
  directions: ReportDirections,
  supplementedRoles: ReportFull["top_roles"] = []
): ReportFull {
  return normalizeFullReportValue({
    ...diagnostics,
    ...directions,
    top_roles: uniqueTopRoles([...directions.top_roles, ...supplementedRoles])
  });
}

export function completeFullReportCandidate(value: unknown) {
  if (!isRecord(value)) return value;
  const summary = safeLongText(value.summary, "Отчёт собран как осторожная рабочая гипотеза на основе анкеты, содержания речи и доступных сигналов подачи.");
  const profession = safeLongText(value.profession, "Профессиональный навигатор", 2);
  const voiceSource = value.voice_analysis ?? value.voiceAnalysis ?? value.voice;
  const faceSource = value.face_analysis ?? value.faceAnalysis ?? value.face;
  const voiceAnalysis = completeDiagnosticMap(voiceSource, voiceAnalysisKeys, "voice");
  const faceAnalysis = completeDiagnosticMap(faceSource, faceAnalysisKeys, "face");

  return {
    ...value,
    profession,
    summary,
    ikigai_scores: {
      love: numberValue(isRecord(value.ikigai_scores) ? value.ikigai_scores : {}, "love", 70),
      good_at: numberValue(isRecord(value.ikigai_scores) ? value.ikigai_scores : {}, "good_at", 68),
      paid_for: numberValue(isRecord(value.ikigai_scores) ? value.ikigai_scores : {}, "paid_for", 64),
      world_needs: numberValue(isRecord(value.ikigai_scores) ? value.ikigai_scores : {}, "world_needs", 66)
    },
    voice_analysis: voiceAnalysis,
    face_analysis: faceAnalysis,
    top_roles: completeTopRoles(value.top_roles, value, voiceAnalysis, faceAnalysis),
    ikigai_zones: completeIkigaiZones(value.ikigai_zones, summary),
    career_action: safeLongText(value.career_action, "Неделя 1. Цель: выбрать одну профессиональную гипотезу из отчёта. Действия: описать ожидаемый результат, провести две короткие беседы с людьми из этой сферы и определить критерий успеха. Результат недели: карточка гипотезы с тремя фактами за и против. Проверка: две беседы проведены и один критерий записан. Неделя 2. Цель: проверить роль на практике. Действия: выполнить небольшой рабочий кейс, ограничить его срок тремя днями и показать результат одному потенциальному пользователю или коллеге. Результат недели: готовый мини-проект. Проверка: получена хотя бы одна конкретная реакция. Неделя 3. Цель: улучшить формат по обратной связи. Действия: собрать ещё три комментария, выделить повторяющийся запрос и внести одно заметное изменение. Результат недели: вторая версия мини-проекта. Проверка: зафиксированы три комментария и одно изменение. Неделя 4. Цель: принять решение о следующем шаге. Действия: сравнить энергию, интерес и рыночный отклик, выбрать продолжение или новую гипотезу и поставить задачу на следующие 30 дней. Результат недели: короткое решение с аргументами. Проверка: выбран один следующий шаг, срок и измеримый результат."),
    final_insight: safeLongText(value.final_insight, "Комплексный AI-анализ показывает рабочую гипотезу о направлении развития: сильнее всего сейчас стоит проверять связку личного интереса, ясной коммуникации и маленьких практических экспериментов. Используйте вывод как карту для следующих действий, а не как окончательный ярлык.")
  };
}

export function normalizeFullReportValue(value: unknown): ReportFull {
  const report = reportFullSchema.parse(completeFullReportCandidate(value));
  const seenRoleNames = new Set<string>();
  const sortedRoles = [...report.top_roles]
    .sort((left, right) => right.match - left.match)
    .filter((role) => {
      const key = role.name.trim().toLocaleLowerCase();
      if (!key || seenRoleNames.has(key)) return false;
      seenRoleNames.add(key);
      return true;
    })
    .slice(0, 5);
  const fallbackNames = [
    "Стратег развития",
    "Методолог практики",
    "Консультант по ясности",
    "Навигатор изменений",
    "Автор экспертного продукта"
  ];
  const sourceRole = sortedRoles[0] ?? {
    name: report.profession,
    match: 72,
    why: report.summary,
    voiceEvidence: report.voice_analysis.communication,
    faceEvidence: report.face_analysis.communication,
    strengths: report.summary,
    risks: "Главный риск — слишком долго оставаться в анализе вместо проверки роли на практике."
  };

  while (sortedRoles.length < 5) {
    const index = sortedRoles.length;
    const fallbackName = fallbackNames.find((name) => !seenRoleNames.has(name.toLocaleLowerCase()))
      ?? `${sourceRole.name}: прикладной формат ${index + 1}`;
    seenRoleNames.add(fallbackName.toLocaleLowerCase());
    sortedRoles.push({
      name: fallbackName,
      match: Math.max(55, Math.min(95, sourceRole.match - (index + 1) * 4)),
      why: `Дополнительное направление из общего профиля: ${report.summary}`,
      voiceEvidence: `Голосовой сигнал и содержание речи поддерживают это направление как рабочую гипотезу: ${sourceRole.voiceEvidence}`,
      faceEvidence: `Визуальный сигнал используется только как слабое подтверждение презентационного стиля: ${sourceRole.faceEvidence}`,
      strengths: sourceRole.strengths,
      risks: sourceRole.risks
    });
  }

  return {
    ...report,
    top_roles: sortedRoles
  };
}

function extractClientVoiceDuration(answers: ReportContext["answers"]) {
  const maybeMetrics = answers as ReportContext["answers"] & { clientMetrics?: { voiceDurationSeconds?: unknown } };
  const duration = Number(maybeMetrics.clientMetrics?.voiceDurationSeconds);
  return Number.isFinite(duration) && duration > 0 ? duration : null;
}

async function buildCompletionInput(
  context: ReportContext,
  tier: ReportTier,
  transcript: string | null,
  voiceMetrics: VoiceSignalMetrics | null,
  photoInput: string | null,
  segmentInstruction?: string
) {
  const prompts = await buildReportPromptMessages(context, tier, transcript, voiceMetrics, Boolean(photoInput));
  const userContent: ChatCompletionContentPart[] = [
    { type: "text", text: prompts.userPrompt }
  ];
  if (segmentInstruction) {
    userContent.push({ type: "text", text: segmentInstruction });
  }
  if (photoInput) {
    userContent.push({
      type: "image_url",
      image_url: { url: photoInput }
    });
  }
  return {
    userContent,
    systemPrompt: prompts.systemPrompt,
    analysisId: context.analysisId,
    tier,
    promptVersion: prompts.promptVersion
  };
}

function isImageInputError(body: string) {
  return /image_parse_error|unsupported image|invalid image|invalid_image|provider_unavailable|provider request failed|400 status code \(no body\)|status code 400|timed out|gateway time-out|gateway timeout|status code 504|504 /i.test(body);
}

function getReportMaxTokens(tier: ReportTier) {
  const tierBudget = tier === "FREE" ? 3000 : 8000;
  return Math.min(env.OPENAI_MAX_OUTPUT_TOKENS, tierBudget);
}

function getRepairMaxTokens() {
  return Math.min(env.OPENAI_MAX_OUTPUT_TOKENS, 5000);
}

type ReportCompletionRequest<TReport> = {
  context: ReportContext;
  tier: ReportTier;
  transcript: string | null;
  voiceMetrics: VoiceSignalMetrics | null;
  photoInput: string | null;
  part: string;
  schemaName: string;
  jsonSchema: Record<string, unknown>;
  useAsync: boolean;
  maxTokens?: number;
  segmentInstruction?: string;
  parseReport: (content: string) => TReport;
};

function supportsNativeJsonSchemaResponseFormat() {
  return env.OPENAI_BASE_URL.includes("api.openai.com");
}

function supportsCompatibleAsyncCompletions() {
  return !supportsNativeJsonSchemaResponseFormat();
}

function buildResponseFormat(schemaName: string, jsonSchema: Record<string, unknown>): ResponseFormat | null {
  if (!supportsNativeJsonSchemaResponseFormat()) {
    return null;
  }

  return {
    type: "json_schema",
    json_schema: {
      name: schemaName,
      strict: true,
      schema: jsonSchema
    }
  };
}

function isResponseFormatUnsupportedError(message: string) {
  return /response_format|json_schema|json_object|unsupported.*format|invalid.*parameter|unknown field|extra field/i.test(message);
}

async function withOpenAiDeadline<T>(callback: (signal: AbortSignal) => Promise<T>, operation = "OpenAI-compatible chat completion") {
  const controller = new AbortController();
  let timeout: NodeJS.Timeout | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(new Error(`${operation} timed out after ${env.OPENAI_REQUEST_TIMEOUT_MS}ms`));
    }, env.OPENAI_REQUEST_TIMEOUT_MS);
  });

  try {
    return await Promise.race([callback(controller.signal), timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function createChatCompletionWithJsonMode(
  openai: OpenAiClient,
  params: CompatibleChatCompletionParams,
  responseFormat: ResponseFormat | null
) {
  if (!responseFormat) {
    return withOpenAiDeadline((signal) => openai.chat.completions.create(params, {
      timeout: env.OPENAI_REQUEST_TIMEOUT_MS,
      signal
    }));
  }

  try {
    return await withOpenAiDeadline((signal) => openai.chat.completions.create({
        ...params,
        response_format: responseFormat
      }, {
        timeout: env.OPENAI_REQUEST_TIMEOUT_MS,
        signal
      })
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!isResponseFormatUnsupportedError(message)) throw error;
    return withOpenAiDeadline((signal) => openai.chat.completions.create(params, {
      timeout: env.OPENAI_REQUEST_TIMEOUT_MS,
      signal
    }));
  }
}

function withCompatibleGenerationControls(params: ChatCompletionParams): CompatibleChatCompletionParams {
  const normalizedParams = {
    ...params,
    messages: normalizeCompatibleChatMessages(params.messages) as ChatCompletionMessageParam[]
  };
  if (supportsNativeJsonSchemaResponseFormat()) return normalizedParams;
  return {
    ...normalizedParams,
    thinking: { type: "disabled" }
  };
}

function buildAsyncIdempotencyKey(
  input: Awaited<ReturnType<typeof buildCompletionInput>>,
  schemaName: string,
  photoInputUsed: boolean,
  params: CompatibleChatCompletionParams
) {
  return [
    "report",
    input.analysisId,
    schemaName,
    `v${input.promptVersion}`,
    photoInputUsed ? "photo" : "no-photo",
    stableRequestFingerprint(params)
  ].join("-");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getAsyncJobId(job: AsyncCompletionJob) {
  const jobId = job.job_id ?? job.jobId ?? job.id;
  return typeof jobId === "string" && jobId ? jobId : null;
}

function formatAsyncError(error: unknown) {
  if (!error) return "unknown async completion error";
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

async function fetchAsyncCompletionJson(path: string, init: RequestInit = {}) {
  const apiKey = getOpenAiApiKey();
  if (!apiKey) throw new Error("OpenAI-compatible client is not configured");
  const response = await withOpenAiDeadline((signal) => fetch(`${env.OPENAI_BASE_URL.replace(/\/$/, "")}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...(init.headers ?? {})
      },
      signal
    }),
    "OpenAI-compatible async completion request"
  );
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`OpenAI-compatible async completion failed with ${response.status}: ${text.slice(0, 500)}`);
  }
  return text ? parseGatewayJson<AsyncCompletionJob>(text, "OpenAI-compatible async completion response") : {};
}

async function createAsyncChatCompletion(
  params: CompatibleChatCompletionParams,
  responseFormat: ResponseFormat | null,
  idempotencyKey: string
) {
  const body = responseFormat ? { ...params, response_format: responseFormat } : params;
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await createAsyncChatCompletionAttempt(
        body,
        attempt === 1 ? idempotencyKey : `${idempotencyKey}-retry-${attempt}`,
        attempt
      );
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (isAsyncCompletionPollingTimeoutError(message)) {
        throw error;
      }
      if (isTerminalAsyncProviderError(message)) {
        throw error;
      }
      if (attempt >= 3 || !isRetryableAsyncCompletionError(message)) {
        throw error;
      }
      await sleep(env.OPENAI_ASYNC_POLL_INTERVAL_MS);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError ?? "unknown async completion error"));
}

async function createAsyncChatCompletionAttempt(
  body: CompatibleChatCompletionParams | ChatCompletionCreateParamsNonStreaming,
  idempotencyKey: string,
  attempt: number
) {
  const created = await fetchAsyncCompletionJson("/chat/completions/async", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey
    },
    body: JSON.stringify(body)
  });
  const jobId = getAsyncJobId(created);
  if (!jobId) throw new Error(`OpenAI-compatible async completion attempt ${attempt} did not return a job id: ${JSON.stringify(created).slice(0, 500)}`);

  const startedAt = Date.now();
  while (Date.now() - startedAt <= env.OPENAI_ASYNC_TIMEOUT_MS) {
    const job = await fetchAsyncCompletionJson(`/chat/completions/async/${encodeURIComponent(jobId)}`);
    if (job.status === "succeeded") {
      if (!job.response) throw new Error(`OpenAI-compatible async completion ${jobId} succeeded without response`);
      return job.response;
    }
    if (job.status === "failed" || job.status === "cancelled") {
      throw new Error(`OpenAI-compatible async completion ${jobId} attempt ${attempt} ${job.status}: ${formatAsyncError(job.error)}`);
    }
    await sleep(env.OPENAI_ASYNC_POLL_INTERVAL_MS);
  }

  throw new Error(`OpenAI-compatible async completion ${jobId} attempt ${attempt} timed out after ${env.OPENAI_ASYNC_TIMEOUT_MS}ms`);
}

function buildJsonContract(schemaName: string, jsonSchema: Record<string, unknown>) {
  return [
    "",
    "REPORT OUTPUT CONTRACT:",
    `For this report-generation request, return ONLY one raw JSON object for schema "${schemaName}".`,
    "Do not include markdown fences, XML, comments, prose, explanations, or <think> blocks.",
    "The first character of the response must be { and the last character must be }.",
    "The JSON object must satisfy this JSON Schema:",
    JSON.stringify(jsonSchema)
  ].join("\n");
}

function buildJsonSystemRule() {
  return [
    "",
    "REPORT OUTPUT RULE:",
    "For report-generation requests, return only the requested raw JSON object. Do not include markdown, XML, comments, explanations, or hidden reasoning."
  ].join("\n");
}

async function requestReportJsonRepair(
  openai: OpenAiClient,
  schemaName: string,
  jsonSchema: Record<string, unknown>,
  invalidContent: string,
  validationError: string,
  responseFormat: ResponseFormat | null
) {
  const repairMessages: ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: [
        "You repair report-generation JSON.",
        "Return only one raw JSON object.",
        "Do not include markdown, comments, explanations, or hidden reasoning.",
        "Preserve the user's report meaning where possible, but fix syntax and fill missing required fields so the object satisfies the schema."
      ].join("\n")
    },
    {
      role: "user",
      content: [
        `Schema name: ${schemaName}`,
        "JSON Schema:",
        JSON.stringify(jsonSchema),
        "Validation or parse error:",
        validationError,
        "Invalid report content:",
        invalidContent
      ].join("\n\n")
    }
  ];

  const response = await createChatCompletionWithJsonMode(
    openai,
    withCompatibleGenerationControls({
      model: env.OPENAI_MODEL,
      temperature: 0,
      max_tokens: getRepairMaxTokens(),
      messages: repairMessages
    }),
    responseFormat
  );

  const message = response.choices?.[0]?.message;
  if (message?.refusal) throw new Error(`OpenAI-compatible gateway refused JSON repair: ${message.refusal}`);
  if (!message?.content) throw new Error("OpenAI-compatible gateway returned an empty JSON repair");
  return message.content;
}

async function createReportCompletion<TReport>(request: ReportCompletionRequest<TReport>): Promise<CompletionResult<TReport>> {
  const input = await buildCompletionInput(
    request.context,
    request.tier,
    request.transcript,
    request.voiceMetrics,
    request.photoInput,
    request.segmentInstruction
  );
  try {
    return await requestReportCompletion(
      input,
      Boolean(request.photoInput),
      request.part,
      request.schemaName,
      request.jsonSchema,
      request.useAsync,
      request.maxTokens,
      request.parseReport
    );
  } catch (error) {
    if (!request.photoInput || !(error instanceof Error) || !isImageInputError(error.message)) {
      throw error;
    }

    return requestReportCompletion(
      await buildCompletionInput(
        request.context,
        request.tier,
        request.transcript,
        request.voiceMetrics,
        null,
        request.segmentInstruction
      ),
      false,
      request.part,
      request.schemaName,
      request.jsonSchema,
      request.useAsync,
      request.maxTokens,
      request.parseReport
    );
  }
}

async function requestReportCompletion<TReport>(
  input: Awaited<ReturnType<typeof buildCompletionInput>>,
  photoInputUsed: boolean,
  part: string,
  schemaName: string,
  jsonSchema: Record<string, unknown>,
  useAsync: boolean,
  maxTokens: number | undefined,
  parseReport: (content: string) => TReport
): Promise<CompletionResult<TReport>> {
  const openai = getOpenAiClient();
  if (!openai) throw new Error("OpenAI-compatible client is not configured");
  const startedAt = Date.now();

  const messages: ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: `${input.systemPrompt}${buildJsonSystemRule()}`
    },
    {
      role: "user",
      content: [
        ...input.userContent,
        { type: "text", text: buildJsonContract(schemaName, jsonSchema) }
      ]
    }
  ];

  try {
    const responseFormat = buildResponseFormat(schemaName, jsonSchema);

    const params = withCompatibleGenerationControls({
      model: env.OPENAI_MODEL,
      temperature: 0.25,
      max_tokens: Math.min(env.OPENAI_MAX_OUTPUT_TOKENS, maxTokens ?? getReportMaxTokens(input.tier)),
      messages
    } satisfies ChatCompletionParams);
    const response = useAsync
      ? await createChatCompletionWithAsyncFallback(openai, params, responseFormat, buildAsyncIdempotencyKey(input, schemaName, photoInputUsed, params))
      : await createChatCompletionWithJsonMode(openai, params, responseFormat);

    const message = response.choices?.[0]?.message;
    if (message?.refusal) throw new Error(`OpenAI-compatible gateway refused report generation: ${message.refusal}`);
    if (!message?.content) throw new Error("OpenAI-compatible gateway returned an empty report");
    const parsed = await parseReportWithRepair(
      openai,
      schemaName,
      jsonSchema,
      message.content,
      responseFormat,
      parseReport
    );

    return {
      report: parsed.report,
      photoInputUsed,
      promptVersion: input.promptVersion,
      telemetry: {
        part,
        requestedTransport: useAsync ? "async" : "sync",
        durationMs: Date.now() - startedAt,
        finishReason: response.choices?.[0]?.finish_reason ? String(response.choices[0].finish_reason) : null,
        outputCharacters: message.content.length,
        completionTokens: response.usage?.completion_tokens ?? null,
        totalTokens: response.usage?.total_tokens ?? null,
        repairAttempts: parsed.repairAttempts
      }
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`OpenAI-compatible report generation failed: ${message.slice(0, 240)}`);
  }
}

async function parseReportWithRepair<TReport>(
  openai: OpenAiClient,
  schemaName: string,
  jsonSchema: Record<string, unknown>,
  content: string,
  responseFormat: ResponseFormat | null,
  parseReport: (content: string) => TReport
) {
  let candidate = content;
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return {
        report: parseReport(candidate),
        repairAttempts: attempt
      };
    } catch (error) {
      lastError = error;
      if (attempt >= 2) break;
      candidate = await requestReportJsonRepair(
        openai,
        schemaName,
        jsonSchema,
        candidate,
        error instanceof Error ? error.message : String(error),
        responseFormat
      );
    }
  }

  const message = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`OpenAI-compatible gateway returned invalid report JSON after repair: ${message}`);
}

async function createChatCompletionWithAsyncFallback(
  openai: OpenAiClient,
  params: CompatibleChatCompletionParams,
  responseFormat: ResponseFormat | null,
  idempotencyKey: string
) {
  try {
    return await createAsyncChatCompletion(params, responseFormat, idempotencyKey);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!isRetryableAsyncCompletionError(message)) throw error;
    if (!shouldFallbackToSyncCompletionAfterAsyncError(message)) throw error;
    return createChatCompletionWithJsonMode(openai, params, responseFormat);
  }
}
