import { existsSync, readFileSync } from "node:fs";
import OpenAI from "openai";
import { env } from "../env.js";

let cachedApiKey: string | null | undefined;
let cachedClient: OpenAI | null = null;

export function getOpenAiApiKey() {
  if (cachedApiKey !== undefined) return cachedApiKey;
  if (env.ORKEN_LLM_API_KEY) {
    cachedApiKey = env.ORKEN_LLM_API_KEY;
    return cachedApiKey;
  }
  if (env.OPENAI_API_KEY) {
    cachedApiKey = env.OPENAI_API_KEY;
    return cachedApiKey;
  }

  try {
    if (!existsSync(env.ORKEN_API_KEY_FILE)) {
      cachedApiKey = null;
      return cachedApiKey;
    }
    const file = JSON.parse(readFileSync(env.ORKEN_API_KEY_FILE, "utf8").replace(/^\uFEFF/, "")) as { api_key?: unknown };
    cachedApiKey = typeof file.api_key === "string" && file.api_key.trim() ? file.api_key.trim() : null;
    return cachedApiKey;
  } catch {
    cachedApiKey = null;
    return cachedApiKey;
  }
}

export function hasOpenAiClient() {
  return Boolean(getOpenAiApiKey());
}

export function getOpenAiClient() {
  const apiKey = getOpenAiApiKey();
  if (!apiKey) return null;
  cachedClient ??= new OpenAI({
    apiKey,
    baseURL: env.OPENAI_BASE_URL
  });
  return cachedClient;
}
