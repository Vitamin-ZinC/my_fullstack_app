import { createHash } from "node:crypto";
import type { FastifyRequest } from "fastify";
import { Prisma } from "@prisma/client";
import { TRAFFIC_PAGES, type AdminTrafficReport } from "@levelup/contracts";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { env } from "../env.js";

export const TRAFFIC_RETENTION_DAYS = 180;
export const TRAFFIC_IDLE_MS = 30 * 60 * 1000;
const uuid = z.string().uuid();
// Marketing tags are short slugs, never URLs, email addresses or free-form text.
const tag = z.string().min(1).max(48).regex(/^[a-z][a-z0-9_-]*$/).refine(value => !/(token|secret|password|bearer|session)/i.test(value));
export const trafficViewSchema = z.object({
  consent: z.literal(true), visitorId: uuid, visitId: uuid, eventId: uuid,
  page: z.enum(TRAFFIC_PAGES), source: tag, medium: tag,
  campaign: tag.optional(), device: z.enum(["mobile", "tablet", "desktop"])
}).strict();

export function trafficHash(value: string) {
  return createHash("sha256").update(`orken-traffic-v1:${value}`).digest("hex");
}

export function trafficOriginAllowed(request: Pick<FastifyRequest, "headers">) {
  const origin = request.headers.origin;
  return typeof origin === "string" && [env.APP_ORIGIN, env.PARTNER_PORTAL_ORIGIN].filter(Boolean).includes(origin);
}

function conversionOriginAllowed(request: Pick<FastifyRequest, "headers">) {
  if (request.headers.origin) return trafficOriginAllowed(request);
  // Same-origin GET fetches do not necessarily carry Origin. Never persist Referer.
  if (request.headers["sec-fetch-site"] !== "same-origin" || typeof request.headers.referer !== "string") return false;
  try { return trafficOriginAllowed({ headers: { origin: new URL(request.headers.referer).origin } }); } catch { return false; }
}

export async function trafficEnabled() {
  const setting = await prisma.appSetting.findUnique({ where: { key: "traffic_analytics_enabled" }, select: { value: true } });
  return setting?.value !== false;
}

export async function saveTrafficView(input: z.infer<typeof trafficViewSchema>) {
  const id = trafficHash(`${input.visitorId}:${input.visitId}`);
  const now = new Date();
  return prisma.$transaction(async tx => {
    const visit = await tx.webTrafficVisit.upsert({
      where: { id }, update: {},
      create: { id, visitorHash: trafficHash(input.visitorId), source: input.source, medium: input.medium,
        campaign: input.campaign, device: input.device, entryPage: input.page, createdAt: now, lastSeenAt: now }
    });
    if (now.getTime() - visit.lastSeenAt.getTime() > TRAFFIC_IDLE_MS || now.getTime() - visit.createdAt.getTime() > 24 * 60 * 60 * 1000) {
      return { ok: false, rotateVisit: true };
    }
    const inserted = await tx.webTrafficPageView.createMany({
      data: [{ id: trafficHash(`${input.visitorId}:${input.eventId}`), visitId: id, page: input.page, createdAt: now }], skipDuplicates: true
    });
    if (inserted.count) await tx.webTrafficVisit.update({ where: { id }, data: { lastSeenAt: now } });
    return { ok: true, rotateVisit: false };
  });
}

