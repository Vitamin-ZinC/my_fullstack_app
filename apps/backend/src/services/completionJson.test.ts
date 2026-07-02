import assert from "node:assert/strict";
import test from "node:test";
import { parseCompletionJson } from "./completionJson.js";

test("parseCompletionJson repairs common malformed JSON from compatible LLM gateways", () => {
  const parsed = parseCompletionJson([
    "<think>hidden reasoning</think>",
    "```json",
    "{",
    "  \"profession\": \"Продуктовый стратег\"",
    "  \"summary\": \"Короткий персональный вывод\"",
    "}",
    "```"
  ].join("\n")) as { profession: string; summary: string };

  assert.deepEqual(parsed, {
    profession: "Продуктовый стратег",
    summary: "Короткий персональный вывод"
  });
});

test("parseCompletionJson extracts JSON object from surrounding prose", () => {
  assert.deepEqual(parseCompletionJson("Result:\n{\"ok\":true}\nDone."), { ok: true });
});

test("parseCompletionJson rejects non-JSON content", () => {
  assert.throws(() => parseCompletionJson("not a report"), /non-JSON report content/);
});
