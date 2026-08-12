import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { PartnerPortalIdentity } from "@levelup/contracts";
import { env } from "../env.js";
import { prisma } from "../lib/prisma.js";
import { assertCoachRewardAffordable } from "./coachRules.js";

const DAY_MS = 86_400_000;

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function slugifyCoach(value: string) {
  const slug = value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "coach";
}

export async function ensureCoachProfile(identity: PartnerPortalIdentity) {
  const existing = await prisma.coachProfile.findUnique({ where: { partnerCorePartnerId: identity.partnerCorePartnerId } });
  if (existing) return existing;
  const displayName = identity.displayName || identity.accountName || "Коуч ORKEN";
  const base = slugifyCoach(displayName);
  const collision = await prisma.coachProfile.findUnique({ where: { slug: base }, select: { id: true } });
  const slug = collision ? `${base}-${identity.partnerCorePartnerId.slice(-6).toLowerCase()}` : base;
  return prisma.coachProfile.create({
    data: {
      partnerCorePartnerId: identity.partnerCorePartnerId,
      slug,
      displayName,
      languages: ["ru"]
    }
  });
}

export function serializeCoachProfile(profile: any, exposeCoreId = false) {
  return {
    id: profile.id,
    ...(exposeCoreId ? { partnerCorePartnerId: profile.partnerCorePartnerId } : {}),
    slug: profile.slug,
    displayName: profile.displayName,
    headline: profile.headline ?? null,
    bio: profile.bio ?? null,
    city: profile.city ?? null,
    specializations: strings(profile.specializations),
    languages: strings(profile.languages),
    avatarUrl: profile.avatarUrl ?? null,
    coverImageUrl: profile.coverImageUrl ?? null,
    status: profile.status,
    acceptingOrders: Boolean(profile.acceptingOrders),
    featured: Boolean(profile.featured),
    calendlyConnected: profile.calendlyConnection?.status === "ACTIVE",
    publicSince: profile.publicSince?.toISOString?.() ?? null
  };
}

export async function listCoachPlans(coachProfileId?: string) {
  const now = new Date();
  const [plans, overrides] = await Promise.all([
    prisma.coachPlan.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
      include: {
        priceVersions: {
          where: { active: true, effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] },
          orderBy: { effectiveFrom: "desc" },
          take: 1
        }
      }
    }),
    coachProfileId
      ? prisma.coachPriceOverride.findMany({
        where: {
          coachProfileId,
          active: true,
          effectiveFrom: { lte: now },
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }]
        },
        orderBy: { effectiveFrom: "desc" }
      })
      : Promise.resolve([])
  ]);
  const overrideByPlan = new Map(overrides.map((override) => [override.planId, override]));
  return plans.map((plan) => {
    const version = plan.priceVersions[0];
    const override = overrideByPlan.get(plan.id);
    return {
      id: plan.id,
      code: plan.code,
      name: plan.name,
      description: plan.description,
      includedClients: plan.includedClients,
      customQuote: plan.customQuote,
      active: plan.active,
      sortOrder: plan.sortOrder,
      amount: override?.amount ?? version?.amount ?? 0,
      currency: override?.currency ?? version?.currency ?? "usd",
      priceVersionId: version?.id ?? null,
      stripePriceId: override ? null : version?.stripePriceId ?? null,
      overridden: Boolean(override)
    };
  });
}

export function serializeCoachOffer(offer: any) {
  return {
    id: offer.id,
    coachProfileId: offer.coachProfileId,
    type: offer.type,
    paymentModel: offer.paymentModel,
    title: offer.title,
    description: offer.description,
    amount: offer.amount,
    currency: offer.currency,
    coachShareBps: offer.coachShareBps ?? null,
    platformShareBps: offer.platformShareBps ?? null,
    calendlyEventTypeUri: offer.calendlyEventTypeUri ?? null,
    calendlySchedulingUrl: offer.calendlySchedulingUrl ?? null,
    status: offer.status,
    moderationNote: offer.moderationNote ?? null
  };
}

export function serializeCoachMessage(message: any) {
  return {
    id: message.id,
    relationshipId: message.relationshipId,
    authorRole: message.authorRole,
    text: message.text,
    readAt: message.readAt?.toISOString?.() ?? null,
    createdAt: message.createdAt.toISOString()
  };
}

export function serializeCoachAssignment(assignment: any) {
  return {
    id: assignment.id,
    relationshipId: assignment.relationshipId,
    title: assignment.title,
    details: assignment.details,
    dueAt: assignment.dueAt?.toISOString?.() ?? null,
    status: assignment.status,
    completedAt: assignment.completedAt?.toISOString?.() ?? null,
    createdAt: assignment.createdAt.toISOString()
  };
}

