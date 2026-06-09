const baseUrl = (process.env.SMOKE_BASE_URL || process.argv[2] || "https://orken.life").replace(/\/$/, "");
const promoCode = process.env.SMOKE_PROMO_CODE || "";

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

const jpeg1x1 = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAVEAEBAAAAAAAAAAAAAAAAAAAAAf/aAAwDAQACEAMQAAAB9A//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/ASP/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/ASP/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/Al//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IV//2gAMAwEAAgADAAAAEP/EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8QH//EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8QH//EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAT8QH//Z",
  "base64"
);

const session = await request("/api/auth/guest", {
  method: "POST",
  body: JSON.stringify({ locale: "ru" })
});

const analysis = await request("/api/analyses", {
  method: "POST",
  body: JSON.stringify({ locale: "ru" })
}, session);

await upload(analysis.audioUploadUrl, Buffer.alloc(4096, 1), "audio/webm");
await upload(analysis.photoUploadUrl, jpeg1x1, "image/jpeg");

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
for (let attempt = 0; attempt < 45; attempt += 1) {
  status = await request(`/api/analyses/${analysis.analysisId}/status`, {}, session);
  if (status.status === "DONE" || status.status === "FAILED") break;
  await new Promise((resolve) => setTimeout(resolve, 2000));
}

if (!status || status.status !== "DONE") {
  throw new Error(`Analysis did not finish successfully: ${JSON.stringify(status)}`);
}

const freeReport = await request(`/api/analyses/${analysis.analysisId}/report/free`, {}, session);
if (!freeReport?.reportFree?.profession) {
  throw new Error("Free report payload is missing profession");
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
  baseUrl,
  analysisId: analysis.analysisId,
  status: status.status,
  progress: status.progress,
  freeProfession: freeReport.reportFree.profession,
  checkout: checkout ? {
    amount: checkout.amount,
    discountAmount: checkout.discountAmount,
    currency: checkout.currency,
    localUnlock: checkout.url.startsWith(baseUrl)
  } : null
}, null, 2));
