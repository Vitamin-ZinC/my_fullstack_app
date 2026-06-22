import type { IkigaiAnswers, PromptStatus, ReportTier } from "@levelup/contracts";
import { prisma } from "../lib/prisma.js";

export const REPORT_FREE_SYSTEM_PROMPT_KEY = "ikigai.report.free.system";
export const REPORT_FREE_USER_PROMPT_KEY = "ikigai.report.free.user";
export const REPORT_FULL_SYSTEM_PROMPT_KEY = "ikigai.report.full.system";
export const REPORT_FULL_USER_PROMPT_KEY = "ikigai.report.full.user";

type PromptDraft = {
  key: string;
  locale: string;
  version: number;
  status: PromptStatus;
  title: string;
  content: string;
};

type ReportPromptContext = {
  analysisId: string;
  locale: string;
  answers: IkigaiAnswers;
};

type ResolvedPrompt = PromptDraft & {
  source: "database" | "default";
};

export const defaultReportPromptTemplates: PromptDraft[] = [
  {
    key: REPORT_FREE_SYSTEM_PROMPT_KEY,
    locale: "ru",
    version: 3,
    status: "ACTIVE",
    title: "ORKEN.LIFE FREE report system prompt",
    content: [
      "You are a careful ORKEN.LIFE free-report writer.",
      "Create engaging career and ikigai guidance as valid JSON for a first, free result.",
      "Do not identify the person, infer sensitive attributes, diagnose health, or claim deterministic traits from appearance or voice.",
      "Use media observations only as weak presentation signals and express them as hypotheses, not facts.",
      "The free report must feel useful by itself: one clear professional vector, one evidence-based insight, and one practical next step.",
      "It must also explain what deeper information is available in the paid report without revealing the full premium analysis."
    ].join("\n")
  },
  {
    key: REPORT_FREE_USER_PROMPT_KEY,
    locale: "ru",
    version: 3,
    status: "ACTIVE",
    title: "ORKEN.LIFE FREE report user prompt",
    content: [
      "Output language: {{language}}.",
      "Create a FREE ORKEN.LIFE ikigai report. It must be concrete, motivating, and safe.",
      "Give the user a current professional role/profession, a useful short summary, one strong key_insight, and four ikigai_scores.",
      "Make the free result engaging but incomplete: show what already looks promising, name the current professional vector, give 2 to 3 evidence reasons, and add one practical next step for the next 24 hours.",
      "Use the questionnaire as primary evidence. Treat voice transcript and image, when present, as weak presentation signals only.",
      "Do not reveal the full paid analysis. Instead, write paid_report_teaser and paid_report_preview so the user clearly understands what extra information the paid report contains and why it matters.",
      "paid_report_preview must list 4 to 6 specific paid sections: expanded voice profile, face/micromimic observations, personalized Ikigai zones, role-fit percentages, career risks, 30-day action route, and final synthesis.",
      "Every visible value must be in Russian when Output language is Russian. Avoid English labels and generic filler.",
      "Do not use placeholders, one-word trait labels, or values such as unavailable, N/A, low, medium, high.",
      "Return exactly the requested JSON shape.",
      "",
      "Analysis ID: {{analysisId}}",
      "Questionnaire JSON: {{questionnaireJson}}",
      "Voice transcript: {{voiceTranscript}}",
      "Photo input included: {{photoIncluded}}"
    ].join("\n")
  },
  {
    key: REPORT_FULL_SYSTEM_PROMPT_KEY,
    locale: "ru",
    version: 3,
    status: "ACTIVE",
    title: "ORKEN.LIFE PREMIUM report system prompt",
    content: [
      "You are a careful ORKEN.LIFE premium-report writer.",
      "Generate useful, non-medical, non-deterministic career guidance as valid JSON.",
      "Use high-level observation lenses inspired by practical characterology, profiling, nonverbal communication, micro-expression research, and deception-research literature without quoting, copying, or imitating protected text.",
      "Relevant lenses may include Viktor Ponomarenko's 7-radicals framing, Alexey Filatov's profiling approach, Aldert Vrij's caution around deception cues, Paul Ekman and Wallace Friesen's facial-action work, and Joe Navarro's nonverbal observation practice.",
      "Do not identify the person, infer sensitive attributes, diagnose health, claim deterministic traits from appearance or voice, or state that someone is lying or deceptive.",
      "Write as a senior career diagnostician: specific, practical, nuanced, and safe.",
      "Every diagnostic parameter must be an interpretive answer about work behavior, not a raw label, score, or translation of the parameter name."
    ].join("\n")
  },
  {
    key: REPORT_FULL_USER_PROMPT_KEY,
    locale: "ru",
    version: 3,
    status: "ACTIVE",
    title: "ORKEN.LIFE PREMIUM report user prompt",
    content: [
      "Output language: {{language}}.",
      "Create a detailed paid ORKEN.LIFE ikigai/career report.",
      "Use the questionnaire as primary evidence. Treat voice transcript and image, when present, as weak presentation signals only.",
      "If media evidence is unavailable or weak, still write useful sections, but ground them in the questionnaire and clearly phrase media parts as limited hypotheses.",
      "Return a practical premium report with detailed voice_analysis, face_analysis, 3 to 5 top_roles, personalized ikigai_zones, career_action, and final_insight.",
      "Sections 2 through 8 must be personalized. Do not output placeholders, one-word labels, English trait words, raw scores, or 'unavailable' as a value.",
      "Each voice_analysis and face_analysis value must be a Russian short paragraph of 2 to 4 sentences with this logic: observed or available signal -> work meaning -> where it helps -> possible risk -> small growth action.",
      "Use cautious formulations: 'похоже', 'может указывать', 'в рабочем контексте это проявляется как'. Never present face or voice as proof of character, health, deception, or identity.",
      "For ikigai_zones, write personalized answers for passion, mission, profession, vocation, and ikigai. Each zone must have title, insight, and recommendation. These texts are shown when the user selects a zone, so they must be useful without extra context.",
      "Top roles must include role-specific why, voiceEvidence, faceEvidence, strengths, and risks. Match percentages must be realistic and internally consistent with ikigai_scores.",
      "career_action must be a 30-day implementation route with Week 1, Week 2, Week 3, and Week 4 steps. final_insight must synthesize questionnaire, voice, face, and ikigai into one practical conclusion.",
      "Keep every field specific, useful, and safe. Avoid generic coaching filler.",
      "Every visible value must be in Russian when Output language is Russian.",
      "Before returning JSON, check that every voice_analysis and face_analysis value is a real diagnostic answer, not just a translation or value of the parameter name.",
      "Return exactly the requested JSON shape.",
      "",
      "Analysis ID: {{analysisId}}",
      "Questionnaire JSON: {{questionnaireJson}}",
      "Voice transcript: {{voiceTranscript}}",
      "Photo input included: {{photoIncluded}}"
    ].join("\n")
  }
];

