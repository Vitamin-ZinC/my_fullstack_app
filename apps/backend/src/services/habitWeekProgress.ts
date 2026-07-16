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
};

export function capHabitWeekCheckins(value: unknown) {
  const count = Number(value);
  if (!Number.isFinite(count)) return 0;
  return Math.max(0, Math.min(HABIT_WEEK_TARGET_CHECKINS, Math.floor(count)));
}

export function shouldAutoAdvanceHabitWeek(checkinsDone: unknown) {
  const count = Number(checkinsDone);
  return Number.isFinite(count) && count >= HABIT_WEEK_TARGET_CHECKINS;
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

export async function advanceCompletedHabitWeeks(programId: string, context: AdvanceContext = {}) {
  let advanced = 0;
  for (let guard = 0; guard < HABIT_PROGRAM_TOTAL_WEEKS; guard += 1) {
    const program = await loadProgressProgram(programId);
    if (!program || program.status !== "ACTIVE") break;

    const currentSortOrder = getHabitCurrentSortOrder({
      currentCycle: program.currentCycle,
      currentWeek: program.currentWeek,
      enrollmentCount: program.enrollments.length
    });
    const activeEnrollment = program.enrollments.find((enrollment) => enrollment.sortOrder === currentSortOrder)
      ?? program.enrollments.find((enrollment) => enrollment.status === "ACTIVE")
      ?? program.enrollments[0]
      ?? null;
    if (!activeEnrollment) break;

    const rawCheckinsDone = activeEnrollment.checkins.filter((checkin) => checkin.completed).length;
    if (!shouldAutoAdvanceHabitWeek(rawCheckinsDone)) break;

    await closeHabitWeek(program, activeEnrollment, rawCheckinsDone, context);
    advanced += 1;
  }

  return { advanced };
}

async function closeHabitWeek(
  program: Awaited<ReturnType<typeof loadProgressProgram>>,
  activeEnrollment: NonNullable<Awaited<ReturnType<typeof loadProgressProgram>>>["enrollments"][number],
  rawCheckinsDone: number,
  context: AdvanceContext
) {
  if (!program) return;
  const currentSortOrder = getHabitCurrentSortOrder({
    currentCycle: program.currentCycle,
    currentWeek: program.currentWeek,
    enrollmentCount: program.enrollments.length
  });
  const position = getNextHabitPosition(currentSortOrder, Math.max(program.enrollments.length, HABIT_PROGRAM_TOTAL_WEEKS));
  const checkinsDone = capHabitWeekCheckins(rawCheckinsDone);
  const weekReward = weekRewardFor(checkinsDone, position.isComplete);
  const now = new Date();
  const existingSummary = await prisma.habitWeekSummary.findUnique({
    where: { programId_enrollmentId: { programId: program.id, enrollmentId: activeEnrollment.id } },
    select: { id: true }
  });

  const summaryData = buildAutoWeekSummaryData(activeEnrollment, checkinsDone, weekReward, position.isComplete);
  const transaction = [
    prisma.habitWeekSummary.upsert({
      where: { programId_enrollmentId: { programId: program.id, enrollmentId: activeEnrollment.id } },
      update: summaryData,
      create: {
        programId: program.id,
        enrollmentId: activeEnrollment.id,
        ...summaryData
      }
    }),
    prisma.habitEnrollment.update({
      where: { id: activeEnrollment.id },
      data: { status: "COMPLETED", completedAt: now }
    }),
    prisma.habitProgram.update({
      where: { id: program.id },
      data: {
        currentCycle: position.nextCycle,
        currentWeek: position.nextWeek,
        status: position.isComplete ? "COMPLETED" : "ACTIVE"
      }
    }),
    ...(position.isComplete ? [] : [
      prisma.habitEnrollment.updateMany({
        where: { programId: program.id, sortOrder: position.nextSortOrder },
        data: { status: "ACTIVE", startedAt: now }
      })
    ]),
    ...(existingSummary ? [] : [
      prisma.habitRewardEvent.create({
        data: {
          programId: program.id,
          type: position.isComplete ? "program_completed" : weekReward.type,
          label: position.isComplete ? `Годовая программа завершена · ${weekReward.label}` : weekReward.label,
          xp: weekReward.xp
        }
      })
    ])
  ];

  await prisma.$transaction(transaction);
  await prisma.analyticsEvent.create({
    data: {
      name: position.isComplete ? "habit_program_auto_completed" : "habit_week_auto_advanced",
      locale: context.locale ?? "ru",
      sessionId: context.sessionId ?? program.sessionId,
      userId: context.userId ?? program.userId,
      properties: {
        programId: program.id,
        enrollmentId: activeEnrollment.id,
        currentSortOrder,
        nextSortOrder: position.nextSortOrder,
        checkinsDone,
        rawCheckinsDone,
        source: context.source ?? "auto"
      }
    }
  }).catch((error) => {
    context.log?.warn?.({
      error: error instanceof Error ? error.message.slice(0, 240) : String(error).slice(0, 240),
      programId: program.id
    }, "Habit auto-advance analytics failed");
  });
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
    completionMode: "FULL",
    summary: `Неделя закрыта автоматически: "${enrollment.title}". Фокус недели: ${enrollment.focus}. Зафиксировано ${checkinsDone}/${HABIT_WEEK_TARGET_CHECKINS} отметок, прогресс недели ${reward.percent}%.`,
    pingviFeedback: isProgramComplete
      ? "Маршрут завершён. Важно не начинать новый рывок сразу, а посмотреть, какие привычки реально стали частью твоего ритма."
      : `Неделя закрыта на 100% — ${reward.label}. Следующая привычка уже открыта, можно двигаться дальше без ручного переключения.`,
    rewardLabel: isProgramComplete ? `Маршрут завершён · ${reward.label}` : reward.label,
    xpAwarded: reward.xp
  };
}

function weekRewardFor(checkinsDone: number, isProgramComplete = false) {
  const percent = Math.min(100, Math.max(0, Math.round((checkinsDone / HABIT_WEEK_TARGET_CHECKINS) * 100)));
  if (isProgramComplete || percent >= 100) {
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

function loadProgressProgram(programId: string) {
  return prisma.habitProgram.findUnique({
    where: { id: programId },
    include: {
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
