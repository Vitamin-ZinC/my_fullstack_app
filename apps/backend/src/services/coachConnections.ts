import type { CoachConnectionRequestSummary } from "@levelup/contracts";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

export class CoachConnectionError extends Error {
  constructor(public statusCode: number, public code: string, message: string) { super(message); }
}

const requestInclude = {
  coachProfile: { select: { id: true, displayName: true, slug: true } },
  user: { select: { name: true, email: true } }
} as const;

export function serializeCoachConnectionRequest(row: any, forCoach = false): CoachConnectionRequestSummary {
  return {
    id: row.id, coachProfileId: row.coachProfileId, coachName: row.coachProfile.displayName, coachSlug: row.coachProfile.slug,
    status: row.status, message: row.message, decisionNote: row.decisionNote, relationshipId: row.relationshipId,
    createdAt: row.createdAt.toISOString(), decidedAt: row.decidedAt?.toISOString() ?? null,
    ...(forCoach ? { client: { name: row.user.name, email: row.user.email } } : {})
  };
}

export function listCoachConnectionRequests(coachProfileId: string) {
  return prisma.coachConnectionRequest.findMany({ where: { coachProfileId }, include: requestInclude, orderBy: { updatedAt: "desc" }, take: 100 });
}

export function listClientConnectionRequests(userId: string) {
  return prisma.coachConnectionRequest.findMany({ where: { userId }, include: requestInclude, orderBy: { updatedAt: "desc" }, take: 100 });
}

export async function lockCoachClients(tx: Prisma.TransactionClient, coachProfileId: string) {
  await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`coach-clients:${coachProfileId}`}, 0))`;
}

export async function requestCoachConnection(userId: string, coachProfileId: string, message: string | null) {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`coach-requests:${userId}`}, 0))`;
    await lockCoachClients(tx, coachProfileId);
    const existing = await tx.coachConnectionRequest.findUnique({ where: { coachProfileId_userId: { coachProfileId, userId } }, include: { relationship: { select: { status: true } } } });
    if (existing && (existing.status === "PENDING" || (existing.status === "ACCEPTED" && existing.relationship && existing.relationship.status !== "ENDED"))) {
      return tx.coachConnectionRequest.findUniqueOrThrow({ where: { id: existing.id }, include: requestInclude });
    }
    const coach = await tx.coachProfile.findFirst({ where: { id: coachProfileId, status: "APPROVED" }, select: { acceptingOrders: true } });
    if (!coach) throw new CoachConnectionError(404, "COACH_UNAVAILABLE", "Коуч не найден или ещё не прошёл модерацию");
    if (!coach.acceptingOrders) throw new CoachConnectionError(409, "COACH_CLOSED", "Коуч временно не принимает новых клиентов");
    const relationship = await tx.coachClientRelationship.findFirst({ where: { coachProfileId, userId, status: { in: ["PENDING", "ACTIVE", "PAUSED"] } }, select: { id: true } });
    if (relationship) throw new CoachConnectionError(409, "ALREADY_CONNECTED", "Коуч уже добавлен в раздел «Мой коуч»");
    const pending = await tx.coachConnectionRequest.count({ where: { userId, status: "PENDING" } });
    if (pending >= 10) throw new CoachConnectionError(409, "REQUEST_LIMIT", "Сначала дождитесь ответа на отправленные заявки или отмените ненужные");
    if (existing?.status === "DECLINED" && existing.decidedAt && Date.now() - existing.decidedAt.getTime() < 86_400_000) {
      throw new CoachConnectionError(409, "REQUEST_COOLDOWN", "Повторную заявку можно отправить через сутки после ответа коуча");
    }
    return tx.coachConnectionRequest.upsert({
      where: { coachProfileId_userId: { coachProfileId, userId } },
      create: { coachProfileId, userId, message },
      update: { status: "PENDING", message, decisionNote: null, relationshipId: null, decidedAt: null, createdAt: new Date() },
      include: requestInclude
    });
  }, { maxWait: 10_000, timeout: 15_000 });
}

