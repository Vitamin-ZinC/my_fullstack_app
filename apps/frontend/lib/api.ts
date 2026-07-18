import type {
  AdminGiftDaysResponse,
  AdminStats,
  AdminUserSummary,
  AppSetting,
  AuthResult,
  AuthSessionResponse,
  CheckoutSessionResponse,
  AnalysisStatusResponse,
  FeatureFlag,
  FreeReportResponse,
  FullReportResponse,
  HabitConfigResponse,
  HabitMeResponse,
  HabitNavigatorResponse,
  HabitNotificationPreferenceSummary,
  HabitProgramResponse,
  IkigaiAnswers,
  MagicLinkRequestResponse,
  MeReportSummary,
  MeResponse,
  PaymentConfigResponse,
  PaymentIntentResponse,
  PartnerAffiliateProgramInput,
  PartnerAffiliateProgramSummary,
  PartnerCoreAdminSnapshot,
  PartnerMarketplaceResponse,
  PartnerOfferInput,
  PartnerOfferRedemptionResponse,
  PartnerOfferStatus,
  PartnerOfferSummary,
  PartnerPortalDashboard,
  PartnerPortalLedgerResponse,
  PartnerPortalOffer,
  PartnerPortalPayoutsResponse,
  PartnerPortalReferralLink,
  PartnerPortalSessionResponse,
  PartnerRedemptionSummary,
  PartnerReferralLinkSummary,
  PromoCode,
  ReportContactResponse,
  TelegramLinkTokenResponse,
  TelegramWebLoginResponse,
  TelegramStatusResponse,
  PromptTemplateInput,
  PromptTemplate
} from "@levelup/contracts";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const SESSION_ID_KEY = "levelup_session_id";
const GUEST_TOKEN_KEY = "levelup_guest_token";
const LOCALE_KEY = "levelup_locale";
const REFERRAL_CODE_KEY = "orken_referral_code";

export type TextLocale = "ru" | "en";
export type AnalysisClientMetrics = {
  voiceDurationSeconds?: number;
};
export type HandoffDoc = {
  title: string;
  file: string;
  content: string;
};
export type HandoffDocsResponse = {
  updatedAt: string;
  docs: HandoffDoc[];
};
export type FounderIntakeDecision = "TAKE_NOW" | "CLARIFY_FIRST" | "REVIEW_REQUIRED" | "REJECTED" | "ANSWER_ONLY";
export type FounderIntakeResponse = {
  id: string;
  createdAt: string;
  type: "bug" | "task" | "idea";
  title: string;
  source: string;
  decision: FounderIntakeDecision;
  priority: "NORMAL" | "URGENT";
  summary: string;
  allowedWork: string[];
  risks: string[];
  blockedReasons: string[];
  requiredChecks: string[];
  howToMakeWorkable: string[];
  clarifyingQuestions: string[];
  answer?: string;
  queueStatus: "QUEUED" | "NOT_QUEUED";
  sanitizedBody: string;
};
export type FounderIntakeBatchResponse = {
  createdAt: string;
  message: string;
  queuedCount: number;
  audits: FounderIntakeResponse[];
};
export type FounderIntakeItem = FounderIntakeResponse & {
  codexStatus: string;
  bridgeStatus: string;
  bridgeAttempts: number;
  bridgeLastError?: string | null;
  bridgeDeliveredAt?: string | null;
  bridgeRespondedAt?: string | null;
  codexReply?: string | null;
  updatedAt: string;
};
export type FounderIntakeListResponse = {
  items: FounderIntakeItem[];
};

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
    let message = text || `API ${res.status}`;
    try {
      const parsed = JSON.parse(text) as { error?: unknown; message?: unknown };
      if (typeof parsed.error === "string") message = parsed.error;
      else if (typeof parsed.message === "string") message = parsed.message;
    } catch {
      // Keep the original response text when the API did not return JSON.
    }
    throw new Error(message);
  }
  return res.json();
}

function hasWindow() {
  return typeof window !== "undefined";
}

export function getStoredLocale(): TextLocale {
  if (!hasWindow()) return "ru";
  const locale = window.localStorage.getItem(LOCALE_KEY) ?? navigator.language?.slice(0, 2) ?? "ru";
  return locale === "en" ? "en" : "ru";
}

