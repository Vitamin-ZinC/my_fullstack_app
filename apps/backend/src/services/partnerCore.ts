import { createHash, createHmac } from "node:crypto";
import type { FastifyRequest } from "fastify";
import type {
  PartnerAffiliateProgram,
  PartnerAttribution,
  PartnerCustomerBonusType,
  PartnerEventStatus,
  PartnerEventType,
  PartnerOffer,
  PartnerOfferStatus,
  Prisma
} from "@prisma/client";
import { env } from "../env.js";
import { prisma } from "../lib/prisma.js";
import type { SessionContext } from "../lib/auth.js";
import { calculateGiftedTrialEnd } from "./adminUsers.js";
import type { PartnerCoreAdminSnapshot } from "@levelup/contracts";

type DbClient = typeof prisma | Prisma.TransactionClient;

type PartnerCoreConversionRequest = {
  programId: string;
  externalId: string;
  actor?: string;
  affiliateId?: string;
  referralCode?: string;
  customerRef?: string;
  customerEmailDomain?: string;
  ipHash?: string;
  eventType?: string;
  paymentAmountCents?: number;
  idempotencyKey: string;
};

export type PartnerCoreConversionReversalRequest = {
  programId: string;
  originalExternalId: string;
  eventType: "refund" | "chargeback" | "cancellation";
  reason: string;
  actor?: string;
  idempotencyKey: string;
};

export type PartnerCoreCustomerBonusRequest = {
  programId: string;
  externalId: string;
  customerRef: string;
  bonusType: "points" | "credits" | "entitlement" | "discount" | "trial_extension";
  bonusValue: number;
  bonusUnit: string;
  entitlementId: string;
  conversionExternalId?: string;
  actor?: string;
  idempotencyKey: string;
};

type PartnerCoreConversionResult = {
  status: PartnerEventStatus;
  partnerCorePartnerId?: string | null;
};

type PartnerCoreEventResult = {
  status: PartnerEventStatus;
};

type EmbeddedSessionResponse = {
  token: string;
  expiresAt: number;
  projectId: string;
  scopes: string[];
};

type PartnerCorePlacementStatus = "published" | "pending_review" | "draft" | "paused" | "rejected" | string;

type PartnerCorePlacement = {
  id?: string;
  projectId?: string;
  project_id?: string;
  offer?: string;
  kind?: string;
  surface?: string;
  price?: string;
  price_label?: string;
  cap?: string;
  cap_label?: string;
  partnerPayoutCents?: number;
  partner_payout_cents?: number;
  status?: PartnerCorePlacementStatus;
};

type PartnerCoreBootstrapResponse = {
  project?: Record<string, unknown> | null;
  programs?: Array<Record<string, unknown>>;
  referralLinks?: Array<Record<string, unknown>>;
  placements?: PartnerCorePlacement[];
  partners?: PartnerCoreAdminSnapshot["partners"];
  redemptions?: Array<Record<string, unknown>>;
  walletOperations?: Array<Record<string, unknown>>;
  ledgerEntries?: Array<Record<string, unknown>>;
  reviewTasks?: Array<Record<string, unknown>>;
};

export type PartnerCorePortalPartner = {
  id?: string;
  partnerId?: string;
  partnerCorePartnerId?: string;
  displayName?: string;
  display_name?: string;
  accountName?: string;
  account_name?: string;
  email?: string;
  status?: string;
};

export type PartnerCorePortalSessionResponse = {
  sessionToken: string;
  expiresAt?: string | number;
  expiresIn?: number;
  partnerCorePartnerId?: string;
  partnerId?: string;
  displayName?: string;
  accountName?: string;
  email?: string;
  status?: string;
  partner?: PartnerCorePortalPartner;
  partnerAccount?: PartnerCorePortalPartner;
};

export type PartnerCorePortalRegisterInput = {
  email: string;
  password: string;
  displayName: string;
  accountName: string;
  accountType: "organization" | "individual";
  clientRef: string;
  idempotencyKey: string;
};

export type PartnerCorePortalLoginInput = {
  email: string;
  password: string;
  clientRef: string;
};

type PartnerCoreServiceCredentials = {
  keyId: string;
  secret: string;
};

const ORKEN_POINTS = "orken_points";

function safeJson(value: unknown) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function signServiceRequest(input: { method: string; path: string; timestamp: string; body: string; secret: string }) {
  const bodyHash = createHash("sha256").update(input.body).digest("hex");
  return createHmac("sha256", input.secret)
    .update([input.method.toUpperCase(), input.path, input.timestamp, bodyHash].join("\n"))
    .digest("base64url");
}

export class PartnerCoreServiceClient {
  private readonly baseUrl: URL;

  constructor(
    private readonly config: {
      baseUrl: string;
      keyId: string;
      secret: string;
      fetchImpl?: typeof fetch;
      now?: () => Date;
    }
  ) {
    this.baseUrl = new URL(config.baseUrl);
  }

  createEmbeddedSession(input: { projectId: string; actor: string; origin: string; ttlSeconds?: number }) {
    return this.request<EmbeddedSessionResponse>("POST", "/api/embedded-sessions", input);
  }

  recordConversion(input: PartnerCoreConversionRequest) {
    const { idempotencyKey, ...body } = input;
    return this.request("POST", "/api/events/conversions", body, { "Idempotency-Key": idempotencyKey });
  }

  reverseConversion(input: PartnerCoreConversionReversalRequest) {
    const { idempotencyKey, ...body } = input;
    return this.request("POST", "/api/events/conversion-reversals", body, { "Idempotency-Key": idempotencyKey });
  }

  recordCustomerBonus(input: PartnerCoreCustomerBonusRequest) {
    const { idempotencyKey, ...body } = input;
    return this.request("POST", "/api/events/customer-bonuses", body, { "Idempotency-Key": idempotencyKey });
  }

  createReferralLink(input: { channel: string; programId: string; actor?: string; projectId?: string; idempotencyKey: string }) {
    const { idempotencyKey, ...body } = input;
    return this.request("POST", "/api/referral-links", body, { "Idempotency-Key": idempotencyKey });
  }

  async embeddedBootstrap(actor: string) {
    const session = await this.createEmbeddedSession({
      projectId: env.PARTNER_CORE_PROJECT_ID,
      actor,
      origin: partnerCoreEmbedOrigin(),
      ttlSeconds: 300
    });
    return this.publicRequest<PartnerCoreBootstrapResponse>("GET", "/api/embedded/bootstrap", undefined, {
      Authorization: `Bearer ${session.token}`,
      "x-embed-origin": partnerCoreEmbedOrigin()
    });
  }

  async updateEmbeddedPartnerStatus(input: { actor: string; partnerAccountId: string; status: "approved" | "suspended" }) {
    const session = await this.createEmbeddedSession({
      projectId: env.PARTNER_CORE_PROJECT_ID,
      actor: input.actor,
      origin: partnerCoreEmbedOrigin(),
      ttlSeconds: 300
    });
    return this.publicRequest<{ partner?: PartnerCoreAdminSnapshot["partners"][number]; changed?: boolean }>(
      "POST",
      `/api/embedded/partners/${encodeURIComponent(input.partnerAccountId)}/status`,
      { status: input.status },
      {
        Authorization: `Bearer ${session.token}`,
        "x-embed-origin": partnerCoreEmbedOrigin()
      }
    );
  }

  async createRewardPlacement(input: {
    actor: string;
    offer: string;
    kind: string;
    surface: string;
    price: string;
    cap: string;
    partnerPayoutCents?: number;
    idempotencyKey: string;
  }) {
    const session = await this.createEmbeddedSession({
      projectId: env.PARTNER_CORE_PROJECT_ID,
      actor: input.actor,
      origin: partnerCoreEmbedOrigin(),
      ttlSeconds: 300
    });
    return this.publicRequest<{ placement?: PartnerCorePlacement }>("POST", "/api/embedded/placements", {
      offer: input.offer,
      kind: input.kind,
      surface: input.surface,
      price: input.price,
      cap: input.cap,
      partnerPayoutCents: input.partnerPayoutCents
    }, {
      Authorization: `Bearer ${session.token}`,
      "x-embed-origin": partnerCoreEmbedOrigin(),
      "Idempotency-Key": input.idempotencyKey
    });
  }

