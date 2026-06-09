import type {
  AdminStats,
  AppSetting,
  CheckoutSessionResponse,
  FeatureFlag,
  IkigaiAnswers,
  PaymentIntentResponse,
  PromoCode,
  PromptTemplate,
  ReportFree,
  ReportFull
} from "@levelup/contracts";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const SESSION_ID_KEY = "levelup_session_id";
const GUEST_TOKEN_KEY = "levelup_guest_token";
const LOCALE_KEY = "levelup_locale";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...sessionHeaders(),
      ...(init?.headers ?? {})
    }
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `API ${res.status}`);
  }
  return res.json();
}

function hasWindow() {
  return typeof window !== "undefined";
}

export function getStoredLocale() {
  if (!hasWindow()) return "ru";
  return window.localStorage.getItem(LOCALE_KEY) ?? navigator.language?.slice(0, 2) ?? "ru";
}

export function setStoredLocale(locale: string) {
  if (!hasWindow()) return;
  window.localStorage.setItem(LOCALE_KEY, locale);
}

function sessionHeaders() {
  if (!hasWindow()) return {};
  const sessionId = window.sessionStorage.getItem(SESSION_ID_KEY);
  const guestToken = window.sessionStorage.getItem(GUEST_TOKEN_KEY);
  const locale = getStoredLocale();
  return {
    ...(sessionId ? { "x-session-id": sessionId } : {}),
    ...(guestToken ? { "x-guest-token": guestToken } : {}),
    "x-locale": locale
  };
}

export async function ensureGuestSession() {
  if (!hasWindow()) throw new Error("Browser session is required");
  const existingSessionId = window.sessionStorage.getItem(SESSION_ID_KEY);
  const existingGuestToken = window.sessionStorage.getItem(GUEST_TOKEN_KEY);
  if (existingSessionId && existingGuestToken) {
    return { sessionId: existingSessionId, guestToken: existingGuestToken };
  }

  const session = await request<{ guestToken: string; sessionId: string }>("/api/auth/guest", {
    method: "POST",
    body: JSON.stringify({ locale: getStoredLocale() })
  });
  window.sessionStorage.setItem(SESSION_ID_KEY, session.sessionId);
  window.sessionStorage.setItem(GUEST_TOKEN_KEY, session.guestToken);
  return session;
}

export const api = {
  createGuest: () => ensureGuestSession(),
  createAnalysis: async () => {
    await ensureGuestSession();
    return request<{ analysisId: string; audioUploadUrl: string; photoUploadUrl: string }>("/api/analyses", {
      method: "POST",
      body: JSON.stringify({ locale: getStoredLocale() })
    });
  },
  confirmAnalysis: (analysisId: string, ikigaiAnswers: IkigaiAnswers) => request<{ status: string; jobId: string }>(`/api/analyses/${analysisId}/confirm`, {
    method: "POST",
    body: JSON.stringify({ ikigaiAnswers })
  }),
  getStatus: (analysisId: string) => request<{ status: string; progress: number; jobId?: string; errorMessage?: string }>(`/api/analyses/${analysisId}/status`),
  getFreeReport: (analysisId: string) => request<{ reportFree: ReportFree }>(`/api/analyses/${analysisId}/report/free`),
  getFullReport: (analysisId: string) => request<{ reportFull: ReportFull }>(`/api/analyses/${analysisId}/report/full`),
  createPaymentIntent: (analysisId: string, promoCode?: string) => request<PaymentIntentResponse>("/api/payments/create-intent", {
    method: "POST",
    body: JSON.stringify({ analysisId, promoCode: promoCode?.trim() || undefined })
  }),
  createCheckoutSession: (analysisId: string, promoCode?: string) => request<CheckoutSessionResponse>("/api/payments/create-checkout-session", {
    method: "POST",
    body: JSON.stringify({ analysisId, promoCode: promoCode?.trim() || undefined })
  }),
  trackEvent: (name: string, properties?: Record<string, unknown>, analysisId?: string) => request<{ ok: true }>("/api/events", {
    method: "POST",
    body: JSON.stringify({ name, properties, analysisId, locale: getStoredLocale() })
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
  const params = new URLSearchParams(sessionHeaders() as Record<string, string>);
  return new EventSource(`${API_URL}/api/analyses/${analysisId}/stream?${params.toString()}`);
}

export function storeAnalysisDraft(draft: { analysisId: string; audioUploadUrl: string; photoUploadUrl: string }) {
  if (!hasWindow()) return;
  window.sessionStorage.setItem("levelup_analysis_id", draft.analysisId);
  window.sessionStorage.setItem("levelup_audio_upload_url", draft.audioUploadUrl);
  window.sessionStorage.setItem("levelup_photo_upload_url", draft.photoUploadUrl);
}

export function getAnalysisDraft() {
  if (!hasWindow()) return null;
  const analysisId = window.sessionStorage.getItem("levelup_analysis_id");
  const audioUploadUrl = window.sessionStorage.getItem("levelup_audio_upload_url");
  const photoUploadUrl = window.sessionStorage.getItem("levelup_photo_upload_url");
  if (!analysisId || !audioUploadUrl || !photoUploadUrl) return null;
  return { analysisId, audioUploadUrl, photoUploadUrl };
}

async function adminRequest<T>(path: string, init?: RequestInit): Promise<T> {
  if (!hasWindow()) throw new Error("Admin API is only available in the browser");
  const token = window.sessionStorage.getItem("levelup_admin_token") ?? "";
  const adminSession = window.sessionStorage.getItem("levelup_admin_session") ?? "";
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { "x-admin-token": token } : {}),
      ...(adminSession ? { "x-admin-session": adminSession } : {}),
      ...(init?.headers ?? {})
    }
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export const adminApi = {
  login: (password: string) => adminRequest<{ adminSession: string; expiresInSeconds: number }>("/api/admin/login", {
    method: "POST",
    body: JSON.stringify({ password })
  }),
  stats: () => adminRequest<AdminStats>("/api/admin/stats"),
  analyses: () => adminRequest<unknown[]>("/api/admin/analyses"),
  settings: () => adminRequest<AppSetting[]>("/api/admin/settings"),
  upsertSetting: (key: string, value: unknown) => adminRequest<AppSetting>(`/api/admin/settings/${encodeURIComponent(key)}`, {
    method: "PUT",
    body: JSON.stringify({ value })
  }),
  flags: () => adminRequest<FeatureFlag[]>("/api/admin/feature-flags"),
  upsertFlag: (key: string, enabled: boolean, payload?: unknown) => adminRequest<FeatureFlag>(`/api/admin/feature-flags/${encodeURIComponent(key)}`, {
    method: "PUT",
    body: JSON.stringify({ enabled, payload })
  }),
  prompts: () => adminRequest<PromptTemplate[]>("/api/admin/prompts"),
  upsertPrompt: (prompt: Omit<PromptTemplate, "id">) => adminRequest<PromptTemplate>("/api/admin/prompts", {
    method: "POST",
    body: JSON.stringify(prompt)
  }),
  promoCodes: () => adminRequest<PromoCode[]>("/api/admin/promo-codes"),
  upsertPromoCode: (promoCode: Omit<PromoCode, "id" | "redemptions" | "createdAt" | "updatedAt">) => adminRequest<PromoCode>("/api/admin/promo-codes", {
    method: "POST",
    body: JSON.stringify(promoCode)
  }),
  setPromoCodeActive: (id: string, active: boolean) => adminRequest<PromoCode>(`/api/admin/promo-codes/${encodeURIComponent(id)}/active`, {
    method: "PUT",
    body: JSON.stringify({ active })
  })
};
