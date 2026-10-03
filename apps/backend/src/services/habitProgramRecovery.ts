import type { Prisma } from "@prisma/client";
import { habitProgramOwnerKey, habitProgramOwnerWhere, type HabitProgramOwner } from "./habitProgramIdentity.js";

const recoveryInclude = {
  enrollments: { include: { _count: { select: { coachAssignments: true } } } },
  checkins: true, dailyMetrics: true, insights: true, rewards: true, dailyTasks: true,
  calendarEvents: true, weekSummaries: true, rankHistory: true, notificationPreference: true,
  _count: { select: { coachRelationships: true } }
} satisfies Prisma.HabitProgramInclude;

type RecoveryProgram = Prisma.HabitProgramGetPayload<{ include: typeof recoveryInclude }>;

export function planHabitProgramRecovery(programs: RecoveryProgram[]) {
  if (programs.length < 2) throw new Error("No duplicate active programs");
  const sorted = [...programs].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
  const target = sorted[sorted.length - 1];
  const owner = target.userId ? `user:${target.userId}` : `session:${target.sessionId}`;
  const targetEnrollments = new Map(target.enrollments.map((e) => [e.sortOrder, e]));
  for (const program of sorted) {
    const identity = program.userId ? `user:${program.userId}` : `session:${program.sessionId}`;
    if (identity !== owner || (!program.userId && !program.sessionId)) throw new Error("Owner mismatch");
    if (program.status !== "ACTIVE" || !["manual-start", "analysis-report"].includes(program.source)) {
      throw new Error("Unexpected program lifecycle; manual review required");
    }
    if (program.stripeSubscriptionId || program._count.coachRelationships ||
        program.enrollments.some((e) => e._count.coachAssignments)) {
      throw new Error("Paid subscription or coaching dependency; manual review required");
    }
    if (!target.enrollments.length || program.enrollments.length !== target.enrollments.length ||
        new Set(program.enrollments.map((e) => e.sortOrder)).size !== program.enrollments.length ||
        program.enrollments.some((e) => !e.habitDefinitionId || targetEnrollments.get(e.sortOrder)?.habitDefinitionId !== e.habitDefinitionId)) {
      throw new Error("Habit catalog mismatch; manual review required");
    }
  }
  const cursor = sorted.reduce((best, p) =>
    (p.currentCycle * 100 + p.currentWeek) > (best.currentCycle * 100 + best.currentWeek) ? p : best, target);
  const profile: Record<string, Prisma.JsonValue> = {};
  for (const p of sorted) {
    if (p.profile && typeof p.profile === "object" && !Array.isArray(p.profile)) {
      for (const [key, value] of Object.entries(p.profile)) {
        if (value != null && value !== "") profile[key] = value;
      }
    }
  }
  const firstTrial = sorted.flatMap((p) => p.trialStartedAt ? [p.trialStartedAt.getTime()] : []);
  const trialEnds = sorted.flatMap((p) => p.trialEndsAt ? [p.trialEndsAt.getTime()] : []);
  const periodEnds = sorted.flatMap((p) => p.subscriptionCurrentPeriodEnd ? [p.subscriptionCurrentPeriodEnd.getTime()] : []);
  return {
    target, sources: sorted.filter((p) => p.id !== target.id),
    totalXp: sorted.flatMap((p) => p.rewards).reduce((sum, r) => sum + r.xp, 0),
    metadata: {
      startedAt: new Date(Math.min(...sorted.map((p) => p.startedAt.getTime()))),
      currentCycle: cursor.currentCycle, currentWeek: cursor.currentWeek,
      guruStreakCount: Math.max(...sorted.map((p) => p.guruStreakCount)),
      legendStatus: sorted.some((p) => p.legendStatus),
      ...(firstTrial.length ? { trialStartedAt: new Date(Math.min(...firstTrial)) } : {}),
      ...(trialEnds.length ? { trialEndsAt: new Date(Math.max(...trialEnds)) } : {}),
      ...(periodEnds.length ? { subscriptionCurrentPeriodEnd: new Date(Math.max(...periodEnds)) } : {}),
      ...(sorted.some((p) => p.subscriptionStatus === "ACTIVE") ? { subscriptionStatus: "ACTIVE" } : {}),
      profile: profile as Prisma.InputJsonObject
    }
  };
}

