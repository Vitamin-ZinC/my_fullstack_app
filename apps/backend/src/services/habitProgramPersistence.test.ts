import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { PrismaClient, type Prisma } from "@prisma/client";
import { ensureHabitProgram } from "./habitProgramIdentity.js";
import { recoverHabitPrograms } from "./habitProgramRecovery.js";

const url = process.env.HABIT_PROGRAM_TEST_DATABASE_URL;

async function withRollback(run: (tx: Prisma.TransactionClient) => Promise<void>) {
  const db = new PrismaClient({ datasources: { db: { url } } });
  const rollback = new Error("ROLLBACK_TEST_FIXTURES");
  try {
    await assert.rejects(db.$transaction(async (tx) => {
      await run(tx);
      throw rollback;
    }, { timeout: 30000 }), (error) => error === rollback);
  } finally { await db.$disconnect(); }
}

async function fixtures(tx: Prisma.TransactionClient) {
  const session = await tx.session.create({ data: { guestToken: randomUUID(), expiresAt: new Date("2099-01-01") } });
  const definition = await tx.habitDefinition.create({ data: {
    slug: `rollback-test-${randomUUID()}`, title: "Test habit", focus: "Test", essence: "Test", practice: "Test", why: "Test", active: false
  } });
  const enrollment = { habitDefinitionId: definition.id, title: "Test habit", focus: "Test", essence: "Test", practice: "Test", why: "Test", sortOrder: 1 };
  return { owner: { id: session.id, userId: null }, enrollment };
}

test("PostgreSQL: repeated diagnosis preserves persisted progress and report history", { skip: !url }, async () => {
  await withRollback(async (tx) => {
    const { owner, enrollment } = await fixtures(tx);
    const old = await tx.analysis.create({ data: { sessionId: owner.id, status: "DONE", createdAt: new Date("2026-07-01") } });
    const latest = await tx.analysis.create({ data: { sessionId: owner.id, status: "DONE", createdAt: new Date("2026-10-02") } });
    const db = { $transaction: (run: (tx: Prisma.TransactionClient) => unknown) => run(tx) } as unknown as Pick<PrismaClient, "$transaction">;
    const data = {
      sessionId: owner.id, title: "Original", source: "analysis-report", analysisId: old.id,
      currentCycle: 2, currentWeek: 7, profile: { name: "Synthetic", avatar: "/test.png" },
      subscriptionStatus: "ACTIVE", stripeSubscriptionId: `rollback-${randomUUID()}`,
      trialEndsAt: new Date("2026-07-15"), reminderTime: "21:00", legendStatus: true, guruStreakCount: 3,
      enrollments: { create: [enrollment] }, rewards: { create: [{ type: "test", label: "Test XP", xp: 465 }] }
    };
    const original = await ensureHabitProgram(db, owner, data);
    const e = await tx.habitEnrollment.findFirstOrThrow({ where: { programId: original.program.id } });
    await tx.habitCheckin.create({ data: { programId: original.program.id, enrollmentId: e.id, date: new Date("2026-07-10"), completed: true } });
    await tx.habitDailyMetric.create({ data: { programId: original.program.id, date: new Date("2026-07-10"), energy: 7, clarity: 8, stability: 9 } });
    const profile = { title: "Updated", weakZone: "mission", archetype: "Strategist", topRole: "Strategist",
      careerAction: "A step", finalInsight: "New insight", raw: { profession: "Strategist" } };
    const updated = await ensureHabitProgram(db, owner, data, { id: latest.id, createdAt: latest.createdAt, profile });
    assert.equal(updated.action, "updated");
    assert.equal(updated.program.id, original.program.id);
    for (const analysis of [latest, old]) {
      assert.equal((await ensureHabitProgram(db, owner, data, { id: analysis.id, createdAt: analysis.createdAt, profile })).action, "unchanged");
    }
    const persisted = await tx.habitProgram.findUniqueOrThrow({ where: { id: original.program.id }, include: {
      rewards: true, checkins: true, dailyMetrics: true, insights: true
    } });
    assert.equal(persisted.rewards.reduce((sum, r) => sum + r.xp, 0), 465);
    assert.equal(persisted.checkins.length, 1);
    assert.equal(persisted.dailyMetrics.length, 1);
    assert.equal(persisted.insights.length, 1);
    assert.deepEqual(persisted.profile, { name: "Synthetic", avatar: "/test.png", profession: "Strategist" });
    assert.equal(persisted.currentWeek, 7);
    assert.equal(persisted.currentCycle, 2);
    assert.equal(persisted.stripeSubscriptionId, data.stripeSubscriptionId);
    assert.equal(persisted.legendStatus, true);
    assert.equal(persisted.reminderTime, "21:00");
    assert.equal(persisted.trialEndsAt?.getTime(), data.trialEndsAt.getTime());
    assert.equal(await tx.analysis.count({ where: { sessionId: owner.id } }), 2);
    assert.equal(await tx.habitProgram.count({ where: { sessionId: owner.id } }), 1);
  });
});