  async createAffiliateProgram(input: {
    actor: string;
    name: string;
    url: string;
    commissionModel: "fixed" | "percent";
    commissionRateBps?: number | null;
    payoutCents?: number | null;
    customerBenefit?: string | null;
    commissionWindow?: string | null;
    lockDays?: number | null;
    idempotencyKey: string;
  }) {
    const session = await this.createEmbeddedSession({
      projectId: env.PARTNER_CORE_PROJECT_ID,
      actor: input.actor,
      origin: partnerCoreEmbedOrigin(),
      ttlSeconds: 300
    });
    return this.publicRequest<{ program?: { id?: string; status?: string } }>("POST", "/api/embedded/programs", {
      name: input.name,
      url: input.url,
      commissionModel: input.commissionModel,
      commissionRateBps: input.commissionRateBps ?? undefined,
      payoutCents: input.payoutCents ?? undefined,
      customerBenefit: input.customerBenefit ?? undefined,
      commissionWindow: input.commissionWindow ?? undefined,
      lockDays: input.lockDays ?? undefined
    }, {
      Authorization: `Bearer ${session.token}`,
      "x-embed-origin": partnerCoreEmbedOrigin(),
      "Idempotency-Key": input.idempotencyKey
    });
  }

  async submitPlacementReview(input: { actor: string; placementId: string; idempotencyKey: string }) {
    const session = await this.createEmbeddedSession({
      projectId: env.PARTNER_CORE_PROJECT_ID,
      actor: input.actor,
      origin: partnerCoreEmbedOrigin(),
      ttlSeconds: 300
    });
    return this.publicRequest<{ placement?: PartnerCorePlacement }>(
      "POST",
      `/api/embedded/placements/${encodeURIComponent(input.placementId)}/submit-review`,
      {},
      {
        Authorization: `Bearer ${session.token}`,
        "x-embed-origin": partnerCoreEmbedOrigin(),
        "Idempotency-Key": input.idempotencyKey
      }
    );
  }

  advancePlacementStatus(placementId: string, input: { actor: string; status: "draft" | "paused"; reviewerComment?: string }) {
    return this.request("POST", `/api/placements/${encodeURIComponent(placementId)}/advance-status`, input);
  }

  async redeemReward(input: {
    placementId: string;
    userRef: string;
    actor: string;
    idempotencyKey: string;
  }) {
    const session = await this.createEmbeddedSession({
      projectId: env.PARTNER_CORE_PROJECT_ID,
      actor: input.actor,
      origin: partnerCoreEmbedOrigin(),
      ttlSeconds: 300
    });
    return this.publicRequest("POST", "/api/rewards/redeem", {
      placementId: input.placementId,
      userRef: input.userRef
    }, {
      Authorization: `Bearer ${session.token}`,
      "x-embed-origin": partnerCoreEmbedOrigin(),
      "Idempotency-Key": input.idempotencyKey
    });
  }

  registerPartnerPortal(input: PartnerCorePortalRegisterInput) {
    const { idempotencyKey, ...body } = input;
    return this.request<PartnerCorePortalSessionResponse>("POST", partnerPortalPath("register"), body, {
      "Idempotency-Key": idempotencyKey
    });
  }

  loginPartnerPortal(input: PartnerCorePortalLoginInput) {
    return this.request<PartnerCorePortalSessionResponse>("POST", partnerPortalPath("login"), input);
  }

  getPartnerPortalMe(sessionToken: string) {
    return this.request<unknown>("GET", partnerPortalPath("me"), undefined, portalAuthorization(sessionToken));
  }

  getPartnerPortalDashboard(sessionToken: string) {
    return this.request<unknown>("GET", partnerPortalPath("dashboard"), undefined, portalAuthorization(sessionToken));
  }

  getPartnerPortalLedger(sessionToken: string) {
    return this.request<unknown>("GET", partnerPortalPath("ledger"), undefined, portalAuthorization(sessionToken));
  }

  getPartnerPortalPayouts(sessionToken: string) {
    return this.request<unknown>("GET", partnerPortalPath("payouts"), undefined, portalAuthorization(sessionToken));
  }

  createPartnerPortalReferralLink(input: { sessionToken: string; channel: string; idempotencyKey: string }) {
    return this.request<unknown>("POST", partnerPortalPath("referral-links"), { channel: input.channel }, {
      ...portalAuthorization(input.sessionToken),
      "Idempotency-Key": input.idempotencyKey
    });
  }

  createPartnerPortalOffer(input: {
    sessionToken: string;
    offer: string;
    kind: string;
    surface: string;
    price: string;
    cap: string;
    partnerPayoutCents: number;
    idempotencyKey: string;
  }) {
    const { sessionToken, idempotencyKey, ...body } = input;
    return this.request<unknown>("POST", partnerPortalPath("offers"), body, {
      ...portalAuthorization(sessionToken),
      "Idempotency-Key": idempotencyKey
    });
  }

  updatePartnerPortalOffer(input: {
    sessionToken: string;
    offerId: string;
    offer?: string;
    kind?: string;
    surface?: string;
    price?: string;
    cap?: string;
    partnerPayoutCents?: number;
    idempotencyKey: string;
  }) {
    const { sessionToken, offerId, idempotencyKey, ...body } = input;
    return this.request<unknown>("PATCH", partnerPortalPath(`offers/${encodeURIComponent(offerId)}`), body, {
      ...portalAuthorization(sessionToken),
      "Idempotency-Key": idempotencyKey
    });
  }

  submitPartnerPortalOfferReview(input: { sessionToken: string; offerId: string; idempotencyKey: string }) {
    return this.request<unknown>("POST", partnerPortalPath(`offers/${encodeURIComponent(input.offerId)}/submit-review`), {}, {
      ...portalAuthorization(input.sessionToken),
      "Idempotency-Key": input.idempotencyKey
    });
  }

  logoutPartnerPortal(sessionToken: string) {
    return this.request<unknown>("POST", partnerPortalPath("logout"), {}, portalAuthorization(sessionToken));
  }

  private async publicRequest<T = unknown>(method: "GET" | "POST", path: string, body?: unknown, headers: Record<string, string> = {}) {
    const rawBody = body === undefined ? "" : JSON.stringify(body);
    const url = new URL(path, this.baseUrl);
    const response = await (this.config.fetchImpl ?? fetch)(url.toString(), {
      method,
      headers: {
        ...(rawBody ? { "content-type": "application/json" } : {}),
        ...headers
      },
      body: rawBody || undefined
    });
    const payload = await readJsonResponse(response);
    if (!response.ok) {
      throw new PartnerCoreServiceError(response.status, payload);
    }
    return payload as T;
  }

  private async request<T = unknown>(method: "GET" | "POST" | "PATCH", path: string, body?: unknown, headers: Record<string, string> = {}) {
    const rawBody = body === undefined ? "" : JSON.stringify(body);
    const timestamp = String(Math.floor((this.config.now?.() ?? new Date()).getTime() / 1000));
    const url = new URL(path, this.baseUrl);
    const signaturePath = `${url.pathname}${url.search}`;
    const response = await (this.config.fetchImpl ?? fetch)(url.toString(), {
      method,
      headers: {
        ...(rawBody ? { "content-type": "application/json" } : {}),
        ...headers,
        "x-partner-core-key-id": this.config.keyId,
        "x-partner-core-timestamp": timestamp,
        "x-partner-core-signature": signServiceRequest({
          method,
          path: signaturePath,
          timestamp,
          body: rawBody,
          secret: this.config.secret
        })
      },
      body: rawBody || undefined
    });
    const payload = await readJsonResponse(response);
    if (!response.ok) {
      throw new PartnerCoreServiceError(response.status, payload);
    }
    return payload as T;
  }
}

export class PartnerCoreServiceError extends Error {
  constructor(readonly status: number, readonly payload: unknown) {
    super(`Partner Core request failed with HTTP ${status}`);
    this.name = "PartnerCoreServiceError";
  }
}

