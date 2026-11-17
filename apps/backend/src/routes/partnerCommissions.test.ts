import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import test, { type TestContext } from "node:test";
import Fastify from "fastify";

process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:1/orken_tests";
process.env.ADMIN_API_TOKEN = "test-admin-commission-token";
process.env.PARTNER_CORE_URL = "https://partner-core.example";
process.env.PARTNER_CORE_SERVICE_KEYS_JSON = "";
process.env.PARTNER_CORE_KEY_ID = "commission-test-key";
process.env.PARTNER_CORE_SERVICE_SECRET = "commission-service-secret";
process.env.PARTNER_CORE_PROJECT_ID = "orken-life";
process.env.PARTNER_CORE_EMBED_ORIGIN = "https://orken.life";

const { partnerCommissionRoutes } = await import("./partnerCommissions.js");
const { prisma } = await import("../lib/prisma.js");
const { createAdminSessionToken } = await import("../lib/auth.js");
const { PartnerCoreServiceClient, recordPaymentConversionForPayment, recordSubscriptionInvoiceConversion, recordCoachCommerceConversion } = await import("../services/partnerCore.js");
const { partnerCommissionTerms } = await import("../services/partnerCommissionTerms.js");
const { partnerPortalDashboard } = await import("../services/partnerPortal.js");
const { env } = await import("../env.js");

const base = {
  projectId: "orken", programId: "prog-orken-life", standardRateBps: 1500,
  partnerRateBps: null, referralLinkRateBps: null, effectiveRateBps: 1500, source: "program",
  effectiveAt: "2026-11-17T12:00:00.000Z", evaluatedAt: "2026-11-17T12:01:00.000Z", termsVersion: "opaque-version"
};
const target = { programId: base.programId, partnerAccountId: "partner-123" };
const change = { ...target, commissionRateBps: 3000, reason: "Ambassador", idempotencyKey: "commission-operation-123" };
const headers = { "x-admin-token": process.env.ADMIN_API_TOKEN };

function stub(t: TestContext, object: any, key: string, fn: (...args: any[]) => any) {
  const original = object[key]; object[key] = t.mock.fn(fn);
  t.after(() => { object[key] = original; });
}

async function appFor(t: TestContext) {
  const app = Fastify();
  await app.register(partnerCommissionRoutes);
  t.after(() => app.close());
  stub(t, prisma.adminAuditLog, "create", async () => ({}));
  return app;
}

function mockCore(t: TestContext, handler?: (url: string, init: RequestInit) => Response) {
  return t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const h = new Headers(init?.headers);
    const body = String(init?.body ?? "");
    const signature = createHmac("sha256", "commission-service-secret").update([
      init?.method, new URL(url).pathname, h.get("x-partner-core-timestamp"), createHash("sha256").update(body).digest("hex")
    ].join("\n")).digest("base64url");
    assert.equal(h.get("x-partner-core-signature"), signature);
    if (url.endsWith("/api/embedded-sessions")) {
      assert.deepEqual(JSON.parse(body), { projectId: "orken-life", actor: "orken-admin:admin-api", origin: "https://orken.life", commissionManagement: true, ttlSeconds: 300 });
      return Response.json({ token: "backend-only-embedded-token", expiresAt: 9999999999, scopes: ["commissions:write"] });
    }
    assert.equal(h.get("authorization"), "Bearer backend-only-embedded-token");
    assert.equal(h.get("x-embed-origin"), "https://orken.life");
    return handler?.(url, init!) ?? Response.json({ commissionTerms: { ...base, ...target } });
  });
}

test("anonymous, B2C and partner credentials cannot mint a commission session", async t => {
  const core = t.mock.method(globalThis, "fetch", async () => { throw new Error("No Core access"); });
  const app = await appFor(t);
  for (const credentials of [{}, { cookie: "orken_partner_session=partner-token" }, { "x-session-id": "user", "x-guest-token": "user-token" }]) {
    for (const method of ["GET", "POST"] as const) {
      const response = await app.inject({ method, url: "/api/admin/partner-core/commission-terms", headers: credentials, ...(method === "POST" ? { payload: change } : {}) });
      assert.equal(response.statusCode, 403);
    }
  }
  assert.equal(core.mock.callCount(), 0);
});

test("invalid targets, rates, reasons and browser-supplied actors are rejected before Core", async t => {
  const core = t.mock.method(globalThis, "fetch", async () => { throw new Error("No Core access"); });
  const app = await appFor(t);
  for (const payload of [
    { ...change, commissionRateBps: -1 }, { ...change, commissionRateBps: 10001 }, { ...change, commissionRateBps: 15.5 },
    { ...change, commissionRateBps: "3000" }, { ...change, reason: " " }, { ...change, idempotencyKey: "" },
    { ...change, actor: "someone-else" }, { ...change, origin: "https://evil.example" },
    { ...change, projectId: "emma" }, { ...change, programId: "../emma" },
    { ...change, partnerAccountId: undefined, referralLinkId: "link-1" },
    { ...change, partnerAccountId: undefined, commissionRateBps: null }
  ]) {
    const response = await app.inject({ method: "POST", url: "/api/admin/partner-core/commission-terms", headers, payload });
    assert.equal(response.statusCode, 400, JSON.stringify(payload));
  }
  assert.equal(core.mock.callCount(), 0);
});

