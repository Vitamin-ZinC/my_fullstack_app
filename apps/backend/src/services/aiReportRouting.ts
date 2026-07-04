export function isRetryableAsyncCompletionError(message: string) {
  return /provider_unavailable|temporar|overload|rate.?limit|gateway|invalid json|expected .* after property value|unterminated string|bad control character|timed? ?out|timeout|502|503|504/i.test(message)
    || shouldFallbackToSyncCompletionAfterAsyncError(message);
}

export function isAsyncCompletionPollingTimeoutError(message: string) {
  return /OpenAI-compatible async completion .* timed out after \d+ms/i.test(message);
}

export function isTerminalAsyncProviderError(message: string) {
  return /provider_unavailable|Provider request failed/i.test(message);
}

export function shouldFallbackToSyncCompletionAfterAsyncError(message: string) {
  return /provider_unavailable|Provider request failed|404|405|method not allowed|cannot\s+(post|get)|unsupported.*async|async.*unsupported|async.*not supported|not found.*\/chat\/completions\/async|\/chat\/completions\/async.*not found/i.test(message);
}

type ChatMessageLike = {
  content?: unknown;
};

export function normalizeCompatibleChatMessages<TMessage extends ChatMessageLike>(messages: TMessage[]): TMessage[] {
  return messages.map((message) => {
    if (!Array.isArray(message.content)) return message;
    return {
      ...message,
      content: message.content.map(normalizeCompatibleContentPart)
    };
  });
}

function normalizeCompatibleContentPart(part: unknown) {
  if (!part || typeof part !== "object" || Array.isArray(part)) return part;
  const record = part as Record<string, unknown>;
  if (typeof record.type === "string") return part;
  if (typeof record.text === "string") {
    return {
      ...record,
      type: "text"
    };
  }
  if (record.image_url && typeof record.image_url === "object") {
    return {
      ...record,
      type: "image_url"
    };
  }
  return part;
}