async function readJsonResponse(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function partnerCoreClient() {
  const credentials = partnerCoreCredentials();
  if (!env.PARTNER_CORE_URL || !credentials) return null;
  return new PartnerCoreServiceClient({
    baseUrl: env.PARTNER_CORE_URL,
    keyId: credentials.keyId,
    secret: credentials.secret
  });
}

export function isPartnerCoreConfigured() {
  return Boolean(partnerCoreClient());
}

export async function getPartnerCoreAdminSnapshot(actor = "orken-admin"): Promise<PartnerCoreAdminSnapshot> {
  const client = partnerCoreClient();
  if (!client) return emptyPartnerCoreAdminSnapshot(false);
  const snapshot = await client.embeddedBootstrap(actor);
  return {
    configured: true,
    project: safeJson(snapshot.project ?? null),
    programs: safeJson(snapshot.programs ?? []),
    referralLinks: safeJson(snapshot.referralLinks ?? []),
    placements: safeJson(snapshot.placements ?? []),
    partners: safeJson(snapshot.partners ?? []),
    redemptions: safeJson(snapshot.redemptions ?? []),
    walletOperations: safeJson(snapshot.walletOperations ?? []),
    ledgerEntries: safeJson(snapshot.ledgerEntries ?? []),
    reviewTasks: safeJson(snapshot.reviewTasks ?? [])
  };
}

export async function updatePartnerCoreAdminPartnerStatus(input: { partnerAccountId: string; status: "approved" | "suspended"; actor?: string }) {
  return requirePartnerCoreClient().updateEmbeddedPartnerStatus({
    actor: input.actor ?? "orken-admin",
    partnerAccountId: input.partnerAccountId,
    status: input.status
  });
}

function emptyPartnerCoreAdminSnapshot(configured: boolean): PartnerCoreAdminSnapshot {
  return {
    configured,
    project: null,
    programs: [],
    referralLinks: [],
    placements: [],
    partners: [],
    redemptions: [],
    walletOperations: [],
    ledgerEntries: [],
    reviewTasks: []
  };
}

function requirePartnerCoreClient() {
  const client = partnerCoreClient();
  if (!client) throw new Error("Partner Core is not configured");
  return client;
}

export function reversePartnerCoreConversion(input: PartnerCoreConversionReversalRequest) {
  return requirePartnerCoreClient().reverseConversion(input);
}

export function recordPartnerCoreCustomerBonus(input: PartnerCoreCustomerBonusRequest) {
  return requirePartnerCoreClient().recordCustomerBonus(input);
}

export function registerPartnerCorePortal(input: PartnerCorePortalRegisterInput) {
  return requirePartnerCoreClient().registerPartnerPortal(input);
}

export function loginPartnerCorePortal(input: PartnerCorePortalLoginInput) {
  return requirePartnerCoreClient().loginPartnerPortal(input);
}

export function getPartnerCorePortalMe(sessionToken: string) {
  return requirePartnerCoreClient().getPartnerPortalMe(sessionToken);
}

export function getPartnerCorePortalDashboard(sessionToken: string) {
  return requirePartnerCoreClient().getPartnerPortalDashboard(sessionToken);
}

export function getPartnerCorePortalLedger(sessionToken: string) {
  return requirePartnerCoreClient().getPartnerPortalLedger(sessionToken);
}

export function getPartnerCorePortalPayouts(sessionToken: string) {
  return requirePartnerCoreClient().getPartnerPortalPayouts(sessionToken);
}

export function createPartnerCorePortalReferralLink(input: { sessionToken: string; channel: string; idempotencyKey: string }) {
  return requirePartnerCoreClient().createPartnerPortalReferralLink(input);
}

export function createPartnerCorePortalOffer(input: {
  sessionToken: string;
  offer: string;
  kind: string;
  surface: string;
  price: string;
  cap: string;
  partnerPayoutCents: number;
  idempotencyKey: string;
}) {
  return requirePartnerCoreClient().createPartnerPortalOffer(input);
}

export function updatePartnerCorePortalOffer(input: {
  sessionToken: string;
  offerId: string;
  offer?: string;
  kind?: string;
  surface?: string;
  price?: string;
  cap?: string;
  partnerPayoutCents?: number;
  idempotencyKey: string;
}) {
  return requirePartnerCoreClient().updatePartnerPortalOffer(input);
}

export function submitPartnerCorePortalOfferReview(input: { sessionToken: string; offerId: string; idempotencyKey: string }) {
  return requirePartnerCoreClient().submitPartnerPortalOfferReview(input);
}

export function logoutPartnerCorePortal(sessionToken: string) {
  return requirePartnerCoreClient().logoutPartnerPortal(sessionToken);
}

function partnerCoreEmbedOrigin() {
  return env.PARTNER_CORE_EMBED_ORIGIN ?? env.APP_ORIGIN;
}

function partnerPortalPath(suffix: string) {
  return `/api/projects/${encodeURIComponent(env.PARTNER_CORE_PROJECT_ID)}/partner/${suffix}`;
}

function portalAuthorization(sessionToken: string) {
  return { Authorization: `Bearer ${sessionToken}` };
}

function partnerCoreCredentials(): PartnerCoreServiceCredentials | null {
  const jsonCredentials = parsePartnerCoreServiceKeys(env.PARTNER_CORE_SERVICE_KEYS_JSON);
  if (jsonCredentials) return jsonCredentials;
  if (!env.PARTNER_CORE_KEY_ID || !env.PARTNER_CORE_SERVICE_SECRET) return null;
  return { keyId: env.PARTNER_CORE_KEY_ID, secret: env.PARTNER_CORE_SERVICE_SECRET };
}

function parsePartnerCoreServiceKeys(raw: string | undefined): PartnerCoreServiceCredentials | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    const entries = Array.isArray(parsed)
      ? parsed
      : isRecord(parsed) && Array.isArray(parsed.keys)
        ? parsed.keys
        : isRecord(parsed) && (typeof parsed.keyId === "string" || typeof parsed.id === "string")
          ? [parsed]
          : isRecord(parsed)
            ? Object.values(parsed)
            : [];
    for (const entry of entries) {
      if (!isRecord(entry)) continue;
      const keyId = readString(entry.keyId) ?? readString(entry.id);
      const secret = readString(entry.secret) ?? readString(entry.serviceSecret);
      const scopes = Array.isArray(entry.scopes) ? entry.scopes.filter((value): value is string => typeof value === "string") : [];
      const projectIds = Array.isArray(entry.projectIds) ? entry.projectIds.filter((value): value is string => typeof value === "string") : [];
      const hasRequiredScopes = scopes.length === 0 || ["sessions:write", "partners:read", "partners:write", "events:write"].every((scope) => scopes.includes(scope));
      const hasOrkenProject = projectIds.length === 0 || projectIds.includes(env.PARTNER_CORE_PROJECT_ID) || projectIds.includes("orken");
      if (keyId && secret && hasRequiredScopes && hasOrkenProject) return { keyId, secret };
    }
  } catch {
    return null;
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function extractPartnerCorePartnerId(value: unknown) {
  if (!isRecord(value)) return null;
  const partner = isRecord(value.partner) ? value.partner : isRecord(value.partnerAccount) ? value.partnerAccount : value;
  return readString(partner.partnerCorePartnerId) ?? readString(partner.partnerId) ?? readString(partner.partner_account_id) ?? readString(partner.id);
}

function privacySecret() {
  return env.PARTNER_CORE_PRIVACY_SECRET ?? partnerCoreCredentials()?.secret ?? env.JWT_ACCESS_SECRET;
}

export function normalizeReferralCode(value: unknown) {
  if (typeof value !== "string") return null;
  const code = value.trim().toUpperCase();
  if (!code || code.length > 120 || !/^[A-Z0-9._-]+$/.test(code)) return null;
  return code;
}

function hmacHex(scope: string, value: string) {
  return createHmac("sha256", privacySecret()).update(`${scope}:${value}`).digest("hex");
}

function hashSubject(value: string) {
  return `orken_${hmacHex("subject", value).slice(0, 40)}`;
}

function hmacIp(ip: string | undefined) {
  if (!ip) return undefined;
  return hmacHex("ip", ip);
}

function emailDomain(email: string | null | undefined) {
  const domain = email?.split("@")[1]?.trim().toLowerCase();
  return domain || undefined;
}

function coreStatusToLocal(status: PartnerCorePlacementStatus | null | undefined): PartnerOfferStatus {
  const normalized = String(status ?? "").toLowerCase();
  if (normalized === "published") return "APPROVED";
  if (normalized === "pending_review") return "PENDING_REVIEW";
  if (normalized === "paused") return "PAUSED";
  if (normalized === "rejected" || normalized === "changes_requested") return "REJECTED";
  return "DRAFT";
}

function localStatusToCore(status: PartnerOfferStatus): "draft" | "paused" | null {
  if (status === "DRAFT") return "draft";
  if (status === "PAUSED") return "paused";
  return null;
}

function numberFromLabel(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value !== "string") return null;
  const match = value.replace(/\s+/g, "").match(/\d+/);
  return match ? Number(match[0]) : null;
}

