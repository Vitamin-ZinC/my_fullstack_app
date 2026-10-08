import { z } from "zod";

function requireModerationReason(body: { status: string; moderationNote?: string | null }, context: z.RefinementCtx) {
  if (["DRAFT", "REJECTED", "SUSPENDED", "PAUSED"].includes(body.status) && !body.moderationNote?.trim()) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["moderationNote"], message: "Укажите причину решения для коуча" });
  }
}

const moderationNote = z.string().trim().max(1000).nullable().optional();

export const coachProfileModerationSchema = z.object({
  status: z.enum(["DRAFT", "PENDING_REVIEW", "APPROVED", "REJECTED", "SUSPENDED"]),
  moderationNote,
  featured: z.boolean().optional()
}).superRefine(requireModerationReason).transform(body => ({
  ...body, moderationNote: body.status === "APPROVED" ? null : body.moderationNote
}));

export const coachOfferModerationSchema = z.object({
  status: z.enum(["DRAFT", "PENDING_REVIEW", "APPROVED", "REJECTED", "PAUSED"]),
  coachShareBps: z.coerce.number().int().min(0).max(10_000).optional(),
  platformShareBps: z.coerce.number().int().min(0).max(10_000).optional(),
  moderationNote
}).superRefine(requireModerationReason).transform(body => ({
  ...body, moderationNote: body.status === "APPROVED" ? null : body.moderationNote
}));