test("admin reads all three targets through signed, server-only Core sessions", async t => {
  const requests: string[] = [];
  mockCore(t, (url) => {
    requests.push(new URL(url).pathname);
    const link = url.includes("/referral-links/") ? "link-123" : undefined;
    return Response.json({ commissionTerms: { ...base, ...(url.includes("/partners/") ? { partnerAccountId: target.partnerAccountId } : {}), ...(link ? { referralLinkId: link } : {}), token: "must-not-leak" } });
  });
  const app = await appFor(t);
  for (const suffix of ["", "&partnerAccountId=partner-123", "&partnerAccountId=partner-123&referralLinkId=link-123"]) {
    const response = await app.inject({ method: "GET", url: `/api/admin/partner-core/commission-terms?programId=${base.programId}${suffix}`, headers });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().commissionTerms.standardRateBps, 1500);
    assert.doesNotMatch(response.body, /token|secret|key-id/);
  }
  assert.deepEqual(requests, [
    "/api/embedded/programs/prog-orken-life/commission-terms",
    "/api/embedded/programs/prog-orken-life/partners/partner-123/commission-terms",
    "/api/embedded/programs/prog-orken-life/partners/partner-123/referral-links/link-123/commission-terms"
  ]);
});

test("30%, explicit zero, link 15% and resets preserve the write key and exact target", async t => {
  const writes: { path: string; body: any; key: string | null }[] = [];
  mockCore(t, (url, init) => {
    const body = JSON.parse(String(init.body));
    writes.push({ path: new URL(url).pathname, body, key: new Headers(init.headers).get("idempotency-key") });
    const link = url.includes("/referral-links/");
    return Response.json({ commissionTerms: {
      ...base, ...target, ...(link ? { referralLinkId: "link-123" } : {}),
      partnerRateBps: link ? 3000 : body.commissionRateBps,
      referralLinkRateBps: link ? body.commissionRateBps : null,
      effectiveRateBps: body.commissionRateBps ?? (link ? 3000 : 1500),
      source: body.commissionRateBps === null ? (link ? "partner" : "program") : (link ? "referral_link" : "partner")
    } });
  });
  const app = await appFor(t);
  for (const input of [change, change, { ...change, commissionRateBps: 0 }, { ...change, commissionRateBps: null }, { ...change, referralLinkId: "link-123", commissionRateBps: 1500 }, { ...change, referralLinkId: "link-123", commissionRateBps: null }]) {
    const response = await app.inject({ method: "POST", url: "/api/admin/partner-core/commission-terms", headers, payload: input });
    assert.equal(response.statusCode, 200);
    assert.equal(writes.at(-1)?.body.commissionRateBps, input.commissionRateBps);
    assert.equal(writes.at(-1)?.key, input.idempotencyKey);
    assert.deepEqual(Object.keys(writes.at(-1)!.body).sort(), ["commissionRateBps", "reason"]);
    assert.doesNotMatch(response.body, /backend-only|commission-service-secret/);
  }
  assert.deepEqual(writes[0], writes[1]);
});

test("scope, tenant, ownership and idempotency errors stay safe and keep their status", async t => {
  let status = 403; let code = "service_scope_missing";
  mockCore(t, () => Response.json({ error: { code, message: "secret commission-service-secret" }, token: "backend-only" }, { status }));
  const app = await appFor(t);
  for (const entry of [[403, "service_scope_missing"], [403, "commission_project_forbidden"], [404, "commission_referral_link_not_found"], [409, "idempotency_conflict"]] as const) {
    [status, code] = entry;
    const response = await app.inject({ method: "POST", url: "/api/admin/partner-core/commission-terms", headers, payload: change });
    assert.equal(response.statusCode, status);
    assert.equal(response.json().code, code);
    assert.doesNotMatch(response.body, /backend-only|commission-service-secret/);
  }
});

test("response from another project or target is not exposed", async t => {
  mockCore(t, () => Response.json({ commissionTerms: { ...base, ...target, projectId: "emma" } }));
  const app = await appFor(t);
  const response = await app.inject({ method: "GET", url: `/api/admin/partner-core/commission-terms?programId=${base.programId}&partnerAccountId=partner-123`, headers });
  assert.equal(response.statusCode, 502);
});

test("old Core cannot silently ignore commissionManagement and grant an ordinary session", async t => {
  const core = t.mock.method(globalThis, "fetch", async () => Response.json({ token: "ordinary-session", scopes: ["partners:read"] }));
  const app = await appFor(t);
  const response = await app.inject({ method: "POST", url: "/api/admin/partner-core/commission-terms", headers, payload: change });
  assert.equal(response.statusCode, 403);
  assert.equal(response.json().code, "scope_missing");
  assert.equal(core.mock.callCount(), 1);
});