export async function recoverHabitPrograms(tx: Prisma.TransactionClient, owner: HabitProgramOwner, apply: boolean) {
  await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${habitProgramOwnerKey(owner)}, 0))`;
  const programs = await tx.habitProgram.findMany({
    where: { status: "ACTIVE", ...habitProgramOwnerWhere(owner) }, include: recoveryInclude
  });
  const plan = planHabitProgramRecovery(programs);
  const result = {
    targetId: plan.target.id, archivedIds: plan.sources.map((p) => p.id), expectedXp: plan.totalXp,
    originalCheckins: programs.reduce((sum, p) => sum + p.checkins.length, 0),
    originalInsights: programs.reduce((sum, p) => sum + p.insights.length, 0), applied: apply
  };
  if (!apply) return result;

  const targetId = plan.target.id;
  const enrollmentIds = new Map(plan.target.enrollments.map((e) => [e.sortOrder, e.id]));
  for (const source of plan.sources) {
    const mapping = new Map(source.enrollments.map((e) => [e.id, enrollmentIds.get(e.sortOrder)!]));
    const enrollmentId = (id: string) => {
      const mapped = mapping.get(id);
      if (!mapped) throw new Error("Unmapped enrollment; aborting recovery");
      return mapped;
    };
    for (const e of source.enrollments) {
      const targetEnrollment = await tx.habitEnrollment.findUniqueOrThrow({ where: { id: enrollmentId(e.id) } });
      await tx.habitEnrollment.update({ where: { id: targetEnrollment.id }, data: {
        startedAt: new Date(Math.min(e.startedAt.getTime(), targetEnrollment.startedAt.getTime())),
        ...(e.status === "COMPLETED" ? { status: "COMPLETED", completedAt: targetEnrollment.completedAt ?? e.completedAt } : {})
      } });
    }
    // Keep original check-ins/metrics in the archived programs as a recovery trail.
    for (const row of source.checkins) {
      const mapped = enrollmentId(row.enrollmentId);
      const existing = await tx.habitCheckin.findUnique({ where: { enrollmentId_date: { enrollmentId: mapped, date: row.date } } });
      const { id: _id, ...data } = row;
      const preferred = existing && existing.updatedAt >= row.updatedAt ? existing : row;
      const notes = [...new Set([existing?.note, row.note].filter((n): n is string => Boolean(n)))];
      await tx.habitCheckin.upsert({
        where: { enrollmentId_date: { enrollmentId: mapped, date: row.date } },
        create: { ...data, programId: targetId, enrollmentId: mapped },
        update: {
          completed: Boolean(existing?.completed || row.completed), note: notes.join("\n\n") || null,
          energy: preferred.energy, clarity: preferred.clarity, stability: preferred.stability,
          updatedAt: preferred.updatedAt
        }
      });
    }
    for (const row of source.dailyMetrics) {
      const existing = await tx.habitDailyMetric.findUnique({ where: { programId_date: { programId: targetId, date: row.date } } });
      if (existing && existing.updatedAt >= row.updatedAt) continue;
      const { id: _id, ...data } = row;
      await tx.habitDailyMetric.upsert({
        where: { programId_date: { programId: targetId, date: row.date } },
        create: { ...data, programId: targetId },
        update: { energy: row.energy, clarity: row.clarity, stability: row.stability, updatedAt: row.updatedAt }
      });
    }
    for (const row of source.insights) {
      await tx.habitInsight.update({ where: { id: row.id }, data: {
        programId: targetId, enrollmentId: row.enrollmentId ? enrollmentId(row.enrollmentId) : null
      } });
    }
    const tasks = new Map<string, string>();
    for (const row of source.dailyTasks) {
      const mapped = enrollmentId(row.enrollmentId);
      const where = { programId_enrollmentId_dayIndex: { programId: targetId, enrollmentId: mapped, dayIndex: row.dayIndex } };
      const existing = await tx.habitDailyTask.findUnique({ where });
      const { id: _id, ...data } = row;
      const merged = await tx.habitDailyTask.upsert({ where, create: { ...data, programId: targetId, enrollmentId: mapped }, update: {
        completedAt: existing?.completedAt ?? row.completedAt,
        xpAwarded: Math.max(existing?.xpAwarded ?? 0, row.xpAwarded)
      } });
      tasks.set(row.id, merged.id);
    }
    for (const row of source.calendarEvents) {
      const taskId = row.dailyTaskId ? tasks.get(row.dailyTaskId) : null;
      if (row.dailyTaskId && !taskId) throw new Error("Unmapped calendar task; aborting recovery");
      if (taskId && await tx.habitCalendarEvent.findUnique({ where: { programId_dailyTaskId: { programId: targetId, dailyTaskId: taskId } } })) continue;
      await tx.habitCalendarEvent.update({ where: { id: row.id }, data: {
        programId: targetId, enrollmentId: row.enrollmentId ? enrollmentId(row.enrollmentId) : null, dailyTaskId: taskId
      } });
    }
    for (const row of source.weekSummaries) {
      const mapped = enrollmentId(row.enrollmentId);
      const where = { programId_enrollmentId: { programId: targetId, enrollmentId: mapped } };
      const existing = await tx.habitWeekSummary.findUnique({ where });
      const { id: _id, ...data } = row;
      await tx.habitWeekSummary.upsert({ where, create: { ...data, programId: targetId, enrollmentId: mapped }, update: {
        checkinsDone: Math.max(existing?.checkinsDone ?? 0, row.checkinsDone),
        xpAwarded: Math.max(existing?.xpAwarded ?? 0, row.xpAwarded),
        ...(row.completionMode === "FULL" ? { completionMode: "FULL" } : {})
      } });
    }
    for (const row of source.rankHistory) {
      const where = { programId_year_month: { programId: targetId, year: row.year, month: row.month } };
      const existing = await tx.habitRankHistory.findUnique({ where });
      if (existing && existing.rankLevel >= row.rankLevel) continue;
      const { id: _id, ...data } = row;
      await tx.habitRankHistory.upsert({ where, create: { ...data, programId: targetId }, update: {
        rankTitle: row.rankTitle, rankLevel: row.rankLevel, monthXp: row.monthXp,
        monthMaxXp: row.monthMaxXp, monthPercent: row.monthPercent,
        guruStreakCount: row.guruStreakCount, legendStatus: row.legendStatus
      } });
    }
    await tx.habitRewardEvent.updateMany({ where: { programId: source.id }, data: { programId: targetId } });
    await tx.habitNavigatorThread.updateMany({ where: { programId: source.id }, data: { programId: targetId } });
    await tx.internalWalletTransaction.updateMany({ where: { programId: source.id }, data: { programId: targetId } });
    await tx.partnerAttribution.updateMany({ where: { bonusAppliedProgramId: source.id }, data: { bonusAppliedProgramId: targetId } });
    await tx.habitProgram.update({ where: { id: source.id }, data: { status: "ARCHIVED" } });
  }
  const preferences = programs.map((p) => p.notificationPreference).filter((p) => p !== null)
    .sort((a, b) => Number(b.telegramEnabled) - Number(a.telegramEnabled) || b.updatedAt.getTime() - a.updatedAt.getTime());
  if (preferences[0]) {
    const { id: _id, programId: _programId, ...data } = preferences[0];
    const reminders = preferences.flatMap((p) => p.lastReminderAt ? [p.lastReminderAt.getTime()] : []);
    const lastReminderAt = reminders.length ? new Date(Math.max(...reminders)) : null;
    await tx.habitNotificationPreference.upsert({ where: { programId: targetId },
      create: { ...data, programId: targetId, lastReminderAt }, update: { ...data, lastReminderAt }
    });
  }
  await tx.habitProgram.update({ where: { id: targetId }, data: plan.metadata });
  const xp = await tx.habitRewardEvent.aggregate({ where: { programId: targetId }, _sum: { xp: true } });
  if (xp._sum.xp !== plan.totalXp) throw new Error("XP conservation check failed; aborting recovery");
  return result;
}