type ConversionKind = "REGISTRATION" | "DIAGNOSTIC_STARTED" | "REPORT_CHECKOUT";
export async function recordTrafficConversion(request: FastifyRequest, kind: ConversionKind, entity: string) {
  try {
    if (!conversionOriginAllowed(request) || request.headers["sec-gpc"] === "1" || request.headers.dnt === "1") return;
    const visitor = uuid.safeParse(request.headers["x-traffic-visitor"]);
    const visit = uuid.safeParse(request.headers["x-traffic-visit"]);
    if (!visitor.success || !visit.success || !await trafficEnabled()) return;
    const current = await prisma.webTrafficVisit.findFirst({
      where: { id: trafficHash(`${visitor.data}:${visit.data}`), lastSeenAt: { gte: new Date(Date.now() - TRAFFIC_IDLE_MS) } }, select: { id: true }
    });
    if (!current) return;
    await prisma.webTrafficConversion.createMany({ data: [{ visitId: current.id, kind, entityHash: trafficHash(entity) }], skipDuplicates: true });
  } catch {
    // Optional analytics must never prevent registration, diagnostics or payment.
    request.log.warn("Web traffic conversion could not be recorded");
  }
}

export async function recordTrafficReportPaid(request: FastifyRequest, analysisId: string, payment: { amount: number; paidAt: Date | null; stripePaymentIntentId: string }) {
  try {
    if (payment.amount <= 0 || !payment.paidAt || payment.stripePaymentIntentId.startsWith("dev_")) return;
    if (!conversionOriginAllowed(request) || request.headers["sec-gpc"] === "1" || request.headers.dnt === "1") return;
    const visitor = uuid.safeParse(request.headers["x-traffic-visitor"]);
    const visit = uuid.safeParse(request.headers["x-traffic-visit"]);
    if (!visitor.success || !visit.success || !await trafficEnabled()) return;
    const current = await prisma.webTrafficVisit.findFirst({ where: { id: trafficHash(`${visitor.data}:${visit.data}`), lastSeenAt: { gte: new Date(Date.now() - TRAFFIC_IDLE_MS) } }, select: { id: true } });
    if (!current) return;
    const entityHash = trafficHash(`report:${analysisId}`);
    const checkout = await prisma.webTrafficConversion.findUnique({ where: { kind_entityHash: { kind: "REPORT_CHECKOUT", entityHash } }, include: { visit: { select: { visitorHash: true } } } });
    if (!checkout || checkout.visit.visitorHash !== trafficHash(visitor.data) || checkout.createdAt > payment.paidAt) return;
    await prisma.webTrafficConversion.createMany({ data: [{ visitId: checkout.visitId, kind: "REPORT_PAID", entityHash }], skipDuplicates: true });
  } catch {
    // Returning to a paid report must remain independent of optional analytics.
  }
}

export async function cleanupWebTraffic() {
  return prisma.webTrafficVisit.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - TRAFFIC_RETENTION_DAYS * 86400000) } } });
}

export function trafficRange(days: number, now = new Date()) {
  const from = new Date(now);
  from.setUTCHours(0, 0, 0, 0);
  from.setUTCDate(from.getUTCDate() - days + 1);
  return { from, to: now };
}

