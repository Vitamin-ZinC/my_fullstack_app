import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import Fastify from "fastify";
import cookie from "@fastify/cookie";

process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/orken_test";
const { coachWorkspaceRoutes } = await import("./coachWorkspace.js");
const { createAdminSessionToken } = await import("../lib/auth.js");
const { prisma } = await import("../lib/prisma.js");
const { createPartnerPortalSession } = await import("../services/partnerPortal.js");
const { createCoachServiceCheckout } = await import("../services/coachCommerce.js");

const profile = { id: "coach", partnerCorePartnerId: "core-partner", displayName: "Test Coach", slug: "test-coach", status: "DRAFT", moderationNote: "Private profile feedback", specializations: [], languages: ["en"], sites: [], rewards: [], serviceOffers: [] };
const paidOffer = { id: "offer", coachProfileId: profile.id, coachProfile: { displayName: profile.displayName }, status: "DRAFT", type: "ONGOING_SUPPORT", paymentModel: "CLIENT_PAID", amount: 3900, currency: "usd", title: "Support", description: "Individual coaching", moderationNote: "Private offer feedback", coachShareBps: null, platformShareBps: null };

function stub(t: TestContext, model: any, method: string, implementation: (...args: any[]) => unknown) {
  const original = model[method];
  model[method] = t.mock.fn(implementation);
  t.after(() => { model[method] = original; });
}

async function appFor(t: TestContext) {
  const app = Fastify();
  t.after(() => app.close());
  await app.register(cookie);
  await app.register(coachWorkspaceRoutes);
  return app;
}

test("admin snapshot denies unauthenticated access before reading any profiles", async t => {
  stub(t, prisma.coachProfile, "findMany", async () => { throw new Error("Private read must not run"); });
  const app = await appFor(t);
  assert.equal((await app.inject("/api/admin/coaches/platform")).statusCode, 403);
  assert.equal((await app.inject({ method: "PATCH", url: "/api/admin/coaches/coach/status", payload: { status: "APPROVED" } })).statusCode, 403);
  assert.equal((await app.inject({ method: "PATCH", url: "/api/admin/coaches/offers/offer/status", payload: { status: "APPROVED" } })).statusCode, 403);
  assert.equal((await app.inject({ method: "PATCH", url: "/api/admin/coaches/coach/catalog", payload: { featured: true } })).statusCode, 403);
});

test("catalog promotion only updates featured, keeps moderation and publication date, and is audited", async t => {
  const current: any = { ...profile, status: "APPROVED", featured: false, acceptingOrders: true, publicSince: new Date("2026-10-01") };
  const audits: any[] = [];
  stub(t, prisma.coachProfile, "findUnique", async () => current);
  stub(t, prisma, "$transaction", async (run: any) => run({
    coachProfile: { updateMany: async ({ where, data }: any) => {
      assert.deepEqual(Object.keys(data), ["featured"]);
      if (where.status && current.status !== where.status) return { count: 0 };
      Object.assign(current, data); return { count: 1 };
    } },
    adminAuditLog: { create: async ({ data }: any) => { audits.push(data); } }
  }));
  const app = await appFor(t);
  const headers = { "x-admin-session": await createAdminSessionToken() };
  const url = "/api/admin/coaches/coach/catalog";
  assert.equal((await app.inject({ method: "PATCH", url, headers, payload: { featured: true, status: "APPROVED" } })).statusCode, 400);
  assert.equal((await app.inject({ method: "PATCH", url, headers, payload: { featured: true } })).statusCode, 200);
  assert.equal(current.status, "APPROVED"); assert.equal(current.acceptingOrders, true);
  assert.equal(current.publicSince.toISOString(), "2026-10-01T00:00:00.000Z");
  assert.equal(current.featured, true); assert.equal(audits[0].action, "coach.catalog.featured");
  current.status = "PENDING_REVIEW";
  assert.equal((await app.inject({ method: "PATCH", url, headers, payload: { featured: true } })).statusCode, 409);
  assert.equal((await app.inject({ method: "PATCH", url, headers, payload: { featured: false } })).statusCode, 200);
  assert.equal(current.status, "PENDING_REVIEW");
});

