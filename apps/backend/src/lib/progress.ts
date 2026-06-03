export type ProgressEvent = {
  status?: string;
  progress: number;
  stage?: string;
  log?: string;
};

const listeners = new Map<string, Set<(event: ProgressEvent) => void>>();

export function subscribeProgress(analysisId: string, listener: (event: ProgressEvent) => void) {
  const bucket = listeners.get(analysisId) ?? new Set();
  bucket.add(listener);
  listeners.set(analysisId, bucket);
  return () => {
    bucket.delete(listener);
    if (bucket.size === 0) listeners.delete(analysisId);
  };
}

export function emitProgress(analysisId: string, event: ProgressEvent) {
  const bucket = listeners.get(analysisId);
  if (!bucket) return;
  for (const listener of bucket) listener(event);
}