function corePlacementId(value: PartnerCorePlacement | null | undefined) {
  return typeof value?.id === "string" && value.id.trim() ? value.id.trim() : null;
}

function corePlacementData(placement: PartnerCorePlacement) {
  const partnerPayoutCents = Number(placement.partnerPayoutCents ?? placement.partner_payout_cents ?? 0);
  const status = coreStatusToLocal(placement.status);
  return {
    partnerCorePlacementId: corePlacementId(placement),
    partnerCoreStatus: typeof placement.status === "string" ? placement.status : null,
    partnerCoreSyncedAt: new Date(),
    kind: typeof placement.kind === "string" && placement.kind ? placement.kind : "manual_deal",
    surface: typeof placement.surface === "string" && placement.surface ? placement.surface : "rewards_tab",
    title: typeof placement.offer === "string" && placement.offer.trim() ? placement.offer.trim() : "Partner reward",
    redemptionCurrency: ORKEN_POINTS,
    redemptionAmount: numberFromLabel(placement.price ?? placement.price_label) ?? 500,
    partnerPayoutCents: Number.isFinite(partnerPayoutCents) ? partnerPayoutCents : 0,
    capPerMonth: numberFromLabel(placement.cap ?? placement.cap_label),
    status
  };
}

export async function getActivePartnerProgram(client: DbClient = prisma) {
  return client.partnerAffiliateProgram.findFirst({
    where: { status: "ACTIVE" },
    orderBy: { updatedAt: "desc" }
  });
}

export async function ensurePartnerCoreAffiliateProgram(programId: string, actor = "orken-admin") {
  const program = await prisma.partnerAffiliateProgram.findUnique({ where: { id: programId } });
  if (!program || program.partnerCoreProgramId) return program;
  const client = partnerCoreClient();
  if (!client) return program;

  const commissionWindow = program.commissionWindowType === "MONTHS"
    ? `${program.commissionWindowMonths ?? 1} months`
    : program.commissionWindowType.toLowerCase();
  const customerBenefit = program.customerBonusType === "NONE"
    ? "No customer bonus"
    : `${program.customerBonusType}:${program.customerBonusValue ?? ""}${program.customerBonusEntitlement ? `:${program.customerBonusEntitlement}` : ""}`;
  const response = await client.createAffiliateProgram({
    actor,
    name: program.name,
    url: program.referralDestination,
    commissionModel: program.commissionModel === "FIXED" ? "fixed" : "percent",
    commissionRateBps: program.commissionRateBps,
    payoutCents: program.fixedPayoutCents,
    customerBenefit,
    commissionWindow,
    lockDays: program.lockDays,
    idempotencyKey: `program:${env.PARTNER_CORE_PROJECT_ID}:${program.id}`
  });
  const coreProgramId = response.program?.id;
  if (!coreProgramId) return program;
  return prisma.partnerAffiliateProgram.update({
    where: { id: program.id },
    data: { partnerCoreProgramId: coreProgramId }
  });
}

export async function handleReferralSignup(input: {
  userId: string;
  email: string;
  referralCode?: string | null;
  request?: FastifyRequest;
}) {
  const referralCode = normalizeReferralCode(input.referralCode);
  if (!referralCode) return null;

  const activeProgram = await getActivePartnerProgram();
  if (!activeProgram) return null;

  const existing = await prisma.partnerAttribution.findUnique({ where: { userId: input.userId } });
  if (existing) return existing;

  const attribution = await prisma.partnerAttribution.create({
    data: {
      userId: input.userId,
      programConfigId: activeProgram.id,
      partnerCoreProgramId: activeProgram.partnerCoreProgramId,
      referralCode,
      customerBonusType: activeProgram.customerBonusType,
      customerBonusValue: activeProgram.customerBonusValue,
      customerBonusEntitlement: activeProgram.customerBonusEntitlement,
      bonusStatus: activeProgram.customerBonusType === "NONE" ? "NOT_APPLICABLE" : "PENDING"
    }
  });

  await applyPendingReferralBonus(input.userId).catch(async (error) => {
    await prisma.partnerAttribution.update({
      where: { id: attribution.id },
      data: { bonusStatus: "FAILED" }
    }).catch(() => undefined);
    await prisma.analyticsEvent.create({
      data: {
        name: "partner_referral_bonus_failed",
        locale: "ru",
        userId: input.userId,
        properties: { attributionId: attribution.id, error: error instanceof Error ? error.message : String(error) }
      }
    }).catch(() => undefined);
  });

  const signup = await recordSignupConversion({
    userId: input.userId,
    email: input.email,
    referralCode,
    activeProgram,
    ip: input.request?.ip
  });

  const updatedAttribution = await prisma.partnerAttribution.update({
    where: { id: attribution.id },
    data: {
      signupEventStatus: signup.status,
      ...(signup.partnerCorePartnerId ? { partnerCorePartnerId: signup.partnerCorePartnerId } : {})
    }
  }).catch(() => undefined);

  return updatedAttribution ?? attribution;
}

async function recordSignupConversion(input: {
  userId: string;
  email: string;
  referralCode: string;
  activeProgram: PartnerAffiliateProgram;
  ip?: string;
}) {
  const payload: PartnerCoreConversionRequest = {
    programId: input.activeProgram.partnerCoreProgramId ?? env.PARTNER_CORE_DEFAULT_PROGRAM_ID,
    eventType: "signup",
    externalId: `signup:${input.userId}`,
    referralCode: input.referralCode,
    customerRef: hashSubject(input.userId),
    customerEmailDomain: emailDomain(input.email),
    ipHash: hmacIp(input.ip),
    idempotencyKey: `orken:signup:${input.userId}`
  };
  return recordPartnerConversionEvent({
    type: "SIGNUP",
    programConfigId: input.activeProgram.id,
    userId: input.userId,
    externalId: payload.externalId,
    payload
  });
}

async function recordPartnerConversionEvent(input: {
  type: PartnerEventType;
  programConfigId?: string | null;
  userId?: string | null;
  paymentId?: string | null;
  externalId: string;
  payload: PartnerCoreConversionRequest;
}): Promise<PartnerCoreConversionResult> {
  const existing = await prisma.partnerEvent.findUnique({ where: { idempotencyKey: input.payload.idempotencyKey } });
  if (existing?.status === "SUCCEEDED" || existing?.status === "SKIPPED") {
    return {
      status: existing.status as PartnerEventStatus,
      partnerCorePartnerId: extractPartnerCorePartnerId(existing.response)
    };
  }

  await prisma.partnerEvent.upsert({
    where: { idempotencyKey: input.payload.idempotencyKey },
    update: {
      request: safeJson(input.payload) as Prisma.InputJsonValue,
      externalId: input.externalId,
      status: "PENDING",
      error: null
    },
    create: {
      type: input.type,
      idempotencyKey: input.payload.idempotencyKey,
      programConfigId: input.programConfigId ?? null,
      userId: input.userId ?? null,
      paymentId: input.paymentId ?? null,
      externalId: input.externalId,
      request: safeJson(input.payload) as Prisma.InputJsonValue
    }
  });

  const client = partnerCoreClient();
  if (!client || !input.payload.programId) {
    await prisma.partnerEvent.update({
      where: { idempotencyKey: input.payload.idempotencyKey },
      data: {
        status: "SKIPPED",
        error: client ? "Partner Core program id is missing" : "Partner Core is not configured"
      }
    });
    return { status: "SKIPPED" satisfies PartnerEventStatus };
  }

  try {
    const response = await client.recordConversion(input.payload);
    await prisma.partnerEvent.update({
      where: { idempotencyKey: input.payload.idempotencyKey },
      data: {
        status: "SUCCEEDED",
        response: safeJson(response) as Prisma.InputJsonValue,
        error: null,
        attempts: { increment: 1 }
      }
    });
    return {
      status: "SUCCEEDED" satisfies PartnerEventStatus,
      partnerCorePartnerId: extractPartnerCorePartnerId(response)
    };
  } catch (error) {
    await prisma.partnerEvent.update({
      where: { idempotencyKey: input.payload.idempotencyKey },
      data: {
        status: "FAILED",
        error: error instanceof Error ? error.message : String(error),
        response: error instanceof PartnerCoreServiceError ? safeJson(error.payload) as Prisma.InputJsonValue : undefined,
        attempts: { increment: 1 }
      }
    });
    return { status: "FAILED" satisfies PartnerEventStatus };
  }
}

