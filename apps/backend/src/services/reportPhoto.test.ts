import assert from "node:assert/strict";
import test from "node:test";
import { readFile, mkdtemp, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { inlineReportPhoto, assertPhotoEvidence, assertReportPhotoReady, hasMissingPhotoClaim, redactPhotoPayload } from "./reportPhoto.js";

const fixture = resolve(import.meta.dirname, "../../../frontend/public/assets/ai-face-hero.jpg");

test("photo is transmitted inline with its detected MIME, never as an externally fetched URL", async () => {
  const buffer = await readFile(fixture);
  const input = inlineReportPhoto(buffer);
  assert.ok(input.startsWith("data:image/jpeg;base64,"));
  assert.deepEqual(Buffer.from(input.split(",")[1], "base64"), buffer);
  assert.throws(() => inlineReportPhoto(null), /PHOTO_INPUT_UNAVAILABLE/);
  assert.throws(() => inlineReportPhoto(Buffer.from("invalid")), /PHOTO_INPUT_INVALID/);
  assert.throws(() => inlineReportPhoto(Buffer.alloc(12 * 1024 * 1024 + 1)), /PHOTO_INPUT_TOO_LARGE/);
});

test("all accepted image formats use the actual container MIME, including WebP", () => {
  const webp = Buffer.alloc(9000);
  webp.write("RIFF", 0); webp.write("WEBP", 8); webp.write("VP8X", 12);
  webp.writeUIntLE(319, 24, 3); webp.writeUIntLE(239, 27, 3);
  assert.ok(inlineReportPhoto(webp).startsWith("data:image/webp;base64,"));
  const png = Buffer.alloc(9000);
  Buffer.from("89504e470d0a1a0a", "hex").copy(png); png.write("IHDR", 12);
  png.writeUInt32BE(320, 16); png.writeUInt32BE(240, 20);
  assert.ok(inlineReportPhoto(png).startsWith("data:image/png;base64,"));
});

test("pending or rejected photo cannot silently become an absent optional photo", () => {
  assertReportPhotoReady([]);
  assertReportPhotoReady([{ type: "PHOTO", status: "VERIFIED" }]);
  for (const status of ["CREATED", "REJECTED"]) assert.throws(() => assertReportPhotoReady([{ type: "PHOTO", status }]), /NOT_READY/);
});

test("contradictory missing-photo claims are rejected but actual still-photo limitations are retained", () => {
  for (const text of ["Фотография не представлена", "фотография отсутствует", "Фото не было приложено", "The photo was not provided", "Image is unavailable", "No photograph was uploaded"]) {
    const report = { face_analysis: { emotionality: text } };
    assert.ok(hasMissingPhotoClaim(report), text);
    assert.throws(() => assertPhotoEvidence(report, true), /PHOTO_EVIDENCE_CONFLICT/);
    assertPhotoEvidence(report, false);
  }
  for (const text of ["На фото отсутствует улыбка", "Фотография не позволяет оценить динамику мимики", "This still photo cannot reveal temporal micro-expressions"]) {
    assert.equal(hasMissingPhotoClaim({ face_analysis: { emotionality: text } }), false, text);
  }
  assert.equal(redactPhotoPayload("invalid data:image/jpeg;base64,YWJjZA== payload"), "invalid [redacted image] payload");
});

test("report completion and JSON repair retain the photo; provider errors never retry without it", async () => {
  const root = await mkdtemp(join(tmpdir(), "orken-photo-test-"));
  await copyFile(fixture, join(root, "photo.jpg"));
  process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:1/orken_photo_tests";
  process.env.OPENAI_API_KEY = "synthetic-test-key";
  process.env.ORKEN_LLM_API_KEY = "";
  process.env.OPENAI_BASE_URL = "https://gateway.example.invalid/v1";
  process.env.OPENAI_ASYNC_REPORTS_ENABLED = "false";
  process.env.LOCAL_UPLOAD_DIR = root;
  process.env.S3_ACCESS_KEY_ID = "";
  process.env.S3_SECRET_ACCESS_KEY = "";
  process.env.S3_BUCKET = "";
  process.env.PARTNER_CORE_URL = "";
  const originalFetch = globalThis.fetch;
  const calls: { image: boolean; repair: boolean }[] = [];
  let reject = false;
  const { buildFallbackReport, buildFallbackFreeReport } = await import("./report.js");
  const answers = { love: ["research"], good_at: ["explaining"], world_needs: [], paid_for: [] };
  const full = buildFallbackReport(answers, "en");
  const result = { ...full, ...buildFallbackFreeReport(full, "en") };
  globalThis.fetch = async (url, options) => {
    const request = new Request(url, options);
    const body = await request.json() as any;
    const repair = String(body.messages[0].content).includes("You repair report-generation JSON");
    const image = body.messages.some((message: any) => Array.isArray(message.content) && message.content.some((part: any) => part.type === "image_url" && part.image_url.url.startsWith("data:image/jpeg;base64,")));
    calls.push({ image, repair });
    if (reject) return new Response(JSON.stringify({ error: { message: "invalid_image provider_unavailable" } }), { status: 400, headers: { "Content-Type": "application/json" } });
    const output = structuredClone(result);
    if (!repair) output.face_analysis.emotionality = "Your result: The photo was not provided. What it means: No visual input. Recommendation: Upload a photo.";
    return new Response(JSON.stringify({ id: "synthetic", object: "chat.completion", created: 1, model: body.model,
      choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify(output) }, finish_reason: "stop" }] }), { headers: { "Content-Type": "application/json" } });
  };
  const { prisma } = await import("../lib/prisma.js");
  const originalFind = prisma.promptTemplate.findFirst;
  prisma.promptTemplate.findFirst = (async () => null) as typeof originalFind;
  try {
    const { generateOpenAiReport } = await import("./aiReport.js");
    const asset = { id: "synthetic", type: "PHOTO", key: "photo.jpg", status: "VERIFIED", mimeType: "image/jpeg" } as any;
    const context = { analysisId: "synthetic", locale: "en", answers, mediaAssets: [asset] };
    const generated = await generateOpenAiReport(context);
    assert.ok(generated?.mediaSignals.photoInput);
    assert.equal(hasMissingPhotoClaim(generated?.report), false);
    assert.ok(calls.some(call => call.repair));
    assert.ok(calls.every(call => call.image));
    const { photoRepairAnalysisData } = await import("../scripts/repairReportPhotos.js");
    assert.deepEqual(Object.keys(photoRepairAnalysisData(generated!)).sort(), ["reportFree", "reportFull", "reportVersion"]);
    assert.throws(() => photoRepairAnalysisData({ ...generated!, mediaSignals: { ...generated!.mediaSignals, photoInput: false } }), /REQUIRES_IMAGE/);
    calls.length = 0;
    reject = true;
    await assert.rejects(generateOpenAiReport(context), /invalid_image|provider_unavailable/);
    assert.ok(calls.length >= 1 && calls.length <= 3);
    assert.ok(calls.every(call => call.image));
    calls.length = 0;
    await assert.rejects(generateOpenAiReport({ ...context, mediaAssets: [{ ...asset, key: "missing.jpg" }] }), /PHOTO_INPUT_UNAVAILABLE/);
    assert.equal(calls.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
    prisma.promptTemplate.findFirst = originalFind;
  }
});