test("connection routes require the matching role, reject browser identity overrides and scope client inbox", async t => {
  const app = await appFor(t);
  for (const url of ["/api/coaches/coach/connection-requests", "/api/habits/coaching/connection-requests/request/cancel", "/api/coach/connection-requests/request/decision"]) {
    assert.equal((await app.inject({ method: "POST", url, payload: {} })).statusCode, 401);
  }
  stub(t, prisma.session, "findFirst", async () => ({ id: "session", guestToken: "synthetic-token", userId: "client", locale: "ru" }));
  const headers = { "x-session-id": "session", "x-guest-token": "synthetic-token" };
  const invalid = await app.inject({ method: "POST", url: "/api/coaches/coach/connection-requests", headers, payload: { userId: "victim", partnerCorePartnerId: "other-project", message: "Hi" } });
  assert.equal(invalid.statusCode, 400);
  stub(t, prisma.coachClientRelationship, "findMany", async ({ where }: any) => { assert.equal(where.userId, "client"); return []; });
  stub(t, prisma.coachServiceOrder, "findMany", async ({ where }: any) => { assert.equal(where.userId, "client"); return []; });
  stub(t, prisma.coachConnectionRequest, "findMany", async ({ where }: any) => {
    assert.equal(where.userId, "client");
    return [{ id: "request", coachProfileId: "coach", coachProfile: { displayName: "Coach", slug: "coach" }, user: { email: "private@example.invalid", name: "Private" }, status: "PENDING", message: "Goals", decisionNote: null, relationshipId: null, createdAt: new Date(), decidedAt: null }];
  });
  const inbox = await app.inject({ url: "/api/habits/coaching", headers });
  assert.equal(inbox.statusCode, 200);
  assert.equal(inbox.json().connectionRequests.length, 1);
  assert.equal(inbox.body.includes("private@example.invalid"), false);
});

test("admin snapshot includes rejected and paused services with private preview fields", async t => {
  stub(t, prisma.coachProfile, "findMany", async () => [profile]);
  for (const model of [prisma.coachPlan, prisma.coachSitePlan, prisma.coachSubscription, prisma.coachServiceOrder, prisma.coachReward, prisma.appSetting]) stub(t, model, "findMany", async () => []);
  stub(t, prisma.appSetting, "findUnique", async () => null);
  stub(t, prisma.coachServiceOffer, "findMany", async (args: any) => {
    assert.equal(args.where, undefined);
    return ["DRAFT", "PENDING_REVIEW", "APPROVED", "REJECTED", "PAUSED"].map(status => ({ ...paidOffer, status }));
  });
  const app = await appFor(t);
  const response = await app.inject({ url: "/api/admin/coaches/platform", headers: { "x-admin-session": await createAdminSessionToken() } });
  assert.equal(response.statusCode, 200);
  const data = response.json();
  assert.equal(data.profiles[0].moderationNote, profile.moderationNote);
  assert.equal(data.offers.length, 5);
  assert.equal(data.offers[0].moderationNote, paidOffer.moderationNote);
  assert.equal(data.offers[0].coachName, profile.displayName);
});

