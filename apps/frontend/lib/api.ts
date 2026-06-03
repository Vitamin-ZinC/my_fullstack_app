import type { IkigaiAnswers } from "@levelup/contracts";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `API ${res.status}`);
  }
  return res.json();
}

export const api = {
  createGuest: () => request<{ guestToken: string; sessionId: string }>("/api/auth/guest", { method: "POST", body: "{}" }),
  createAnalysis: (sessionId: string) => request<{ analysisId: string; audioUploadUrl: string; photoUploadUrl: string }>("/api/analyses", {
    method: "POST",
    body: JSON.stringify({ sessionId })
  }),
  confirmAnalysis: (analysisId: string, ikigaiAnswers: IkigaiAnswers) => request<{ status: string; jobId: string }>(`/api/analyses/${analysisId}/confirm`, {
    method: "POST",
    body: JSON.stringify({ ikigaiAnswers })
  }),
  getStatus: (analysisId: string) => request<{ status: string; progress: number; jobId?: string }>(`/api/analyses/${analysisId}/status`),
  getFreeReport: <T>(analysisId: string) => request<T>(`/api/analyses/${analysisId}/report/free`),
  getFullReport: <T>(analysisId: string) => request<T>(`/api/analyses/${analysisId}/report/full`),
  createPaymentIntent: (analysisId: string) => request<{ clientSecret: string; paymentIntentId: string }>("/api/payments/create-intent", {
    method: "POST",
    body: JSON.stringify({ analysisId })
  })
};

export async function uploadMedia(uploadUrl: string, blob: Blob) {
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": blob.type || "application/octet-stream" },
    body: blob
  });
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
}

export function createProgressSource(analysisId: string) {
  return new EventSource(`${API_URL}/api/analyses/${analysisId}/stream`);
}
