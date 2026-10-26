import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import rateLimit from "@fastify/rate-limit";

process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/orken_test";
const { prisma } = await import("../lib/prisma.js");
const { env } = await import("../env.js");
const { webTrafficRoutes } = await import("../routes/webTraffic.js");
const { adminRoutes } = await import("../routes/admin.js");
const { createAdminSessionToken } = await import("../lib/auth.js");
const { trafficViewSchema, trafficHash, trafficRange, saveTrafficView, recordTrafficConversion, recordTrafficReportPaid, cleanupWebTraffic, getAdminTrafficReport } = await import("./webTraffic.js");
const { trafficPageForPath } = await import("@levelup/contracts");

function stub(t: TestContext, model: any, method: string, implementation: (...args: any[]) => unknown) {
  const original = model[method]; model[method] = t.mock.fn(implementation); t.after(() => { model[method] = original; });
}
const input = () => ({ consent: true as const, visitorId: randomUUID(), visitId: randomUUID(), eventId: randomUUID(), page: "/" as const, source: "telegram", medium: "social", campaign: "autumn_launch", device: "mobile" as const });

test("traffic schemas exclude identifiers, arbitrary paths, URLs, credentials and conversion claims", () => {
  const view = input();
  assert.equal(trafficViewSchema.safeParse(view).success, true);
  for (const override of [{ consent: false }, { page: "/admin" }, { page: "/login?token=private" }, { source: "user@example.com" }, { campaign: "session_secret" }, { source: "https://site.test" }, { userId: "victim" }, { kind: "REGISTRATION" }, { properties: { text: "private" } }, { visitorId: "predictable" }]) {
    assert.equal(trafficViewSchema.safeParse({ ...view, ...override }).success, false);
  }
  assert.equal(trafficPageForPath("/coaches/some-coach"), "/coaches/[profile]");
  assert.equal(trafficPageForPath("/report/private-report/full"), "/report/[report]/full");
  for (const path of ["/admin/traffic", "/docs", "/demo", "/founder-chat", "/coaches/material/private-token", "/api/traffic/views"]) assert.equal(trafficPageForPath(path), null);
  assert.deepEqual(trafficRange(7, new Date("2026-10-22T23:59:59Z")), { from: new Date("2026-10-16T00:00:00Z"), to: new Date("2026-10-22T23:59:59Z") });
});

test("page view retry deduplicates, attribution stays first-touch and expired visits rotate", async t => {
  const visits = new Map<string, any>(); const views = new Map<string, any>();
  const tx = {
    webTrafficVisit: {
      upsert: async ({ where, create, update }: any) => { assert.deepEqual(update, {}); if (!visits.has(where.id)) visits.set(where.id, create); return visits.get(where.id); },
      update: async ({ where, data }: any) => Object.assign(visits.get(where.id), data)
    },
    webTrafficPageView: { createMany: async ({ data, skipDuplicates }: any) => { assert.equal(skipDuplicates, true); const fresh = !views.has(data[0].id); views.set(data[0].id, data[0]); return { count: fresh ? 1 : 0 }; } }
  };
  stub(t, prisma, "$transaction", async (run: any) => run(tx));
  const body = input();
  await saveTrafficView(body); await saveTrafficView({ ...body, source: "changed" });
  assert.equal(visits.size, 1); assert.equal(views.size, 1);
  const visit = [...visits.values()][0]; assert.equal(visit.source, "telegram");
  assert.equal(JSON.stringify(visit).includes(body.visitorId), false);
  assert.equal(JSON.stringify([...views.values()]).includes(body.visitId), false);
  visit.lastSeenAt = new Date(Date.now() - 31 * 60000);
  assert.deepEqual(await saveTrafficView({ ...body, eventId: randomUUID() }), { ok: false, rotateVisit: true });
  assert.equal(views.size, 1);
});