export function renderPromptTemplate(template: string, variables: Record<string, string>) {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key: string) => (
    Object.prototype.hasOwnProperty.call(variables, key) ? variables[key] : match
  ));
}

function normalizeReportLocale(locale: string) {
  return locale.startsWith("en") ? "en" : "ru";
}

function promptKeysForTier(tier: ReportTier) {
  return tier === "FREE"
    ? { systemKey: REPORT_FREE_SYSTEM_PROMPT_KEY, userKey: REPORT_FREE_USER_PROMPT_KEY }
    : { systemKey: REPORT_FULL_SYSTEM_PROMPT_KEY, userKey: REPORT_FULL_USER_PROMPT_KEY };
}

function defaultPromptFor(key: string): ResolvedPrompt {
  const prompt = defaultReportPromptTemplates.find((item) => item.key === key);
  if (!prompt) throw new Error(`Default prompt is missing for ${key}`);
  return { ...prompt, source: "default" };
}

async function resolveActivePrompt(key: string, locale: string): Promise<ResolvedPrompt> {
  const normalizedLocale = normalizeReportLocale(locale);
  const exact = await prisma.promptTemplate.findFirst({
    where: { key, locale: normalizedLocale, status: "ACTIVE" },
    orderBy: { version: "desc" }
  });
  if (exact) return { ...exact, source: "database" };

  if (normalizedLocale !== "ru") {
    const ruPrompt = await prisma.promptTemplate.findFirst({
      where: { key, locale: "ru", status: "ACTIVE" },
      orderBy: { version: "desc" }
    });
    if (ruPrompt) return { ...ruPrompt, source: "database" };
  }

  return defaultPromptFor(key);
}

export async function buildReportPromptMessages(
  context: ReportPromptContext,
  tier: ReportTier,
  transcript: string | null,
  photoIncluded: boolean
) {
  const keys = promptKeysForTier(tier);
  const [systemPrompt, userPrompt] = await Promise.all([
    resolveActivePrompt(keys.systemKey, context.locale),
    resolveActivePrompt(keys.userKey, context.locale)
  ]);
  const language = context.locale.startsWith("en") ? "English" : "Russian";
  const variables = {
    language,
    analysisId: context.analysisId,
    questionnaireJson: JSON.stringify(context.answers),
    voiceTranscript: transcript || "unavailable",
    photoIncluded: photoIncluded ? "yes" : "no"
  };

  return {
    systemPrompt: systemPrompt.content,
    userPrompt: renderPromptTemplate(userPrompt.content, variables),
    promptVersion: Math.max(systemPrompt.version, userPrompt.version),
    promptSources: {
      system: systemPrompt.source,
      user: userPrompt.source
    }
  };
}
