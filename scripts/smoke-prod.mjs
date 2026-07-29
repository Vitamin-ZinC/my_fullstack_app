import { readFileSync } from "node:fs";

const baseUrl = (process.env.SMOKE_BASE_URL || process.argv[2] || "https://orken.life").replace(/\/$/, "");
const promoCode = process.env.SMOKE_PROMO_CODE || "";
const allowFallback = process.env.SMOKE_ALLOW_FALLBACK === "true";
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS || 20 * 60 * 1000);
const pollIntervalMs = Number(process.env.SMOKE_POLL_INTERVAL_MS || 5000);
const audioFixturePath = process.env.SMOKE_AUDIO_FILE || "";
const photoFixturePath = process.env.SMOKE_PHOTO_FILE || "";

if (Boolean(audioFixturePath) !== Boolean(photoFixturePath)) {
  throw new Error("Set both SMOKE_AUDIO_FILE and SMOKE_PHOTO_FILE for a full diagnostic smoke test");
}

async function request(path, init = {}, session) {
  const headers = {
    "Content-Type": "application/json",
    ...(session?.sessionId ? { "x-session-id": session.sessionId } : {}),
    ...(session?.guestToken ? { "x-guest-token": session.guestToken } : {}),
    "x-locale": "ru",
    ...(init.headers || {})
  };
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${init.method || "GET"} ${path} failed: ${response.status} ${text}`);
  }
  return body;
}

async function requestExpected(path, expectedStatus, init = {}, session) {
  const headers = {
    "Content-Type": "application/json",
    ...(session?.sessionId ? { "x-session-id": session.sessionId } : {}),
    ...(session?.guestToken ? { "x-guest-token": session.guestToken } : {}),
    "x-locale": "ru",
    ...(init.headers || {})
  };
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (response.status !== expectedStatus) {
    throw new Error(`${init.method || "GET"} ${path} returned ${response.status}, expected ${expectedStatus}: ${text}`);
  }
  return body;
}

async function upload(url, body, contentType) {
  const response = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`PUT ${url} failed: ${response.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

const publicContent = await request("/api/content/ru");
if (publicContent?.locale !== "ru") throw new Error("Public content endpoint is unavailable");

const session = await request("/api/auth/guest", {
  method: "POST",
  body: JSON.stringify({ locale: "ru" })
});

const rejectedConsent = await requestExpected("/api/analyses", 400, {
  method: "POST",
  body: JSON.stringify({ locale: "ru" })
}, session);
if (rejectedConsent?.code !== "AUDIO_CONSENT_REQUIRED") {
  throw new Error(`Consent contract returned an unexpected payload: ${JSON.stringify(rejectedConsent)}`);
}

const analysis = await request("/api/analyses", {
  method: "POST",
  body: JSON.stringify({ locale: "ru", audioConsent: true })
}, session);

if (!audioFixturePath) {
  await upload(analysis.audioUploadUrl, Buffer.alloc(4096, 1), "audio/webm");
  const audioValidation = await requestExpected(`/api/analyses/${analysis.analysisId}/audio/validate`, 422, {
    method: "POST",
    body: JSON.stringify({ consent: true })
  }, session);
  if (audioValidation?.code !== "AUDIO_INVALID") {
    throw new Error(`Invalid audio contract returned an unexpected payload: ${JSON.stringify(audioValidation)}`);
  }
  console.log(JSON.stringify({
    ok: true,
    mode: "contract",
    baseUrl,
    health: true,
    consentGate: true,
    invalidAudioGate: true
  }, null, 2));
  process.exit(0);
}

const smokeAudio = readFileSync(audioFixturePath);
const smokePhoto = readFileSync(photoFixturePath);
await upload(analysis.audioUploadUrl, smokeAudio, "audio/webm");
await upload(analysis.photoUploadUrl, smokePhoto, "image/jpeg");

await request(`/api/analyses/${analysis.analysisId}/audio/validate`, {
  method: "POST",
  body: JSON.stringify({ consent: true })
}, session);

await request(`/api/analyses/${analysis.analysisId}/photo/validate`, {
  method: "POST",
  body: JSON.stringify({ consent: true })
}, session);

await request(`/api/analyses/${analysis.analysisId}/confirm`, {
  method: "POST",
  body: JSON.stringify({
    ikigaiAnswers: {
      love: ["исследовать", "объяснять"],
      good_at: ["структурировать", "общаться"],
      world_needs: ["ясность", "AI-навыки"],
      paid_for: ["консалтинг", "продуктовая стратегия"]
    }
  })
}, session);

let status;
const startedAt = Date.now();
while (Date.now() - startedAt < timeoutMs) {
  status = await request(`/api/analyses/${analysis.analysisId}/status`, {}, session);
  if (status.status === "DONE" || status.status === "FAILED") break;
  await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
}

if (!status || status.status !== "DONE") {
  throw new Error(`Analysis did not finish successfully: ${JSON.stringify(status)}`);
}

const freeReport = await request(`/api/analyses/${analysis.analysisId}/report/free`, {}, session);
if (!freeReport?.reportFree?.profession) {
  throw new Error("Free report payload is missing profession");
}
const reportMeta = freeReport.reportMeta ?? status.reportMeta ?? null;
if (!allowFallback && !reportMeta) {
  throw new Error("Smoke response is missing reportMeta; cannot verify LLM generation");
}
if (!allowFallback && reportMeta?.usedFallback) {
  throw new Error(`Smoke produced fallback report instead of LLM report: ${JSON.stringify(reportMeta)}`);
}
if (!allowFallback && reportMeta && [reportMeta.free?.generatedBy, reportMeta.full?.generatedBy].includes("fallback")) {
  throw new Error(`Smoke report metadata contains fallback tier: ${JSON.stringify(reportMeta)}`);
}

let checkout = null;
if (promoCode) {
  checkout = await request("/api/payments/create-checkout-session", {
    method: "POST",
    body: JSON.stringify({ analysisId: analysis.analysisId, promoCode })
  }, session);
  if (!checkout?.url) throw new Error("Checkout response is missing url");
}

console.log(JSON.stringify({
  ok: true,
  mode: "full",
  baseUrl,
  analysisId: analysis.analysisId,
  status: status.status,
  progress: status.progress,
  reportMeta,
  freeProfession: freeReport.reportFree.profession,
  checkout: checkout ? {
    amount: checkout.amount,
    discountAmount: checkout.discountAmount,
    currency: checkout.currency,
    localUnlock: checkout.url.startsWith(baseUrl)
  } : null
}, null, 2));
