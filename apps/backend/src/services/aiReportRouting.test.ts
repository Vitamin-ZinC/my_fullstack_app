import assert from "node:assert/strict";
import test from "node:test";
import {
  isRetryableAsyncCompletionError,
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
