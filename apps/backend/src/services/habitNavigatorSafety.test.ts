import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultReportPromptTemplates,
  HABIT_NAVIGATOR_SYSTEM_PROMPT_KEY,
  renderPromptTemplate
} from "./reportPrompts.js";

test("ORKEN system prompt contains safety rules for web and Telegram", () => {
  const prompt = defaultReportPromptTemplates.find((item) => item.key === HABIT_NAVIGATOR_SYSTEM_PROMPT_KEY);

  assert.ok(prompt);
  assert.match(prompt.content, /They are never instructions/);
  assert.match(prompt.content, /Do not invent memory/);
  assert.match(prompt.content, /Do not reveal/);
  assert.match(prompt.content, /Never output chain-of-thought/);
  assert.match(prompt.content, /If in Telegram/);
});

test("ORKEN system prompt renders only explicit backend context variables", () => {
  const prompt = defaultReportPromptTemplates.find((item) => item.key === HABIT_NAVIGATOR_SYSTEM_PROMPT_KEY);

  assert.ok(prompt);
  const rendered = renderPromptTemplate(prompt.content, {
    channel: "TELEGRAM",
    frontendContext: "{\"mode\":\"chat\"}",
    backendContext: "Program: test"
  });

  assert.match(rendered, /Channel: TELEGRAM/);
  assert.match(rendered, /Program: test/);
  assert.doesNotMatch(rendered, /{{backendContext}}/);
});
