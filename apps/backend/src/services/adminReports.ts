import type {
  AdminBusinessReport,
  AdminMoneyTotal,
  AdminReportBreakdown,
  AdminSubscriptionAccessType
} from "@levelup/contracts";
import { prisma } from "../lib/prisma.js";
import { getHabitSubscriptionConfig } from "./pricing.js";

type AccessProgram = {
  stripeSubscriptionId: string | null;
  subscriptionStatus: string;
  trialEndsAt: Date | null;
  partnerBonusApplied: boolean;
  giftedDays: boolean;
};

export function resolveAdminSubscriptionAccessType(program: AccessProgram): AdminSubscriptionAccessType {
  if (program.stripeSubscriptionId) return "PAID_SUBSCRIPTION";
  if (program.partnerBonusApplied) return "PARTNER_BONUS";
  if (program.giftedDays) return "GIFTED_DAYS";
  if (program.subscriptionStatus === "ACTIVE" && !program.trialEndsAt) return "FREE_ACCESS";
  return "STANDARD_TRIAL";
}

export function resolveAdminSubscriptionStatus(status: string, trialEndsAt: Date | null, now = new Date()) {
  if (status === "TRIAL" && trialEndsAt && trialEndsAt.getTime() <= now.getTime()) return "EXPIRED_TRIAL";
  return status;
}

function breakdown(values: string[]): AdminReportBreakdown[] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key));
}

function moneyTotals(rows: Array<{ amount: number; currency: string }>): AdminMoneyTotal[] {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const currency = row.currency.toLowerCase();
    totals.set(currency, (totals.get(currency) ?? 0) + row.amount);
  }
  return [...totals.entries()]
    .map(([currency, amount]) => ({ currency, amount }))
    .sort((left, right) => left.currency.localeCompare(right.currency));
}