export function setStoredLocale(locale: TextLocale) {
  if (!hasWindow()) return;
  window.localStorage.setItem(LOCALE_KEY, locale);
}

export function captureReferralFromUrl() {
  if (!hasWindow()) return null;
  const url = new URL(window.location.href);
  const raw = url.searchParams.get("ref") ?? url.searchParams.get("referralCode");
  const code = raw?.trim();
  if (!code || code.length > 120 || !/^[A-Za-z0-9._-]+$/.test(code)) return null;
  const normalized = code.toUpperCase();
  window.localStorage.setItem(REFERRAL_CODE_KEY, normalized);
  url.searchParams.delete("ref");
  url.searchParams.delete("referralCode");
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  return normalized;
}

function readStoredReferralCode() {
  if (!hasWindow()) return undefined;
  captureReferralFromUrl();
  const code = window.localStorage.getItem(REFERRAL_CODE_KEY)?.trim();
  return code || undefined;
}

function readCookie(name: string) {
  if (!hasWindow()) return undefined;
  const entry = document.cookie.split("; ").find((item) => item.startsWith(`${name}=`));
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : undefined;
}

function partnerPortalWriteHeaders(): Record<string, string> {
  const csrf = readCookie("orken_partner_csrf");
  return csrf ? { "x-partner-csrf": csrf } : {};
}

function storeSession(session: { sessionId: string; guestToken: string }) {
  if (!hasWindow()) return;
  window.sessionStorage.setItem(SESSION_ID_KEY, session.sessionId);
  window.sessionStorage.setItem(GUEST_TOKEN_KEY, session.guestToken);
  window.localStorage.setItem(SESSION_ID_KEY, session.sessionId);
  window.localStorage.setItem(GUEST_TOKEN_KEY, session.guestToken);
}

function clearSession() {
  if (!hasWindow()) return;
  window.sessionStorage.removeItem(SESSION_ID_KEY);
  window.sessionStorage.removeItem(GUEST_TOKEN_KEY);
  window.localStorage.removeItem(SESSION_ID_KEY);
  window.localStorage.removeItem(GUEST_TOKEN_KEY);
}

function sessionHeaders() {
  if (!hasWindow()) return {};
  const sessionId = window.sessionStorage.getItem(SESSION_ID_KEY) ?? window.localStorage.getItem(SESSION_ID_KEY);
  const guestToken = window.sessionStorage.getItem(GUEST_TOKEN_KEY) ?? window.localStorage.getItem(GUEST_TOKEN_KEY);
  return {
    ...(sessionId ? { "x-session-id": sessionId } : {}),
    ...(guestToken ? { "x-guest-token": guestToken } : {}),
    "x-locale": getStoredLocale()
  };
}

export async function ensureGuestSession() {
  if (!hasWindow()) throw new Error("Browser session is required");
  captureReferralFromUrl();
  const existingSessionId = window.sessionStorage.getItem(SESSION_ID_KEY) ?? window.localStorage.getItem(SESSION_ID_KEY);
  const existingGuestToken = window.sessionStorage.getItem(GUEST_TOKEN_KEY) ?? window.localStorage.getItem(GUEST_TOKEN_KEY);
  if (existingSessionId && existingGuestToken) {
    storeSession({ sessionId: existingSessionId, guestToken: existingGuestToken });
    return { sessionId: existingSessionId, guestToken: existingGuestToken };
  }

  const session = await request<{ guestToken: string; sessionId: string }>("/api/auth/guest", {
    method: "POST",
    body: JSON.stringify({ locale: getStoredLocale() })
  });
  storeSession(session);
  return session;
}

