export function isRetryableAsyncCompletionError(message: string) {
  return /provider_unavailable|temporar|overload|rate.?limit|gateway|invalid json|expected .* after property value|unterminated string|bad control character|timed? ?out|timeout|502|503|504/i.test(message)
    || shouldFallbackToSyncCompletionAfterAsyncError(message);
}

export function shouldFallbackToSyncCompletionAfterAsyncError(message: string) {
  return /404|405|method not allowed|cannot\s+(post|get)|unsupported.*async|async.*unsupported|async.*not supported|not found.*\/chat\/completions\/async|\/chat\/completions\/async.*not found/i.test(message);
}
