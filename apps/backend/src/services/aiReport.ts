import type { IkigaiAnswers, ReportFree, ReportFull, ReportTier } from "@levelup/contracts";
import type { MediaAsset } from "@prisma/client";
import type {
  ChatCompletion,
  ChatCompletionContentPart,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionMessageParam
} from "openai/resources/chat/completions";
import { basename } from "node:path";
import { z } from "zod";
import { env } from "../env.js";
import { getMediaAssetPublicUrl, readMediaAssetBuffer } from "./media.js";
import { buildReportPromptMessages } from "./reportPrompts.js";
import { analyzeAudioMetrics, type AudioTranscription, type VoiceSignalMetrics } from "./audioMetrics.js";
import { parseCompletionJson, parseGatewayJson } from "./completionJson.js";
import { getOpenAiApiKey, getOpenAiClient, hasOpenAiClient } from "./openaiClient.js";

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
  value.includes("Ваш результат:") && value.includes("Что это значит:") && value.includes("Рекомендация:")
), "diagnostic parameters must use the required result/meaning/recommendation format");

const ikigaiZoneSchema = z.object({
  title: z.string().min(2),
  insight: z.string().min(20),
  recommendation: z.string().min(20)
});

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
  })),
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

function isLikelyAudio(buffer: Buffer) {
  if (buffer.length < 4) return false;
  const isWebm = buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3;
  const isMp3 = buffer.subarray(0, 3).toString("latin1") === "ID3" || (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0);
  const isWav = buffer.subarray(0, 4).toString("latin1") === "RIFF";
  const isOgg = buffer.subarray(0, 4).toString("latin1") === "OggS";
  const isMp4 = buffer.length >= 12 && buffer.subarray(4, 8).toString("latin1") === "ftyp";
  return isWebm || isMp3 || isWav || isOgg || isMp4;
}

function getAsset(assets: MediaAsset[], type: "AUDIO" | "PHOTO") {
  return assets.find((asset) => asset.type === type && (asset.status === "UPLOADED" || asset.status === "VERIFIED")) ?? null;
}

async function transcribeAudio(asset: MediaAsset | null) {
  const apiKey = getOpenAiApiKey();
  if (!asset || !apiKey) return null;
  const buffer = await readMediaAssetBuffer(asset.key);
  if (!buffer) return null;
  if (!isLikelyAudio(buffer)) return null;

  const formData = new FormData();
  formData.set("model", env.OPENAI_TRANSCRIPTION_MODEL);
  formData.set("response_format", "verbose_json");
  formData.set("file", new Blob([buffer], { type: asset.mimeType || "application/octet-stream" }), basename(asset.key));

  const response = await withOpenAiDeadline((signal) => fetch(`${env.OPENAI_BASE_URL.replace(/\/$/, "")}/audio/transcriptions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`
      },
      body: formData,
      signal
    }),
    "OpenAI-compatible transcription"
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI transcription failed with ${response.status}: ${body.slice(0, 240)}`);
  }

  const data = await response.json() as {
    text?: string;
    duration?: number;
    segments?: Array<{ start?: number; end?: number; text?: string }>;
  };
  const text = data.text?.trim();
  if (!text) return null;
  return {
    text,
    durationSeconds: data.duration,
    segments: Array.isArray(data.segments) ? data.segments : []
  } satisfies AudioTranscription;
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
    transcription = await transcribeAudio(audioAsset);
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
  const freeCompletion = await createReportCompletion({
    context,
    tier: "FREE",
    transcript,
    voiceMetrics,
    photoInput,
    schemaName: "ikigai_free_report",
    jsonSchema: reportFreeJsonSchema,
    useAsync: useCompatibleAsync,
    parseReport: (content) => reportFreeSchema.parse(parseCompletionJson(content))
  });
  const fullCompletion = await createReportCompletion({
    context,
    tier: "FULL",
    transcript,
    voiceMetrics,
    photoInput,
    schemaName: "ikigai_full_report",
    jsonSchema: reportFullJsonSchema,
    useAsync: useCompatibleAsync,
    parseReport: (content) => reportFullSchema.parse(parseCompletionJson(content))
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
      audioMetrics: Boolean(voiceMetrics),
      photoInput: freeCompletion.photoInputUsed || fullCompletion.photoInputUsed
    }
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
  if (supportsNativeJsonSchemaResponseFormat()) return params;
  return {
    ...params,
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

function isRetryableAsyncCompletionError(message: string) {
  return /provider_unavailable|temporar|overload|rate.?limit|gateway|invalid json|expected .* after property value|unterminated string|bad control character|timed? ?out|timeout|502|503|504/i.test(message);
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
      max_tokens: env.OPENAI_MAX_OUTPUT_TOKENS,
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
      max_tokens: env.OPENAI_MAX_OUTPUT_TOKENS,
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
    return createChatCompletionWithJsonMode(openai, params, responseFormat);
  }
}
