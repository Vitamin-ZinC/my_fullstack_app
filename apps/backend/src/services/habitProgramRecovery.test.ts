import assert from "node:assert/strict";
import test from "node:test";
import { planHabitProgramRecovery } from "./habitProgramRecovery.js";

function program(overrides: Record<string, unknown> = {}) {
  return {
    id: "older", userId: "user", sessionId: "session", status: "ACTIVE", source: "analysis-report",
    createdAt: new Date("2026-07-01"), startedAt: new Date("2026-07-01"), currentCycle: 1, currentWeek: 7,
    profile: { name: "User", avatar: "/avatar.png" }, stripeSubscriptionId: null,
    guruStreakCount: 3, legendStatus: true, subscriptionStatus: "TRIAL",
    trialStartedAt: new Date("2026-07-01"), trialEndsAt: new Date("2026-07-15"), subscriptionCurrentPeriodEnd: null,
    rewards: [{ xp: 465 }], enrollments: [{ id: "enrollment", sortOrder: 1, habitDefinitionId: "definition", _count: { coachAssignments: 0 } }],
    _count: { coachRelationships: 0 }, ...overrides
  } as unknown as Parameters<typeof planHabitProgramRecovery>[0][number];
}

test("recovery keeps all earned XP, the farthest week, earliest start and profile", () => {
  const old = program();
  const middle = program({ id: "middle", createdAt: new Date("2026-07-08"), currentWeek: 5, rewards: [{ xp: 705 }] });
  const newest = program({ id: "newest", createdAt: new Date("2026-08-13"), startedAt: new Date("2026-08-13"),
    currentWeek: 6, rewards: [{ xp: 655 }], guruStreakCount: 0, legendStatus: false, profile: { profession: "New role", name: "" },
    trialEndsAt: new Date("2026-08-27") });
  const plan = planHabitProgramRecovery([newest, old, middle]);
  assert.equal(plan.target.id, "newest");
  assert.deepEqual(plan.sources.map((p) => p.id), ["older", "middle"]);
  assert.equal(plan.totalXp, 1825);
  assert.equal(plan.metadata.currentWeek, 7);
  assert.equal(plan.metadata.startedAt.toISOString(), "2026-07-01T00:00:00.000Z");
  assert.deepEqual(plan.metadata.profile, { name: "User", avatar: "/avatar.png", profession: "New role" });
  assert.equal(plan.metadata.legendStatus, true);
  assert.equal(plan.metadata.guruStreakCount, 3);
  assert.equal(plan.metadata.trialEndsAt?.toISOString(), "2026-08-27T00:00:00.000Z");
});

test("recovery rejects cross-account, subscription and coaching dependencies", () => {
  for (const patch of [
    { userId: "other-user" }, { stripeSubscriptionId: "sub_paid" }, { _count: { coachRelationships: 1 } },
    { status: "ARCHIVED" }, { source: "coach-assigned" },
    { enrollments: [{ sortOrder: 1, habitDefinitionId: "definition", _count: { coachAssignments: 1 } }] }
  ]) {
    assert.throws(() => planHabitProgramRecovery([program(), program({ id: "newer", ...patch })]));
  }
});

test("recovery rejects unknown or duplicated catalog mappings instead of losing records", () => {
  assert.throws(() => planHabitProgramRecovery([program(), program({ id: "newer", enrollments: [] })]), /catalog mismatch/);
  const enrollment = { sortOrder: 1, habitDefinitionId: "definition", _count: { coachAssignments: 0 } };
  assert.throws(() => planHabitProgramRecovery([program(), program({ enrollments: [enrollment, enrollment] })]), /catalog mismatch/);
});

test("recovery is unavailable for a single program and does not restart a trial", () => {
  assert.throws(() => planHabitProgramRecovery([program()]), /No duplicate/);
  const plan = planHabitProgramRecovery([program(), program({ id: "newer", createdAt: new Date("2026-07-20"), trialEndsAt: null })]);
  assert.equal(plan.metadata.trialEndsAt?.toISOString(), "2026-07-15T00:00:00.000Z");
});
