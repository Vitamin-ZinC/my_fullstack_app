import { prisma } from "../lib/prisma.js";

export type DailyHabitRewardType = "daily_metric" | "daily_checkin" | "insight_saved";

function utcDayRange(date = new Date()) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

export async function createDailyHabitRewardIfNeeded(input: {
  programId: string;
  type: DailyHabitRewardType;
  label: string;
  xp: number;
  date?: Date;
}) {
  const { start, end } = utcDayRange(input.date);
  const existing = await prisma.habitRewardEvent.findFirst({
    where: {
      programId: input.programId,
      type: input.type,
      createdAt: { gte: start, lt: end }
    }
  });
  if (existing) return { awarded: false, reward: existing };

  const reward = await prisma.habitRewardEvent.create({
    data: {
      programId: input.programId,
      type: input.type,
      label: input.label,
      xp: input.xp
    }
  });
  return { awarded: true, reward };
}
