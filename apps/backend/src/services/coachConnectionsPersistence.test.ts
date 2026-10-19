import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

const url = process.env.COACH_CONNECTION_TEST_DATABASE_URL;
process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:1/test";
const { prisma } = await import("../lib/prisma.js");
const { requestCoachConnection, decideCoachConnectionRequest, cancelCoachConnectionRequest } = await import("./coachConnections.js");
const { resolveHabitAccessForUser, serializeCoachClient } = await import("./coachPlatform.js");

test("PostgreSQL: catalog requests, isolated identities, last-slot concurrency and self-funded access", { skip: !url }, async () => {
  assert.match(new URL(url!).pathname, /^\/orken_connection_test_[a-z0-9_]+$/);
  assert.equal(url, process.env.DATABASE_URL, "Only a dedicated disposable test database may run these fixtures");
  try {
    const coach = await prisma.coachProfile.create({ data: { partnerCorePartnerId: `synthetic-${randomUUID()}`, slug: `test-${randomUUID()}`, displayName: "Synthetic coach", status: "APPROVED", acceptingOrders: true } });
    const users = await Promise.all(Array.from({ length: 4 }, () => prisma.user.create({ data: { email: `${randomUUID()}@example.invalid` } })));
    const program = await prisma.habitProgram.create({ data: { userId: users[0].id, title: "Existing progress", source: "manual-start", subscriptionStatus: "EXPIRED", rewards: { create: [{ type: "test", label: "Existing XP", xp: 540 }] }, dailyMetrics: { create: [{ date: new Date("2026-10-01"), energy: 1, clarity: 2, stability: 3 }] } } });
    const attempts = await Promise.all(Array.from({ length: 3 }, () => requestCoachConnection(users[0].id, coach.id, "Synthetic goals")));
    assert.equal(new Set(attempts.map(row => row.id)).size, 1);
    assert.equal(await prisma.coachClientRelationship.count({ where: { coachProfileId: coach.id } }), 0);
    await assert.rejects(decideCoachConnectionRequest("different-coach", attempts[0].id, { decision: "accept", funding: "SELF_FUNDED" }), (error: any) => error.statusCode === 404);
    const accepted = await decideCoachConnectionRequest(coach.id, attempts[0].id, { decision: "accept", funding: "SELF_FUNDED" });
    await decideCoachConnectionRequest(coach.id, attempts[0].id, { decision: "accept", funding: "COACH_PAID" });
    const relationship = await prisma.coachClientRelationship.findUniqueOrThrow({ where: { id: accepted.relationshipId! }, include: { habitProgram: { include: { dailyMetrics: true } } } });
    assert.equal(relationship.funding, "SELF_FUNDED");
    assert.equal(relationship.status, "PENDING");
    assert.equal(relationship.metricsConsentAt, null); assert.equal(relationship.journalConsentAt, null);
    assert.equal(serializeCoachClient(relationship).latestEnergy, null);
    await prisma.coachClientRelationship.update({ where: { id: relationship.id }, data: { status: "ACTIVE", metricsConsentAt: new Date() } });
    assert.equal((await resolveHabitAccessForUser(users[0].id)).allowed, false);
    const unchanged = await prisma.habitProgram.findUniqueOrThrow({ where: { id: program.id }, include: { rewards: true } });
    assert.equal(unchanged.subscriptionStatus, "EXPIRED");
    assert.equal(unchanged.rewards.reduce((sum, reward) => sum + reward.xp, 0), 540);

    const plan = await prisma.coachPlan.create({ data: { code: `test-${randomUUID()}`, name: "One client", includedClients: 1 } });
    await prisma.coachSubscription.create({ data: { coachProfileId: coach.id, planId: plan.id, status: "ACTIVE", amount: 3900, clientLimit: 1, idempotencyKey: randomUUID(), currentPeriodEnd: new Date("2099-01-01") } });
    const [one, two] = await Promise.all(users.slice(1, 3).map(user => requestCoachConnection(user.id, coach.id, null)));
    const outcomes = await Promise.allSettled([one, two].map(row => decideCoachConnectionRequest(coach.id, row.id, { decision: "accept", funding: "COACH_PAID" })));
    assert.equal(outcomes.filter(row => row.status === "fulfilled").length, 1);
    assert.equal(outcomes.filter(row => row.status === "rejected" && row.reason.code === "COACH_SLOT_UNAVAILABLE").length, 1);
    assert.equal(await prisma.coachClientRelationship.count({ where: { coachProfileId: coach.id, funding: "COACH_PAID", status: { in: ["PENDING", "ACTIVE"] } } }), 1);
    const pending = await requestCoachConnection(users[3].id, coach.id, null);
    await assert.rejects(cancelCoachConnectionRequest(users[0].id, pending.id), (error: any) => error.statusCode === 404);
    await cancelCoachConnectionRequest(users[3].id, pending.id);
    await assert.rejects(decideCoachConnectionRequest(coach.id, pending.id, { decision: "accept", funding: "SELF_FUNDED" }), (error: any) => error.code === "REQUEST_DECIDED");
  } finally { await prisma.$disconnect(); }
});