async function recordPartnerCustomerBonusEvent(input: {
  attribution: Pick<PartnerAttribution, "id" | "userId" | "programConfigId" | "partnerCoreProgramId">;
  program?: Pick<PartnerAffiliateProgram, "id" | "partnerCoreProgramId"> | null;
  bonusType: PartnerCoreCustomerBonusRequest["bonusType"];
  bonusValue: number;
  bonusUnit: string;
  entitlementId: string;
  conversionExternalId?: string;
}): Promise<PartnerCoreEventResult> {
  const programId = input.attribution.partnerCoreProgramId ?? input.program?.partnerCoreProgramId ?? env.PARTNER_CORE_DEFAULT_PROGRAM_ID;
  const payload: PartnerCoreCustomerBonusRequest = {
    programId,
    externalId: `bonus:${input.attribution.id}`,
    customerRef: hashSubject(input.attribution.userId),
    bonusType: input.bonusType,
    bonusValue: input.bonusValue,
    bonusUnit: input.bonusUnit,
    entitlementId: input.entitlementId,
    conversionExternalId: input.conversionExternalId ?? `signup:${input.attribution.userId}`,
    actor: "Orken bonus worker",
    idempotencyKey: `orken:bonus:${input.attribution.id}`
  };

  const existing = await prisma.partnerEvent.findUnique({ where: { idempotencyKey: payload.idempotencyKey } });
  if (existing?.status === "SUCCEEDED" || existing?.status === "SKIPPED") {
    return { status: existing.status as PartnerEventStatus };
  }

  await prisma.partnerEvent.upsert({
    where: { idempotencyKey: payload.idempotencyKey },
    update: {
      request: safeJson(payload) as Prisma.InputJsonValue,
      externalId: payload.externalId,
      status: "PENDING",
      error: null
    },
    create: {
      type: "CUSTOMER_BONUS",
      idempotencyKey: payload.idempotencyKey,
      programConfigId: input.program?.id ?? input.attribution.programConfigId ?? null,
      userId: input.attribution.userId,
      externalId: payload.externalId,
      request: safeJson(payload) as Prisma.InputJsonValue
    }
  });

  const client = partnerCoreClient();
  if (!client || !payload.programId) {
    await prisma.partnerEvent.update({
      where: { idempotencyKey: payload.idempotencyKey },
      data: {
        status: "SKIPPED",
        error: client ? "Partner Core program id is missing" : "Partner Core is not configured"
      }
    });
    return { status: "SKIPPED" };
  }

  try {
    const response = await client.recordCustomerBonus(payload);
    await prisma.partnerEvent.update({
      where: { idempotencyKey: payload.idempotencyKey },
      data: {
        status: "SUCCEEDED",
        response: safeJson(response) as Prisma.InputJsonValue,
        error: null,
        attempts: { increment: 1 }
      }
    });
    return { status: "SUCCEEDED" };
  } catch (error) {
    await prisma.partnerEvent.update({
      where: { idempotencyKey: payload.idempotencyKey },
      data: {
        status: "FAILED",
        error: error instanceof Error ? error.message : String(error),
        response: error instanceof PartnerCoreServiceError ? safeJson(error.payload) as Prisma.InputJsonValue : undefined,
        attempts: { increment: 1 }
      }
    });
    return { status: "FAILED" };
  }
}

async function recordPartnerConversionReversalEvent(input: {
  programConfigId?: string | null;
  userId?: string | null;
  paymentId?: string | null;
  payload: PartnerCoreConversionReversalRequest;
}): Promise<PartnerCoreEventResult> {
  const existing = await prisma.partnerEvent.findUnique({ where: { idempotencyKey: input.payload.idempotencyKey } });
  if (existing?.status === "SUCCEEDED" || existing?.status === "SKIPPED") {
    return { status: existing.status as PartnerEventStatus };
  }

  await prisma.partnerEvent.upsert({
    where: { idempotencyKey: input.payload.idempotencyKey },
    update: {
      request: safeJson(input.payload) as Prisma.InputJsonValue,
      externalId: input.payload.originalExternalId,
      status: "PENDING",
      error: null
    },
    create: {
      type: "REFUND",
      idempotencyKey: input.payload.idempotencyKey,
      programConfigId: input.programConfigId ?? null,
      userId: input.userId ?? null,
      paymentId: input.paymentId ?? null,
      externalId: input.payload.originalExternalId,
      request: safeJson(input.payload) as Prisma.InputJsonValue
    }
  });

  const client = partnerCoreClient();
  if (!client || !input.payload.programId) {
    await prisma.partnerEvent.update({
      where: { idempotencyKey: input.payload.idempotencyKey },
      data: {
        status: "SKIPPED",
        error: client ? "Partner Core program id is missing" : "Partner Core is not configured"
      }
    });
    return { status: "SKIPPED" };
  }

  try {
    const response = await client.reverseConversion(input.payload);
    await prisma.partnerEvent.update({
      where: { idempotencyKey: input.payload.idempotencyKey },
      data: {
        status: "SUCCEEDED",
        response: safeJson(response) as Prisma.InputJsonValue,
        error: null,
        attempts: { increment: 1 }
      }
    });
    return { status: "SUCCEEDED" };
  } catch (error) {
    await prisma.partnerEvent.update({
      where: { idempotencyKey: input.payload.idempotencyKey },
      data: {
        status: "FAILED",
        error: error instanceof Error ? error.message : String(error),
        response: error instanceof PartnerCoreServiceError ? safeJson(error.payload) as Prisma.InputJsonValue : undefined,
        attempts: { increment: 1 }
      }
    });
    return { status: "FAILED" };
  }
}

export async function applyPendingReferralBonus(userId: string, programId?: string) {
  const attribution = await prisma.partnerAttribution.findFirst({
    where: { userId, bonusStatus: "PENDING" },
    orderBy: { createdAt: "asc" }
  });
  if (!attribution) return null;

  const now = new Date();
  if (attribution.customerBonusType === "NONE") {
    return prisma.partnerAttribution.update({
      where: { id: attribution.id },
      data: { bonusStatus: "NOT_APPLICABLE" }
    });
  }

  if (attribution.customerBonusType === "FREE_DAYS") {
    const days = attribution.customerBonusValue ?? 0;
    if (days <= 0) {
      return prisma.partnerAttribution.update({
        where: { id: attribution.id },
        data: { bonusStatus: "NOT_APPLICABLE" }
      });
    }
    const program = programId
      ? await prisma.habitProgram.findFirst({ where: { id: programId, userId } })
      : await prisma.habitProgram.findFirst({ where: { userId, status: "ACTIVE" }, orderBy: { createdAt: "desc" } });
    if (!program) return attribution;

    const trialEndsAt = calculateGiftedTrialEnd({ now, currentTrialEndsAt: program.trialEndsAt, days });
    await prisma.habitProgram.update({
      where: { id: program.id },
      data: {
        trialStartedAt: program.trialStartedAt ?? now,
        trialEndsAt,
        subscriptionStatus: program.subscriptionStatus === "ACTIVE" ? "ACTIVE" : "TRIAL"
      }
    });
    const applied = await prisma.partnerAttribution.update({
      where: { id: attribution.id },
      data: {
        bonusStatus: "APPLIED",
        bonusAppliedAt: now,
        bonusAppliedProgramId: program.id
      }
    });
    const activeProgram = attribution.programConfigId
      ? await prisma.partnerAffiliateProgram.findUnique({ where: { id: attribution.programConfigId } })
      : await getActivePartnerProgram();
    await recordPartnerCustomerBonusEvent({
      attribution,
      program: activeProgram,
      bonusType: "trial_extension",
      bonusValue: days,
      bonusUnit: "days",
      entitlementId: `trial:${attribution.id}:${program.id}`
    });
    return applied;
  }

  if (attribution.customerBonusType === "CREDITS") {
    const amount = attribution.customerBonusValue ?? 0;
    if (amount <= 0) {
      return prisma.partnerAttribution.update({
        where: { id: attribution.id },
        data: { bonusStatus: "NOT_APPLICABLE" }
      });
    }
    const walletTransaction = await prisma.internalWalletTransaction.upsert({
      where: { idempotencyKey: `partner-bonus:${attribution.id}` },
      update: {},
      create: {
        userId,
        currency: ORKEN_POINTS,
        amountDelta: amount,
        reason: "partner_referral_bonus",
        sourceType: "PartnerAttribution",
        sourceId: attribution.id,
        idempotencyKey: `partner-bonus:${attribution.id}`
      }
    });
    const applied = await prisma.partnerAttribution.update({
      where: { id: attribution.id },
      data: { bonusStatus: "APPLIED", bonusAppliedAt: now }
    });
    const activeProgram = attribution.programConfigId
      ? await prisma.partnerAffiliateProgram.findUnique({ where: { id: attribution.programConfigId } })
      : await getActivePartnerProgram();
    await recordPartnerCustomerBonusEvent({
      attribution,
      program: activeProgram,
      bonusType: "points",
      bonusValue: amount,
      bonusUnit: ORKEN_POINTS,
      entitlementId: walletTransaction.id
    });
    return applied;
  }

  return prisma.partnerAttribution.update({
    where: { id: attribution.id },
    data: { bonusStatus: "APPLIED", bonusAppliedAt: now }
  });
}

