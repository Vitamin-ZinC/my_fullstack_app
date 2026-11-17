import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { requireAdmin, writeAdminAudit } from "../lib/auth.js";
import { managePartnerCoreCommissionTerms, PartnerCoreServiceError } from "../services/partnerCore.js";

const id = z.string().trim().min(1).max(180).regex(/^[a-zA-Z0-9_-]+$/);
const targetFields = { programId: id, partnerAccountId: id.optional(), referralLinkId: id.optional() };
const targetSchema = z.object(targetFields).strict().refine(value => !value.referralLinkId || value.partnerAccountId);
const updateSchema = z.object({
  ...targetFields,
  commissionRateBps: z.number().int().min(0).max(10000).nullable(),
  reason: z.string().trim().min(1).max(1000),
  idempotencyKey: z.string().trim().min(12).max(220).regex(/^[a-zA-Z0-9_:.-]+$/)
}).strict().refine(value => (!value.referralLinkId || value.partnerAccountId) &&
  (value.partnerAccountId || value.commissionRateBps !== null));

const allowedErrors = new Set([
  "invalid_commission_rate", "invalid_commission_reason", "idempotency_key_required", "session_expired",
  "session_revoked", "invalid_token", "scope_missing", "service_scope_missing", "service_project_scope_missing",
  "commission_project_forbidden", "origin_mismatch", "commission_program_not_found", "commission_partner_not_found",
  "commission_referral_link_not_found", "commission_model_not_percent", "idempotency_conflict",
  "versioned_commission_api_required", "commission_service_not_configured", "commission_response_invalid"
]);

function commissionError(reply: FastifyReply, error: unknown) {
  const payload = error instanceof PartnerCoreServiceError ? error.payload as { error?: { code?: string } } | null : null;
  const code = payload?.error?.code;
  const safeCode = code && allowedErrors.has(code) ? code : "commission_unavailable";
  // Never forward arbitrary Core messages, tokens or service credentials.
  const status = error instanceof PartnerCoreServiceError && [400, 401, 403, 404, 409, 429, 503].includes(error.status) ? error.status : 502;
  return reply.code(status).send({ error: "Commission terms could not be loaded or saved", code: safeCode });
}

export async function partnerCommissionRoutes(app: FastifyInstance) {
  app.get("/api/admin/partner-core/commission-terms", async (request, reply) => {
    const admin = await requireAdmin(request, reply);
    if (!admin) return;
    const parsed = targetSchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid commission target", code: "commission_input_invalid" });
    try {
      return await managePartnerCoreCommissionTerms(admin.id, parsed.data);
    } catch (error) { return commissionError(reply, error); }
  });

  app.post("/api/admin/partner-core/commission-terms", async (request, reply) => {
    const admin = await requireAdmin(request, reply);
    if (!admin) return;
    const parsed = updateSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Invalid commission change", code: "commission_input_invalid" });
    const { programId, partnerAccountId, referralLinkId } = parsed.data;
    const target = { programId, partnerAccountId, referralLinkId };
    try {
      const result = await managePartnerCoreCommissionTerms(admin.id, target, parsed.data);
      // Core records the authoritative audit in the same transaction as the change.
      await writeAdminAudit("partner.commission.update", "PartnerCoreCommission", referralLinkId ?? partnerAccountId ?? programId,
        { ...parsed.data, actor: `orken-admin:${admin.id}`, commissionTerms: result.commissionTerms })
        .catch(() => request.log.warn({ code: "commission_local_audit_failed" }, "Core commission saved; local audit unavailable"));
      return result;
    } catch (error) { return commissionError(reply, error); }
  });
}
