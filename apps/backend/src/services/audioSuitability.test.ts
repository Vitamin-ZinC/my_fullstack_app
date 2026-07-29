import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL ??= "postgresql://levelup:dev_password@localhost:5432/levelup";
process.env.PARTNER_CORE_URL = "";

test("audio suitability requires actual speech content", async () => {
  const { hasDetectableSpeech, isDetectableTranscription } = await import("./audioSuitability.js");
  assert.equal(hasDetectableSpeech(null), false);
  assert.equal(hasDetectableSpeech(""), false);
  assert.equal(hasDetectableSpeech("тишина"), false);
  assert.equal(hasDetectableSpeech("Рассказываю о работе"), true);
  assert.equal(isDetectableTranscription({
    text: "Продолжение следует",
    segments: [{
      text: "Продолжение следует",
      noSpeechProbability: 0.96,
      averageLogProbability: -1.8
    }]
  }), false);
  assert.equal(isDetectableTranscription({
    text: "Рассказываю о работе",
    segments: [{
      text: "Рассказываю о работе",
      noSpeechProbability: 0.04,
      averageLogProbability: -0.22
    }]
  }), true);
});

test("audio suitability exposes the required user-facing retry message", async () => {
  const { audioSuitabilityMessage } = await import("./audioSuitability.js");
  assert.equal(
    audioSuitabilityMessage("ru", "AUDIO_SPEECH_REQUIRED"),
    "Голос не обнаружен. Пожалуйста, повторите запись"
  );
});
