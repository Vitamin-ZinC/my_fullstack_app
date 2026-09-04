import assert from "node:assert/strict";
import test from "node:test";
import { publicReportFailureMessage, resolveAnalysisProgress } from "./analysisProgress.js";

test("analysis polling reports persisted worker progress instead of a fixed 55 percent", () => {
  assert.equal(resolveAnalysisProgress("PROCESSING", 96), 96);
  assert.equal(resolveAnalysisProgress("PROCESSING", null), 55);
  assert.equal(resolveAnalysisProgress("PROCESSING", 120), 99);
});

test("terminal analysis states always finish the progress indicator", () => {
  assert.equal(resolveAnalysisProgress("DONE", 55), 100);
  assert.equal(resolveAnalysisProgress("FAILED", 55), 100);
});

test("public report failure does not expose provider or validation details", () => {
  const message = publicReportFailureMessage("ru");
  assert.match(message, /Не удалось сформировать отчёт/);
  assert.doesNotMatch(message, /Zod|top_roles|OpenAI/i);
});