export function serializeCoachHabitAssignment(assignment: any) {
  return {
    id: assignment.id,
    relationshipId: assignment.relationshipId,
    habitDefinitionId: assignment.habitDefinitionId ?? null,
    enrollmentId: assignment.enrollmentId ?? null,
    title: assignment.title,
    focus: assignment.focus,
    practice: assignment.practice,
    why: assignment.why,
    startsAt: assignment.startsAt.toISOString(),
    endsAt: assignment.endsAt?.toISOString?.() ?? null,
    status: assignment.status
  };
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function metricAverage(metric: { energy: number; clarity: number; stability: number }) {
  return (metric.energy + metric.clarity + metric.stability) / 3;
}

function attentionReason(metrics: any[], lastCheckinAt: Date | null) {
  const latest = metrics[0];
  if (latest && Math.min(latest.energy, latest.clarity, latest.stability) <= 3) return "Один из показателей снизился до 3 или ниже";
  const recent = metrics.slice(0, 3);
  if (recent.length === 3) {
    const scores = recent.map(metricAverage);
    if (scores[0] < scores[1] && scores[1] < scores[2] && scores[0] <= 5) return "Состояние снижается три отметки подряд";
  }
  if (!lastCheckinAt || Date.now() - lastCheckinAt.getTime() > 3 * DAY_MS) return "Нет ежедневной отметки более трёх дней";
  return null;
}

export function serializeCoachClient(relationship: any) {
  const metrics = relationship.habitProgram?.dailyMetrics ?? [];
  const checkins = (relationship.habitProgram?.enrollments ?? []).flatMap((enrollment: any) => enrollment.checkins ?? []);
  const lastCheckinAt = checkins.map((item: any) => item.date as Date).sort((a: Date, b: Date) => b.getTime() - a.getTime())[0] ?? null;
  const weekMetrics = metrics.filter((metric: any) => Date.now() - metric.date.getTime() <= 7 * DAY_MS);
  const latest = metrics[0];
  return {
    relationshipId: relationship.id,
    userId: relationship.userId,
    name: relationship.user?.name ?? null,
    email: relationship.user?.email ?? "",
    avatarUrl: relationship.user?.avatarUrl ?? null,
    funding: relationship.funding,
    status: relationship.status,
    metricsConsent: Boolean(relationship.metricsConsentAt),
    journalConsent: Boolean(relationship.journalConsentAt),
    startedAt: relationship.startedAt?.toISOString?.() ?? null,
    accessEndsAt: relationship.accessEndsAt?.toISOString?.() ?? null,
    lastCheckinAt: lastCheckinAt?.toISOString?.() ?? null,
    weeklyAverage: weekMetrics.length ? Math.round((average(weekMetrics.map(metricAverage)) ?? 0) * 10) / 10 : null,
    latestEnergy: latest?.energy ?? null,
    latestClarity: latest?.clarity ?? null,
    latestStability: latest?.stability ?? null,
    attentionReason: attentionReason(metrics, lastCheckinAt)
  };
}

export function metricPoints(metrics: any[]) {
  return metrics
    .slice()
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .map((metric) => ({
      date: metric.date.toISOString().slice(0, 10),
      energy: metric.energy,
      clarity: metric.clarity,
      stability: metric.stability,
      wellness: Math.round(metricAverage(metric) * 10) / 10
    }));
}

export function calculateHabitCorrelations(program: any) {
  const metrics = program?.dailyMetrics ?? [];
  if (metrics.length < 14) return [];
  const results: Array<Record<string, unknown>> = [];
  for (const enrollment of program.enrollments ?? []) {
    const completed = new Set((enrollment.checkins ?? []).filter((item: any) => item.completed).map((item: any) => item.date.toISOString().slice(0, 10)));
    for (const key of ["energy", "clarity", "stability"] as const) {
      const done = metrics.filter((metric: any) => completed.has(metric.date.toISOString().slice(0, 10))).map((metric: any) => metric[key]);
      const notDone = metrics.filter((metric: any) => !completed.has(metric.date.toISOString().slice(0, 10))).map((metric: any) => metric[key]);
      if (done.length < 4 || notDone.length < 4) continue;
      const doneAverage = average(done) ?? 0;
      const comparisonAverage = average(notDone) ?? 0;
      if (comparisonAverage === 0) continue;
      const differencePercent = Math.round(((doneAverage - comparisonAverage) / comparisonAverage) * 100);
      if (Math.abs(differencePercent) < 5) continue;
      const metricLabel = key === "energy" ? "Энергия" : key === "clarity" ? "Ясность" : "Устойчивость";
      results.push({
        habitTitle: enrollment.title,
        metric: key,
        differencePercent,
        completedDays: done.length,
        comparisonDays: notDone.length,
        message: `В отмеченные дни показатель «${metricLabel}» был ${differencePercent > 0 ? "выше" : "ниже"} на ${Math.abs(differencePercent)}%. Это наблюдаемая связь, а не доказанная причина.`
      });
    }
  }
  return results.sort((a: any, b: any) => Math.abs(b.differencePercent) - Math.abs(a.differencePercent)).slice(0, 6);
}

export async function getActiveCoachSubscription(coachProfileId: string) {
  const now = new Date();
  return prisma.coachSubscription.findFirst({
    where: {
      coachProfileId,
      OR: [
        { status: { in: ["ACTIVE", "CANCEL_AT_PERIOD_END"] }, OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gt: now } }] },
        { status: "GRACE", graceEndsAt: { gt: now } }
      ]
    },
    orderBy: { createdAt: "desc" },
    include: { plan: true, priceVersion: true }
  });
}