export async function getAdminTrafficReport(days: number): Promise<AdminTrafficReport> {
  const now = new Date();
  const { from, to } = trafficRange(days, now);
  const visitsRange = Prisma.sql`v."createdAt" >= ${from} AND v."createdAt" <= ${to}`;
  const [enabled, first, totals, visitDays, viewDays, sources, pages, devices, conversions, registrations, diagnostics, paidReports] = await Promise.all([
    trafficEnabled(),
    prisma.webTrafficVisit.findFirst({ orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
    prisma.$queryRaw<Array<{ visitors: number; visits: number; pageViews: number }>>(Prisma.sql`
      SELECT COUNT(DISTINCT v."visitorHash")::int AS visitors, COUNT(*)::int AS visits,
        (SELECT COUNT(*)::int FROM "WebTrafficPageView" WHERE "createdAt" >= ${from} AND "createdAt" <= ${to}) AS "pageViews"
      FROM "WebTrafficVisit" v WHERE ${visitsRange}`),
    prisma.$queryRaw<Array<{ date: string; visitors: number; visits: number }>>(Prisma.sql`
      SELECT to_char(v."createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date,
        COUNT(DISTINCT v."visitorHash")::int AS visitors, COUNT(*)::int AS visits
      FROM "WebTrafficVisit" v WHERE ${visitsRange} GROUP BY 1 ORDER BY 1`),
    prisma.$queryRaw<Array<{ date: string; pageViews: number }>>(Prisma.sql`
      SELECT to_char("createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date, COUNT(*)::int AS "pageViews"
      FROM "WebTrafficPageView" WHERE "createdAt" >= ${from} AND "createdAt" <= ${to} GROUP BY 1 ORDER BY 1`),
    prisma.$queryRaw<AdminTrafficReport["sources"]>(Prisma.sql`
      SELECT v.source, v.medium, v.campaign, COUNT(DISTINCT v.id)::int AS visits,
        COUNT(DISTINCT CASE WHEN c.kind = 'REGISTRATION' THEN v.id END)::int AS registrations,
        COUNT(DISTINCT CASE WHEN c.kind = 'REPORT_PAID' THEN v.id END)::int AS "paidReports"
      FROM "WebTrafficVisit" v LEFT JOIN "WebTrafficConversion" c ON c."visitId" = v.id AND c."createdAt" <= ${to}
      WHERE ${visitsRange} GROUP BY v.source, v.medium, v.campaign ORDER BY visits DESC, v.source, v.medium, v.campaign LIMIT 20`),
    prisma.$queryRaw<AdminTrafficReport["pages"]>(Prisma.sql`
      SELECT p.page, COUNT(*)::int AS "pageViews", COUNT(DISTINCT v."visitorHash")::int AS visitors
      FROM "WebTrafficPageView" p JOIN "WebTrafficVisit" v ON v.id = p."visitId"
      WHERE p."createdAt" >= ${from} AND p."createdAt" <= ${to} GROUP BY p.page ORDER BY "pageViews" DESC, p.page LIMIT 30`),
    prisma.$queryRaw<AdminTrafficReport["devices"]>(Prisma.sql`
      SELECT v.device, COUNT(*)::int AS visits FROM "WebTrafficVisit" v WHERE ${visitsRange} GROUP BY v.device ORDER BY visits DESC`),
    prisma.$queryRaw<Array<AdminTrafficReport["conversions"]>>(Prisma.sql`
      SELECT COUNT(DISTINCT CASE WHEN c.kind = 'REGISTRATION' THEN v.id END)::int AS "registrationVisits",
        COUNT(DISTINCT CASE WHEN c.kind = 'DIAGNOSTIC_STARTED' THEN v.id END)::int AS "diagnosticVisits",
        COUNT(DISTINCT CASE WHEN c.kind = 'REPORT_PAID' THEN v.id END)::int AS "paidReportVisits"
      FROM "WebTrafficVisit" v LEFT JOIN "WebTrafficConversion" c ON c."visitId" = v.id AND c."createdAt" <= ${to}
      WHERE ${visitsRange}`),
    prisma.user.count({ where: { createdAt: { gte: from, lte: to } } }),
    prisma.analysis.count({ where: { createdAt: { gte: from, lte: to } } }),
    prisma.payment.count({ where: { status: "SUCCEEDED", amount: { gt: 0 }, paidAt: { gte: from, lte: to } } })
  ]);
  const daily = Array.from({ length: days }, (_, index) => {
    const date = new Date(from.getTime() + index * 86400000).toISOString().slice(0, 10);
    return { date, visitors: 0, visits: 0, pageViews: 0, ...visitDays.find(row => row.date === date), ...viewDays.find(row => row.date === date) };
  });
  return {
    generatedAt: now.toISOString(), range: { days, from: from.toISOString(), to: to.toISOString(), timezone: "UTC" },
    enabled, retentionDays: TRAFFIC_RETENTION_DAYS, observedSince: first?.createdAt.toISOString() ?? null,
    totals: totals[0], daily, sources, pages, devices, conversions: conversions[0], business: { registrations, diagnostics, paidReports }
  };
}