test("moderation validates reasons, preserves paid split gate and audits successful decisions", async t => {
  const writes: any[] = [];
  const audits: any[] = [];
  stub(t, prisma.coachProfile, "findUnique", async () => profile);
  stub(t, prisma.coachServiceOffer, "findUnique", async () => paidOffer);
  stub(t, prisma.coachProfile, "update", async (args: any) => { writes.push(args.data); return { ...profile, ...args.data }; });
  stub(t, prisma.coachServiceOffer, "update", async (args: any) => { writes.push(args.data); return { ...paidOffer, ...args.data }; });
  stub(t, prisma.adminAuditLog, "create", async (args: any) => { audits.push(args.data); return args.data; });
  const app = await appFor(t);
  const headers = { "x-admin-session": await createAdminSessionToken() };
  for (const url of ["/api/admin/coaches/coach/status", "/api/admin/coaches/offers/offer/status"]) {
    for (const status of ["DRAFT", "REJECTED"]) assert.equal((await app.inject({ method: "PATCH", url, headers, payload: { status, moderationNote: "  " } })).statusCode, 400);
  }
  const offerUrl = "/api/admin/coaches/offers/offer/status";
  assert.equal((await app.inject({ method: "PATCH", url: offerUrl, headers, payload: { status: "APPROVED" } })).statusCode, 409);
  assert.equal(writes.length, 0);
  assert.equal((await app.inject({ method: "PATCH", url: "/api/admin/coaches/coach/status", headers, payload: { status: "DRAFT", moderationNote: " Clarify methodology " } })).statusCode, 200);
  assert.equal(writes[0].moderationNote, "Clarify methodology");
  assert.equal(writes[0].acceptingOrders, false);
  assert.equal((await app.inject({ method: "PATCH", url: offerUrl, headers, payload: { status: "APPROVED", coachShareBps: 7000, platformShareBps: 3000 } })).statusCode, 200);
  assert.equal(writes[1].moderationNote, null);
  assert.equal(audits.length, 2);
  assert.equal(audits[0].action, "coach.profile.status");
  assert.equal(audits[1].action, "coach.offer.status");
});

test("public catalog and profile never bypass approval or expose moderation feedback", async t => {
  const approved = { ...profile, status: "APPROVED", serviceOffers: [{ ...paidOffer, status: "APPROVED", coachShareBps: 7000, platformShareBps: 3000 }, { ...paidOffer, id: "included-offer", status: "APPROVED", paymentModel: "INCLUDED", amount: 0 }] };
  stub(t, prisma.coachProfile, "findMany", async (args: any) => {
    assert.equal(args.where.status, "APPROVED");
    assert.equal(args.include.serviceOffers.where.status, "APPROVED");
    assert.equal(args.include.serviceOffers.where.paymentModel, undefined);
    return [approved];
  });
  stub(t, prisma.coachProfile, "findFirst", async (args: any) => {
    assert.equal(args.where.status, "APPROVED");
    assert.equal(args.include.serviceOffers.where.status, "APPROVED");
    assert.equal(args.include.serviceOffers.where.paymentModel, undefined);
    return args.where.slug === "approved" ? approved : null;
  });
  stub(t, prisma.featureFlag, "findUnique", async () => null);
  const app = await appFor(t);
  for (const url of ["/api/coaches", "/api/coaches/approved"]) {
    const response = await app.inject(url);
    assert.equal(response.statusCode, 200);
    const coach = url === "/api/coaches" ? response.json().coaches[0] : response.json().coach;
    assert.equal(coach.services.length, 2);
    assert.equal(coach.services[1].paymentModel, "INCLUDED");
    for (const field of ["moderationNote", "coachShareBps", "platformShareBps", "partnerCorePartnerId"]) assert.equal(response.body.includes(field), false);
  }
  assert.equal((await app.inject("/api/coaches/unapproved?preview=true")).statusCode, 404);
});

test("unapproved coach sites and their public chats stay unavailable", async t => {
  stub(t, prisma.coachSite, "findFirst", async (args: any) => {
    assert.equal(args.where.coachProfile.status, "APPROVED");
    return null;
  });
  const app = await appFor(t);
  assert.equal((await app.inject("/api/coach-sites/by-host?host=unapproved.orken.life")).statusCode, 404);
  assert.equal((await app.inject({ method: "POST", url: "/api/coach-sites/chat", payload: { host: "unapproved.orken.life", message: "Show biography" } })).statusCode, 404);
});

