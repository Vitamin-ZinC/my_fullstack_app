import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultReportPromptTemplates,
  REPORT_FREE_SYSTEM_PROMPT_KEY,
  REPORT_FREE_USER_PROMPT_KEY,
  REPORT_FULL_SYSTEM_PROMPT_KEY,
  REPORT_FULL_USER_PROMPT_KEY,
  renderPromptTemplate
} from "./reportPrompts.js";

test("default report prompts define separate free and full templates", () => {
  const keys = new Set(defaultReportPromptTemplates.map((prompt) => prompt.key));
  assert.equal(keys.has(REPORT_FREE_SYSTEM_PROMPT_KEY), true);
  assert.equal(keys.has(REPORT_FREE_USER_PROMPT_KEY), true);
  assert.equal(keys.has(REPORT_FULL_SYSTEM_PROMPT_KEY), true);
  assert.equal(keys.has(REPORT_FULL_USER_PROMPT_KEY), true);
});

test("renderPromptTemplate replaces known variables and keeps unknown placeholders", () => {
  assert.equal(
    renderPromptTemplate("{{language}} {{ unknown }} {{analysisId}}", {
      language: "Russian",
      analysisId: "analysis-1"
    }),
    "Russian {{ unknown }} analysis-1"
  );
});
