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
  shouldFallbackToSyncCompletionAfterAsyncError
} from "./aiReportRouting.js";

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
    audioMetrics: boolean;
    photoInput: boolean;
  };
};

type CompletionResult<TReport> = {
  report: TReport;
  photoInputUsed: boolean;
  promptVersion: number;
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

export const reportFullSchema = z.object({
  profession: z.string().min(2),
  summary: z.string().min(20),
  ikigai_scores: scoreSchema,
  voice_analysis: z.object({
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
  }),
  face_analysis: z.object({
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
  }),
  top_roles: z.array(z.object({
    name: z.string(),
    match: z.number().int().min(0).max(100),
    why: z.string(),
    voiceEvidence: z.string(),
    faceEvidence: z.string(),
    strengths: z.string(),
    risks: z.string()
  })).min(3).max(5),
  ikigai_zones: z.object({
    passion: ikigaiZoneSchema,
    mission: ikigaiZoneSchema,
    profession: ikigaiZoneSchema,
    vocation: ikigaiZoneSchema,
    ikigai: ikigaiZoneSchema
  }),
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

export async function generateOpenAiReport(context: ReportContext): Promise<GeneratedReport | null> {
  if (!hasOpenAiClient()) return null;

  const audioAsset = getAsset(context.mediaAssets, "AUDIO");
  const photoAsset = getAsset(context.mediaAssets, "PHOTO");

  let transcription: AudioTranscription | null = null;
  try {
    transcription = await transcribeAudioAsset(audioAsset);
  } catch {
    transcription = null;
  }

  const clientDurationSeconds = extractClientVoiceDuration(context.answers);
  let voiceMetrics: VoiceSignalMetrics | null = null;
  try {
    voiceMetrics = await buildVoiceMetrics(audioAsset, transcription, clientDurationSeconds);
  } catch {
    voiceMetrics = null;
  }

  const transcript = transcription?.text ?? null;
  const photoInput = await buildPhotoInput(photoAsset);
  const useCompatibleAsync = env.OPENAI_ASYNC_REPORTS_ENABLED && supportsCompatibleAsyncCompletions();
  const [freeCompletion, fullCompletion] = await Promise.all([
    createReportCompletion({
      context,
      tier: "FREE",
      transcript,
      voiceMetrics,
      photoInput,
      schemaName: "ikigai_free_report",
      jsonSchema: reportFreeJsonSchema,
      useAsync: useCompatibleAsync,
      parseReport: (content) => reportFreeSchema.parse(parseCompletionJson(content))
    }),
    createReportCompletion({
      context,
      tier: "FULL",
      transcript,
      voiceMetrics,
      photoInput,
      schemaName: "ikigai_full_report",
      jsonSchema: reportFullJsonSchema,
      useAsync: useCompatibleAsync,
      parseReport: (content) => normalizeFullReportValue(parseCompletionJson(content))
    })
  ]);
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
      audioMetrics: Boolean(voiceMetrics),
      photoInput: freeCompletion.photoInputUsed || fullCompletion.photoInputUsed
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

function completeTopRoles(source: unknown, candidate: UnknownRecord, voiceAnalysis: UnknownRecord, faceAnalysis: UnknownRecord) {
  const roles = Array.isArray(source) ? source.filter(isRecord).slice(0, 5).map((role, index) => ({
    name: stringValue(role, "name", "role") ?? `Профессиональная роль ${index + 1}`,
    match: numberValue(role, "match", Math.max(55, 82 - index * 5)),
    why: safeLongText(role.why, safeLongText(candidate.summary, "Роль подходит как рабочая гипотеза по анкете и общему профилю пользователя.")),
    voiceEvidence: safeLongText(stringValue(role, "voiceEvidence", "voice_evidence"), String(voiceAnalysis.communication ?? diagnosticFallback("voice", "communication"))),
    faceEvidence: safeLongText(stringValue(role, "faceEvidence", "face_evidence"), String(faceAnalysis.communication ?? diagnosticFallback("face", "communication"))),
    strengths: safeLongText(role.strengths, "Сильная сторона роли - соединять личный интерес, структуру действий и понятную пользу для других."),
    risks: safeLongText(role.risks, "Риск роли - слишком долго оставаться в анализе и не проверять гипотезу через маленький рыночный или рабочий эксперимент.")
  })) : [];

  while (roles.length < 3) {
    const index = roles.length;
    roles.push({
      name: ["Стратег развития", "Методолог практики", "Навигатор изменений"][index] ?? `Профессиональная роль ${index + 1}`,
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
    career_action: safeLongText(value.career_action, "Week 1: выбрать один рабочий эксперимент. Week 2: собрать первую обратную связь. Week 3: улучшить формат и повторить проверку. Week 4: зафиксировать выводы и выбрать следующий шаг."),
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
  photoInput: string | null
) {
  const prompts = await buildReportPromptMessages(context, tier, transcript, voiceMetrics, Boolean(photoInput));
  const userContent: ChatCompletionContentPart[] = [
    { type: "text", text: prompts.userPrompt }
  ];
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
  const tierBudget = tier === "FREE" ? 2500 : 5500;
  return Math.min(env.OPENAI_MAX_OUTPUT_TOKENS, tierBudget);
}

function getRepairMaxTokens() {
  return Math.min(env.OPENAI_MAX_OUTPUT_TOKENS, 3500);
}

type ReportCompletionRequest<TReport> = {
  context: ReportContext;
  tier: ReportTier;
  transcript: string | null;
  voiceMetrics: VoiceSignalMetrics | null;
  photoInput: string | null;
  schemaName: string;
  jsonSchema: Record<string, unknown>;
  useAsync: boolean;
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

function buildAsyncIdempotencyKey(input: Awaited<ReturnType<typeof buildCompletionInput>>, schemaName: string, photoInputUsed: boolean) {
  return [
    "report",
    input.analysisId,
    schemaName,
    `v${input.promptVersion}`,
    photoInputUsed ? "photo" : "no-photo"
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
  const input = await buildCompletionInput(request.context, request.tier, request.transcript, request.voiceMetrics, request.photoInput);
  try {
    return await requestReportCompletion(
      input,
      Boolean(request.photoInput),
      request.schemaName,
      request.jsonSchema,
      request.useAsync,
      request.parseReport
    );
  } catch (error) {
    if (!request.photoInput || !(error instanceof Error) || !isImageInputError(error.message)) {
      throw error;
    }

    return requestReportCompletion(
      await buildCompletionInput(request.context, request.tier, request.transcript, request.voiceMetrics, null),
      false,
      request.schemaName,
      request.jsonSchema,
      request.useAsync,
      request.parseReport
    );
  }
}

async function requestReportCompletion<TReport>(
  input: Awaited<ReturnType<typeof buildCompletionInput>>,
  photoInputUsed: boolean,
  schemaName: string,
  jsonSchema: Record<string, unknown>,
  useAsync: boolean,
  parseReport: (content: string) => TReport
): Promise<CompletionResult<TReport>> {
  const openai = getOpenAiClient();
  if (!openai) throw new Error("OpenAI-compatible client is not configured");

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
      max_tokens: getReportMaxTokens(input.tier),
      messages
    } satisfies ChatCompletionParams);
    const response = useAsync
      ? await createChatCompletionWithAsyncFallback(openai, params, responseFormat, buildAsyncIdempotencyKey(input, schemaName, photoInputUsed))
      : await createChatCompletionWithJsonMode(openai, params, responseFormat);

    const message = response.choices?.[0]?.message;
    if (message?.refusal) throw new Error(`OpenAI-compatible gateway refused report generation: ${message.refusal}`);
    if (!message?.content) throw new Error("OpenAI-compatible gateway returned an empty report");

    return {
      report: await parseReportWithRepair(
        openai,
        schemaName,
        jsonSchema,
        message.content,
        responseFormat,
        parseReport
      ),
      photoInputUsed,
      promptVersion: input.promptVersion
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
      return parseReport(candidate);
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