export async function cancelCoachConnectionRequest(userId: string, id: string) {
  const owned = await prisma.coachConnectionRequest.findFirst({ where: { id, userId }, select: { coachProfileId: true } });
  if (!owned) throw new CoachConnectionError(404, "REQUEST_NOT_FOUND", "Заявка не найдена");
  return prisma.$transaction(async tx => {
    await lockCoachClients(tx, owned.coachProfileId);
    const current = await tx.coachConnectionRequest.findFirstOrThrow({ where: { id, userId } });
    if (current.status === "CANCELLED") return tx.coachConnectionRequest.findUniqueOrThrow({ where: { id }, include: requestInclude });
    if (current.status !== "PENDING") throw new CoachConnectionError(409, "REQUEST_DECIDED", "По заявке уже принято решение");
    return tx.coachConnectionRequest.update({ where: { id }, data: { status: "CANCELLED", decidedAt: new Date() }, include: requestInclude });
  });
}

export async function decideCoachConnectionRequest(coachProfileId: string, id: string, input: { decision: "accept" | "decline"; funding: "COACH_PAID" | "SELF_FUNDED"; note?: string }) {
  if (input.decision === "decline" && !input.note?.trim()) throw new CoachConnectionError(400, "REASON_REQUIRED", "Укажите причину отказа");
  return prisma.$transaction(async tx => {
    await lockCoachClients(tx, coachProfileId);
    const request = await tx.coachConnectionRequest.findFirst({ where: { id, coachProfileId } });
    if (!request) throw new CoachConnectionError(404, "REQUEST_NOT_FOUND", "Заявка не найдена");
    const nextStatus = input.decision === "accept" ? "ACCEPTED" : "DECLINED";
    if (request.status === nextStatus) return tx.coachConnectionRequest.findUniqueOrThrow({ where: { id }, include: requestInclude });
    if (request.status !== "PENDING") throw new CoachConnectionError(409, "REQUEST_DECIDED", "По заявке уже принято решение");
    if (input.decision === "decline") return tx.coachConnectionRequest.update({ where: { id }, data: { status: "DECLINED", decisionNote: input.note, decidedAt: new Date() }, include: requestInclude });
    const coach = await tx.coachProfile.findFirst({ where: { id: coachProfileId, status: "APPROVED" }, select: { id: true } });
    if (!coach) throw new CoachConnectionError(409, "COACH_UNAVAILABLE", "Сначала дождитесь одобрения профиля коуча");
    let relationship = await tx.coachClientRelationship.findFirst({ where: { coachProfileId, userId: request.userId, status: { in: ["PENDING", "ACTIVE", "PAUSED"] } } });
    if (!relationship) {
      if (input.funding === "COACH_PAID") {
        const now = new Date();
        const subscription = await tx.coachSubscription.findFirst({ where: { coachProfileId, OR: [
          { status: { in: ["ACTIVE", "CANCEL_AT_PERIOD_END"] }, OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gt: now } }] },
          { status: "GRACE", graceEndsAt: { gt: now } }
        ] }, orderBy: { createdAt: "desc" } });
        const used = await tx.coachClientRelationship.count({ where: { coachProfileId, funding: "COACH_PAID", status: { in: ["PENDING", "ACTIVE"] } } });
        if (!subscription?.clientLimit || used >= subscription.clientLimit) throw new CoachConnectionError(409, "COACH_SLOT_UNAVAILABLE", "В пакете коуча нет свободного места");
      }
      const program = await tx.habitProgram.findFirst({ where: { userId: request.userId, status: "ACTIVE" }, orderBy: { createdAt: "desc" }, select: { id: true } });
      // Approval reserves access, never a client's data consent or an automatic payment.
      relationship = await tx.coachClientRelationship.create({ data: { coachProfileId, userId: request.userId, habitProgramId: program?.id, funding: input.funding, status: "PENDING" } });
    }
    return tx.coachConnectionRequest.update({ where: { id }, data: { status: "ACCEPTED", relationshipId: relationship.id, decisionNote: input.note || null, decidedAt: new Date() }, include: requestInclude });
  }, { maxWait: 10_000, timeout: 15_000 });
}
