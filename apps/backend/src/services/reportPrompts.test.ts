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

test("premium default prompt requires safe profiling lens and Russian personalization", () => {
  const system = defaultReportPromptTemplates.find((prompt) => prompt.key === REPORT_FULL_SYSTEM_PROMPT_KEY);
  const user = defaultReportPromptTemplates.find((prompt) => prompt.key === REPORT_FULL_USER_PROMPT_KEY);

  assert.ok(system);
  assert.ok(user);
  assert.match(system.content, /Ponomarenko|Ekman|Navarro|deception-research/);
  assert.match(system.content, /Do not.*lying|deceptive/i);
  assert.match(user.content, /Ваш результат:/);
  assert.match(user.content, /Что это значит:/);
  assert.match(user.content, /Рекомендация:/);
  assert.match(user.content, /voiceMetricsJson/);
  assert.match(user.content, /слов в минуту/);
  assert.match(user.content, /ikigai_zones/);
  assert.match(user.content, /похоже|может указывать/);
  assert.match(user.content, /Every visible value must be in Russian/);
  assert.doesNotMatch(user.content, /Рї|Рј|РІ СЂ/);
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
