import assert from "node:assert/strict";
import test from "node:test";
import {
  isAsyncCompletionPollingTimeoutError,
  isRetryableAsyncCompletionError,
  isTerminalAsyncProviderError,
  normalizeCompatibleChatMessages,
  shouldFallbackToSyncCompletionAfterAsyncError
} from "./aiReportRouting.js";

test("async completion 504 is retryable but does not fall back to sync report generation", () => {
  const message = "OpenAI-compatible async completion failed with 504: 504 Gateway Time-out";

  assert.equal(isRetryableAsyncCompletionError(message), true);
  assert.equal(shouldFallbackToSyncCompletionAfterAsyncError(message), false);
});

test("unsupported async endpoint can fall back to sync report generation", () => {
  const message = "OpenAI-compatible async completion failed with 404: /chat/completions/async not found";

  assert.equal(isRetryableAsyncCompletionError(message), true);
  assert.equal(shouldFallbackToSyncCompletionAfterAsyncError(message), true);
});

test("async polling timeout is not retried as a new long-running job", () => {
  const message = "OpenAI-compatible async completion job-1 attempt 1 timed out after 600000ms";

  assert.equal(isRetryableAsyncCompletionError(message), true);
  assert.equal(isAsyncCompletionPollingTimeoutError(message), true);
  assert.equal(shouldFallbackToSyncCompletionAfterAsyncError(message), false);
});

test("compatible chat message normalization adds missing text part type", () => {
  const messages = normalizeCompatibleChatMessages([
    {
      role: "user",
      content: [
        { text: "Опиши картинку" },
        { type: "image_url", image_url: { url: "https://example.com/a.jpg" } }
      ]
    }
  ]);

  assert.deepEqual(messages[0]?.content, [
    { text: "Опиши картинку", type: "text" },
    { type: "image_url", image_url: { url: "https://example.com/a.jpg" } }
  ]);
});

test("provider unavailable is terminal for async report jobs", () => {
  const message = "OpenAI-compatible async completion job-1 attempt 1 failed: {\"code\":\"provider_unavailable\",\"message\":\"Provider request failed\"}";

  assert.equal(isRetryableAsyncCompletionError(message), true);
  assert.equal(isTerminalAsyncProviderError(message), true);
});
