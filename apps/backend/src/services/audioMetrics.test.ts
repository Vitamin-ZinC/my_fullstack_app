import assert from "node:assert/strict";
import test from "node:test";
import { buildTranscriptMetrics, countWords, labelSpeechRate } from "./audioMetrics.js";

test("countWords handles Russian and mixed alphanumeric speech", () => {
  assert.equal(countWords("Я работаю в product-led growth и веду 2 проекта"), 9);
});

test("buildTranscriptMetrics derives tempo, articulation rate, and pauses", () => {
  const metrics = buildTranscriptMetrics({
    text: "Раз два три четыре пять шесть семь восемь девять десять",
    durationSeconds: 10,
    segments: [
      { start: 0, end: 2.5, text: "Раз два три четыре" },
      { start: 3.3, end: 5.3, text: "пять шесть семь" },
      { start: 7, end: 8, text: "восемь девять десять" }
    ]
  });

  assert.equal(metrics.transcriptWordCount, 10);
  assert.equal(metrics.speechRateWpm, 60);
  assert.equal(metrics.speechRateLabel, "замедленный темп");
  assert.equal(metrics.activeSpeechSeconds, 5.5);
  assert.equal(metrics.articulationRateWpm, 109);
  assert.equal(metrics.silenceRatio, 0.45);
  assert.equal(metrics.pauseCount, 2);
  assert.equal(metrics.averagePauseMs, 1250);
  assert.equal(metrics.longestPauseMs, 1700);
});

test("labelSpeechRate keeps stable product buckets", () => {
  assert.equal(labelSpeechRate(89), "замедленный темп");
  assert.equal(labelSpeechRate(90), "сбалансированный темп");
  assert.equal(labelSpeechRate(125), "умеренно быстрый темп");
  assert.equal(labelSpeechRate(170), "ускоренный темп (выше среднего)");
});
