import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { env } from "../env.js";
import { requireAdmin, writeAdminAudit } from "../lib/auth.js";
import { prisma } from "../lib/prisma.js";
import {
  createCoachPartnershipLead,
  getCoachPartnershipMaterial,
  markCoachApplicationDelivery,
  serializeCoachPartnershipLead,
  updateCoachPartnershipLeadStatus
} from "../services/coachPartnership.js";
import { sendCoachApplicationEmails } from "../services/email.js";

const interestSchema = z.enum(["wholesale", "referral", "marketplace", "white_label", "personal"]);
const coachApplicationSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(320),
  telegram: z.string().trim().max(80).optional().default(""),
  city: z.string().trim().max(120).optional().default(""),
  practiceFormat: z.enum(["individual", "groups", "corporate", "education", "mixed"]),
  experienceYears: z.coerce.number().int().min(0).max(80).optional(),
  activeClients: z.coerce.number().int().min(0).max(100000).optional(),
  interests: z.array(interestSchema).min(1).max(5).transform((items) => [...new Set(items)]),
  message: z.string().trim().max(2000).optional().default(""),
  consent: z.literal(true),
  idempotencyKey: z.string().trim().min(12).max(220),
  website: z.string().trim().max(240).optional().default("")
});
const materialParamsSchema = z.object({ token: z.string().min(40).max(80) });
const adminLeadQuerySchema = z.object({
  status: z.enum(["NEW", "CONTACTED", "APPROVED", "REJECTED"]).optional(),
  take: z.coerce.number().int().min(1).max(200).default(100)
});
const adminStatusSchema = z.object({ status: z.enum(["NEW", "CONTACTED", "APPROVED", "REJECTED"]) });

export async function coachRoutes(app: FastifyInstance) {
  app.post("/api/coaches/applications", {
    config: { rateLimit: { max: 5, timeWindow: "1 hour" } }
  }, async (request, reply) => {
    const parsed = coachApplicationSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: "Проверьте обязательные поля и согласие на обработку данных." });
    }
    const body = parsed.data;
    if (body.website) {
      return reply.code(202).send({ applicationId: "received", status: "received", materialDelivery: "manual_follow_up" });
    }

    const result = await createCoachPartnershipLead({
      idempotencyKey: body.idempotencyKey,
      fullName: body.fullName,
      email: body.email,
      telegram: normalizeTelegram(body.telegram),
      city: body.city || null,
      practiceFormat: body.practiceFormat,
      experienceYears: body.experienceYears,
      activeClients: body.activeClients,
      interests: body.interests,
      message: body.message || null,
      consentAt: new Date()
    });

    if (!result.created || !result.materialToken) {
      return {
        applicationId: result.lead.id,
        status: "received",
        materialDelivery: result.lead.applicantEmailStatus === "SENT" ? "sent" : "manual_follow_up"
      };
    }

    const materialUrl = `${env.APP_ORIGIN.replace(/\/$/, "")}/coaches/material/${encodeURIComponent(result.materialToken)}`;
    const delivery = await sendCoachApplicationEmails({
      applicationId: result.lead.id,
      email: result.lead.email,
      fullName: result.lead.fullName,
      telegram: result.lead.telegram,
      city: result.lead.city,
      practiceFormat: result.lead.practiceFormat,
      experienceYears: result.lead.experienceYears,
      activeClients: result.lead.activeClients,
      interests: body.interests,
      message: result.lead.message,
      materialUrl,
      materialExpiresAt: result.lead.materialExpiresAt
    });
    await markCoachApplicationDelivery(result.lead.id, delivery);
    await prisma.analyticsEvent.create({
      data: {
        name: "coach_partnership_application_submitted",
        properties: {
          applicationId: result.lead.id,
          practiceFormat: result.lead.practiceFormat,
          interests: body.interests,
          applicantEmailSent: delivery.applicantEmailSent,
          teamNotificationSent: delivery.teamNotificationSent
        }
      }
    });
    return reply.code(201).send({
      applicationId: result.lead.id,
      status: "received",
      materialDelivery: delivery.applicantEmailSent ? "sent" : "manual_follow_up"
    });
  });

  app.get("/api/coaches/material/:token", {
    config: { rateLimit: { max: 30, timeWindow: "1 hour" } }
  }, async (request, reply) => {
    const parsed = materialParamsSchema.safeParse(request.params);
    if (!parsed.success) return reply.code(404).send({ error: "Материал не найден или ссылка устарела." });
    const material = await getCoachPartnershipMaterial(parsed.data.token);
    if (!material) return reply.code(404).send({ error: "Материал не найден или ссылка устарела." });
    return reply.header("Cache-Control", "private, no-store").send(material);
  });

  app.get("/api/admin/coach-applications", async (request, reply) => {
    if (!(await requireAdmin(request, reply))) return;
    const query = adminLeadQuerySchema.parse(request.query ?? {});
    const leads = await prisma.coachPartnershipLead.findMany({
      where: query.status ? { status: query.status } : undefined,
      orderBy: { createdAt: "desc" },
      take: query.take
    });
    return leads.map(serializeCoachPartnershipLead);
  });

  app.patch("/api/admin/coach-applications/:id/status", async (request, reply) => {
    if (!(await requireAdmin(request, reply))) return;
    const params = z.object({ id: z.string().min(1).max(120) }).parse(request.params);
    const body = adminStatusSchema.parse(request.body ?? {});
    const lead = await updateCoachPartnershipLeadStatus(params.id, body.status);
    await writeAdminAudit("coach_application.status", "CoachPartnershipLead", lead.id, body);
    return serializeCoachPartnershipLead(lead);
  });
}

function normalizeTelegram(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const username = trimmed.replace(/^https?:\/\/t\.me\//i, "").replace(/^@/, "").split(/[/?#]/)[0];
  return username && /^[A-Za-z0-9_]{5,32}$/.test(username) ? `@${username}` : trimmed.slice(0, 80);
}
