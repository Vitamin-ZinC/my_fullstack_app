import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";

process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:1/orken_test";
const { prisma } = await import("../lib/prisma.js");
const {
  advanceCompletedHabitWeeks,
  capHabitWeekCheckins,
  getNextHabitPosition,
  HABIT_WEEK_TARGET_CHECKINS,
  shouldAutoAdvanceHabitWeek
} = await import("./habitWeekProgress.js");

test("habit week progress caps display at 7", () => {
  assert.equal(HABIT_WEEK_TARGET_CHECKINS, 7);
  assert.equal(capHabitWeekCheckins(9), 7);
  assert.equal(capHabitWeekCheckins(-1), 0);
  assert.equal(capHabitWeekCheckins(Number.NaN), 0);
});

test("a habit lasts seven calendar days and changes on day eight in the user's timezone", () => {
  const start = new Date("2026-10-01T20:59:00Z");
  assert.equal(shouldAutoAdvanceHabitWeek(start, new Date("2026-10-07T20:59:59Z")), false);
  assert.equal(shouldAutoAdvanceHabitWeek(start, new Date("2026-10-07T21:00:00Z")), true);
  assert.equal(shouldAutoAdvanceHabitWeek(start, new Date("2026-10-07T21:00:00Z"), "UTC"), false);
  assert.equal(shouldAutoAdvanceHabitWeek(start, new Date("2026-10-08T00:00:00Z"), "UTC"), true);
  assert.equal(shouldAutoAdvanceHabitWeek(new Date("invalid")), false);
  assert.equal(shouldAutoAdvanceHabitWeek(start, new Date("2026-09-30")), false);
  assert.equal(shouldAutoAdvanceHabitWeek(start, new Date("2026-10-07T21:00:00Z"), "invalid-zone"), true);
});

test("calendar rotation handles daylight saving without requiring seven 24-hour intervals", () => {
  const start = new Date("2026-03-23T22:50:00Z"); // 23:50 in Paris; DST starts during this week.
  const next = new Date("2026-03-29T22:00:00Z"); // Day eight, midnight in Paris.
  assert.equal(shouldAutoAdvanceHabitWeek(start, new Date("2026-03-29T21:59:59Z"), "Europe/Paris"), false);
  assert.equal(shouldAutoAdvanceHabitWeek(start, next, "Europe/Paris"), true);
});

function fixture(t: TestContext, marks = 5, startedAt = new Date("2026-10-01T09:00:00Z"), currentSortOrder = 1) {
  const now = new Date("2026-10-08T09:00:00Z");
  const enrollments = Array.from({ length: 48 }, (_, index) => ({
    id: `enrollment-${index + 1}`, sortOrder: index + 1, week: (index % 12) + 1,
    title: `Habit ${index + 1}`, focus: "Energy", status: index + 1 < currentSortOrder ? "COMPLETED" : "ACTIVE",
    startedAt, completedAt: null, checkins: index + 1 === currentSortOrder ? Array.from({ length: marks }, (_, day) => ({ id: `checkin-${day}`, completed: true })) : []
  }));
  const program: any = { id: "program", status: "ACTIVE", currentCycle: Math.ceil(currentSortOrder / 12), currentWeek: ((currentSortOrder - 1) % 12) + 1, userId: "user", sessionId: "session", notificationPreference: { timezone: "Europe/Moscow" }, enrollments, insights: [{ text: "Retained insight" }], rewards: [{ xp: 540 }], subscriptionStatus: "ACTIVE" };
  const summaries = new Map<string, any>();
  const patches: any[] = [];
  let tail = Promise.resolve();
  const transaction = prisma.$transaction;
  const analytics = prisma.analyticsEvent.create;
  (prisma as any).$transaction = async (run: (tx: any) => Promise<unknown>) => {
    const previous = tail;
    let release!: () => void;
    tail = new Promise<void>(resolve => { release = resolve; });
    await previous;
    const tx = {
      $queryRaw: async (_sql: unknown, key: string) => { assert.equal(key, "habit-week:program"); return [{ locked: 1 }]; },
      habitProgram: { findUnique: async () => structuredClone(program), update: async ({ data }: any) => { patches.push(data); Object.assign(program, data); } },
      habitEnrollment: {
        update: async ({ where, data }: any) => Object.assign(enrollments.find(item => item.id === where.id)!, data),
        updateMany: async ({ where, data }: any) => { for (const item of enrollments.filter(item => item.sortOrder === where.sortOrder)) Object.assign(item, data); }
      },
      habitWeekSummary: {
        findUnique: async ({ where }: any) => summaries.get(where.programId_enrollmentId.enrollmentId) ?? null,
        upsert: async ({ where, create, update }: any) => { const key = where.programId_enrollmentId.enrollmentId; summaries.set(key, { id: `summary-${key}`, ...(summaries.has(key) ? update : create) }); }
      },
      habitRewardEvent: { create: async ({ data }: any) => { program.rewards.push(data); } }
    };
    try { return await run(tx); } finally { release(); }
  };
  prisma.analyticsEvent.create = t.mock.fn(async () => ({})) as any;
  t.after(() => { prisma.$transaction = transaction; prisma.analyticsEvent.create = analytics; });
  return { program, summaries, patches, now };
}

