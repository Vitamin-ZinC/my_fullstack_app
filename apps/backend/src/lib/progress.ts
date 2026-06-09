import { redis } from "./queue.js";
import { prisma } from "./prisma.js";

export type ProgressEvent = {
  status?: string;
  progress: number;
  stage?: string;
  log?: string;
};

const listeners = new Map<string, Set<(event: ProgressEvent) => void>>();
const channel = "analysis-progress";
let subscriberStarted = false;

function dispatch(analysisId: string, event: ProgressEvent) {
  const bucket = listeners.get(analysisId);
  if (!bucket) return;
  for (const listener of bucket) listener(event);
}

function ensureSubscriber() {
  if (subscriberStarted) return;
  subscriberStarted = true;
  const subscriber = redis.duplicate();
  void subscriber.subscribe(channel);
  subscriber.on("message", (_channel, payload) => {
    try {
      const message = JSON.parse(payload) as { analysisId: string; event: ProgressEvent };
      dispatch(message.analysisId, message.event);
    } catch {
      // Ignore malformed progress payloads; they should not break active SSE streams.
    }
  });
}

export function subscribeProgress(analysisId: string, listener: (event: ProgressEvent) => void) {
  ensureSubscriber();
  const bucket = listeners.get(analysisId) ?? new Set();
  bucket.add(listener);
  listeners.set(analysisId, bucket);
  return () => {
    bucket.delete(listener);
    if (bucket.size === 0) listeners.delete(analysisId);
  };
}

export function emitProgress(analysisId: string, event: ProgressEvent) {
  dispatch(analysisId, event);
  void redis.publish(channel, JSON.stringify({ analysisId, event })).catch(() => undefined);
  void prisma.jobEvent.create({
    data: {
      analysisId,
      status: event.status,
      progress: event.progress,
      stage: event.stage,
      log: event.log
    }
  }).catch(() => undefined);
}
