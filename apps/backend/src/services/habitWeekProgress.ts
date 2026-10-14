import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { HABIT_PROGRAM_TOTAL_WEEKS, HABIT_WEEKS_PER_CYCLE } from "./habitCatalog.js";

export const HABIT_WEEK_TARGET_CHECKINS = 7;

type LogLike = {
  warn?: (payload: unknown, message?: string) => void;
};

type AdvanceContext = {
  source?: string;
  locale?: string;
  sessionId?: string | null;
  userId?: string | null;
  log?: LogLike;
  now?: Date;
};

export function capHabitWeekCheckins(value: unknown) {
  const count = Number(value);
  if (!Number.isFinite(count)) return 0;
  return Math.max(0, Math.min(HABIT_WEEK_TARGET_CHECKINS, Math.floor(count)));
}

export function shouldAutoAdvanceHabitWeek(startedAt: Date, now = new Date(), timezone = "Europe/Moscow") {
  if (!Number.isFinite(startedAt.getTime()) || !Number.isFinite(now.getTime()) || now < startedAt) return false;
  return calendarDay(now, timezone) - calendarDay(startedAt, timezone) >= HABIT_WEEK_TARGET_CHECKINS;
}

function calendarDay(date: Date, timezone: string): number {
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "numeric", day: "numeric" });
  } catch {
    formatter = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Moscow", year: "numeric", month: "numeric", day: "numeric" });
  }
  const parts = formatter.formatToParts(date);
  const part = (type: string) => Number(parts.find((item) => item.type === type)?.value);
  return Date.UTC(part("year"), part("month") - 1, part("day")) / 86_400_000;
}

