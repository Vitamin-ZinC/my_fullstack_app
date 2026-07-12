import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { env } from "../env.js";
import { requireAdmin, requireSession, writeAdminAudit } from "../lib/auth.js";
import { prisma } from "../lib/prisma.js";
import {
  createEmbeddedPartnerCoreSession,
  createPartnerReferralLink,
  createPartnerCoreRewardPlacement,
  ensurePartnerCoreAffiliateProgram,
  getPartnerMarketplace,
  isPartnerCoreConfigured,
  redeemPartnerOffer,
  syncPartnerCoreOffers,
  transitionPartnerCoreOfferStatus
} from "../services/partnerCore.js";

const partnerProgramSchema = z.object({
  id: z.string().optional(),
  partnerCoreProgramId: z.string().trim().max(180).optional().nullable(),
  name: z.string().trim().min(2).max(180),
  referralDestination: z.string().trim().url().max(600),
  customerBonusType: z.enum(["NONE", "FREE_DAYS", "DISCOUNT", "CREDITS", "CUSTOM_ENTITLEMENT"]),
  customerBonusValue: z.coerce.number().int().min(0).max(1000000).optional().nullable(),
  customerBonusEntitlement: z.string().trim().max(500).optional().nullable(),
  commissionModel: z.enum(["FIXED", "PERCENT", "HYBRID"]),
  commissionRateBps: z.coerce.number().int().min(0).max(10000).optional().nullable(),
  fixedPayoutCents: z.coerce.number().int().min(0).max(100000000).optional().nullable(),
  commissionWindowType: z.enum(["FIRST_PAYMENT", "MONTHS", "LIFETIME"]),
  commissionWindowMonths: z.coerce.number().int().min(1).max(120).optional().nullable(),
  lockDays: z.coerce.number().int().min(0).max(3650),
  status: z.enum(["ACTIVE", "PAUSED"]),
  termsVersion: z.string().trim().min(1).max(80)
});

const partnerOfferSchema = z.object({
  id: z.string().optional(),
  programConfigId: z.string().trim().min(1).optional().nullable(),
  partnerId: z.string().trim().max(160).optional().nullable(),
  partnerCorePlacementId: z.string().trim().max(180).optional().nullable(),
  kind: z.enum(["paid_service", "qualified_lead", "portfolio_credit", "reward_trial", "manual_deal"]).default("manual_deal"),
  surface: z.enum(["rewards_tab", "milestone_modal", "home_module", "admin_recommendation"]).default("rewards_tab"),
  title: z.string().trim().min(2).max(180),
  description: z.string().trim().min(2).max(2000),
  imageUrl: z.string().trim().max(800).optional().nullable(),
  redemptionCurrency: z.string().trim().min(3).max(40).default("orken_points"),
  redemptionAmount: z.coerce.number().int().min(1).max(100000000),
  userBenefit: z.string().trim().min(1).max(500),
  partnerPayoutCents: z.coerce.number().int().min(0).max(100000000).default(0),
  capPerMonth: z.coerce.number().int().min(1).max(1000000).optional().nullable(),
  status: z.enum(["DRAFT", "PENDING_REVIEW", "APPROVED", "REJECTED", "PAUSED"]).default("DRAFT"),
  entitlementType: z.string().trim().min(1).max(80).default("manual"),
  entitlementValue: z.string().trim().max(1000).optional().nullable()
});

const statusSchema = z.object({
  status: z.enum(["DRAFT", "PENDING_REVIEW", "APPROVED", "REJECTED", "PAUSED"])
});

const referralLinkSchema = z.object({
  channel: z.string().trim().min(2).max(120)
});

const redemptionSchema = z.object({
  idempotencyKey: z.string().trim().min(12).max(220).optional()
});

