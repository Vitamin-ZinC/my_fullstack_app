import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { env } from "../env.js";
import { prisma } from "../lib/prisma.js";
import type { PartnerPortalDashboard, PartnerPortalIdentity } from "@levelup/contracts";
import type { PartnerCorePortalSessionResponse } from "./partnerCore.js";

export const PARTNER_PORTAL_SESSION_COOKIE = "orken_partner_session";
export const PARTNER_PORTAL_CSRF_COOKIE = "orken_partner_csrf";

export type PartnerPortalSessionContext = {
  id: string;
  partnerCorePartnerId: string;
  partnerStatus: string;
  displayName: string | null;
  accountName: string | null;
  expiresAt: Date;
  coreSessionToken: string;
};

type CorePartnerRecord = Record<string, unknown>;

function asRecord(value: unknown): CorePartnerRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as CorePartnerRecord : null;
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function firstRecord(...values: unknown[]) {
  for (const value of values) {
    const record = asRecord(value);
    if (record) return record;
  }
  return null;
}

function tokenHash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function encryptionKey() {
  const secret = env.PARTNER_PORTAL_SESSION_ENCRYPTION_SECRET ?? env.JWT_ACCESS_SECRET;
  return createHash("sha256").update(`orken-partner-portal:${secret}`).digest();
}

function encryptCoreToken(token: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

function decryptCoreToken(value: string) {
  const [version, ivBase64, tagBase64, ciphertextBase64] = value.split(".");
  if (version !== "v1" || !ivBase64 || !tagBase64 || !ciphertextBase64) throw new Error("Invalid partner portal session");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivBase64, "base64url"));
  decipher.setAuthTag(Buffer.from(tagBase64, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextBase64, "base64url")), decipher.final()]).toString("utf8");
}

function resolveExpiry(value: PartnerCorePortalSessionResponse, now = new Date()) {
  const defaultExpiry = new Date(now.getTime() + 60 * 60 * 1000);
  const maxExpiry = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  let candidate: Date | null = null;
  if (typeof value.expiresAt === "number" && Number.isFinite(value.expiresAt)) {
    candidate = new Date(value.expiresAt > 10_000_000_000 ? value.expiresAt : value.expiresAt * 1000);
  } else if (typeof value.expiresAt === "string") {
    const parsed = new Date(value.expiresAt);
    if (!Number.isNaN(parsed.getTime())) candidate = parsed;
  } else if (typeof value.expiresIn === "number" && Number.isFinite(value.expiresIn) && value.expiresIn > 0) {
    candidate = new Date(now.getTime() + value.expiresIn * 1000);
  }
  if (!candidate || candidate <= now) return defaultExpiry;
  return candidate > maxExpiry ? maxExpiry : candidate;
}

export function partnerPortalIdentity(value: unknown, fallback?: Partial<PartnerPortalIdentity>): PartnerPortalIdentity | null {
  const root = asRecord(value);
  const nested = firstRecord(root?.partner, root?.partnerAccount, root?.account, value);
  const partnerCorePartnerId = firstString(
    root?.partnerCorePartnerId,
    root?.partnerId,
    root?.partner_account_id,
    nested?.partnerCorePartnerId,
    nested?.partnerId,
    nested?.partner_account_id,
    nested?.id,
    fallback?.partnerCorePartnerId
  );
  if (!partnerCorePartnerId) return null;
  return {
    partnerCorePartnerId,
    status: firstString(root?.status, nested?.status, fallback?.status) ?? "PENDING_REVIEW",
    displayName: firstString(root?.displayName, root?.display_name, nested?.displayName, nested?.display_name, fallback?.displayName) ?? null,
    accountName: firstString(root?.accountName, root?.account_name, nested?.accountName, nested?.account_name, nested?.name, fallback?.accountName) ?? null,
    email: firstString(root?.email, nested?.email, fallback?.email) ?? null
  };
}

