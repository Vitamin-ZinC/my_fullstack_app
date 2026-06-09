import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { env } from "../env.js";
import { createAdminSessionToken, requireAdmin, verifyAdminPassword, writeAdminAudit } from "../lib/auth.js";
import { prisma } from "../lib/prisma.js";

const jsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(jsonValueSchema)
  ])
);

const settingSchema = z.object({
  value: jsonValueSchema
});

const loginSchema = z.object({
  password: z.string().min(1).max(300)
});

const flagSchema = z.object({
  enabled: z.boolean(),
  payload: jsonValueSchema.optional()
});

const promptSchema = z.object({
  key: z.string().min(1).max(120),
  locale: z.string().min(2).max(12).default("ru"),
  version: z.coerce.number().int().positive().default(1),
  status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]).default("DRAFT"),
  title: z.string().min(1).max(200),
  content: z.string().min(1)
});

const promoCodeSchema = z.object({
  code: z.string().trim().min(2).max(64),
  description: z.string().trim().max(300).optional().nullable(),
  discountType: z.enum(["PERCENT", "FIXED_AMOUNT"]),
  percentOff: z.coerce.number().int().min(1).max(100).optional().nullable(),
  amountOff: z.coerce.number().int().positive().optional().nullable(),
  currency: z.string().trim().min(3).max(3).optional().nullable(),
  active: z.boolean().default(true),
  maxRedemptions: z.coerce.number().int().positive().optional().nullable(),
  startsAt: z.string().datetime().optional().nullable(),
  expiresAt: z.string().datetime().optional().nullable()
});

function normalizePromoCode(code: string) {
  return code.trim().toUpperCase();
}

function toPromoData(input: z.infer<typeof promoCodeSchema>) {
  if (input.discountType === "PERCENT" && !input.percentOff) {
    throw new Error("percentOff is required for percent promo codes");
  }
  if (input.discountType === "FIXED_AMOUNT" && !input.amountOff) {
    throw new Error("amountOff is required for fixed amount promo codes");
  }

  return {
    code: normalizePromoCode(input.code),
    description: input.description || null,
    discountType: input.discountType,
    percentOff: input.discountType === "PERCENT" ? input.percentOff : null,
    amountOff: input.discountType === "FIXED_AMOUNT" ? input.amountOff : null,
    currency: input.discountType === "FIXED_AMOUNT" ? (input.currency ?? "usd").toLowerCase() : input.currency?.toLowerCase() ?? null,
    active: input.active,
    maxRedemptions: input.maxRedemptions ?? null,
    startsAt: input.startsAt ? new Date(input.startsAt) : null,
    expiresAt: input.expiresAt ? new Date(input.expiresAt) : null
  };
}

