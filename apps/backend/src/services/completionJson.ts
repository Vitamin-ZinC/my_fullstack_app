import { jsonrepair } from "jsonrepair";

export function parseCompletionJson(content: string) {
  const withoutThink = content.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const withoutFence = withoutThink.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const candidate = extractJsonObjectCandidate(withoutFence);
  if (!candidate) {
    throw new Error("OpenAI-compatible gateway returned non-JSON report content");
  }

  return parseJsonWithRepair(candidate);
}

function extractJsonObjectCandidate(content: string) {
  if (content.startsWith("{") && content.endsWith("}")) return content;
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  return start >= 0 && end > start ? content.slice(start, end + 1) : null;
}

function parseJsonWithRepair(candidate: string) {
  try {
    return JSON.parse(candidate);
  } catch (error) {
    try {
      return JSON.parse(jsonrepair(candidate));
    } catch {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`OpenAI-compatible gateway returned invalid JSON report content: ${message}`);
    }
  }
}
