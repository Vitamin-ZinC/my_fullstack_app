import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { safeAccountReturnPath } from "@levelup/contracts";

process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:1/test";
const { prisma } = await import("../lib/prisma.js");
const { requestCoachConnection, decideCoachConnectionRequest, cancelCoachConnectionRequest, serializeCoachConnectionRequest } = await import("./coachConnections.js");
const { serializeCoachClient, resolveHabitAccessForUser } = await import("./coachPlatform.js");

function stub(t: TestContext, model: any, method: string, fn: (...args: any[]) => unknown) {
  const original = model[method]; model[method] = t.mock.fn(fn);
  t.after(() => { model[method] = original; });
}

function fixture(t: TestContext) {
  const requests: any[] = [], relationships: any[] = [];
  const coach: any = { id: "coach", displayName: "Coach", slug: "coach", status: "APPROVED", acceptingOrders: true };
  const program: any = { id: "program", userId: "user", status: "ACTIVE", subscriptionStatus: "EXPIRED", rewards: [{ xp: 540 }] };
  let subscription: any = { clientLimit: 1 };
  const matches = (row: any, where: any) => Object.entries(where).every(([key, value]: any) => value && typeof value === "object" && "in" in value ? value.in.includes(row[key]) : row[key] === value);
  const include = (row: any) => row ? { ...row, coachProfile: coach, user: { name: row.userId, email: `${row.userId}@example.invalid` }, relationship: relationships.find(item => item.id === row.relationshipId) ?? null } : null;
  const requestModel = {
    findUnique: async ({ where }: any) => include(requests.find(row => matches(row, where.coachProfileId_userId ?? where))),
    findUniqueOrThrow: async ({ where }: any) => { const row = requests.find(row => matches(row, where)); assert.ok(row); return include(row); },
    findFirst: async ({ where }: any) => include(requests.find(row => matches(row, where))),
    findFirstOrThrow: async ({ where }: any) => { const row = requests.find(row => matches(row, where)); assert.ok(row); return row; },
    count: async ({ where }: any) => requests.filter(row => matches(row, where)).length,
    upsert: async ({ where, create, update }: any) => {
      let row = requests.find(row => matches(row, where.coachProfileId_userId));
      if (row) Object.assign(row, update);
      else { row = { id: `request-${requests.length}`, status: "PENDING", message: null, decisionNote: null, relationshipId: null, createdAt: new Date(), decidedAt: null, ...create }; requests.push(row); }
      return include(row);
    },
    update: async ({ where, data }: any) => { const row = requests.find(row => matches(row, where)); assert.ok(row); Object.assign(row, data); return include(row); }
  };
  const tx = {
    $queryRaw: async () => [{ locked: 1 }], coachConnectionRequest: requestModel,
    coachProfile: { findFirst: async ({ where }: any) => matches(coach, where) ? coach : null },
    coachSubscription: { findFirst: async () => subscription },
    habitProgram: { findFirst: async () => program },
    coachClientRelationship: {
      findFirst: async ({ where }: any) => relationships.find(row => matches(row, where)) ?? null,
      count: async ({ where }: any) => relationships.filter(row => matches(row, where)).length,
      create: async ({ data }: any) => { const row = { id: `relationship-${relationships.length}`, metricsConsentAt: null, journalConsentAt: null, ...data }; relationships.push(row); return row; }
    }
  };
  let tail = Promise.resolve();
  stub(t, prisma, "$transaction", async (run: (tx: any) => unknown) => {
    const previous = tail; let release!: () => void;
    tail = new Promise<void>(resolve => { release = resolve; }); await previous;
    try { return await run(tx); } finally { release(); }
  });
  stub(t, prisma.coachConnectionRequest, "findFirst", requestModel.findFirst);
  return { requests, relationships, coach, program, setSubscription: (value: any) => { subscription = value; } };
}

test("repeated concurrent applications create one pending request, not a subscription or relationship", async t => {
  const data = fixture(t);
  const results = await Promise.all([requestCoachConnection("user", "coach", "My goals"), requestCoachConnection("user", "coach", "My goals")]);
  assert.equal(new Set(results.map(row => row.id)).size, 1);
  assert.equal(data.requests.length, 1);
  assert.equal(data.relationships.length, 0);
  assert.equal(data.program.subscriptionStatus, "EXPIRED");
  assert.equal(data.program.rewards[0].xp, 540);
  assert.equal("client" in serializeCoachConnectionRequest(results[0]), false);
  assert.equal(serializeCoachConnectionRequest(results[0], true).client?.email, "user@example.invalid");
});

test("unapproved and closed coaches reject new applications", async t => {
  const data = fixture(t);
  data.coach.status = "PENDING_REVIEW";
  await assert.rejects(requestCoachConnection("user", "coach", null), (error: any) => error.statusCode === 404);
  data.coach.status = "APPROVED"; data.coach.acceptingOrders = false;
  await assert.rejects(requestCoachConnection("user", "coach", null), (error: any) => error.code === "COACH_CLOSED");
  assert.equal(data.requests.length, 0);
});

