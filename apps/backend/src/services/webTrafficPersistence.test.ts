import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";

const testUrl = process.env.WEB_TRAFFIC_TEST_DATABASE_URL;
if (testUrl) {
  const database = new URL(testUrl).pathname.slice(1);
  if (!/^orken_traffic_test_[a-z0-9_]+$/.test(database)) throw new Error("Web traffic persistence tests require a dedicated test database");
  process.env.DATABASE_URL = testUrl;
}

test("PostgreSQL: web traffic retries, conversion cohorts, aggregate SQL and retention", { skip: !testUrl }, async () => {
  const { prisma } = await import("../lib/prisma.js");
  const { env } = await import("../env.js");
  const { saveTrafficView, recordTrafficConversion, recordTrafficReportPaid, getAdminTrafficReport, cleanupWebTraffic, trafficHash } = await import("./webTraffic.js");
  const visitorId = randomUUID();
  const otherVisitor = randomUUID();
  const visitId = randomUUID();
  const followupVisit = randomUUID();
  const userEntity = `test-user:${randomUUID()}`;
  const analysisId = randomUUID();
  const hashes = [trafficHash(visitorId), trafficHash(otherVisitor)];
  const base = { consent: true as const, visitorId, visitId, eventId: randomUUID(), page: "/" as const, source: "telegram", medium: "social", device: "mobile" as const };
  const request = (visitor: string, visit: string): any => ({ headers: { origin: env.APP_ORIGIN, "x-traffic-visitor": visitor, "x-traffic-visit": visit }, log: { warn: () => {} } });
  try {
    assert.equal(await prisma.webTrafficVisit.count(), 0, "The test database must be empty");
    await Promise.all([saveTrafficView(base), saveTrafficView(base)]);
    assert.equal(await prisma.webTrafficVisit.count(), 1);
    assert.equal(await prisma.webTrafficPageView.count(), 1);
    await saveTrafficView({ ...base, eventId: randomUUID(), page: "/coaches" });
    await Promise.all([
      recordTrafficConversion(request(visitorId, visitId), "REGISTRATION", userEntity),
      recordTrafficConversion(request(visitorId, visitId), "REGISTRATION", userEntity)
    ]);
    await recordTrafficConversion(request(visitorId, visitId), "DIAGNOSTIC_STARTED", `analysis:${analysisId}`);
    await recordTrafficConversion(request(visitorId, visitId), "REPORT_CHECKOUT", `report:${analysisId}`);
    await saveTrafficView({ ...base, visitId: followupVisit, eventId: randomUUID(), source: "direct" });
    const paid = { amount: 300, paidAt: new Date(Date.now() + 1), stripePaymentIntentId: "pi_synthetic" };
    await Promise.all([
      recordTrafficReportPaid(request(visitorId, followupVisit), analysisId, paid),
      recordTrafficReportPaid(request(visitorId, followupVisit), analysisId, paid)
    ]);
    const payment = await prisma.webTrafficConversion.findUnique({ where: { kind_entityHash: { kind: "REPORT_PAID", entityHash: trafficHash(`report:${analysisId}`) } } });
    assert.equal(payment?.visitId, trafficHash(`${visitorId}:${visitId}`), "A return visit must not replace the checkout cohort");
    await saveTrafficView({ ...base, visitorId: otherVisitor, visitId: randomUUID(), eventId: randomUUID(), source: "google", medium: "organic", device: "desktop" });

    const report = await getAdminTrafficReport(7);
    assert.deepEqual(report.totals, { visitors: 2, visits: 3, pageViews: 4 });
    assert.deepEqual(report.conversions, { registrationVisits: 1, diagnosticVisits: 1, paidReportVisits: 1 });
    assert.equal(report.sources.find(row => row.source === "telegram")?.paidReports, 1);
    assert.equal(report.sources.find(row => row.source === "direct")?.paidReports, 0);
    assert.equal(report.daily.reduce((sum, row) => sum + row.pageViews, 0), 4);
    assert.equal(report.pages.find(row => row.page === "/coaches")?.pageViews, 1);
    for (const secret of [visitorId, visitId, analysisId, userEntity]) assert.equal(JSON.stringify(report).includes(secret), false);

    await prisma.webTrafficVisit.update({ where: { id: trafficHash(`${visitorId}:${visitId}`) }, data: { lastSeenAt: new Date(Date.now() - 31 * 60000) } });
    assert.equal((await saveTrafficView({ ...base, eventId: randomUUID() })).rotateVisit, true);
    await prisma.webTrafficVisit.update({ where: { id: trafficHash(`${visitorId}:${visitId}`) }, data: { createdAt: new Date(Date.now() - 181 * 86400000) } });
    const cleanup = await cleanupWebTraffic();
    assert.equal(cleanup.count, 1);
    assert.equal(await prisma.webTrafficPageView.count(), 2);
    assert.equal(await prisma.webTrafficConversion.count(), 0, "Retention must cascade to conversions");
  } finally {
    await prisma.webTrafficVisit.deleteMany({ where: { visitorHash: { in: hashes } } });
    await prisma.$disconnect();
  }
});
