import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import { ensureHabitProgram, habitProgramOwnerKey, habitProgramOwnerWhere } from "./habitProgramIdentity.js";

const owner = { id: "session-1", userId: "user-1" };
const profile = {
  title: "New direction", weakZone: "mission", archetype: "Strategist", topRole: "Product strategist",
  careerAction: "Test a direction", finalInsight: "A new insight", raw: { profession: "Strategist", weakZone: "mission" }
};
const report = { id: "analysis-2", createdAt: new Date("2026-10-02"), profile };
const createData = { userId: owner.userId, sessionId: owner.id, title: profile.title, analysisId: report.id, source: "analysis-report" };

function fixture(initial: any[] = []) {
  const programs = structuredClone(initial);
  const patches: any[] = [];
  const locks: string[] = [];
  const waiters = new Map<string, Promise<void>>();
  const db = {
    async $transaction(run: (tx: any) => Promise<any>) {
      let release: (() => void) | undefined;
      const tx = {
        async $queryRaw(_sql: unknown, key: string) {
          locks.push(key);
          const previous = waiters.get(key) ?? Promise.resolve();
          const current = new Promise<void>((resolve) => { release = resolve; });
          waiters.set(key, previous.then(() => current));
          await previous;
          return [{ locked: 1 }];
        },
        habitProgram: {
          async findFirst({ where }: any) {
            return programs.find((p: any) => p.status === where.status &&
              (where.userId ? p.userId === where.userId : !p.userId && p.sessionId === where.sessionId)) ?? null;
          },
          async create({ data }: any) {
            await Promise.resolve();
            const program = { id: `program-${programs.length + 1}`, status: "ACTIVE", ...data, analysis: { createdAt: report.createdAt } };
            programs.push(program);
            return program;
          },
          async update({ where, data }: any) {
            patches.push(data);
            const program = programs.find((p: any) => p.id === where.id);
            const { rewards, insights, ...fields } = data;
            Object.assign(program, fields, { analysis: { createdAt: report.createdAt } });
            if (rewards) program.rewards.push(...rewards.create);
            if (insights) program.insights.push(...insights.create);
            return program;
          }
        }
      };
      try { return await run(tx); } finally { release?.(); }
    }
  } as unknown as Pick<PrismaClient, "$transaction">;
  return { db, programs, patches, locks };
}

function existingProgram(overrides: Record<string, unknown> = {}) {
  return {
    id: "existing", userId: owner.userId, sessionId: "old-session", status: "ACTIVE",
    analysisId: "analysis-1", analysis: { createdAt: new Date("2026-09-01") }, source: "analysis-report",
    profile: { name: "User", avatar: "/api/uploads/avatar.png", focus: "energy", profession: "Old role" },
    currentCycle: 2, currentWeek: 7, startedAt: new Date("2026-07-01"),
    subscriptionStatus: "ACTIVE", stripeSubscriptionId: "sub_existing", trialEndsAt: new Date("2026-07-15"),
    subscriptionCurrentPeriodEnd: new Date("2026-11-01"), reminderTime: "21:00", weeklyFreezes: 0,
    legendStatus: true, guruStreakCount: 3, currentRankProvisional: "Existing rank",
    rewards: [{ id: "reward", xp: 705 }], checkins: [{ id: "checkin", completed: true }],
    dailyMetrics: [{ energy: 8, clarity: 7, stability: 9 }], insights: [{ text: "My insight" }],
    ...overrides
  };
}

test("repeat diagnosis updates the same program without touching progress, payment, rank or identity", async () => {
  const original = existingProgram();
  const { db, programs, patches } = fixture([original]);
  const result = await ensureHabitProgram(db, owner, createData, report);
  assert.equal(result.program.id, original.id);
  assert.equal(result.action, "updated");
  assert.equal(programs.length, 1);
  for (const key of ["rewards", "checkins", "dailyMetrics", "currentCycle", "currentWeek", "startedAt",
    "subscriptionStatus", "stripeSubscriptionId", "trialEndsAt", "subscriptionCurrentPeriodEnd", "reminderTime",
    "weeklyFreezes", "legendStatus", "guruStreakCount", "currentRankProvisional"]) {
    assert.deepEqual(programs[0][key], original[key as keyof typeof original], key);
    assert.equal(patches[0][key], undefined, `must not reset ${key}`);
  }
  assert.equal(programs[0].profile.name, original.profile.name);
  assert.equal(programs[0].profile.avatar, original.profile.avatar);
  assert.equal(programs[0].profile.focus, original.profile.focus);
  assert.equal(programs[0].profile.profession, profile.raw.profession);
  assert.equal(programs[0].insights.length, 2);
  assert.equal(programs[0].analysisId, report.id);
});

test("same or older reports cannot add XP, duplicate insights or roll back recommendations", async () => {
  for (const candidate of [report, { ...report, id: "older", createdAt: new Date("2026-08-01") }]) {
    const { db, programs, patches } = fixture([existingProgram({ analysisId: report.id, analysis: { createdAt: report.createdAt } })]);
    assert.equal((await ensureHabitProgram(db, owner, createData, candidate)).action, "unchanged");
    assert.equal(programs[0].analysisId, report.id);
    assert.equal(patches.length, 0);
  }
});

test("first personalization preserves the manual profile and adds its reward exactly once", async () => {
  const { db, programs } = fixture([existingProgram({ analysisId: null, analysis: null, source: "manual-start" })]);
  assert.equal((await ensureHabitProgram(db, owner, createData, report)).action, "personalized");
  assert.equal((await ensureHabitProgram(db, owner, createData, report)).action, "unchanged");
  assert.equal(programs[0].rewards.reduce((sum: number, r: any) => sum + r.xp, 0), 725);
  assert.equal(programs[0].profile.name, "User");
});

test("concurrent starts and report activations share an account lock and create only one program", async () => {
  const { db, programs, locks } = fixture();
  const results = await Promise.all([
    ensureHabitProgram(db, owner, createData),
    ensureHabitProgram(db, { ...owner, id: "other-session" }, createData, report),
    ensureHabitProgram(db, owner, createData, report)
  ]);
  assert.equal(programs.length, 1);
  assert.equal(results.filter((r) => r.action === "created").length, 1);
  assert.equal(new Set(results.map((r) => r.program.id)).size, 1);
  assert.equal(new Set(locks).size, 1);
});

test("account scope cannot reuse another user's program even when the session ID matches", async () => {
  const { db, programs } = fixture([existingProgram({ userId: "other-user", sessionId: owner.id })]);
  assert.equal((await ensureHabitProgram(db, owner, createData, report)).action, "created");
  assert.equal(programs.length, 2);
  assert.deepEqual(habitProgramOwnerWhere(owner), { userId: owner.userId });
  assert.deepEqual(habitProgramOwnerWhere({ ...owner, userId: null }), { sessionId: owner.id, userId: null });
  assert.notEqual(habitProgramOwnerKey(owner), habitProgramOwnerKey({ ...owner, userId: null }));
});

test("manual start does not reset an already personalized program", async () => {
  const { db, patches } = fixture([existingProgram()]);
  const result = await ensureHabitProgram(db, owner, createData);
  assert.equal(result.action, "unchanged");
  assert.equal(result.program.id, "existing");
  assert.equal(patches.length, 0);
});