export async function partnerRoutes(app: FastifyInstance) {
  app.get("/api/partners/marketplace", async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    const marketplace = await getPartnerMarketplace(session);
    return serializeMarketplace(marketplace);
  });

  app.post("/api/partners/offers/:id/redeem", async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = redemptionSchema.parse(request.body ?? {});
    try {
      const redemption = await redeemPartnerOffer({
        session,
        offerId: params.id,
        idempotencyKey: body.idempotencyKey
      });
      const marketplace = await getPartnerMarketplace(session);
      return {
        redemption: serializeRedemption(redemption),
        balance: marketplace.balance,
        currency: marketplace.currency
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Partner offer redemption failed";
      return reply.code(400).send({ error: message });
    }
  });

  app.get("/api/admin/partner-programs", async (request, reply) => {
    if (!(await requireAdmin(request, reply))) return;
    const programs = await prisma.partnerAffiliateProgram.findMany({
      orderBy: { updatedAt: "desc" },
      include: { referralLinks: { orderBy: { createdAt: "desc" } } }
    });
    return programs.map(serializeProgram);
  });

  app.post("/api/admin/partner-programs", async (request, reply) => {
    if (!(await requireAdmin(request, reply))) return;
    const body = partnerProgramSchema.parse(request.body ?? {});
    const data = {
      partnerCoreProgramId: body.partnerCoreProgramId || null,
      name: body.name,
      referralDestination: body.referralDestination,
      customerBonusType: body.customerBonusType,
      customerBonusValue: body.customerBonusValue ?? null,
      customerBonusEntitlement: body.customerBonusEntitlement || null,
      commissionModel: body.commissionModel,
      commissionRateBps: body.commissionRateBps ?? null,
      fixedPayoutCents: body.fixedPayoutCents ?? null,
      commissionWindowType: body.commissionWindowType,
      commissionWindowMonths: body.commissionWindowMonths ?? null,
      lockDays: body.lockDays,
      status: body.status,
      termsVersion: body.termsVersion
    };

    const program = await prisma.$transaction(async (tx) => {
      if (body.status === "ACTIVE") {
        await tx.partnerAffiliateProgram.updateMany({
          where: body.id ? { id: { not: body.id }, status: "ACTIVE" } : { status: "ACTIVE" },
          data: { status: "PAUSED" }
        });
      }
      return body.id
        ? tx.partnerAffiliateProgram.update({ where: { id: body.id }, data, include: { referralLinks: true } })
        : tx.partnerAffiliateProgram.create({ data, include: { referralLinks: true } });
    });
    const syncedProgram = await ensurePartnerCoreAffiliateProgram(program.id, "orken-admin").catch((error) => {
      request.log.warn({ error, programId: program.id }, "Partner Core program creation failed");
      return program;
    });
    await writeAdminAudit("partner.program.upsert", "PartnerAffiliateProgram", program.id, data);
    const hydrated = await prisma.partnerAffiliateProgram.findUnique({
      where: { id: syncedProgram?.id ?? program.id },
      include: { referralLinks: { orderBy: { createdAt: "desc" } } }
    });
    return serializeProgram(hydrated ?? program);
  });

  app.post("/api/admin/partner-programs/:id/referral-links", async (request, reply) => {
    if (!(await requireAdmin(request, reply))) return;
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = referralLinkSchema.parse(request.body ?? {});
    try {
      const link = await createPartnerReferralLink({
        programConfigId: params.id,
        channel: body.channel,
        actor: "orken-admin"
      });
      await writeAdminAudit("partner.referral_link.create", "PartnerReferralLink", link.id, { programConfigId: params.id, channel: body.channel });
      return serializeReferralLink(link);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Referral link creation failed";
      return reply.code(400).send({ error: message });
    }
  });

  app.get("/api/admin/partner-offers", async (request, reply) => {
    if (!(await requireAdmin(request, reply))) return;
    await syncPartnerCoreOffers("orken-admin").catch((error) => {
      request.log.warn({ error }, "Partner Core offer sync failed");
    });
    const offers = await prisma.partnerOffer.findMany({
      orderBy: { updatedAt: "desc" },
      include: { _count: { select: { redemptions: true } } }
    });
    return offers.map(serializeOffer);
  });

  app.post("/api/admin/partner-offers", async (request, reply) => {
    if (!(await requireAdmin(request, reply))) return;
    const body = partnerOfferSchema.parse(request.body ?? {});
    const data = {
      programConfigId: body.programConfigId || null,
      partnerId: body.partnerId || null,
      partnerCorePlacementId: body.partnerCorePlacementId || null,
      kind: body.kind,
      surface: body.surface,
      title: body.title,
      description: body.description,
      imageUrl: body.imageUrl || null,
      redemptionCurrency: body.redemptionCurrency,
      redemptionAmount: body.redemptionAmount,
      userBenefit: body.userBenefit,
      partnerPayoutCents: body.partnerPayoutCents,
      capPerMonth: body.capPerMonth ?? null,
      status: body.status,
      entitlementType: body.entitlementType,
      entitlementValue: body.entitlementValue || null
    };
    const localStatus = isPartnerCoreConfigured() && body.status === "APPROVED" ? "DRAFT" : body.status;
    const offer = body.id
      ? await prisma.partnerOffer.update({ where: { id: body.id }, data: { ...data, status: localStatus }, include: { _count: { select: { redemptions: true } } } })
      : await prisma.partnerOffer.create({ data: { ...data, status: localStatus }, include: { _count: { select: { redemptions: true } } } });
    const syncedOffer = isPartnerCoreConfigured()
      ? await createPartnerCoreRewardPlacement(offer).catch((error) => {
        request.log.warn({ error, offerId: offer.id }, "Partner Core placement creation failed");
        return offer;
      })
      : offer;
    await writeAdminAudit("partner.offer.upsert", "PartnerOffer", offer.id, data);
    const hydrated = await prisma.partnerOffer.findUnique({
      where: { id: syncedOffer.id },
      include: { _count: { select: { redemptions: true } } }
    });
    return serializeOffer(hydrated ?? offer);
  });

  app.patch("/api/admin/partner-offers/:id/status", async (request, reply) => {
    if (!(await requireAdmin(request, reply))) return;
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = statusSchema.parse(request.body ?? {});
    const updated = await transitionPartnerCoreOfferStatus(params.id, body.status, "orken-admin");
    const offer = await prisma.partnerOffer.findUniqueOrThrow({
      where: { id: updated.id },
      include: { _count: { select: { redemptions: true } } }
    });
    await writeAdminAudit("partner.offer.status", "PartnerOffer", offer.id, body);
    return serializeOffer(offer);
  });

  app.post("/api/admin/partner-offers/sync", async (request, reply) => {
    if (!(await requireAdmin(request, reply))) return;
    if (!isPartnerCoreConfigured()) {
      return reply.code(501).send({ error: "Partner Core is not configured" });
    }
    const result = await syncPartnerCoreOffers("orken-admin");
    await writeAdminAudit("partner.offer.sync", "PartnerOffer", undefined, result);
    return result;
  });

  app.get("/api/admin/partner-redemptions", async (request, reply) => {
    if (!(await requireAdmin(request, reply))) return;
    const redemptions = await prisma.partnerOfferRedemption.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        offer: true,
        user: { select: { id: true, email: true, name: true } }
      }
    });
    return redemptions.map(serializeRedemption);
  });

  app.post("/api/admin/partner-core/embedded-session", async (request, reply) => {
    if (!(await requireAdmin(request, reply))) return;
    if (!isPartnerCoreConfigured()) {
      return reply.code(501).send({ error: "Partner Core is not configured" });
    }
    const session = await createEmbeddedPartnerCoreSession("orken-admin");
    return {
      ...session,
      partnerCoreUrl: env.PARTNER_CORE_URL,
      projectId: env.PARTNER_CORE_PROJECT_ID
    };
  });
}