export async function recordPaymentConversionForPayment(paymentId: string) {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment || payment.status !== "SUCCEEDED" || payment.amount <= 0 || !payment.userId) return "SKIPPED";

  const attribution = await prisma.partnerAttribution.findUnique({ where: { userId: payment.userId } });
  if (!attribution?.referralCode) return "SKIPPED";

  const activeProgram = attribution.programConfigId
    ? await prisma.partnerAffiliateProgram.findUnique({ where: { id: attribution.programConfigId } })
    : await getActivePartnerProgram();
  const programId = attribution.partnerCoreProgramId ?? activeProgram?.partnerCoreProgramId ?? env.PARTNER_CORE_DEFAULT_PROGRAM_ID;
  if (!programId) return "SKIPPED";

  const externalInvoiceId = payment.stripeCheckoutSessionId ?? payment.stripePaymentIntentId ?? payment.id;
  const payload: PartnerCoreConversionRequest = {
    programId,
    eventType: "payment",
    externalId: `invoice:${externalInvoiceId}`,
    referralCode: attribution.referralCode,
    customerRef: hashSubject(payment.userId),
    paymentAmountCents: payment.amount,
    idempotencyKey: `orken:invoice:${externalInvoiceId}:affiliate`
  };

  return (await recordPartnerConversionEvent({
    type: "PAYMENT",
    programConfigId: activeProgram?.id ?? attribution.programConfigId,
    userId: payment.userId,
    paymentId: payment.id,
    externalId: payload.externalId,
    payload
  })).status;
}

export async function recordSubscriptionInvoiceConversion(input: {
  invoiceId: string;
  userId?: string | null;
  customerId?: string | null;
  amountPaidCents: number;
}) {
  if (!input.userId || input.amountPaidCents <= 0) return "SKIPPED";
  const attribution = await prisma.partnerAttribution.findUnique({ where: { userId: input.userId } });
  if (!attribution?.referralCode) return "SKIPPED";

  const activeProgram = attribution.programConfigId
    ? await prisma.partnerAffiliateProgram.findUnique({ where: { id: attribution.programConfigId } })
    : await getActivePartnerProgram();
  const programId = attribution.partnerCoreProgramId ?? activeProgram?.partnerCoreProgramId ?? env.PARTNER_CORE_DEFAULT_PROGRAM_ID;
  if (!programId) return "SKIPPED";

  const payload: PartnerCoreConversionRequest = {
    programId,
    eventType: "payment",
    externalId: `invoice:${input.invoiceId}`,
    referralCode: attribution.referralCode,
    customerRef: hashSubject(input.customerId || input.userId),
    paymentAmountCents: input.amountPaidCents,
    idempotencyKey: `orken:invoice:${input.invoiceId}:affiliate`
  };
  return (await recordPartnerConversionEvent({
    type: "PAYMENT",
    programConfigId: activeProgram?.id ?? attribution.programConfigId,
    userId: input.userId,
    externalId: payload.externalId,
    payload
  })).status;
}

export async function recordPaymentConversionReversalForPayment(input: {
  paymentId: string;
  refundId: string;
  reason: string;
  eventType?: PartnerCoreConversionReversalRequest["eventType"];
}) {
  const payment = await prisma.payment.findUnique({ where: { id: input.paymentId } });
  if (!payment || !payment.userId) return "SKIPPED";

  const attribution = await prisma.partnerAttribution.findUnique({ where: { userId: payment.userId } });
  if (!attribution?.referralCode) return "SKIPPED";

  const activeProgram = attribution.programConfigId
    ? await prisma.partnerAffiliateProgram.findUnique({ where: { id: attribution.programConfigId } })
    : await getActivePartnerProgram();
  const programId = attribution.partnerCoreProgramId ?? activeProgram?.partnerCoreProgramId ?? env.PARTNER_CORE_DEFAULT_PROGRAM_ID;
  if (!programId) return "SKIPPED";

  const externalInvoiceId = payment.stripeCheckoutSessionId ?? payment.stripePaymentIntentId ?? payment.id;
  const payload: PartnerCoreConversionReversalRequest = {
    programId,
    originalExternalId: `invoice:${externalInvoiceId}`,
    eventType: input.eventType ?? "refund",
    reason: input.reason,
    actor: "Orken Stripe webhook",
    idempotencyKey: `orken:refund:${input.refundId}`
  };

  return (await recordPartnerConversionReversalEvent({
    programConfigId: activeProgram?.id ?? attribution.programConfigId,
    userId: payment.userId,
    paymentId: payment.id,
    payload
  })).status;
}

export async function recordSubscriptionInvoiceConversionReversal(input: {
  invoiceId: string;
  refundId: string;
  reason: string;
  userId?: string | null;
  customerId?: string | null;
  eventType?: PartnerCoreConversionReversalRequest["eventType"];
}) {
  if (!input.userId) return "SKIPPED";
  const attribution = await prisma.partnerAttribution.findUnique({ where: { userId: input.userId } });
  if (!attribution?.referralCode) return "SKIPPED";

  const activeProgram = attribution.programConfigId
    ? await prisma.partnerAffiliateProgram.findUnique({ where: { id: attribution.programConfigId } })
    : await getActivePartnerProgram();
  const programId = attribution.partnerCoreProgramId ?? activeProgram?.partnerCoreProgramId ?? env.PARTNER_CORE_DEFAULT_PROGRAM_ID;
  if (!programId) return "SKIPPED";

  const payload: PartnerCoreConversionReversalRequest = {
    programId,
    originalExternalId: `invoice:${input.invoiceId}`,
    eventType: input.eventType ?? "refund",
    reason: input.reason,
    actor: "Orken Stripe webhook",
    idempotencyKey: `orken:refund:${input.refundId}`
  };

  return (await recordPartnerConversionReversalEvent({
    programConfigId: activeProgram?.id ?? attribution.programConfigId,
    userId: input.userId,
    payload
  })).status;
}

