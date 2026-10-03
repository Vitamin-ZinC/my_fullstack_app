import type { Prisma, PrismaClient } from "@prisma/client";

export type HabitProgramOwner = { id: string; userId: string | null };

const programSelect = {
  id: true,
  weakZone: true,
  analysisId: true,
  source: true,
  profile: true,
  analysis: { select: { createdAt: true } }
} satisfies Prisma.HabitProgramSelect;

type ReportProfile = {
  title: string;
  weakZone: string | null;
  archetype: string;
  topRole: string;
  careerAction: string | null;
  finalInsight: string | null;
  raw: Prisma.InputJsonObject;
};

export function habitProgramOwnerWhere(owner: HabitProgramOwner) {
  return owner.userId ? { userId: owner.userId } : { sessionId: owner.id, userId: null };
}

export function habitProgramOwnerKey(owner: HabitProgramOwner) {
  return owner.userId ? `habit-program:user:${owner.userId}` : `habit-program:session:${owner.id}`;
}

export async function ensureHabitProgram(
  db: Pick<PrismaClient, "$transaction">,
  owner: HabitProgramOwner,
  createData: Prisma.HabitProgramUncheckedCreateInput,
  report?: { id: string; createdAt: Date; profile: ReportProfile }
) {
  return db.$transaction(async (tx) => {
    // Serialize both manual starts and report activation for the same account.
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${habitProgramOwnerKey(owner)}, 0))`;
    const existing = await tx.habitProgram.findFirst({
      where: { status: "ACTIVE", ...habitProgramOwnerWhere(owner) },
      orderBy: { createdAt: "desc" },
      select: programSelect
    });
    if (!existing) {
      const program = await tx.habitProgram.create({ data: createData, select: programSelect });
      return { program, action: "created" as const };
    }
    if (!report || existing.analysisId === report.id ||
        (existing.analysis && existing.analysis.createdAt >= report.createdAt)) {
      return { program: existing, action: "unchanged" as const };
    }

    const firstPersonalization = !existing.analysisId && existing.source !== "analysis-report";
    const currentProfile = existing.profile && typeof existing.profile === "object" && !Array.isArray(existing.profile)
      ? existing.profile : {};
    const { raw, ...fields } = report.profile;
    const program = await tx.habitProgram.update({
      where: { id: existing.id },
      data: {
        ...fields,
        analysisId: report.id,
        source: "analysis-report",
        profile: { ...currentProfile, ...raw } as Prisma.InputJsonObject,
        insights: fields.finalInsight ? {
          create: [{ text: `Программа персонализирована по диагностике: ${fields.finalInsight}`, source: "analysis-report" }]
        } : undefined,
        rewards: firstPersonalization ? {
          create: [{ type: "program_personalized", label: "Программа обновлена по отчету без сброса прогресса", xp: 20 }]
        } : undefined
      },
      select: programSelect
    });
    return { program, action: firstPersonalization ? "personalized" as const : "updated" as const };
  }, { maxWait: 10000, timeout: 15000 });
}
