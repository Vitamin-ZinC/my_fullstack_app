import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/orken_test";
process.env.OPENAI_MODEL ??= "gpt-4o-mini";

const {
  interpretPhotoSuitabilityDecision,
  parsePhotoSuitabilityDecision,
  photoSuitabilityMessage
} = await import("./photoSuitability.js");

test("photo suitability accepts one clear photographic human face", () => {
  const result = interpretPhotoSuitabilityDecision({
    hasHuman: true,
    isPhotographicHuman: true,
    visibleFaceCount: 1,
    primaryFaceClear: true,
    confidence: 0.94,
    reason: "single clear face"
  });
  assert.equal(result.ok, true);
});

test("photo suitability rejects images without a real photographic person", () => {
  const result = interpretPhotoSuitabilityDecision({
    hasHuman: false,
    isPhotographicHuman: false,
    visibleFaceCount: 0,
    primaryFaceClear: false,
    confidence: 0.98,
    reason: "object"
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, "PHOTO_PERSON_REQUIRED");

  const personWithoutVisibleFace = interpretPhotoSuitabilityDecision({
    hasHuman: true,
    isPhotographicHuman: true,
    visibleFaceCount: 0,
    primaryFaceClear: false,
    confidence: 0.88,
    reason: "person facing away"
  });
  assert.equal(personWithoutVisibleFace.ok, false);
  if (!personWithoutVisibleFace.ok) {
    assert.equal(personWithoutVisibleFace.code, "PHOTO_PERSON_REQUIRED");
    assert.equal(personWithoutVisibleFace.message, "На фото не обнаружено лицо. Пожалуйста, загрузите другое фото");
  }
});

test("photo suitability rejects group photos and unclear faces", () => {
  const group = interpretPhotoSuitabilityDecision({
    hasHuman: true,
    isPhotographicHuman: true,
    visibleFaceCount: 3,
    primaryFaceClear: true,
    confidence: 0.93,
    reason: "group"
  });
  assert.equal(group.ok, false);
  if (!group.ok) assert.equal(group.code, "PHOTO_SINGLE_PERSON_REQUIRED");

  const unclear = interpretPhotoSuitabilityDecision({
    hasHuman: true,
    isPhotographicHuman: true,
    visibleFaceCount: 1,
    primaryFaceClear: false,
    confidence: 0.55,
    reason: "occluded"
  });
  assert.equal(unclear.ok, false);
  if (!unclear.ok) assert.equal(unclear.code, "PHOTO_FACE_NOT_CLEAR");
});

test("photo suitability parser tolerates a compatible model think block", () => {
  const decision = parsePhotoSuitabilityDecision(
    '<think>internal</think>{"hasHuman":true,"isPhotographicHuman":true,"visibleFaceCount":1,"primaryFaceClear":true,"confidence":0.9,"reason":"portrait"}'
  );
  assert.equal(decision.visibleFaceCount, 1);
  assert.equal(decision.primaryFaceClear, true);
});

test("photo suitability messages are localized without exposing provider errors", () => {
  assert.equal(
    photoSuitabilityMessage("ru", "PHOTO_PERSON_REQUIRED"),
    "На фото не обнаружено лицо. Пожалуйста, загрузите другое фото"
  );
  assert.match(photoSuitabilityMessage("en", "PHOTO_PERSON_REQUIRED"), /No face was detected/i);
});