test("commission routes select a commission-scoped principal instead of the ordinary partner key", async t => {
  const original = env.PARTNER_CORE_SERVICE_KEYS_JSON;
  env.PARTNER_CORE_SERVICE_KEYS_JSON = JSON.stringify([
    { keyId: "ordinary", secret: "not-used", scopes: ["sessions:write", "partners:read", "partners:write", "events:write"], projectIds: ["orken"] },
    { keyId: "commission-only", secret: "commission-service-secret", scopes: ["sessions:write", "commissions:write"], projectIds: ["orken"] }
  ]);
  t.after(() => { env.PARTNER_CORE_SERVICE_KEYS_JSON = original; });
  const core = mockCore(t);
  const app = await appFor(t);
  const response = await app.inject({ method: "GET", url: `/api/admin/partner-core/commission-terms?programId=${base.programId}&partnerAccountId=partner-123`, headers });
  assert.equal(response.statusCode, 200);
  for (const call of core.mock.calls) assert.equal(new Headers(call.arguments[1]?.headers).get("x-partner-core-key-id"), "commission-only");
});

test("authenticated admin actor comes from the verified admin principal", async t => {
  const calls: any[] = [];
  t.mock.method(globalThis, "fetch", async (url: string | URL | Request, init?: RequestInit) => {
    if (String(url).endsWith("/api/embedded-sessions")) {
      calls.push(JSON.parse(String(init?.body)));
      return Response.json({ token: "private-token", scopes: ["commissions:write"] });
    }
    return Response.json({ commissionTerms: { ...base, ...target } });
  });
  const app = await appFor(t);
  const response = await app.inject({ method: "POST", url: "/api/admin/partner-core/commission-terms", headers: { "x-admin-session": await createAdminSessionToken() }, payload: change });
  assert.equal(response.statusCode, 200);
  assert.equal(calls[0].actor, "orken-admin:admin");
});

test("portal commission data is read-only, allowlisted and restricted to its partner", () => {
  const own = { ...base, ...target, partnerRateBps: 0, effectiveRateBps: 0, source: "partner", secret: "hidden" };
  const other = { ...own, partnerAccountId: "other-partner" };
  const payload = { commissionTerms: { programs: [base], partners: [own, other, { ...own, projectId: "emma" }], referralLinks: [{ ...own, referralLinkId: "link-123" }] } };
  const terms = partnerCommissionTerms(payload, target.partnerAccountId);
  assert.equal(terms.partners.length, 1);
  assert.equal(terms.partners[0].effectiveRateBps, 0);
  assert.doesNotMatch(JSON.stringify(terms), /hidden|other-partner|emma/);
  const dashboard = partnerPortalDashboard(payload, { partnerCorePartnerId: target.partnerAccountId, status: "APPROVED" });
  assert.deepEqual(dashboard.commissionTerms, terms);
});

test("conversion client preserves the confirmed timestamp and referral without a trusted rate", async () => {
  let sent: any;
  const client = new PartnerCoreServiceClient({ baseUrl: "https://core.example", keyId: "key", secret: "secret", fetchImpl: async (_url, init) => { sent = JSON.parse(String(init?.body)); return Response.json({}); } });
  await client.recordConversion({ programId: base.programId, externalId: "invoice:paid", referralCode: "PERSISTED", occurredAt: base.effectiveAt, paymentAmountCents: 800, idempotencyKey: "invoice:paid" });
  assert.equal(sent.occurredAt, base.effectiveAt);
  assert.equal(sent.referralCode, "PERSISTED");
  assert.equal(sent.commissionRateBps, undefined);
});

test("report, renewal and coach conversion events persist the real paidAt for retries", async t => {
  const sent: any[] = [];
  stub(t, prisma.payment, "findUnique", async () => ({ id: "payment", status: "SUCCEEDED", amount: 300, userId: "user", paidAt: new Date(base.effectiveAt), stripeCheckoutSessionId: "checkout" }));
  stub(t, prisma.partnerAttribution, "findUnique", async () => ({ referralCode: "SAVED-REF", partnerCoreProgramId: base.programId }));
  stub(t, prisma.partnerAffiliateProgram, "findFirst", async () => ({ id: "local", partnerCoreProgramId: base.programId }));
  stub(t, prisma.partnerEvent, "findUnique", async () => null);
  stub(t, prisma.partnerEvent, "upsert", async () => ({}));
  stub(t, prisma.partnerEvent, "update", async () => ({}));
  t.mock.method(globalThis, "fetch", async (_url: string | URL | Request, init?: RequestInit) => { sent.push(JSON.parse(String(init?.body))); return Response.json({}); });
  await recordPaymentConversionForPayment("payment");
  await recordSubscriptionInvoiceConversion({ invoiceId: "renewal", userId: "user", amountPaidCents: 800, occurredAt: base.effectiveAt });
  await recordCoachCommerceConversion({ externalId: "coach-invoice", referralCode: "SAVED-REF", amountPaidCents: 3900, eventType: "coach_package_payment", occurredAt: base.effectiveAt, idempotencyKey: "coach:invoice" });
  assert.equal(sent.length, 3);
  for (const event of sent) {
    assert.equal(event.occurredAt, base.effectiveAt);
    assert.equal(event.referralCode, "SAVED-REF");
    assert.equal(event.commissionRateBps, undefined);
  }
});