export function portalIdentityFromAuth(value: PartnerCorePortalSessionResponse) {
  const identity = partnerPortalIdentity(value);
  if (!identity || !value.sessionToken?.trim()) throw new Error("Partner Core response is missing a portal session");
  return { identity, expiresAt: resolveExpiry(value) };
}

function portalCookieOptions(expiresAt: Date, httpOnly: boolean) {
  const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  return {
    path: "/",
    httpOnly,
    secure: env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge,
    ...(env.PARTNER_PORTAL_COOKIE_DOMAIN ? { domain: env.PARTNER_PORTAL_COOKIE_DOMAIN } : {})
  };
}

function clearCookieOptions() {
  return {
    path: "/",
    ...(env.PARTNER_PORTAL_COOKIE_DOMAIN ? { domain: env.PARTNER_PORTAL_COOKIE_DOMAIN } : {})
  };
}

export function setPartnerPortalCookies(reply: FastifyReply, rawSessionToken: string, expiresAt: Date) {
  reply.setCookie(PARTNER_PORTAL_SESSION_COOKIE, rawSessionToken, portalCookieOptions(expiresAt, true));
  reply.setCookie(PARTNER_PORTAL_CSRF_COOKIE, randomBytes(24).toString("base64url"), portalCookieOptions(expiresAt, false));
}

export function clearPartnerPortalCookies(reply: FastifyReply) {
  reply.clearCookie(PARTNER_PORTAL_SESSION_COOKIE, clearCookieOptions());
  reply.clearCookie(PARTNER_PORTAL_CSRF_COOKIE, clearCookieOptions());
}

export async function createPartnerPortalSession(coreSession: PartnerCorePortalSessionResponse) {
  const { identity, expiresAt } = portalIdentityFromAuth(coreSession);
  const rawSessionToken = randomBytes(32).toString("base64url");
  await prisma.partnerPortalSession.create({
    data: {
      tokenHash: tokenHash(rawSessionToken),
      coreSessionCiphertext: encryptCoreToken(coreSession.sessionToken),
      partnerCorePartnerId: identity.partnerCorePartnerId,
      partnerStatus: identity.status,
      displayName: identity.displayName ?? null,
      accountName: identity.accountName ?? null,
      expiresAt
    }
  });
  return { rawSessionToken, identity, expiresAt };
}

export async function getPartnerPortalSession(request: FastifyRequest): Promise<PartnerPortalSessionContext | null> {
  const rawSessionToken = request.cookies?.[PARTNER_PORTAL_SESSION_COOKIE];
  if (!rawSessionToken) return null;
  const session = await prisma.partnerPortalSession.findFirst({
    where: {
      tokenHash: tokenHash(rawSessionToken),
      expiresAt: { gt: new Date() },
      revokedAt: null
    }
  });
  if (!session) return null;
  try {
    const coreSessionToken = decryptCoreToken(session.coreSessionCiphertext);
    await prisma.partnerPortalSession.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } });
    return {
      id: session.id,
      partnerCorePartnerId: session.partnerCorePartnerId,
      partnerStatus: session.partnerStatus,
      displayName: session.displayName,
      accountName: session.accountName,
      expiresAt: session.expiresAt,
      coreSessionToken
    };
  } catch {
    await prisma.partnerPortalSession.update({ where: { id: session.id }, data: { revokedAt: new Date() } }).catch(() => undefined);
    return null;
  }
}

export async function revokePartnerPortalSession(sessionId: string) {
  await prisma.partnerPortalSession.update({ where: { id: sessionId }, data: { revokedAt: new Date() } }).catch(() => undefined);
}

export async function refreshPartnerPortalIdentity(sessionId: string, identity: PartnerPortalIdentity) {
  await prisma.partnerPortalSession.update({
    where: { id: sessionId },
    data: {
      partnerCorePartnerId: identity.partnerCorePartnerId,
      partnerStatus: identity.status,
      displayName: identity.displayName ?? null,
      accountName: identity.accountName ?? null
    }
  });
}