test("expired partial week is retained as completed, preserves history and XP, and opens one fresh week", async t => {
  const { program, summaries, patches, now } = fixture(t, 5, new Date("2026-07-01"));
  const originalMarks = structuredClone(program.enrollments[0].checkins);
  assert.equal((await advanceCompletedHabitWeeks(program.id, { now })).advanced, 1);
  assert.equal(program.currentWeek, 2);
  assert.equal(program.enrollments[0].status, "COMPLETED");
  assert.deepEqual(program.enrollments[0].checkins, originalMarks);
  assert.deepEqual(program.enrollments[1].startedAt, now);
  assert.equal(program.enrollments[2].completedAt, null);
  assert.equal(program.rewards.reduce((sum: number, item: any) => sum + item.xp, 0), 560);
  assert.equal(summaries.get("enrollment-1").completionMode, "SOFT");
  assert.equal(summaries.get("enrollment-1").checkinsDone, 5);
  assert.match(summaries.get("enrollment-1").summary, /71%/);
  assert.doesNotMatch(summaries.get("enrollment-1").pingviFeedback, /100%/);
  assert.equal(program.insights[0].text, "Retained insight");
  assert.equal(program.subscriptionStatus, "ACTIVE");
  assert.deepEqual(Object.keys(patches[0]).sort(), ["currentCycle", "currentWeek", "status"]);
  assert.equal((await advanceCompletedHabitWeeks(program.id, { now })).advanced, 0);
  assert.equal(program.rewards.length, 2);
});

test("seven checkins on day seven do not prematurely rotate the habit", async t => {
  const { program } = fixture(t, 7);
  assert.equal((await advanceCompletedHabitWeeks(program.id, { now: new Date("2026-10-07T20:59:59Z") })).advanced, 0);
  assert.equal(program.currentWeek, 1);
  assert.equal(program.rewards.length, 1);
});

test("concurrent web and Telegram reads rotate and award a week bonus only once", async t => {
  const { program, now, summaries } = fixture(t, 9);
  const results = await Promise.all(["web", "telegram", "reminder"].map(source => advanceCompletedHabitWeeks(program.id, { now, source })));
  assert.equal(results.reduce((sum, result) => sum + result.advanced, 0), 1);
  assert.equal(program.currentWeek, 2);
  assert.equal(program.rewards.length, 2);
  assert.equal(program.rewards[1].xp, 50);
  assert.equal(summaries.get("enrollment-1").checkinsDone, 7);
});

test("zero marks cannot earn a perfect-week bonus even at the end of the program", async t => {
  const { program, now, summaries } = fixture(t, 0, undefined, 48);
  assert.equal((await advanceCompletedHabitWeeks(program.id, { now })).advanced, 1);
  assert.equal(program.status, "COMPLETED");
  assert.equal(program.enrollments[47].status, "COMPLETED");
  assert.equal(program.rewards[1].xp, 0);
  assert.equal(summaries.get("enrollment-48").completionMode, "SOFT");
  assert.equal((await advanceCompletedHabitWeeks(program.id, { now })).advanced, 0);
});

test("a frozen week gets a fresh seven-day period and may earn only its eventual completion bonus", async t => {
  const { program, now, summaries } = fixture(t, 7, new Date("2026-10-06T09:00:00Z"));
  summaries.set("enrollment-1", { id: "frozen", completionMode: "FROZEN", xpAwarded: 0 });
  assert.equal((await advanceCompletedHabitWeeks(program.id, { now })).advanced, 0);
  assert.equal((await advanceCompletedHabitWeeks(program.id, { now: new Date("2026-10-13T09:00:00Z") })).advanced, 1);
  assert.equal(program.rewards.length, 2);
  assert.equal(summaries.get("enrollment-1").completionMode, "FULL");
});

test("habit week auto-advance opens the next weekly position", () => {
  assert.deepEqual(getNextHabitPosition(1, 48), {
    nextSortOrder: 2,
    isComplete: false,
    nextCycle: 1,
    nextWeek: 2
  });
  assert.deepEqual(getNextHabitPosition(12, 48), {
    nextSortOrder: 13,
    isComplete: false,
    nextCycle: 2,
    nextWeek: 1
  });
});