function jsonStrings(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export async function getAdminBusinessReport(days: number): Promise<AdminBusinessReport> {
  const now = new Date();
  const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const range = { gte: from, lte: now };

  const [
    usersTotal,
    newUsers,
    activeUsers,
    diagnosticStatuses,
    paymentStatuses,
    paymentsCreated,
    paidInPeriod,
    promoUsesInPeriod,
    programs,
    giftAudits,
    coachLeads,
    partnerAttributions,
    partnerEvents,
    partnerRedemptions,
    habitConfig
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: range } }),
    prisma.analyticsEvent.findMany({
      where: { createdAt: range, userId: { not: null } },
      distinct: ["userId"],
      select: { userId: true }
    }),
    prisma.analysis.groupBy({ by: ["status"], where: { createdAt: range }, _count: { _all: true } }),
    prisma.payment.groupBy({ by: ["status"], where: { createdAt: range }, _count: { _all: true } }),
    prisma.payment.findMany({
      where: { createdAt: range },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        user: { select: { email: true } },
        promoCode: { select: { code: true } }
      }
    }),
    prisma.payment.findMany({
      where: { status: "SUCCEEDED", paidAt: range },
      select: { amount: true, originalAmount: true, discountAmount: true, currency: true }
    }),
    prisma.payment.count({ where: { status: "SUCCEEDED", paidAt: range, promoCodeId: { not: null } } }),
    prisma.habitProgram.findMany({
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        userId: true,
        user: { select: { email: true } },
        title: true,
        source: true,
        subscriptionStatus: true,
        stripeSubscriptionId: true,
        trialStartedAt: true,
        trialEndsAt: true,
        subscriptionCurrentPeriodEnd: true,
        subscriptionCancelAtPeriodEnd: true,
        createdAt: true,
        updatedAt: true,
        partnerBonusAttributions: {
          where: { bonusStatus: "APPLIED" },
          select: { id: true },
          take: 1
        }
      }
    }),
    prisma.adminAuditLog.findMany({
      where: { action: "user.gift_days", targetId: { not: null } },
      select: { targetId: true }
    }),
    prisma.coachPartnershipLead.findMany({
      select: { status: true, practiceFormat: true, interests: true, createdAt: true }
    }),
    prisma.partnerAttribution.findMany({
      select: { createdAt: true, bonusStatus: true }
    }),
    prisma.partnerEvent.findMany({
      where: { createdAt: range },
      select: { type: true }
    }),
    prisma.partnerOfferRedemption.findMany({
      where: { createdAt: range },
      select: { status: true }
    }),
    getHabitSubscriptionConfig()
  ]);

  const giftProgramIds = new Set(giftAudits.flatMap((item) => item.targetId ? [item.targetId] : []));
  const subscriptions = programs.map((program) => {
    const accessType = resolveAdminSubscriptionAccessType({
      stripeSubscriptionId: program.stripeSubscriptionId,
      subscriptionStatus: program.subscriptionStatus,
      trialEndsAt: program.trialEndsAt,
      partnerBonusApplied: program.partnerBonusAttributions.length > 0,
      giftedDays: giftProgramIds.has(program.id)
    });
    return {
      program,
      accessType,
      status: resolveAdminSubscriptionStatus(program.subscriptionStatus, program.trialEndsAt, now)
    };
  });
  const currentPaid = subscriptions.filter(({ program }) =>
    Boolean(program.stripeSubscriptionId)
    && (program.subscriptionStatus === "ACTIVE" || program.subscriptionStatus === "CANCEL_AT_PERIOD_END")
  );
  const trialCohort = programs.filter((program) => program.trialStartedAt && program.trialStartedAt >= from && program.trialStartedAt <= now);
  const paidTrialCohort = trialCohort.filter((program) => Boolean(program.stripeSubscriptionId));
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const estimatedMrrAmount = currentPaid.length * habitConfig.amount;

  const diagnosticByStatus = diagnosticStatuses.map((item) => ({ key: item.status, count: item._count._all }));
  const paymentByStatus = paymentStatuses.map((item) => ({ key: item.status, count: item._count._all }));
  const coachInterests = coachLeads.flatMap((lead) => jsonStrings(lead.interests));

  return {
    generatedAt: now.toISOString(),
    range: { days, from: from.toISOString(), to: now.toISOString() },
    users: {
      total: usersTotal,
      newInPeriod: newUsers,
      activeInPeriod: activeUsers.length
    },
    diagnostics: {
      createdInPeriod: diagnosticByStatus.reduce((sum, item) => sum + item.count, 0),
      completedInPeriod: diagnosticByStatus.find((item) => item.key === "DONE")?.count ?? 0,
      failedInPeriod: diagnosticByStatus.find((item) => item.key === "FAILED")?.count ?? 0,
      byStatus: diagnosticByStatus
    },
    payments: {
      createdInPeriod: paymentByStatus.reduce((sum, item) => sum + item.count, 0),
      succeededInPeriod: paidInPeriod.length,
      promoUsesInPeriod,
      byStatus: paymentByStatus,
      revenue: moneyTotals(paidInPeriod.map((payment) => ({ amount: payment.amount, currency: payment.currency }))),
      discounts: moneyTotals(paidInPeriod.map((payment) => ({ amount: payment.discountAmount, currency: payment.currency }))),
      recent: paymentsCreated.map((payment) => ({
        id: payment.id,
        userEmail: payment.user?.email ?? null,
        productType: "DIAGNOSTIC_REPORT" as const,
        status: payment.status,
        amount: payment.amount,
        originalAmount: payment.originalAmount,
        discountAmount: payment.discountAmount,
        currency: payment.currency,
        promoCode: payment.promoCode?.code ?? null,
        createdAt: payment.createdAt.toISOString(),
        paidAt: payment.paidAt?.toISOString() ?? null
      }))
    },
    subscriptions: {
      totalPrograms: programs.length,
      createdInPeriod: programs.filter((program) => program.createdAt >= from && program.createdAt <= now).length,
      trialStartedInPeriod: trialCohort.length,
      paidCurrent: currentPaid.length,
      cancellingCurrent: programs.filter((program) => program.subscriptionStatus === "CANCEL_AT_PERIOD_END" || program.subscriptionCancelAtPeriodEnd).length,
      trialsEndingWithin7Days: programs.filter((program) =>
        program.subscriptionStatus === "TRIAL"
        && Boolean(program.trialEndsAt)
        && program.trialEndsAt! > now
        && program.trialEndsAt! <= sevenDaysFromNow
      ).length,
      cohortTrialToPaidPercent: trialCohort.length ? Math.round((paidTrialCohort.length / trialCohort.length) * 1000) / 10 : 0,
      byStatus: breakdown(subscriptions.map((item) => item.status)),
      byAccessType: breakdown(subscriptions.map((item) => item.accessType)),
      estimatedMrr: { amount: estimatedMrrAmount, currency: habitConfig.currency },
      estimatedArr: { amount: estimatedMrrAmount * 12, currency: habitConfig.currency },
      rows: subscriptions.slice(0, 200).map(({ program, accessType, status }) => ({
        id: program.id,
        userId: program.userId,
        userEmail: program.user?.email ?? null,
        title: program.title,
        planType: "HABITS_MONTHLY" as const,
        accessType,
        status,
        source: program.source,
        trialStartedAt: program.trialStartedAt?.toISOString() ?? null,
        trialEndsAt: program.trialEndsAt?.toISOString() ?? null,
        currentPeriodEnd: program.subscriptionCurrentPeriodEnd?.toISOString() ?? null,
        cancelAtPeriodEnd: program.subscriptionCancelAtPeriodEnd,
        createdAt: program.createdAt.toISOString(),
        updatedAt: program.updatedAt.toISOString()
      }))
    },
    coaches: {
      applicationsTotal: coachLeads.length,
      applicationsInPeriod: coachLeads.filter((lead) => lead.createdAt >= from && lead.createdAt <= now).length,
      byStatus: breakdown(coachLeads.map((lead) => lead.status)),
      byPracticeFormat: breakdown(coachLeads.map((lead) => lead.practiceFormat)),
      byInterest: breakdown(coachInterests)
    },
    partners: {
      attributedUsersTotal: partnerAttributions.length,
      attributionsInPeriod: partnerAttributions.filter((item) => item.createdAt >= from && item.createdAt <= now).length,
      bonusesAppliedTotal: partnerAttributions.filter((item) => item.bonusStatus === "APPLIED").length,
      eventsInPeriod: partnerEvents.length,
      eventsByType: breakdown(partnerEvents.map((item) => item.type)),
      redemptionsInPeriod: partnerRedemptions.length,
      redemptionsByStatus: breakdown(partnerRedemptions.map((item) => item.status))
    }
  };
}