export async function retryPartnerCoreEvents(limit = 25) {
  const client = partnerCoreClient();
  if (!client) return { attempted: 0, succeeded: 0, failed: 0, skipped: 0 };

  const stalePendingCutoff = new Date(Date.now() - 5 * 60 * 1000);
  const events = await prisma.partnerEvent.findMany({
    where: {
      type: { in: ["SIGNUP", "PAYMENT", "REFUND", "CUSTOMER_BONUS"] },
      attempts: { lt: 8 },
      OR: [
        { status: "FAILED" },
        { status: "PENDING", updatedAt: { lt: stalePendingCutoff } }
      ]
    },
    orderBy: { updatedAt: "asc" },
    take: limit
  });

  let succeeded = 0;
  let failed = 0;
  let skipped = 0;
  for (const event of events) {
    const payload = event.request;
    if (!isRecord(payload) || !readString(payload.idempotencyKey)) {
      skipped += 1;
      await prisma.partnerEvent.update({
        where: { id: event.id },
        data: { status: "FAILED", error: "Stored Partner Core event payload is invalid" }
      }).catch(() => undefined);
      continue;
    }

    await prisma.partnerEvent.update({
      where: { id: event.id },
      data: { status: "PENDING", error: null }
    });

    try {
      const response = await dispatchStoredPartnerCoreEvent(client, event.type, payload);
      await prisma.partnerEvent.update({
        where: { id: event.id },
        data: {
          status: "SUCCEEDED",
          response: safeJson(response) as Prisma.InputJsonValue,
          error: null,
          attempts: { increment: 1 }
        }
      });
      succeeded += 1;
    } catch (error) {
      await prisma.partnerEvent.update({
        where: { id: event.id },
        data: {
          status: "FAILED",
          error: error instanceof Error ? error.message : String(error),
          response: error instanceof PartnerCoreServiceError ? safeJson(error.payload) as Prisma.InputJsonValue : undefined,
          attempts: { increment: 1 }
        }
      });
      failed += 1;
    }
  }

  return { attempted: events.length, succeeded, failed, skipped };
}

function dispatchStoredPartnerCoreEvent(client: PartnerCoreServiceClient, type: PartnerEventType, payload: Record<string, unknown>) {
  if (type === "SIGNUP" || type === "PAYMENT") {
    return client.recordConversion(payload as PartnerCoreConversionRequest);
  }
  if (type === "REFUND") {
    return client.reverseConversion(payload as PartnerCoreConversionReversalRequest);
  }
  if (type === "CUSTOMER_BONUS") {
    return client.recordCustomerBonus(payload as PartnerCoreCustomerBonusRequest);
  }
  throw new Error(`Partner Core event type is not retryable: ${type}`);
}

async function walletBalance(client: DbClient, session: Pick<SessionContext, "id" | "userId">, currency = ORKEN_POINTS) {
  const programWhere = session.userId
    ? { OR: [{ userId: session.userId }, { sessionId: session.id }] }
    : { sessionId: session.id };
  const walletWhere = session.userId
    ? { currency, OR: [{ userId: session.userId }, { sessionId: session.id }] }
    : { currency, sessionId: session.id };
  const [rewardSum, walletSum] = await Promise.all([
    client.habitRewardEvent.aggregate({
      where: { program: { is: programWhere } },
      _sum: { xp: true }
    }),
    client.internalWalletTransaction.aggregate({
      where: walletWhere,
      _sum: { amountDelta: true }
    })
  ]);
  return (rewardSum._sum.xp ?? 0) + (walletSum._sum.amountDelta ?? 0);
}

export async function syncPartnerCoreOffers(actor = "orken-admin") {
  const client = partnerCoreClient();
  if (!client) return { synced: false, count: 0 };

  const bootstrap = await client.embeddedBootstrap(actor);
  const placements = Array.isArray(bootstrap.placements) ? bootstrap.placements : [];
  let count = 0;
  for (const placement of placements) {
    const placementId = corePlacementId(placement);
    if (!placementId) continue;
    const data = corePlacementData(placement);
    const existing = await prisma.partnerOffer.findUnique({ where: { partnerCorePlacementId: placementId } });
    if (existing) {
      await prisma.partnerOffer.update({
        where: { id: existing.id },
        data: {
          partnerCoreStatus: data.partnerCoreStatus,
          partnerCoreSyncedAt: data.partnerCoreSyncedAt,
          kind: data.kind,
          surface: data.surface,
          title: data.title,
          redemptionCurrency: data.redemptionCurrency,
          redemptionAmount: data.redemptionAmount,
          partnerPayoutCents: data.partnerPayoutCents,
          capPerMonth: data.capPerMonth,
          status: data.status
        }
      });
    } else {
      await prisma.partnerOffer.create({
        data: {
          partnerCorePlacementId: placementId,
          partnerCoreStatus: data.partnerCoreStatus,
          partnerCoreSyncedAt: data.partnerCoreSyncedAt,
          kind: data.kind,
          surface: data.surface,
          title: data.title,
          description: "Synced from Partner Core",
          redemptionCurrency: data.redemptionCurrency,
          redemptionAmount: data.redemptionAmount,
          userBenefit: data.title,
          partnerPayoutCents: data.partnerPayoutCents,
          capPerMonth: data.capPerMonth,
          status: data.status
        }
      });
    }
    count += 1;
  }
  return { synced: true, count };
}

export async function createPartnerCoreRewardPlacement(offer: PartnerOffer, actor = "orken-admin") {
  const client = partnerCoreClient();
  if (!client) return offer;
  if (offer.partnerCorePlacementId) return offer;

  const response = await client.createRewardPlacement({
    actor,
    offer: offer.title,
    kind: offer.kind || "manual_deal",
    surface: offer.surface || "rewards_tab",
    price: `${offer.redemptionAmount} ${offer.redemptionCurrency}`,
    cap: offer.capPerMonth ? `${offer.capPerMonth} / month` : "uncapped",
    partnerPayoutCents: offer.partnerPayoutCents,
    idempotencyKey: `placement:${env.PARTNER_CORE_PROJECT_ID}:${offer.id}`
  });
  const placement = response.placement;
  const placementId = corePlacementId(placement);
  if (!placementId) return offer;
  const data = corePlacementData(placement ?? { id: placementId, offer: offer.title, status: "draft" });
  return prisma.partnerOffer.update({
    where: { id: offer.id },
    data: {
      partnerCorePlacementId: placementId,
      partnerCoreStatus: data.partnerCoreStatus,
      partnerCoreSyncedAt: data.partnerCoreSyncedAt,
      status: data.status
    }
  });
}

export async function requestPartnerOfferReview(offerId: string, actor = "orken-admin") {
  const offer = await prisma.partnerOffer.findUnique({ where: { id: offerId } });
  if (!offer) throw new Error("Partner offer not found");
  const withPlacement = await createPartnerCoreRewardPlacement(offer, actor);
  if (!withPlacement.partnerCorePlacementId) throw new Error("Partner Core placement id is required");

  const client = partnerCoreClient();
  if (!client) {
    return prisma.partnerOffer.update({ where: { id: offerId }, data: { status: "PENDING_REVIEW" } });
  }

  const response = await client.submitPlacementReview({
    actor,
    placementId: withPlacement.partnerCorePlacementId,
    idempotencyKey: `submit-review:${env.PARTNER_CORE_PROJECT_ID}:${withPlacement.partnerCorePlacementId}`
  });
  const data = corePlacementData(response.placement ?? { id: withPlacement.partnerCorePlacementId, offer: withPlacement.title, status: "pending_review" });
  return prisma.partnerOffer.update({
    where: { id: offerId },
    data: {
      partnerCoreStatus: data.partnerCoreStatus,
      partnerCoreSyncedAt: data.partnerCoreSyncedAt,
      status: data.status
    }
  });
}

export async function transitionPartnerCoreOfferStatus(offerId: string, status: PartnerOfferStatus, actor = "orken-admin") {
  const offer = await prisma.partnerOffer.findUnique({ where: { id: offerId } });
  if (!offer) throw new Error("Partner offer not found");

  if (status === "PENDING_REVIEW") return requestPartnerOfferReview(offerId, actor);

  const coreStatus = localStatusToCore(status);
  const client = partnerCoreClient();
  if (!client || !offer.partnerCorePlacementId || !coreStatus) {
    if (client && status === "APPROVED") {
      throw new Error("Publication must be completed in Partner Core review queue, then synced to Orken");
    }
    return prisma.partnerOffer.update({ where: { id: offerId }, data: { status } });
  }

  await client.advancePlacementStatus(offer.partnerCorePlacementId, {
    actor,
    status: coreStatus,
    reviewerComment: "Orken project status update"
  });
  return prisma.partnerOffer.update({
    where: { id: offerId },
    data: {
      status,
      partnerCoreStatus: coreStatus,
      partnerCoreSyncedAt: new Date()
    }
  });
}

