import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import test from "node:test";

process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/orken_test";
process.env.APP_ORIGIN ??= "https://orken.life";

const { PartnerCoreServiceClient } = await import("./partnerCore.js");
const { partnerPortalDashboard, partnerPortalIdentity, partnerPortalReferralLink, portalIdentityFromAuth, sanitizePartnerCorePayload } = await import("./partnerPortal.js");

test("Partner Core portal registration is server-signed and idempotent", async () => {
  let requestUrl = "";
  let requestInit: RequestInit | undefined;
  const client = new PartnerCoreServiceClient({
    baseUrl: "https://partner-core.example",
    keyId: "orken-key",
    secret: "server-only-secret",
    now: () => new Date("2026-07-17T10:00:00.000Z"),
    fetchImpl: async (url, init) => {
      requestUrl = url.toString();
      requestInit = init;
      return new Response(JSON.stringify({
        sessionToken: "opaque-core-session",
        expiresIn: 1800,
        partner: { id: "partner_123", status: "PENDING_REVIEW", displayName: "Jane" }
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
  });

  await client.registerPartnerPortal({
    email: "jane@example.com",
    password: "long-enough-password",
    displayName: "Jane",
    accountName: "Jane Co",
    accountType: "organization",
    clientRef: "orken_client_ref",
    idempotencyKey: "partner-register:test-123"
  });

  const headers = new Headers(requestInit?.headers);
  assert.equal(requestUrl, "https://partner-core.example/api/projects/orken-life/partner/register");
  assert.equal(headers.get("idempotency-key"), "partner-register:test-123");
  assert.equal(headers.get("x-partner-core-key-id"), "orken-key");
  const rawBody = String(requestInit?.body);
  const expectedSignature = createHmac("sha256", "server-only-secret")
    .update([
      "POST",
      "/api/projects/orken-life/partner/register",
      headers.get("x-partner-core-timestamp"),
      createHash("sha256").update(rawBody).digest("hex")
    ].join("\n"))
    .digest("base64url");
  assert.equal(headers.get("x-partner-core-signature"), expectedSignature);
  assert.equal(headers.get("authorization"), null);
});

test("Partner Core refund and customer bonus events are server-signed and idempotent", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const client = new PartnerCoreServiceClient({
    baseUrl: "https://partner-core.example",
    keyId: "orken-key",
    secret: "server-only-secret",
    fetchImpl: async (url, init) => {
      requests.push({ url: url.toString(), init });
      return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
    }
  });

  await client.reverseConversion({
    programId: "prog-orken-life",
    originalExternalId: "invoice:in_123",
    eventType: "refund",
    reason: "Stripe refund re_123",
    idempotencyKey: "orken:refund:re_123"
  });
  await client.recordCustomerBonus({
    programId: "prog-orken-life",
    externalId: "bonus:attr_123",
    customerRef: "hashed-customer",
    bonusType: "points",
    bonusValue: 120,
    bonusUnit: "orken_points",
    entitlementId: "wallet_tx_123",
    conversionExternalId: "signup:user_123",
    idempotencyKey: "orken:bonus:attr_123"
  });

  assert.deepEqual(requests.map((request) => new URL(request.url).pathname), [
    "/api/events/conversion-reversals",
    "/api/events/customer-bonuses"
  ]);
  assert.deepEqual(requests.map((request) => new Headers(request.init?.headers).get("idempotency-key")), [
    "orken:refund:re_123",
    "orken:bonus:attr_123"
  ]);
  assert.ok(requests.every((request) => new Headers(request.init?.headers).get("x-partner-core-signature")));
});

test("Partner portal Core calls are restricted to Orken and keep its opaque token server-side", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const client = new PartnerCoreServiceClient({
    baseUrl: "https://partner-core.example",
    keyId: "orken-key",
    secret: "server-only-secret",
    fetchImpl: async (url, init) => {
      requests.push({ url: url.toString(), init });
      return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
    }
  });

  await client.getPartnerPortalDashboard("opaque-core-session");
  await client.createPartnerPortalReferralLink({ sessionToken: "opaque-core-session", channel: "telegram", idempotencyKey: "partner-ref:telegram" });
  await client.createPartnerPortalOffer({
    sessionToken: "opaque-core-session",
    offer: "Onboarding",
    kind: "qualified_lead",
    surface: "rewards_tab",
    price: "120 Orken Points",
    cap: "25 / month",
    partnerPayoutCents: 500,
    idempotencyKey: "partner-offer:onboarding"
  });
  await client.updatePartnerPortalOffer({
    sessionToken: "opaque-core-session",
    offerId: "offer_123",
    offer: "Onboarding and audit",
    partnerPayoutCents: 650,
    idempotencyKey: "partner-offer-update:offer_123"
  });
  await client.submitPartnerPortalOfferReview({ sessionToken: "opaque-core-session", offerId: "offer_123", idempotencyKey: "partner-offer-submit:offer_123" });
  await client.logoutPartnerPortal("opaque-core-session");

  assert.equal(requests.length, 6);
  for (const request of requests) {
    assert.match(request.url, /^https:\/\/partner-core\.example\/api\/projects\/orken-life\/partner\//);
    const headers = new Headers(request.init?.headers);
    assert.equal(headers.get("authorization"), "Bearer opaque-core-session");
    assert.equal(headers.get("x-partner-core-key-id"), "orken-key");
    assert.ok(headers.get("x-partner-core-signature"));
  }
  assert.equal(new Headers(requests[1].init?.headers).get("idempotency-key"), "partner-ref:telegram");
  assert.equal(new Headers(requests[2].init?.headers).get("idempotency-key"), "partner-offer:onboarding");
  assert.equal(requests[3].init?.method, "PATCH");
  assert.equal(new Headers(requests[3].init?.headers).get("idempotency-key"), "partner-offer-update:offer_123");
  assert.equal(new Headers(requests[4].init?.headers).get("idempotency-key"), "partner-offer-submit:offer_123");
});

test("embedded Orken admin loads project partners and updates project-only access", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  let sessionNumber = 0;
  const client = new PartnerCoreServiceClient({
    baseUrl: "https://partner-core.example",
    keyId: "orken-key",
    secret: "server-only-secret",
    fetchImpl: async (url, init) => {
      requests.push({ url: url.toString(), init });
      const path = new URL(url instanceof Request ? url.url : url.toString()).pathname;
      if (path === "/api/embedded-sessions") {
        sessionNumber += 1;
        return new Response(JSON.stringify({ token: `embedded-session-${sessionNumber}`, projectId: "orken", expiresAt: 1, scopes: ["project:read", "partners:write"] }), { status: 201 });
      }
      if (path === "/api/embedded/bootstrap") {
        return new Response(JSON.stringify({ partners: [{ id: "partner_123", project_status: "approved" }] }), { status: 200 });
      }
      return new Response(JSON.stringify({ partner: { id: "partner_123", project_status: "suspended" }, changed: true }), { status: 200 });
    }
  });

  const dashboard = await client.embeddedBootstrap("orken-admin");
  const updated = await client.updateEmbeddedPartnerStatus({ actor: "orken-admin", partnerAccountId: "partner_123", status: "suspended" });

  assert.equal(dashboard.partners?.[0]?.id, "partner_123");
  assert.equal(updated.partner?.project_status, "suspended");
  assert.deepEqual(requests.map((request) => new URL(request.url).pathname), [
    "/api/embedded-sessions",
    "/api/embedded/bootstrap",
    "/api/embedded-sessions",
    "/api/embedded/partners/partner_123/status"
  ]);
  assert.ok(new Headers(requests[0].init?.headers).get("x-partner-core-signature"));
  assert.equal(new Headers(requests[1].init?.headers).get("authorization"), "Bearer embedded-session-1");
  assert.equal(new Headers(requests[3].init?.headers).get("authorization"), "Bearer embedded-session-2");
  assert.equal(new Headers(requests[3].init?.headers).get("x-partner-core-key-id"), null);
});

test("Partner portal identity uses Core partner id and caps missing expiry safely", () => {
  const result = portalIdentityFromAuth({
    sessionToken: "opaque-core-session",
    partnerAccount: { id: "partner_123", status: "APPROVED", account_name: "Jane Co" }
  });

  assert.equal(result.identity.partnerCorePartnerId, "partner_123");
  assert.equal(result.identity.status, "APPROVED");
  assert.equal(result.identity.accountName, "Jane Co");
  assert.ok(result.expiresAt.getTime() > Date.now());
  assert.equal(partnerPortalIdentity({}), null);
});

test("Partner portal auth identity fills display fields that Core omits", () => {
  const result = portalIdentityFromAuth({
    sessionToken: "opaque-core-session",
    partner: { id: "partner_123", status: "approved" }
  }, {
    displayName: "Jane Coach",
    accountName: "Jane Practice",
    email: "jane@example.com"
  });

  assert.equal(result.identity.displayName, "Jane Coach");
  assert.equal(result.identity.accountName, "Jane Practice");
  assert.equal(result.identity.email, "jane@example.com");
});

test("Partner portal keeps cached display fields while Core remains authoritative for status", () => {
  const identity = partnerPortalIdentity({
    partner: {
      id: "partner_123",
      status: "suspended",
      displayName: "Practice name"
    }
  }, {
    partnerCorePartnerId: "partner_123",
    status: "approved",
    displayName: "Jane Coach",
    accountName: "Jane Practice",
    email: "jane@example.com"
  });

  assert.equal(identity?.status, "suspended");
  assert.equal(identity?.displayName, "Jane Coach");
  assert.equal(identity?.accountName, "Jane Practice");
  assert.equal(identity?.email, "jane@example.com");
});

test("Partner portal payload never returns Core credentials or payout details", () => {
  const payload = sanitizePartnerCorePayload({
    partner: { id: "partner_123", displayName: "Jane" },
    sessionToken: "never-return",
    apiKey: "never-return",
    kycProviderRef: "never-return",
    bankAccountNumber: "never-return",
    payoutStatus: "pending",
    ledger: [{ id: "ledger_1", amount: 1200 }]
  }) as Record<string, unknown>;

  assert.deepEqual(payload, {
    partner: { id: "partner_123", displayName: "Jane" },
    payoutStatus: "pending",
    ledger: [{ id: "ledger_1", amount: 1200 }]
  });
});

test("Partner portal rewrites Core short links to the Orken referral entrypoint", () => {
  const link = partnerPortalReferralLink({
    referralLink: {
      id: "link_123",
      channel: "Instagram",
      code: "INSTAGRAM-ORKEN",
      url: "https://go.enchantstartup.com/instagram-orken"
    }
  });
  assert.equal(link.url, "https://orken.life/?ref=INSTAGRAM-ORKEN");
  assert.equal(link.referralUrl, "https://orken.life/?ref=INSTAGRAM-ORKEN");
  assert.equal(link.channel, "Instagram");

  const dashboard = partnerPortalDashboard({
    partner: { id: "partner_123", status: "APPROVED" },
    referralLinks: [{ code: "TELEGRAM-ORKEN", url: "https://go.enchantstartup.com/telegram-orken" }]
  }, { partnerCorePartnerId: "partner_123", status: "APPROVED" });
  assert.equal(dashboard.referralLinks[0]?.url, "https://orken.life/?ref=TELEGRAM-ORKEN");
});

test("Partner portal normalizes registration and payment aliases without losing legacy fields", () => {
  const dashboard = partnerPortalDashboard({
    partner: { id: "partner_123", status: "APPROVED" },
    registrations: [{ id: "registration_1", customerRef: "customer_1" }],
    payments: [{ id: "payment_1", customerRef: "customer_1", amountCents: 800, currency: "USD" }]
  }, { partnerCorePartnerId: "partner_123", status: "APPROVED" });

  assert.equal(dashboard.registrations[0]?.id, "registration_1");
  assert.equal(dashboard.payments[0]?.id, "payment_1");
  assert.deepEqual(dashboard.leads, dashboard.registrations);
  assert.deepEqual(dashboard.conversions, dashboard.payments);
});
