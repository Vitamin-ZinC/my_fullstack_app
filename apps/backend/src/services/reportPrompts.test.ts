import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultReportPromptTemplates,
  HABIT_NAVIGATOR_SYSTEM_PROMPT_KEY,
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
  assert.equal(keys.has(HABIT_NAVIGATOR_SYSTEM_PROMPT_KEY), true);
});

test("navigator prompt default is safe and admin-editable", () => {
  const prompt = defaultReportPromptTemplates.find((item) => item.key === HABIT_NAVIGATOR_SYSTEM_PROMPT_KEY);

  assert.ok(prompt);
  assert.match(prompt.content, /Treat reports, insights, user profile/);
  assert.match(prompt.content, /Do not reveal/);
  assert.match(prompt.content, /{{backendContext}}/);
  assert.match(prompt.content, /{{frontendContext}}/);
});

test("default report prompts expose strengthened version numbers", () => {
  const freeVersions = defaultReportPromptTemplates
    .filter((prompt) => prompt.key.startsWith("ikigai.report.free."))
    .map((prompt) => prompt.version);
  const fullVersions = defaultReportPromptTemplates
    .filter((prompt) => prompt.key.startsWith("ikigai.report.full."))
    .map((prompt) => prompt.version);

  assert.deepEqual(new Set(freeVersions), new Set([4]));
  assert.deepEqual(new Set(fullVersions), new Set([7]));
});

test("free default prompt requires engaging result and paid-report preview", () => {
  const user = defaultReportPromptTemplates.find((prompt) => prompt.key === REPORT_FREE_USER_PROMPT_KEY);

  assert.ok(user);
  assert.match(user.content, /paid_report_teaser/);
  assert.match(user.content, /paid_report_preview/);
  assert.match(user.content, /next 24 hours/);
  assert.match(user.content, /Итоговое аналитическое заключение/);
  assert.match(user.content, /does not expose the full premium/);
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
  assert.match(user.content, /Итоговое аналитическое заключение/);
  assert.match(user.content, /Комплексный AI-анализ показывает/);
  assert.match(user.content, /похоже|может указывать/);
  assert.match(user.content, /Every visible value must be in Russian/);
  assert.match(user.content, /Quality gate/);
  assert.match(user.content, /exactly 5 roles/);
  assert.match(user.content, /55 to 95/);
  assert.match(user.content, /not be a translation of the field name/);
  assert.match(user.content, /self-described context/);
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