export function withHabitWeekLock<T>(programId: string, run: (tx: Prisma.TransactionClient) => Promise<T>, db: Pick<PrismaClient, "$transaction"> = prisma) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`habit-week:${programId}`}, 0))`;
    return run(tx);
  }, { maxWait: 10_000, timeout: 15_000 });
}

export function getHabitCurrentSortOrder(input: {
  currentCycle: unknown;
  currentWeek: unknown;
  enrollmentCount: number;
}) {
  const currentCycle = clampInteger(input.currentCycle, 1, Math.ceil(Math.max(1, input.enrollmentCount) / HABIT_WEEKS_PER_CYCLE));
  const currentWeek = clampInteger(input.currentWeek, 1, HABIT_WEEKS_PER_CYCLE);
  return Math.min(((currentCycle - 1) * HABIT_WEEKS_PER_CYCLE) + currentWeek, Math.max(1, input.enrollmentCount));
}

export function getNextHabitPosition(currentSortOrder: number, totalWeeks: number) {
  const safeTotalWeeks = Math.max(1, totalWeeks);
  const nextSortOrder = currentSortOrder + 1;
  const isComplete = nextSortOrder > safeTotalWeeks;
  return {
    nextSortOrder,
    isComplete,
    nextCycle: isComplete ? Math.ceil(currentSortOrder / HABIT_WEEKS_PER_CYCLE) : Math.ceil(nextSortOrder / HABIT_WEEKS_PER_CYCLE),
    nextWeek: isComplete ? ((currentSortOrder - 1) % HABIT_WEEKS_PER_CYCLE) + 1 : ((nextSortOrder - 1) % HABIT_WEEKS_PER_CYCLE) + 1
  };
}

export async function advanceCompletedHabitWeeks(programId: string, context: AdvanceContext = {}, db: Pick<PrismaClient, "$transaction" | "analyticsEvent"> = prisma) {
  const now = context.now ?? new Date();
  // One elapsed week opens one fresh seven-day period, even after a long absence.
  const event = await withHabitWeekLock(programId, async (tx) => {
    const program = await loadProgressProgram(tx, programId);
    if (!program || program.status !== "ACTIVE") return null;

    const currentSortOrder = getHabitCurrentSortOrder({
      currentCycle: program.currentCycle,
      currentWeek: program.currentWeek,
      enrollmentCount: program.enrollments.length
    });
    const activeEnrollment = program.enrollments.find((enrollment) => enrollment.sortOrder === currentSortOrder)
      ?? program.enrollments.find((enrollment) => enrollment.status === "ACTIVE")
      ?? program.enrollments[0]
      ?? null;
    if (!activeEnrollment || activeEnrollment.status === "COMPLETED") return null;
    if (!shouldAutoAdvanceHabitWeek(activeEnrollment.startedAt, now, program.notificationPreference?.timezone)) return null;

    const rawCheckinsDone = activeEnrollment.checkins.filter((checkin) => checkin.completed).length;
    return closeHabitWeek(tx, program, activeEnrollment, rawCheckinsDone, now);
  }, db);
  if (event) {
    await db.analyticsEvent.create({
      data: {
        name: event.isComplete ? "habit_program_auto_completed" : "habit_week_auto_advanced",
        locale: context.locale ?? "ru",
        sessionId: context.sessionId ?? event.sessionId,
        userId: context.userId ?? event.userId,
        properties: { ...event.properties, source: context.source ?? "auto" }
      }
    }).catch((error) => context.log?.warn?.({ error: error instanceof Error ? error.message.slice(0, 240) : "Analytics failed", programId }, "Habit auto-advance analytics failed"));
  }
  return { advanced: event ? 1 : 0 };
}

async function closeHabitWeek(
  tx: Prisma.TransactionClient,
  program: Awaited<ReturnType<typeof loadProgressProgram>>,
  activeEnrollment: NonNullable<Awaited<ReturnType<typeof loadProgressProgram>>>["enrollments"][number],
  rawCheckinsDone: number,
  now: Date
) {
  if (!program) return;
  const currentSortOrder = getHabitCurrentSortOrder({
    currentCycle: program.currentCycle,
    currentWeek: program.currentWeek,
    enrollmentCount: program.enrollments.length
  });
  const position = getNextHabitPosition(currentSortOrder, Math.max(program.enrollments.length, HABIT_PROGRAM_TOTAL_WEEKS));
  const checkinsDone = capHabitWeekCheckins(rawCheckinsDone);
  if (!position.isComplete && !program.enrollments.some((item) => item.sortOrder === position.nextSortOrder)) return null;
  const weekReward = weekRewardFor(checkinsDone);
  const existingSummary = await tx.habitWeekSummary.findUnique({
    where: { programId_enrollmentId: { programId: program.id, enrollmentId: activeEnrollment.id } },
    select: { id: true, completionMode: true }
  });

  const summaryData = buildAutoWeekSummaryData(activeEnrollment, checkinsDone, weekReward, position.isComplete);
  await tx.habitWeekSummary.upsert({
      where: { programId_enrollmentId: { programId: program.id, enrollmentId: activeEnrollment.id } },
      update: summaryData,
      create: {
        programId: program.id,
        enrollmentId: activeEnrollment.id,
        ...summaryData
      }
    });
  await tx.habitEnrollment.update({
      where: { id: activeEnrollment.id },
      data: { status: "COMPLETED", completedAt: now }
    });
  await tx.habitProgram.update({
      where: { id: program.id },
      data: {
        currentCycle: position.nextCycle,
        currentWeek: position.nextWeek,
        status: position.isComplete ? "COMPLETED" : "ACTIVE"
      }
    });
  if (!position.isComplete) {
    await tx.habitEnrollment.updateMany({
        where: { programId: program.id, sortOrder: position.nextSortOrder },
        data: { status: "ACTIVE", startedAt: now }
      });
  }
  if (!existingSummary || existingSummary.completionMode === "FROZEN") {
    await tx.habitRewardEvent.create({
        data: {
          programId: program.id,
          type: position.isComplete ? "program_completed" : weekReward.type,
          label: position.isComplete ? `Годовая программа завершена · ${weekReward.label}` : weekReward.label,
          xp: weekReward.xp
        }
      });
  }
  return {
    isComplete: position.isComplete, sessionId: program.sessionId, userId: program.userId,
    properties: {
        programId: program.id,
        enrollmentId: activeEnrollment.id,
        currentSortOrder,
        nextSortOrder: position.nextSortOrder,
        checkinsDone,
        rawCheckinsDone
      }
  };
}

function buildAutoWeekSummaryData(
  enrollment: {
    week: number;
    sortOrder: number;
    title: string;
    focus: string;
  },
  checkinsDone: number,
  reward: { label: string; xp: number; percent: number },
  isProgramComplete: boolean
) {
  return {
    cycle: Math.ceil(enrollment.sortOrder / HABIT_WEEKS_PER_CYCLE),
    week: enrollment.week,
    checkinsDone,
    completionMode: checkinsDone >= HABIT_WEEK_TARGET_CHECKINS ? "FULL" : "SOFT",
    summary: `Неделя закрыта автоматически: "${enrollment.title}". Фокус недели: ${enrollment.focus}. Зафиксировано ${checkinsDone}/${HABIT_WEEK_TARGET_CHECKINS} отметок, прогресс недели ${reward.percent}%.`,
    pingviFeedback: isProgramComplete
      ? "Маршрут завершён. Важно не начинать новый рывок сразу, а посмотреть, какие привычки реально стали частью твоего ритма."
      : `Прошло семь дней. Отмечено ${checkinsDone}/${HABIT_WEEK_TARGET_CHECKINS} дней — ${reward.label}. Следующая привычка уже открыта.`,
    rewardLabel: isProgramComplete ? `Маршрут завершён · ${reward.label}` : reward.label,
    xpAwarded: reward.xp
  };
}

function weekRewardFor(checkinsDone: number) {
  const percent = Math.min(100, Math.max(0, Math.round((checkinsDone / HABIT_WEEK_TARGET_CHECKINS) * 100)));
  if (percent >= 100) {
    return {
      type: "week_gold_chest",
      label: "Золотой сундук — идеальная неделя",
      xp: 50,
      percent: 100
    };
  }
  if (percent >= 70) {
    return {
      type: "week_silver_chest",
      label: "Серебряный сундук — сильная неделя",
      xp: 20,
      percent
    };
  }
  return {
    type: "week_no_reward",
    label: "Неделя без бонусной награды",
    xp: 0,
    percent
  };
}

function loadProgressProgram(tx: Prisma.TransactionClient, programId: string) {
  return tx.habitProgram.findUnique({
    where: { id: programId },
    include: {
      notificationPreference: { select: { timezone: true } },
      enrollments: {
        orderBy: { sortOrder: "asc" },
        include: {
          checkins: { orderBy: { date: "desc" } }
        }
      }
    }
  });
}

function clampInteger(value: unknown, min: number, max: number) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return min;
  return Math.min(max, Math.max(min, Math.round(numberValue)));
}