export async function getPartnerMarketplace(session: SessionContext) {
  await syncPartnerCoreOffers("orken-marketplace").catch(() => undefined);
  const [offers, redemptions, balance] = await Promise.all([
    prisma.partnerOffer.findMany({
      where: { status: "APPROVED" },
      orderBy: { updatedAt: "desc" }
    }),
    prisma.partnerOfferRedemption.findMany({
      where: session.userId
        ? { OR: [{ userId: session.userId }, { sessionId: session.id }] }
        : { sessionId: session.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { offer: true }
    }),
    walletBalance(prisma, session)
  ]);
  return { balance, currency: ORKEN_POINTS, offers, redemptions };
}

export async function redeemPartnerOffer(input: {
  session: SessionContext;
  offerId: string;
  idempotencyKey?: string | null;
}) {
  const subject = input.session.userId ?? input.session.id;
  const idempotencyKey = input.idempotencyKey?.trim() || `orken:redemption:${subject}:${input.offerId}`;
  const existing = await prisma.partnerOfferRedemption.findUnique({
    where: { idempotencyKey },
    include: { offer: true }
  });
  if (existing) return existing;

  const redemption = await prisma.$transaction(async (tx) => {
    const offer = await tx.partnerOffer.findUnique({ where: { id: input.offerId } });
    if (!offer || offer.status !== "APPROVED") throw new Error("Partner offer is not available");

    if (offer.capPerMonth) {
      const start = new Date();
      start.setUTCDate(1);
      start.setUTCHours(0, 0, 0, 0);
      const usedThisMonth = await tx.partnerOfferRedemption.count({
        where: {
          offerId: offer.id,
          createdAt: { gte: start },
          status: { in: ["PENDING", "FULFILLED"] }
        }
      });
      if (usedThisMonth >= offer.capPerMonth) throw new Error("Partner offer monthly cap reached");
    }

    const balance = await walletBalance(tx, input.session, offer.redemptionCurrency);
    if (balance < offer.redemptionAmount) throw new Error("Not enough Orken points");

    await tx.internalWalletTransaction.create({
      data: {
        userId: input.session.userId,
        sessionId: input.session.id,
        currency: offer.redemptionCurrency,
        amountDelta: -offer.redemptionAmount,
        reason: "partner_offer_redemption",
        sourceType: "PartnerOffer",
        sourceId: offer.id,
        idempotencyKey: `wallet:${idempotencyKey}`
      }
    });

    return tx.partnerOfferRedemption.create({
      data: {
        offerId: offer.id,
        userId: input.session.userId,
        sessionId: input.session.id,
        costCurrency: offer.redemptionCurrency,
        costAmount: offer.redemptionAmount,
        entitlementType: offer.entitlementType,
        entitlementValue: offer.entitlementValue,
        idempotencyKey
      },
      include: { offer: true }
    });
  });

  const client = partnerCoreClient();
  if (!client || !redemption.offer.partnerCorePlacementId) {
    return prisma.partnerOfferRedemption.update({
      where: { id: redemption.id },
      data: {
        status: "FULFILLED",
        partnerCoreResponse: safeJson({
          skipped: client ? "Partner Core placement id is missing" : "Partner Core is not configured"
        }) as Prisma.InputJsonValue
      },
      include: { offer: true }
    });
  }

  const requestPayload = {
    placementId: redemption.offer.partnerCorePlacementId,
    userRef: hashSubject(subject),
    idempotencyKey
  };
  await prisma.partnerEvent.upsert({
    where: { idempotencyKey },
    update: { request: safeJson(requestPayload) as Prisma.InputJsonValue, status: "PENDING", error: null },
    create: {
      type: "REDEMPTION",
      idempotencyKey,
      programConfigId: redemption.offer.programConfigId,
      userId: input.session.userId,
      externalId: `redemption:${redemption.id}`,
      request: safeJson(requestPayload) as Prisma.InputJsonValue
    }
  });

  try {
    const response = await client.redeemReward({
      placementId: redemption.offer.partnerCorePlacementId,
      userRef: hashSubject(subject),
      actor: input.session.userId ?? `session:${input.session.id}`,
      idempotencyKey
    });
    const responseRecord = response as Record<string, unknown>;
    await prisma.partnerEvent.update({
      where: { idempotencyKey },
      data: { status: "SUCCEEDED", response: safeJson(response) as Prisma.InputJsonValue, attempts: { increment: 1 } }
    });
    return prisma.partnerOfferRedemption.update({
      where: { id: redemption.id },
      data: {
        status: "FULFILLED",
        partnerCoreRedemptionId: typeof responseRecord.id === "string"
          ? responseRecord.id
          : typeof responseRecord.redemptionId === "string"
            ? responseRecord.redemptionId
            : null,
        partnerCoreResponse: safeJson(response) as Prisma.InputJsonValue
      },
      include: { offer: true }
    });
  } catch (error) {
    await prisma.$transaction(async (tx) => {
      await tx.internalWalletTransaction.create({
        data: {
          userId: input.session.userId,
          sessionId: input.session.id,
          currency: redemption.costCurrency,
          amountDelta: redemption.costAmount,
          reason: "partner_offer_redemption_refund",
          sourceType: "PartnerOfferRedemption",
          sourceId: redemption.id,
          idempotencyKey: `refund:${idempotencyKey}`
        }
      }).catch(() => undefined);
      await tx.partnerOfferRedemption.update({
        where: { id: redemption.id },
        data: {
          status: "PARTNER_FAILED",
          deliveryError: error instanceof Error ? error.message : String(error),
          partnerCoreResponse: error instanceof PartnerCoreServiceError ? safeJson(error.payload) as Prisma.InputJsonValue : undefined
        }
      });
      await tx.partnerEvent.update({
        where: { idempotencyKey },
        data: {
          status: "FAILED",
          error: error instanceof Error ? error.message : String(error),
          response: error instanceof PartnerCoreServiceError ? safeJson(error.payload) as Prisma.InputJsonValue : undefined,
          attempts: { increment: 1 }
        }
      });
    });
    return prisma.partnerOfferRedemption.findUniqueOrThrow({
      where: { id: redemption.id },
      include: { offer: true }
    });
  }
}

export async function createEmbeddedPartnerCoreSession(actor = "orken-admin") {
  const client = partnerCoreClient();
  if (!client) throw new Error("Partner Core is not configured");
  return client.createEmbeddedSession({
    projectId: env.PARTNER_CORE_PROJECT_ID,
    actor,
    origin: partnerCoreEmbedOrigin(),
    ttlSeconds: 900
  });
}

export async function createPartnerReferralLink(input: { programConfigId: string; channel: string; actor?: string }) {
  const program = await prisma.partnerAffiliateProgram.findUnique({ where: { id: input.programConfigId } });
  if (!program) throw new Error("Partner program not found");
  if (!program.partnerCoreProgramId) throw new Error("Partner Core program id is required");

  const channel = input.channel.trim().toLowerCase();
  const idempotencyKey = `referral:${env.PARTNER_CORE_PROJECT_ID}:${program.partnerCoreProgramId}:${channel}`;
  const existing = await prisma.partnerReferralLink.findUnique({ where: { idempotencyKey } });
  if (existing) return existing;

  const client = partnerCoreClient();
  if (!client) {
    return prisma.partnerReferralLink.create({
      data: {
        programConfigId: program.id,
        channel,
        status: "SKIPPED",
        idempotencyKey,
        rawResponse: { error: "Partner Core is not configured" }
      }
    });
  }

  const response = await client.createReferralLink({
    programId: program.partnerCoreProgramId,
    projectId: env.PARTNER_CORE_PROJECT_ID,
    channel,
    actor: input.actor ?? "orken-admin",
    idempotencyKey
  });
  const payload = response as Record<string, unknown>;
  return prisma.partnerReferralLink.create({
    data: {
      programConfigId: program.id,
      channel,
      referralCode: typeof payload.referralCode === "string" ? payload.referralCode : typeof payload.code === "string" ? payload.code : null,
      url: typeof payload.url === "string" ? payload.url : typeof payload.href === "string" ? payload.href : null,
      partnerCoreLinkId: typeof payload.id === "string" ? payload.id : null,
      status: "CREATED",
      idempotencyKey,
      rawResponse: safeJson(response) as Prisma.InputJsonValue
    }
  });
}