export function sessionIdentity(session: PartnerPortalSessionContext): PartnerPortalIdentity {
  return {
    partnerCorePartnerId: session.partnerCorePartnerId,
    status: session.partnerStatus,
    displayName: session.displayName,
    accountName: session.accountName
  };
}

export function partnerPortalClientRef(request: FastifyRequest) {
  const userAgentHeader = request.headers["user-agent"];
  const userAgent = Array.isArray(userAgentHeader) ? userAgentHeader[0] : userAgentHeader;
  const secret = env.PARTNER_CORE_PRIVACY_SECRET ?? env.PARTNER_PORTAL_SESSION_ENCRYPTION_SECRET ?? env.JWT_ACCESS_SECRET;
  return `orken_${createHmac("sha256", secret).update(`${request.ip}:${userAgent ?? ""}`).digest("hex").slice(0, 40)}`;
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function isPartnerPortalCsrfValid(request: FastifyRequest) {
  const cookieToken = request.cookies?.[PARTNER_PORTAL_CSRF_COOKIE];
  const header = request.headers["x-partner-csrf"];
  const headerToken = Array.isArray(header) ? header[0] : header;
  if (!cookieToken || !headerToken || !safeEqual(cookieToken, headerToken)) return false;
  const origin = request.headers.origin;
  if (!origin) return true;
  return origin === env.APP_ORIGIN || origin === env.PARTNER_PORTAL_ORIGIN;
}

const SENSITIVE_KEY = /(password|secret|token|api[_-]?key|hmac|kyc|bank|iban|swift|account[_-]?(number|details)|payout[_-]?(provider|details|account))/i;

export function sanitizePartnerCorePayload(value: unknown, depth = 0): unknown {
  if (depth > 12 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => sanitizePartnerCorePayload(item, depth + 1));
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as CorePartnerRecord)) {
    if (SENSITIVE_KEY.test(key)) continue;
    result[key] = sanitizePartnerCorePayload(item, depth + 1);
  }
  return result;
}

function recordAt(value: unknown, ...keys: string[]) {
  const record = asRecord(value);
  if (!record) return {};
  for (const key of keys) {
    const candidate = asRecord(record[key]);
    if (candidate) return candidate;
  }
  return {};
}

function arrayAt(value: unknown, ...keys: string[]) {
  const record = asRecord(value);
  if (!record) return [];
  for (const key of keys) {
    if (Array.isArray(record[key])) return record[key].map((item) => asRecord(item) ?? {});
  }
  return [];
}

export function partnerPortalReferralLink(value: unknown): CorePartnerRecord {
  const sanitized = sanitizePartnerCorePayload(value);
  const root = asRecord(sanitized) ?? {};
  const link = firstRecord(root.referralLink, root.referral_link, root.link, root) ?? {};
  const rawCode = firstString(link.referralCode, link.referral_code, link.code);
  const code = rawCode?.toUpperCase();
  if (!code || code.length > 120 || !/^[A-Z0-9._-]+$/.test(code)) return link;

  const url = new URL("/", env.APP_ORIGIN);
  url.searchParams.set("ref", code);
  const referralUrl = url.toString();
  return {
    ...link,
    code,
    referralCode: code,
    referral_code: code,
    url: referralUrl,
    href: referralUrl,
    referralUrl,
    referral_url: referralUrl
  };
}

export function partnerPortalDashboard(value: unknown, fallback: PartnerPortalIdentity): PartnerPortalDashboard {
  const sanitized = sanitizePartnerCorePayload(value);
  const identity = partnerPortalIdentity(sanitized, fallback) ?? fallback;
  return {
    partner: identity,
    metrics: recordAt(sanitized, "metrics", "summary", "stats"),
    referralLinks: arrayAt(sanitized, "referralLinks", "referral_links", "links").map(partnerPortalReferralLink),
    offers: arrayAt(sanitized, "offers", "placements", "rewardPlacements"),
    leads: arrayAt(sanitized, "leads"),
    conversions: arrayAt(sanitized, "conversions"),
    payouts: recordAt(sanitized, "payouts", "payoutSummary", "payout_summary")
  };
}