test("coach acceptance is scoped, idempotent, reserves one package slot and never grants data consent", async t => {
  const data = fixture(t);
  const request = await requestCoachConnection("user", "coach", null);
  await assert.rejects(decideCoachConnectionRequest("other-coach", request.id, { decision: "accept", funding: "COACH_PAID" }), (error: any) => error.statusCode === 404);
  const result = await decideCoachConnectionRequest("coach", request.id, { decision: "accept", funding: "COACH_PAID" });
  assert.equal(result.status, "ACCEPTED");
  await decideCoachConnectionRequest("coach", request.id, { decision: "accept", funding: "COACH_PAID" });
  assert.equal(data.relationships.length, 1);
  assert.equal(data.relationships[0].status, "PENDING");
  assert.equal(data.relationships[0].metricsConsentAt, null);
  assert.equal(data.relationships[0].journalConsentAt, null);
});

test("concurrent requests cannot consume the last package slot twice; self-funded uses no slot", async t => {
  const data = fixture(t);
  const one = await requestCoachConnection("one", "coach", null);
  const two = await requestCoachConnection("two", "coach", null);
  const results = await Promise.allSettled([one, two].map(row => decideCoachConnectionRequest("coach", row.id, { decision: "accept", funding: "COACH_PAID" })));
  assert.equal(results.filter(item => item.status === "fulfilled").length, 1);
  const pending = data.requests.find(row => row.status === "PENDING");
  await decideCoachConnectionRequest("coach", pending.id, { decision: "accept", funding: "SELF_FUNDED" });
  assert.equal(data.relationships.filter(row => row.funding === "COACH_PAID").length, 1);
  assert.equal(data.relationships.filter(row => row.funding === "SELF_FUNDED").length, 1);
});

test("applications can be cancelled only by their client; declined requests require a reason and cooldown", async t => {
  const data = fixture(t);
  const one = await requestCoachConnection("one", "coach", null);
  await assert.rejects(cancelCoachConnectionRequest("other", one.id), (error: any) => error.statusCode === 404);
  await cancelCoachConnectionRequest("one", one.id);
  await cancelCoachConnectionRequest("one", one.id);
  await assert.rejects(decideCoachConnectionRequest("coach", one.id, { decision: "accept", funding: "SELF_FUNDED" }), (error: any) => error.statusCode === 409);
  const two = await requestCoachConnection("two", "coach", null);
  await assert.rejects(decideCoachConnectionRequest("coach", two.id, { decision: "decline", funding: "SELF_FUNDED" }), (error: any) => error.statusCode === 400);
  await decideCoachConnectionRequest("coach", two.id, { decision: "decline", funding: "SELF_FUNDED", note: "No availability" });
  await assert.rejects(requestCoachConnection("two", "coach", null), (error: any) => error.code === "REQUEST_COOLDOWN");
  assert.equal(data.requests.find(row => row.id === two.id).decisionNote, "No availability");
});

test("a pending or revoked relationship cannot expose even summary metrics or last activity", () => {
  for (const input of [{ status: "PENDING", metricsConsentAt: new Date() }, { status: "ACTIVE", metricsConsentAt: null }, { status: "PAUSED", metricsConsentAt: new Date() }]) {
    const client = serializeCoachClient({ id: "relationship", userId: "user", ...input, habitProgram: { dailyMetrics: [{ date: new Date(), energy: 1, clarity: 1, stability: 1 }], enrollments: [{ checkins: [{ date: new Date(), completed: true }] }] } });
    for (const key of ["weeklyAverage", "latestEnergy", "latestClarity", "latestStability", "lastCheckinAt", "attentionReason"] as const) assert.equal(client[key], null, key);
  }
});

test("self-funded connections do not grant habit access without the client's own entitlement", async t => {
  stub(t, prisma.habitProgram, "findFirst", async () => ({ id: "program", subscriptionStatus: "EXPIRED" }));
  stub(t, prisma.coachClientRelationship, "findFirst", async ({ where }: any) => {
    assert.equal(JSON.stringify(where).includes("SELF_FUNDED"), false);
    assert.equal(where.status, "ACTIVE");
    return null;
  });
  assert.equal((await resolveHabitAccessForUser("user")).allowed, false);
});

test("login return paths preserve coach selection and invitations but cannot redirect off-site", () => {
  assert.equal(safeAccountReturnPath("/habits/coaching?coach=anna&admin=true"), "/habits/coaching?coach=anna");
  assert.equal(safeAccountReturnPath("/habits/coaching?coach_invite=synthetic-token-1234567890"), "/habits/coaching?coach_invite=synthetic-token-1234567890");
  for (const value of ["https://example.com", "//example.com", "/\\example.com", "/admin", "/login?token=secret", "/%2F%2Fexample.com", "javascript:alert(1)"]) assert.equal(safeAccountReturnPath(value), "/account");
});
