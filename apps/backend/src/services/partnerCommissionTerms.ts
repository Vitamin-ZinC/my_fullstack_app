import { z } from "zod";
import type { PartnerCommissionTerms } from "@levelup/contracts";

const rate = z.number().int().min(0).max(10000);
const id = z.string().min(1).max(180);

// Only allowlisted fields cross the BFF boundary; Core remains authoritative.
export const partnerCommissionTermSchema = z.object({
  projectId: z.enum(["orken", "orken-life"]),
  programId: id,
  partnerAccountId: id.nullish().transform(value => value ?? undefined),
  referralLinkId: id.nullish().transform(value => value ?? undefined),
  standardRateBps: rate,
  partnerRateBps: rate.nullable(),
  referralLinkRateBps: rate.nullable(),
  effectiveRateBps: rate,
  source: z.enum(["program", "partner", "referral_link"]),
  effectiveAt: z.string().datetime({ offset: true }),
  termsVersion: z.string(),
  evaluatedAt: z.string().datetime({ offset: true })
});

export function partnerCommissionTerms(value: unknown, partnerAccountId?: string): PartnerCommissionTerms {
  const payload = value && typeof value === "object" ? (value as Record<string, unknown>).commissionTerms : null;
  const source = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const result: PartnerCommissionTerms = { programs: [], partners: [], referralLinks: [] };
  for (const key of ["programs", "partners", "referralLinks"] as const) {
    for (const entry of Array.isArray(source[key]) ? source[key] : []) {
      const parsed = partnerCommissionTermSchema.safeParse(entry);
      if (!parsed.success) continue;
      const term = parsed.data;
      if (key === "programs" && (term.partnerAccountId || term.referralLinkId)) continue;
      if (key !== "programs" && (!term.partnerAccountId || (partnerAccountId && term.partnerAccountId !== partnerAccountId))) continue;
      if (key === "partners" && term.referralLinkId) continue;
      if (key === "referralLinks" && !term.referralLinkId) continue;
      result[key].push(term);
    }
  }
  return result;
}