test("PostgreSQL: legacy recovery is atomic, conserves XP and maps all progress relations", { skip: !url }, async () => {
  await withRollback(async (tx) => {
    const { owner, enrollment } = await fixtures(tx);
    const old = await tx.habitProgram.create({ data: {
      sessionId: owner.id, title: "Older", source: "analysis-report", createdAt: new Date("2026-07-01"), currentWeek: 7,
      enrollments: { create: [{ ...enrollment, status: "COMPLETED" }] },
      rewards: { create: [{ type: "test", label: "Old XP", xp: 100 }] }, insights: { create: [{ text: "Old insight" }] },
      notificationPreference: { create: { telegramEnabled: true } },
      rankHistory: { create: [{ year: 2026, month: 7, rankTitle: "Previous rank", rankLevel: 3, monthXp: 100, monthMaxXp: 200, monthPercent: 50 }] }
    }, include: { enrollments: true } });
    const latest = await tx.habitProgram.create({ data: {
      sessionId: owner.id, title: "Latest", source: "analysis-report", createdAt: new Date("2026-08-01"), currentWeek: 2,
      enrollments: { create: [enrollment] }, rewards: { create: [{ type: "test", label: "New XP", xp: 150 }] },
      insights: { create: [{ text: "New insight" }] }
    }, include: { enrollments: true } });
    const date = new Date("2026-07-10");
    for (const p of [old, latest]) {
      const completed = p.id === old.id;
      await tx.habitCheckin.create({ data: { programId: p.id, enrollmentId: p.enrollments[0].id, date, completed, note: completed ? "Old note" : "New note" } });
      await tx.habitDailyMetric.create({ data: { programId: p.id, date, energy: completed ? 5 : 8, clarity: 7, stability: 8,
        updatedAt: new Date(completed ? "2026-07-10" : "2026-07-11") } });
      const task = await tx.habitDailyTask.create({ data: { programId: p.id, enrollmentId: p.enrollments[0].id,
        dayIndex: 1, title: "Task", taskText: "Task", microAction: "Step", whyToday: "Why", completedAt: completed ? date : null, xpAwarded: completed ? 25 : 0 } });
      if (completed) await tx.habitCalendarEvent.create({ data: { programId: p.id, enrollmentId: p.enrollments[0].id,
        dailyTaskId: task.id, title: "Task", description: "Test event", startsAt: date } });
    }
    await tx.habitWeekSummary.create({ data: { programId: old.id, enrollmentId: old.enrollments[0].id, cycle: 1, week: 1,
      checkinsDone: 7, completionMode: "FULL", summary: "Summary", pingviFeedback: "Feedback", rewardLabel: "Reward", xpAwarded: 50 } });
    await tx.internalWalletTransaction.create({ data: { programId: old.id, sessionId: owner.id, amountDelta: -25, reason: "Test",
      sourceType: "test", idempotencyKey: randomUUID() } });
    const preview = await recoverHabitPrograms(tx, owner, false);
    assert.equal(preview.expectedXp, 250);
    assert.equal(await tx.habitProgram.count({ where: { sessionId: owner.id, status: "ACTIVE" } }), 2);
    const applied = await recoverHabitPrograms(tx, owner, true);
    assert.equal(applied.targetId, latest.id);
    const merged = await tx.habitProgram.findUniqueOrThrow({ where: { id: latest.id }, include: {
      rewards: true, checkins: true, dailyMetrics: true, insights: true, dailyTasks: true, calendarEvents: true,
      rankHistory: true, weekSummaries: true, notificationPreference: true, walletTransactions: true
    } });
    assert.equal(merged.rewards.reduce((sum, r) => sum + r.xp, 0), 250);
    assert.equal(merged.checkins.length, 1);
    assert.equal(merged.checkins[0].completed, true);
    assert.match(merged.checkins[0].note!, /Old note/);
    assert.match(merged.checkins[0].note!, /New note/);
    assert.equal(merged.dailyMetrics[0].energy, 8);
    assert.equal(merged.insights.length, 2);
    assert.equal(merged.dailyTasks[0].xpAwarded, 25);
    assert.equal(merged.calendarEvents[0].dailyTaskId, merged.dailyTasks[0].id);
    assert.equal(merged.calendarEvents[0].enrollmentId, latest.enrollments[0].id);
    assert.equal(merged.weekSummaries[0].enrollmentId, latest.enrollments[0].id);
    assert.equal(merged.rankHistory[0].rankLevel, 3);
    assert.equal(merged.notificationPreference?.telegramEnabled, true);
    assert.equal(merged.walletTransactions[0].amountDelta, -25);
    assert.equal(merged.currentWeek, 7);
    assert.equal((await tx.habitProgram.findUniqueOrThrow({ where: { id: old.id } })).status, "ARCHIVED");
    assert.equal(await tx.habitCheckin.count({ where: { programId: old.id } }), 1);
    await assert.rejects(recoverHabitPrograms(tx, owner, true), /No duplicate/);
  });
});