function serializeProgram(program: any) {
  return {
    id: program.id,
    partnerCoreProgramId: program.partnerCoreProgramId,
    name: program.name,
    referralDestination: program.referralDestination,
    customerBonusType: program.customerBonusType,
    customerBonusValue: program.customerBonusValue,
    customerBonusEntitlement: program.customerBonusEntitlement,
    commissionModel: program.commissionModel,
    commissionRateBps: program.commissionRateBps,
    fixedPayoutCents: program.fixedPayoutCents,
    commissionWindowType: program.commissionWindowType,
    commissionWindowMonths: program.commissionWindowMonths,
    lockDays: program.lockDays,
    status: program.status,
    termsVersion: program.termsVersion,
    referralLinks: (program.referralLinks ?? []).map(serializeReferralLink),
    createdAt: program.createdAt.toISOString(),
    updatedAt: program.updatedAt.toISOString()
  };
}

function serializeReferralLink(link: any) {
  return {
    id: link.id,
    programConfigId: link.programConfigId,
    channel: link.channel,
    referralCode: link.referralCode,
    url: link.url,
    partnerCoreLinkId: link.partnerCoreLinkId,
    status: link.status,
    createdAt: link.createdAt.toISOString(),
    updatedAt: link.updatedAt.toISOString()
  };
}

function serializeOffer(offer: any) {
  return {
    id: offer.id,
    programConfigId: offer.programConfigId,
    partnerId: offer.partnerId,
    partnerCorePlacementId: offer.partnerCorePlacementId,
    partnerCoreStatus: offer.partnerCoreStatus,
    partnerCoreSyncedAt: offer.partnerCoreSyncedAt?.toISOString?.() ?? null,
    kind: offer.kind,
    surface: offer.surface,
    title: offer.title,
    description: offer.description,
    imageUrl: offer.imageUrl,
    redemptionCost: {
      currency: offer.redemptionCurrency,
      amount: offer.redemptionAmount
    },
    userBenefit: offer.userBenefit,
    partnerPayoutCents: offer.partnerPayoutCents,
    capPerMonth: offer.capPerMonth,
    status: offer.status,
    entitlementType: offer.entitlementType,
    entitlementValue: offer.entitlementValue,
    redemptionsCount: offer._count?.redemptions,
    createdAt: offer.createdAt.toISOString(),
    updatedAt: offer.updatedAt.toISOString()
  };
}

function serializeRedemption(redemption: any) {
  return {
    id: redemption.id,
    offerId: redemption.offerId,
    offerTitle: redemption.offer?.title,
    userId: redemption.userId,
    userEmail: redemption.user?.email,
    sessionId: redemption.sessionId,
    costCurrency: redemption.costCurrency,
    costAmount: redemption.costAmount,
    status: redemption.status,
    entitlementType: redemption.entitlementType,
    entitlementValue: redemption.entitlementValue,
    partnerCoreRedemptionId: redemption.partnerCoreRedemptionId,
    deliveryError: redemption.deliveryError,
    createdAt: redemption.createdAt.toISOString(),
    updatedAt: redemption.updatedAt.toISOString()
  };
}

function serializeMarketplace(marketplace: Awaited<ReturnType<typeof getPartnerMarketplace>>) {
  return {
    balance: marketplace.balance,
    currency: marketplace.currency,
    offers: marketplace.offers.map(serializeOffer),
    redemptions: marketplace.redemptions.map(serializeRedemption)
  };
}