export async function adminRoutes(app: FastifyInstance) {
  app.post("/api/admin/login", async (request, reply) => {
    const body = loginSchema.parse(request.body ?? {});
    if (!env.ADMIN_PASSWORD_HASH) {
      return reply.code(501).send({ error: "Admin password is not configured" });
    }
    if (!verifyAdminPassword(body.password, env.ADMIN_PASSWORD_HASH)) {
      return reply.code(401).send({ error: "Invalid password" });
    }
    const adminSession = await createAdminSessionToken();
    await writeAdminAudit("admin.login", "AdminSession");
    return { adminSession, expiresInSeconds: 12 * 60 * 60 };
  });

  app.addHook("preHandler", async (request, reply) => {
    if (request.method === "POST" && request.url.split("?")[0] === "/api/admin/login") {
      return;
    }

    const admin = await requireAdmin(request, reply);
    if (!admin) return reply;
  });

  app.get("/api/admin/stats", async () => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [analysesTotal, analysesByStatus, paymentsSucceeded, revenue, eventsLast24h, failedAnalyses] = await Promise.all([
      prisma.analysis.count(),
      prisma.analysis.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.payment.count({ where: { status: "SUCCEEDED" } }),
      prisma.payment.aggregate({ where: { status: "SUCCEEDED" }, _sum: { amount: true } }),
      prisma.analyticsEvent.count({ where: { createdAt: { gte: since } } }),
      prisma.analysis.count({ where: { status: "FAILED" } })
    ]);

    return {
      analysesTotal,
      analysesByStatus: analysesByStatus.map((item) => ({ status: item.status, count: item._count._all })),
      paymentsSucceeded,
      revenueSucceeded: revenue._sum.amount ?? 0,
      eventsLast24h,
      failedAnalyses
    };
  });

  app.get("/api/admin/analyses", async (request) => {
    const query = z.object({
      limit: z.coerce.number().int().min(1).max(100).default(25),
      status: z.enum(["PENDING", "QUEUED", "PROCESSING", "DONE", "FAILED"]).optional()
    }).parse(request.query);

    return prisma.analysis.findMany({
      where: query.status ? { status: query.status } : undefined,
      orderBy: { createdAt: "desc" },
      take: query.limit,
      include: {
        payment: true,
        mediaAssets: true,
        jobEvents: { orderBy: { createdAt: "desc" }, take: 5 }
      }
    });
  });

  app.get("/api/admin/settings", async () => {
    return prisma.appSetting.findMany({ orderBy: { key: "asc" } });
  });

  app.put("/api/admin/settings/:key", async (request) => {
    const params = z.object({ key: z.string().min(1).max(120) }).parse(request.params);
    const body = settingSchema.parse(request.body);
    const setting = await prisma.appSetting.upsert({
      where: { key: params.key },
      update: { value: body.value as any },
      create: { key: params.key, value: body.value as any }
    });
    await writeAdminAudit("setting.upsert", "AppSetting", params.key, body);
    return setting;
  });

  app.get("/api/admin/feature-flags", async () => {
    return prisma.featureFlag.findMany({ orderBy: { key: "asc" } });
  });

  app.put("/api/admin/feature-flags/:key", async (request) => {
    const params = z.object({ key: z.string().min(1).max(120) }).parse(request.params);
    const body = flagSchema.parse(request.body);
    const flag = await prisma.featureFlag.upsert({
      where: { key: params.key },
      update: { enabled: body.enabled, payload: body.payload as any },
      create: { key: params.key, enabled: body.enabled, payload: body.payload as any }
    });
    await writeAdminAudit("feature_flag.upsert", "FeatureFlag", params.key, body);
    return flag;
  });

  app.get("/api/admin/prompts", async () => {
    return prisma.promptTemplate.findMany({
      orderBy: [{ key: "asc" }, { locale: "asc" }, { version: "desc" }]
    });
  });

  app.post("/api/admin/prompts", async (request) => {
    const body = promptSchema.parse(request.body);
    const prompt = await prisma.promptTemplate.upsert({
      where: { key_locale_version: { key: body.key, locale: body.locale, version: body.version } },
      update: {
        status: body.status,
        title: body.title,
        content: body.content,
        publishedAt: body.status === "ACTIVE" ? new Date() : undefined
      },
      create: {
        key: body.key,
        locale: body.locale,
        version: body.version,
        status: body.status,
        title: body.title,
        content: body.content,
        publishedAt: body.status === "ACTIVE" ? new Date() : undefined
      }
    });
    await writeAdminAudit("prompt.upsert", "PromptTemplate", prompt.id, body);
    return prompt;
  });

  app.get("/api/admin/promo-codes", async () => {
    return prisma.promoCode.findMany({
      orderBy: [{ active: "desc" }, { updatedAt: "desc" }]
    });
  });

  app.post("/api/admin/promo-codes", async (request, reply) => {
    let data: ReturnType<typeof toPromoData>;
    try {
      data = toPromoData(promoCodeSchema.parse(request.body));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid promo code";
      return reply.code(400).send({ error: message });
    }

    const promo = await prisma.promoCode.upsert({
      where: { code: data.code },
      update: data,
      create: data
    });
    await writeAdminAudit("promo_code.upsert", "PromoCode", promo.id, data);
    return promo;
  });

  app.put("/api/admin/promo-codes/:id/active", async (request) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const body = z.object({ active: z.boolean() }).parse(request.body);
    const promo = await prisma.promoCode.update({
      where: { id: params.id },
      data: { active: body.active }
    });
    await writeAdminAudit(body.active ? "promo_code.activate" : "promo_code.deactivate", "PromoCode", promo.id, body);
    return promo;
  });

  app.get("/api/admin/audit-log", async () => {
    return prisma.adminAuditLog.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
  });
}