test("public inclusion does not allow checkout of included services or closed coach profiles", async t => {
  stub(t, prisma.coachServiceOrder, "findUnique", async () => null);
  stub(t, prisma.coachServiceOrder, "create", async () => { throw new Error("No order may be created"); });
  stub(t, prisma.coachServiceOffer, "findFirst", async ({ where }: any) => {
    assert.equal(where.paymentModel, "CLIENT_PAID");
    assert.equal(where.status, "APPROVED");
    assert.deepEqual(where.coachProfile, { status: "APPROVED", acceptingOrders: true });
    return null;
  });
  await assert.rejects(createCoachServiceCheckout({ offerId: "included-offer", userId: "test-user", idempotencyKey: "synthetic-checkout" }), /Услуга сейчас недоступна/);
});

test("coach receives feedback, corrects only owned services and resubmits before shares are configured", async t => {
  let storedSession: any = null;
  stub(t, prisma.partnerPortalSession, "findFirst", async () => storedSession);
  stub(t, prisma.partnerPortalSession, "create", async (args: any) => { storedSession = { id: "session", ...args.data }; return storedSession; });
  stub(t, prisma.partnerPortalSession, "update", async () => storedSession);
  const session = await createPartnerPortalSession({ sessionToken: "synthetic-core-session", expiresIn: 1800, partner: { id: profile.partnerCorePartnerId, displayName: profile.displayName, status: "APPROVED" } });
  stub(t, prisma.coachProfile, "findUnique", async (args: any) => {
    assert.equal(args.where.partnerCorePartnerId, profile.partnerCorePartnerId);
    return profile;
  });
  let current = { ...paidOffer };
  stub(t, prisma.coachServiceOffer, "findMany", async (args: any) => { assert.equal(args.where.coachProfileId, profile.id); return [current]; });
  stub(t, prisma.coachServiceOffer, "findFirst", async (args: any) => {
    assert.equal(args.where.coachProfileId, profile.id);
    return args.where.id === current.id ? current : null;
  });
  stub(t, prisma.coachServiceOffer, "update", async (args: any) => {
    if (args.data.status === "DRAFT") assert.equal(args.where.coachProfileId, profile.id);
    current = { ...current, ...args.data, id: current.id };
    return current;
  });
  const app = await appFor(t);
  const headers = { cookie: `orken_partner_session=${session.rawSessionToken}; orken_partner_csrf=synthetic-csrf`, "x-partner-csrf": "synthetic-csrf" };
  assert.equal((await app.inject({ method: "POST", url: "/api/coach/connection-requests/request/decision", headers: { cookie: headers.cookie }, payload: { decision: "accept", funding: "COACH_PAID" } })).statusCode, 403);
  assert.equal((await app.inject({ method: "POST", url: "/api/coach/connection-requests/request/decision", headers, payload: { decision: "accept", funding: "CLIENT_PAID" } })).statusCode, 400);
  const owned = await app.inject({ url: "/api/coach/services", headers });
  assert.equal(owned.statusCode, 200);
  assert.equal(owned.json().offers[0].moderationNote, paidOffer.moderationNote);
  assert.equal(owned.body.includes("synthetic-core-session"), false);
  assert.equal((await app.inject({ method: "POST", url: "/api/coach/services/other-coach-offer/submit-review", headers, payload: {} })).statusCode, 404);
  const payload = { id: current.id, type: current.type, paymentModel: current.paymentModel, title: "Corrected support", description: "Clear expectations for individual coaching", amount: current.amount, currency: current.currency };
  assert.equal((await app.inject({ method: "POST", url: "/api/coach/services", headers: { cookie: headers.cookie }, payload })).statusCode, 403);
  const corrected = await app.inject({ method: "POST", url: "/api/coach/services", headers, payload });
  assert.equal(corrected.statusCode, 200);
  assert.equal(corrected.json().offer.moderationNote, null);
  const resubmitted = await app.inject({ method: "POST", url: `/api/coach/services/${current.id}/submit-review`, headers, payload: {} });
  assert.equal(resubmitted.statusCode, 200);
  assert.equal(resubmitted.json().offer.status, "PENDING_REVIEW");
  assert.equal(resubmitted.json().offer.coachShareBps, null);
});