export const contentSettingKey = (locale: string) => `site_texts_${locale}`;
export const reportPriceAmountSettingKey = "report_price_amount";
export const reportPriceCurrencySettingKey = "report_price_currency";
export const habitPriceAmountSettingKey = "habit_subscription_price_amount";
export const habitPriceCurrencySettingKey = "habit_subscription_price_currency";
export const habitTrialDaysSettingKey = "habit_trial_days";
export const enabledLocalesSettingKey = "enabled_locales";
export const defaultLocaleSettingKey = "default_locale";
export const habitWeekSummaryModeSettingKey = "habit_week_summary_mode";
export const habitWeekSummaryModelSettingKey = "habit_week_summary_model";
export const habitNavigatorTemperatureSettingKey = "habit_navigator_temperature";
export const telegramRateLimitWindowMsSettingKey = "telegram_rate_limit_window_ms";
export const telegramRateLimitMaxSettingKey = "telegram_rate_limit_max";
export const telegramReminderTemplateSettingKey = "telegram_reminder_template";
export const telegramWebLoginEnabledSettingKey = "telegram_web_login_enabled";
export const telegramWelcomeTemplateSettingKey = "telegram_welcome_template";
export const telegramTodayTemplateSettingKey = "telegram_today_template";
export const habitAssistantAvatarUrlSettingKey = "habit_assistant_avatar_url";

export const contentApi = {
  get: (locale: TextLocale) => request<{ locale: TextLocale; value: unknown | null }>(`/api/content/${locale}`)
};