test("public ingest requires same origin and consent, ignores DNT, GPC and bots, and rate limits", async t => {
  stub(t, prisma.appSetting, "findUnique", async () => null);
  stub(t, prisma, "$transaction", async () => ({ ok: true, rotateVisit: false }));
  const app = Fastify(); t.after(() => app.close());
  await app.register(rateLimit, { max: 200 }); await app.register(webTrafficRoutes);
  const headers = { origin: env.APP_ORIGIN, "user-agent": "Browser" };
  assert.equal((await app.inject("/api/traffic/config")).json().enabled, true);
  assert.equal((await app.inject({ method: "POST", url: "/api/traffic/views", payload: input() })).statusCode, 403);
  assert.equal((await app.inject({ method: "POST", url: "/api/traffic/views", headers: { origin: "https://evil.test" }, payload: input() })).statusCode, 403);
  assert.equal((await app.inject({ method: "POST", url: "/api/traffic/views", headers, payload: { ...input(), consent: false } })).statusCode, 400);
  for (const extra of [{ dnt: "1" }, { "sec-gpc": "1" }, { "user-agent": "HeadlessChrome" }]) {
    assert.equal((await app.inject({ method: "POST", url: "/api/traffic/views", headers: { ...headers, ...extra }, payload: input() })).json().ignored, true);
  }
  assert.equal((await app.inject({ method: "POST", url: "/api/traffic/views", headers, payload: input() })).json().ok, true);
  stub(t, prisma.appSetting, "findUnique", async () => ({ value: false }));
  assert.equal((await app.inject({ method: "POST", url: "/api/traffic/views", headers, payload: input() })).json().ignored, true);
  for (let index = 0; index < 90; index++) await app.inject({ method: "POST", url: "/api/traffic/views", headers, payload: input() });
  assert.equal((await app.inject({ method: "POST", url: "/api/traffic/views", headers, payload: input() })).statusCode, 429);
});

test("conversion writes are server-only, scoped to an active consent visit and idempotent", async t => {
  const body = input(); const rows = new Map<string, any>();
  stub(t, prisma.appSetting, "findUnique", async () => null);
  stub(t, prisma.webTrafficVisit, "findFirst", async ({ where }: any) => {
    assert.equal(where.id, trafficHash(`${body.visitorId}:${body.visitId}`));
    assert.ok(where.lastSeenAt.gte instanceof Date); return { id: where.id };
  });
  stub(t, prisma.webTrafficConversion, "createMany", async ({ data, skipDuplicates }: any) => { assert.equal(skipDuplicates, true); const row = data[0]; rows.set(`${row.kind}:${row.entityHash}`, row); return { count: 1 }; });
  const request: any = { headers: { origin: env.APP_ORIGIN }, log: { warn: t.mock.fn() } };
  await recordTrafficConversion(request, "REGISTRATION", "user:server-id"); assert.equal(rows.size, 0);
  Object.assign(request.headers, { "x-traffic-visitor": body.visitorId, "x-traffic-visit": body.visitId });
  await recordTrafficConversion(request, "REGISTRATION", "user:server-id");
  await recordTrafficConversion(request, "REGISTRATION", "user:server-id");
  assert.equal(rows.size, 1); assert.equal(JSON.stringify([...rows.values()]).includes("server-id"), false);
  request.headers.dnt = "1"; await recordTrafficConversion(request, "DIAGNOSTIC_STARTED", "analysis:x"); assert.equal(rows.size, 1);
  delete request.headers.dnt;
  stub(t, prisma.webTrafficVisit, "findFirst", async () => null);
  await recordTrafficConversion(request, "DIAGNOSTIC_STARTED", "analysis:x"); assert.equal(rows.size, 1);
  stub(t, prisma.appSetting, "findUnique", async () => { throw new Error("Database unavailable"); });
  await assert.doesNotReject(recordTrafficConversion(request, "REGISTRATION", "user:x"));
  assert.equal(request.log.warn.mock.callCount(), 1);
});