export async function resolveHabitAccessForUser(userId: string) {
  const now = new Date();
  const program = await prisma.habitProgram.findFirst({ where: { userId, status: "ACTIVE" }, orderBy: { createdAt: "desc" } });
  if (!program) return { allowed: false, source: "NONE" as const, program: null };
  const direct = program.subscriptionStatus === "ACTIVE"
    || program.subscriptionStatus === "CANCEL_AT_PERIOD_END"
    || (program.subscriptionStatus === "TRIAL" && Boolean(program.trialEndsAt && program.trialEndsAt > now));
  if (direct) return { allowed: true, source: "B2C" as const, program };
  const relationship = await prisma.coachClientRelationship.findFirst({
    where: {
      userId,
      status: "ACTIVE",
      AND: [
        { OR: [{ accessEndsAt: null }, { accessEndsAt: { gt: now } }] },
        { OR: [
          { funding: "CLIENT_PAID" },
          {
            funding: "COACH_PAID",
            coachProfile: {
              subscriptions: {
                some: {
                  OR: [
                    {
                      status: { in: ["ACTIVE", "CANCEL_AT_PERIOD_END"] },
                      OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gt: now } }]
                    },
                    { status: "GRACE", graceEndsAt: { gt: now } }
                  ]
                }
              }
            }
          }
        ] }
      ]
    }
  });
  return relationship
    ? { allowed: true, source: relationship.funding === "COACH_PAID" ? "COACH_PACKAGE" as const : "COACH_SERVICE" as const, program, relationshipId: relationship.id }
    : { allowed: false, source: "EXPIRED" as const, program };
}

export function hashCoachToken(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function integrationKey() {
  const secret = env.CALENDLY_TOKEN_ENCRYPTION_SECRET || env.PARTNER_PORTAL_SESSION_ENCRYPTION_SECRET || env.JWT_ACCESS_SECRET;
  return createHash("sha256").update(`orken-calendly:${secret}`).digest();
}

export function encryptCoachIntegrationToken(token: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", integrationKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptCoachIntegrationToken(value: string) {
  const [version, iv, tag, encrypted] = value.split(".");
  if (version !== "v1" || !iv || !tag || !encrypted) throw new Error("Invalid encrypted integration token");
  const decipher = createDecipheriv("aes-256-gcm", integrationKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
}

export function createOpaqueCoachToken() {
  return randomBytes(32).toString("base64url");
}

export async function redeemCoachReward(input: { rewardId: string; relationshipId: string; userId: string; idempotencyKey: string }) {
  return prisma.$transaction(async (tx) => {
    const existingWallet = await tx.internalWalletTransaction.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (existingWallet) {
      const existing = await tx.coachRewardRedemption.findUnique({ where: { walletTransactionId: existingWallet.id } });
      if (existing) return existing;
    }
    const reward = await tx.coachReward.findFirst({
      where: { id: input.rewardId, status: "APPROVED", coachProfile: { clients: { some: { id: input.relationshipId, userId: input.userId, status: "ACTIVE" } } } }
    });
    if (!reward) throw new Error("Reward is not available");
    const relationship = await tx.coachClientRelationship.findUniqueOrThrow({ where: { id: input.relationshipId } });
    const balance = await tx.internalWalletTransaction.aggregate({
      where: { userId: input.userId, currency: "orken_points" },
      _sum: { amountDelta: true }
    });
    assertCoachRewardAffordable(balance._sum.amountDelta ?? 0, reward.pointsCost);
    const wallet = await tx.internalWalletTransaction.create({
      data: {
        userId: input.userId,
        programId: relationship.habitProgramId,
        currency: "orken_points",
        amountDelta: -reward.pointsCost,
        reason: reward.title,
        sourceType: "coach_reward",
        sourceId: reward.id,
        idempotencyKey: input.idempotencyKey
      }
    });
    return tx.coachRewardRedemption.create({
      data: {
        rewardId: reward.id,
        relationshipId: input.relationshipId,
        userId: input.userId,
        pointsCost: reward.pointsCost,
        walletTransactionId: wallet.id
      }
    });
  });
}