export const api = {
  createGuest: () => ensureGuestSession(),
  getSession: () => request<AuthSessionResponse>("/api/auth/session"),
  register: async (email: string, password: string, name?: string) => {
    await ensureGuestSession();
    const result = await request<AuthResult>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, name: name?.trim() || undefined, referralCode: readStoredReferralCode() })
    });
    storeSession(result);
    return result;
  },
  login: async (email: string, password: string) => {
    await ensureGuestSession();
    const result = await request<AuthResult>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });
    storeSession(result);
    return result;
  },
  requestMagicLink: async (email: string) => {
    await ensureGuestSession();
    return request<MagicLinkRequestResponse>("/api/auth/magic-link/request", {
      method: "POST",
      body: JSON.stringify({ email })
    });
  },
  verifyMagicLink: async (token: string) => {
    await ensureGuestSession();
    const result = await request<AuthResult>("/api/auth/magic-link/verify", {
      method: "POST",
      body: JSON.stringify({ token, referralCode: readStoredReferralCode() })
    });
    storeSession(result);
    return result;
  },
  logout: async () => {
    await request<{ ok: true }>("/api/auth/logout", { method: "POST" }).catch(() => ({ ok: true as const }));
    clearSession();
  },
  me: () => request<MeResponse>("/api/me"),
  myReports: () => request<MeReportSummary[]>("/api/me/reports"),
  habitsMe: async () => {
    await ensureGuestSession();
    return request<HabitMeResponse>("/api/habits/me");
  },
  habitConfig: () => request<HabitConfigResponse>("/api/habits/config"),
  activateHabitsFromReport: async (analysisId: string) => {
    await ensureGuestSession();
    return request<HabitProgramResponse>(`/api/habits/enroll-from-report/${encodeURIComponent(analysisId)}`, {
      method: "POST",
      body: JSON.stringify({})
    });
  },
  startHabitProgram: async (focus?: "energy" | "focus" | "career" | "rhythm") => {
    await ensureGuestSession();
    return request<HabitProgramResponse>("/api/habits/start", {
      method: "POST",
      body: JSON.stringify({ focus })
    });
  },
  startHabitProgramWithProfile: async (payload: {
    focus?: "energy" | "focus" | "career" | "rhythm";
    name?: string;
    weakZone?: string;
    reminderTime?: string;
  }) => {
    await ensureGuestSession();
    return request<HabitProgramResponse>("/api/habits/start", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  },
  saveHabitMetric: (payload: { programId: string; date?: string; energy: number; clarity: number; stability: number }) => request<HabitProgramResponse>("/api/habits/metrics", {
    method: "POST",
    body: JSON.stringify(payload)
  }),
  saveHabitCheckin: (payload: {
    programId: string;
    enrollmentId: string;
    date?: string;
    completed?: boolean;
    note?: string;
    energy?: number;
    clarity?: number;
    stability?: number;
  }) => request<HabitProgramResponse>("/api/habits/checkins", {
    method: "POST",
    body: JSON.stringify(payload)
  }),
  saveHabitInsight: (payload: { programId: string; enrollmentId?: string; text: string; source?: string }) => request<HabitProgramResponse>("/api/habits/insights", {
    method: "POST",
    body: JSON.stringify(payload)
  }),
  updateHabitDailyTaskVariant: (payload: { programId: string; taskId: string; mode: "SOFTEN" | "REPLACE" }) => request<HabitProgramResponse>("/api/habits/daily-task-variant", {
    method: "POST",
    body: JSON.stringify(payload)
  }),
  createHabitCalendarEvent: (payload: {
    programId: string;
    enrollmentId?: string;
    dailyTaskId?: string;
    startsAt?: string;
    durationMinutes?: number;
  }) => request<HabitProgramResponse>("/api/habits/calendar-events", {
    method: "POST",
    body: JSON.stringify(payload)
  }),
  updateHabitSettings: (payload: {
    programId: string;
    name?: string;
    weakZone?: string;
    reminderEnabled?: boolean;
    reminderTime?: string;
    avatar?: string;
  }) => request<HabitProgramResponse>("/api/habits/settings", {
    method: "PATCH",
    body: JSON.stringify(payload)
  }),
  uploadHabitAvatar: async (file: Blob) => {
    await ensureGuestSession();
    const res = await fetch(`${API_URL}/api/habits/avatar`, {
      method: "POST",
      credentials: "include",
      headers: {
        ...sessionHeaders(),
        "Content-Type": file.type || "application/octet-stream"
      },
      body: file
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json() as Promise<{ ok: true; url: string }>;
  },
  startHabitSubscriptionCheckout: (programId: string) => request<{ url?: string; sessionId?: string } | HabitProgramResponse>("/api/habits/subscription/checkout", {
    method: "POST",
    body: JSON.stringify({ programId })
  }),
  pauseHabitSubscription: (programId: string) => request<HabitProgramResponse>("/api/habits/subscription/pause", {
    method: "POST",
    body: JSON.stringify({ programId })
  }),
  cancelHabitSubscription: (programId: string) => request<HabitProgramResponse>("/api/habits/subscription/cancel", {
    method: "POST",
    body: JSON.stringify({ programId })
  }),
  advanceHabitWeek: (payload: { programId: string; force?: boolean }) => request<HabitProgramResponse>("/api/habits/advance", {
    method: "POST",
    body: JSON.stringify(payload)
  }),
  freezeHabitWeek: (programId: string) => request<HabitProgramResponse>("/api/habits/freeze", {
    method: "POST",
    body: JSON.stringify({ programId })
  }),
  askHabitNavigator: (payload: {
    programId?: string;
    threadId?: string;
    message: string;
    messages?: Array<{ role: "user" | "assistant"; text: string }>;
    context?: Record<string, unknown>;
  }) => request<HabitNavigatorResponse>("/api/habits/navigator", {
    method: "POST",
    body: JSON.stringify(payload)
  }),
  partnerMarketplace: async () => {
    await ensureGuestSession();
    return request<PartnerMarketplaceResponse>("/api/partners/marketplace");
  },
  redeemPartnerOffer: async (offerId: string, idempotencyKey?: string) => {
    await ensureGuestSession();
    return request<PartnerOfferRedemptionResponse>(`/api/partners/offers/${encodeURIComponent(offerId)}/redeem`, {
      method: "POST",
      body: JSON.stringify({ idempotencyKey })
    });
  },
  handoffDocs: (password: string) => request<HandoffDocsResponse>("/api/docs/handoff", {
    method: "POST",
    body: JSON.stringify({ password })
  }),
  submitFounderIntake: (payload: {
    password: string;
    type: "bug" | "task" | "idea";
    title: string;
    body: string;
    expected?: string;
    actual?: string;
    steps?: string;
    priority?: "NORMAL" | "URGENT";
    source?: string;
  }) => request<FounderIntakeBatchResponse>("/api/docs/intake", {
    method: "POST",
    body: JSON.stringify(payload)
  }),
  sendFounderChat: (payload: {
    password: string;
    message: string;
    type?: "bug" | "task" | "idea";
    priority?: "NORMAL" | "URGENT";
  }) => request<FounderIntakeBatchResponse>("/api/docs/intake", {
    method: "POST",
    body: JSON.stringify({
      password: payload.password,
      type: payload.type ?? "bug",
      title: payload.message.slice(0, 120),
      body: payload.message,
      priority: payload.priority,
      source: "founder-docs-chat"
    })
  }),
  listFounderIntake: (payload: {
    password: string;
    limit?: number;
    decision?: string;
    codexStatus?: string;
    queueStatus?: string;
  }) => request<FounderIntakeListResponse>("/api/docs/intake/list", {
    method: "POST",
    body: JSON.stringify(payload)
  }),
  updateFounderIntakeStatus: (payload: {
    password: string;
    id: string;
    codexStatus: "ACKNOWLEDGED" | "ANALYZED" | "QUEUED" | "IN_PROGRESS" | "DONE" | "BLOCKED" | "IGNORED" | "WAITING_CLARIFICATION";
    priority?: "NORMAL" | "URGENT";
    reply?: string;
    notes?: string;
  }) => request<{ ok: true; item: FounderIntakeItem }>("/api/docs/intake/status", {
    method: "POST",
    body: JSON.stringify(payload)
  }),
  telegramStatus: async (programId?: string) => {
    await ensureGuestSession();
    const query = programId ? `?programId=${encodeURIComponent(programId)}` : "";
    return request<TelegramStatusResponse>(`/api/telegram/status${query}`);
  },
  createTelegramLinkToken: async (programId?: string) => {
    await ensureGuestSession();
    return request<TelegramLinkTokenResponse>("/api/telegram/link-token", {
      method: "POST",
      body: JSON.stringify({ programId })
    });
  },
  updateTelegramPreferences: async (payload: {
    programId: string;
    telegramEnabled?: boolean;
    reminderTime?: string;
    timezone?: string;
    quietHoursStart?: string | null;
    quietHoursEnd?: string | null;
    motivationFrequency?: "off" | "daily" | "weekdays" | "weekly";
  }) => {
    await ensureGuestSession();
    return request<{ preferences: HabitNotificationPreferenceSummary }>("/api/telegram/preferences", {
      method: "PATCH",
      body: JSON.stringify(payload)
    });
  },
  verifyTelegramWebLogin: async (token: string) => {
    const result = await request<TelegramWebLoginResponse>("/api/telegram/web-login/verify", {
      method: "POST",
      body: JSON.stringify({ token })
    });
    storeSession(result);
    return result;
  },
  createAnalysis: async () => {
    await ensureGuestSession();
    return request<{ analysisId: string; audioUploadUrl: string; photoUploadUrl: string }>("/api/analyses", {
      method: "POST",
      body: JSON.stringify({ locale: getStoredLocale() })
    });
  },
  confirmAnalysis: (analysisId: string, ikigaiAnswers: IkigaiAnswers, clientMetrics?: AnalysisClientMetrics) => request<{ status: string; jobId: string }>(`/api/analyses/${analysisId}/confirm`, {
    method: "POST",
    body: JSON.stringify({ ikigaiAnswers, ...(clientMetrics ? { clientMetrics } : {}) })
  }),
  getStatus: (analysisId: string) => request<AnalysisStatusResponse>(`/api/analyses/${analysisId}/status`),
  getFreeReport: (analysisId: string) => request<FreeReportResponse>(`/api/analyses/${analysisId}/report/free`),
  getFullReport: (analysisId: string) => request<FullReportResponse>(`/api/analyses/${analysisId}/report/full`),
  saveReportContact: (analysisId: string, email: string) => request<ReportContactResponse>(`/api/analyses/${analysisId}/contact`, {
    method: "POST",
    body: JSON.stringify({ email })
  }),
  getPaymentConfig: () => request<PaymentConfigResponse>("/api/payments/config"),
  createPaymentIntent: (analysisId: string, promoCode?: string) => request<PaymentIntentResponse>("/api/payments/create-intent", {
    method: "POST",
    body: JSON.stringify({ analysisId, promoCode: promoCode?.trim() || undefined })
  }),
  createCheckoutSession: (analysisId: string, promoCode?: string) => request<CheckoutSessionResponse>("/api/payments/create-checkout-session", {
    method: "POST",
    body: JSON.stringify({ analysisId, promoCode: promoCode?.trim() || undefined })
  }),
  trackEvent: async (name: string, properties?: Record<string, unknown>, analysisId?: string) => {
    await ensureGuestSession();
    return request<{ ok: true }>("/api/events", {
      method: "POST",
      body: JSON.stringify({ name, properties, analysisId, locale: getStoredLocale() })
    });
  },
  getContent: contentApi.get
};

export const partnerPortalApi = {
  register: (payload: {
    email: string;
    password: string;
    displayName: string;
    accountName: string;
    accountType: "organization" | "individual";
    idempotencyKey: string;
  }) => request<PartnerPortalSessionResponse>("/api/partners/portal/register", {
    method: "POST",
    body: JSON.stringify(payload)
  }),
  login: (payload: { email: string; password: string }) => request<PartnerPortalSessionResponse>("/api/partners/portal/login", {
    method: "POST",
    body: JSON.stringify(payload)
  }),
  logout: () => request<{ ok: true }>("/api/partners/portal/logout", {
    method: "POST",
    headers: partnerPortalWriteHeaders(),
    body: JSON.stringify({})
  }),
  me: () => request<PartnerPortalSessionResponse>("/api/partners/portal/me"),
  dashboard: () => request<PartnerPortalDashboard>("/api/partners/portal/dashboard"),
  referralLinks: () => request<{ links: PartnerPortalReferralLink[] }>("/api/partners/portal/referral-links"),
  createReferralLink: (payload: { channel: string; idempotencyKey: string }) => request<{ link: PartnerPortalReferralLink }>("/api/partners/portal/referral-links", {
    method: "POST",
    headers: partnerPortalWriteHeaders(),
    body: JSON.stringify(payload)
  }),
  offers: () => request<{ offers: PartnerPortalOffer[] }>("/api/partners/portal/offers"),
  createOffer: (payload: {
    offer: string;
    kind: "paid_service" | "qualified_lead" | "portfolio_credit" | "reward_trial" | "manual_deal";
    surface: "rewards_tab" | "milestone_modal" | "home_module" | "admin_recommendation";
    price: string;
    cap: string;
    partnerPayoutCents: number;
    idempotencyKey: string;
  }) => request<{ offer: PartnerPortalOffer }>("/api/partners/portal/offers", {
    method: "POST",
    headers: partnerPortalWriteHeaders(),
    body: JSON.stringify(payload)
  }),
  updateOffer: (offerId: string, payload: {
    offer?: string;
    kind?: "paid_service" | "qualified_lead" | "portfolio_credit" | "reward_trial" | "manual_deal";
    surface?: "rewards_tab" | "milestone_modal" | "home_module" | "admin_recommendation";
    price?: string;
    cap?: string;
    partnerPayoutCents?: number;
    idempotencyKey: string;
  }) => request<{ offer: PartnerPortalOffer }>(`/api/partners/portal/offers/${encodeURIComponent(offerId)}`, {
    method: "PATCH",
    headers: partnerPortalWriteHeaders(),
    body: JSON.stringify(payload)
  }),
  submitOfferReview: (offerId: string, idempotencyKey: string) => request<{ offer: PartnerPortalOffer }>(`/api/partners/portal/offers/${encodeURIComponent(offerId)}/submit-review`, {
    method: "POST",
    headers: partnerPortalWriteHeaders(),
    body: JSON.stringify({ idempotencyKey })
  }),
  ledger: () => request<{ ledger: PartnerPortalLedgerResponse }>("/api/partners/portal/ledger"),
  payouts: () => request<{ payouts: PartnerPortalPayoutsResponse }>("/api/partners/portal/payouts")
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

export function restoreSessionFromUrl() {
  if (!hasWindow()) return false;
  const url = new URL(window.location.href);
  const sessionId = url.searchParams.get("x-session-id");
  const guestToken = url.searchParams.get("x-guest-token");
  if (!sessionId || !guestToken) return false;

  window.sessionStorage.setItem(SESSION_ID_KEY, sessionId);
  window.sessionStorage.setItem(GUEST_TOKEN_KEY, guestToken);
  window.localStorage.setItem(SESSION_ID_KEY, sessionId);
  window.localStorage.setItem(GUEST_TOKEN_KEY, guestToken);
  url.searchParams.delete("x-session-id");
  url.searchParams.delete("x-guest-token");
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  return true;
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
  users: (query?: { q?: string; limit?: number; offset?: number }) => {
    const params = new URLSearchParams();
    if (query?.q?.trim()) params.set("q", query.q.trim());
    if (query?.limit) params.set("limit", String(query.limit));
    if (query?.offset) params.set("offset", String(query.offset));
    return adminRequest<AdminUserSummary[]>(`/api/admin/users${params.size ? `?${params.toString()}` : ""}`);
  },
  giftUserDays: (userId: string, payload: { days: number; programId?: string; note?: string }) => adminRequest<AdminGiftDaysResponse>(`/api/admin/users/${encodeURIComponent(userId)}/gift-days`, {
    method: "POST",
    body: JSON.stringify(payload)
  }),
  settings: () => adminRequest<AppSetting[]>("/api/admin/settings"),
  upsertSetting: (key: string, value: unknown) => adminRequest<AppSetting>(`/api/admin/settings/${encodeURIComponent(key)}`, {
    method: "PUT",
    body: JSON.stringify({ value })
  }),
  uploadAssistantAvatar: async (file: Blob) => {
    if (!hasWindow()) throw new Error("Admin API is only available in the browser");
    const token = window.sessionStorage.getItem("levelup_admin_token") ?? "";
    const adminSession = window.sessionStorage.getItem("levelup_admin_session") ?? "";
    const res = await fetch(`${API_URL}/api/admin/assets/assistant-avatar`, {
      method: "POST",
      headers: {
        ...(token ? { "x-admin-token": token } : {}),
        ...(adminSession ? { "x-admin-session": adminSession } : {}),
        "Content-Type": file.type || "application/octet-stream"
      },
      body: file
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json() as Promise<{ ok: true; url: string; setting: AppSetting }>;
  },
  flags: () => adminRequest<FeatureFlag[]>("/api/admin/feature-flags"),
  upsertFlag: (key: string, enabled: boolean, payload?: unknown) => adminRequest<FeatureFlag>(`/api/admin/feature-flags/${encodeURIComponent(key)}`, {
    method: "PUT",
    body: JSON.stringify({ enabled, payload })
  }),
  prompts: () => adminRequest<PromptTemplate[]>("/api/admin/prompts"),
  promptDefaults: () => adminRequest<PromptTemplateInput[]>("/api/admin/prompts/defaults"),
  upsertPrompt: (prompt: PromptTemplateInput) => adminRequest<PromptTemplate>("/api/admin/prompts", {
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
  }),
  partnerPrograms: () => adminRequest<PartnerAffiliateProgramSummary[]>("/api/admin/partner-programs"),
  partnerCore: () => adminRequest<PartnerCoreAdminSnapshot>("/api/admin/partner-core"),
  setPartnerCorePartnerStatus: (id: string, status: "approved" | "suspended") => adminRequest<{ changed?: boolean }>(`/api/admin/partner-core/partners/${encodeURIComponent(id)}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status })
  }),
  upsertPartnerProgram: (program: PartnerAffiliateProgramInput) => adminRequest<PartnerAffiliateProgramSummary>("/api/admin/partner-programs", {
    method: "POST",
    body: JSON.stringify(program)
  }),
  createPartnerReferralLink: (programId: string, channel: string) => adminRequest<PartnerReferralLinkSummary>(`/api/admin/partner-programs/${encodeURIComponent(programId)}/referral-links`, {
    method: "POST",
    body: JSON.stringify({ channel })
  }),
  partnerOffers: () => adminRequest<PartnerOfferSummary[]>("/api/admin/partner-offers"),
  upsertPartnerOffer: (offer: PartnerOfferInput) => adminRequest<PartnerOfferSummary>("/api/admin/partner-offers", {
    method: "POST",
    body: JSON.stringify(offer)
  }),
  syncPartnerOffers: () => adminRequest<{ synced: boolean; count: number }>("/api/admin/partner-offers/sync", {
    method: "POST",
    body: JSON.stringify({})
  }),
  setPartnerOfferStatus: (id: string, status: PartnerOfferStatus) => adminRequest<PartnerOfferSummary>(`/api/admin/partner-offers/${encodeURIComponent(id)}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status })
  }),
  partnerRedemptions: () => adminRequest<PartnerRedemptionSummary[]>("/api/admin/partner-redemptions"),
  saveContent: (locale: string, value: unknown) => adminApi.upsertSetting(contentSettingKey(locale), value)
};