test("verified report payments require current consent, match checkout browser, and deduplicate returns", async t => {
  const rows = new Map<string, any>();
  const body = input();
  const request: any = { headers: { "sec-fetch-site": "same-origin", referer: `${env.APP_ORIGIN}/report/private-id/full`, "x-traffic-visitor": body.visitorId, "x-traffic-visit": body.visitId } };
  const payment = { amount: 300, paidAt: new Date(), stripePaymentIntentId: "pi_verified" };
  stub(t, prisma.appSetting, "findUnique", async () => null);
  stub(t, prisma.webTrafficVisit, "findFirst", async () => ({ id: "current-visit" }));
  stub(t, prisma.webTrafficConversion, "findUnique", async ({ where }: any) => { assert.equal(where.kind_entityHash.kind, "REPORT_CHECKOUT"); return { visitId: "hashed-visit", createdAt: new Date(Date.now() - 60000), visit: { visitorHash: trafficHash(body.visitorId) } }; });
  stub(t, prisma.webTrafficConversion, "createMany", async ({ data }: any) => { rows.set(data[0].entityHash, data[0]); });
  await recordTrafficReportPaid(request, "analysis-server-id", payment); await recordTrafficReportPaid(request, "analysis-server-id", payment);
  assert.equal(rows.size, 1); assert.equal([...rows.values()][0].kind, "REPORT_PAID");
  await recordTrafficReportPaid(request, "free-promo", { ...payment, amount: 0 }); assert.equal(rows.size, 1);
  await recordTrafficReportPaid({ headers: {} } as any, "opted-out", payment); assert.equal(rows.size, 1);
  await recordTrafficReportPaid(request, "dev-payment", { ...payment, stripePaymentIntentId: "dev_fake" }); assert.equal(rows.size, 1);
  stub(t, prisma.webTrafficConversion, "findUnique", async () => ({ createdAt: new Date(0), visitId: "other", visit: { visitorHash: trafficHash("other-browser") } }));
  await recordTrafficReportPaid(request, "other-browser", payment); assert.equal(rows.size, 1);
  stub(t, prisma.webTrafficConversion, "findUnique", async () => null);
  await recordTrafficReportPaid(request, "unattributed", payment); assert.equal(rows.size, 1);
  let deletion: any;
  stub(t, prisma.webTrafficVisit, "deleteMany", async args => { deletion = args; return { count: 1 }; });
  await cleanupWebTraffic(); assert.ok(deletion.where.createdAt.lt < new Date(Date.now() - 179 * 86400000));
});

test("admin traffic report is protected, bounded, aggregate-only and keeps business totals separate", async t => {
  const app = Fastify(); t.after(() => app.close()); await app.register(adminRoutes);
  assert.equal((await app.inject("/api/admin/reports/traffic")).statusCode, 403);
  const headers = { "x-admin-session": await createAdminSessionToken() };
  for (const days of ["0", "181", "abc", "1.5"]) assert.equal((await app.inject({ url: `/api/admin/reports/traffic?days=${days}`, headers })).statusCode, 400);
  stub(t, prisma.appSetting, "findUnique", async () => null);
  stub(t, prisma.webTrafficVisit, "findFirst", async () => null);
  stub(t, prisma, "$queryRaw", async (query: any) => {
    assert.ok(query.values.some((value: unknown) => value instanceof Date));
    if (query.sql.includes('AS "registrationVisits"')) return [{ registrationVisits: 1, diagnosticVisits: 2, paidReportVisits: 0 }];
    if (query.sql.includes('AS visitors, COUNT(*)::int AS visits,')) return [{ visitors: 3, visits: 4, pageViews: 8 }];
    return [];
  });
  stub(t, prisma.user, "count", async () => 12); stub(t, prisma.analysis, "count", async () => 15); stub(t, prisma.payment, "count", async args => { assert.equal(args.where.amount.gt, 0); return 2; });
  const response = await app.inject({ url: "/api/admin/reports/traffic?days=7", headers });
  assert.equal(response.statusCode, 200); assert.equal(response.headers["cache-control"], "no-store");
  const report = response.json(); assert.equal(report.daily.length, 7); assert.equal(report.range.timezone, "UTC");
  assert.equal(report.business.registrations, 12); assert.equal(report.conversions.registrationVisits, 1);
  assert.equal(report.observedSince, null); assert.equal(report.daily[0].pageViews, 0);
  for (const forbidden of ["visitorHash", "entityHash", "userId", "email", "sessionId"]) assert.equal(response.body.includes(forbidden), false);
  assert.equal((await app.inject({ method: "PUT", url: "/api/admin/settings/traffic_analytics_enabled", headers, payload: { value: "false" } })).statusCode, 400);
  assert.equal((await app.inject({ method: "PUT", url: "/api/admin/settings/traffic_analytics_enabled", payload: { value: false } })).statusCode, 403);
});
