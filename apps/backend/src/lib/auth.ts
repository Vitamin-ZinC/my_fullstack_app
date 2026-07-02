import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { jwtVerify, SignJWT } from "jose";
import { env } from "../env.js";
import { prisma } from "./prisma.js";

export type SessionContext = {
  id: string;
  guestToken: string;
  userId: string | null;
  locale: string;
};

function readHeader(request: FastifyRequest, name: string) {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function readRequestValue(request: FastifyRequest, name: string) {
  const header = readHeader(request, name);
  if (header) return header;
  const query = request.query as Record<string, string | string[] | undefined>;
  const value = query?.[name];
  return Array.isArray(value) ? value[0] : value;
}

function adminSessionSecret() {
  return new TextEncoder().encode(env.ADMIN_SESSION_SECRET || env.JWT_ACCESS_SECRET);
}

export function hashPassword(password: string, salt = randomBytes(16).toString("hex")) {
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string) {
  const [scheme, salt, expectedHex] = storedHash.split(":");
  if (scheme !== "scrypt" || !salt || !expectedHex) return false;
  const actual = Buffer.from(scryptSync(password, salt, 64));
  const expected = Buffer.from(expectedHex, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export const hashAdminPassword = hashPassword;
export const verifyAdminPassword = verifyPassword;

export async function createAdminSessionToken() {
  return new SignJWT({ role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("admin")
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(adminSessionSecret());
}

async function verifyAdminSessionToken(token: string | undefined) {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, adminSessionSecret(), { subject: "admin" });
    return payload.role === "admin";
  } catch {
    return false;
  }
}

export function getRequestedLocale(request: FastifyRequest) {
  const locale = readRequestValue(request, "x-locale") ?? "ru";
  return locale.slice(0, 12);
}

export async function createGuestSession(request: FastifyRequest, localeOverride?: string): Promise<SessionContext> {
  const locale = (localeOverride ?? getRequestedLocale(request)).slice(0, 12);
  const userAgentHeader = request.headers["user-agent"];
  const userAgent = Array.isArray(userAgentHeader) ? userAgentHeader[0] : userAgentHeader;
  const session = await prisma.session.create({
    data: {
      guestToken: randomUUID(),
      locale,
      userAgent,
      ipAddress: request.ip,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    },
    select: {
      id: true,
      guestToken: true,
      userId: true,
      locale: true
    }
  });
  return session;
}

export async function getOptionalSession(request: FastifyRequest): Promise<SessionContext | null> {
  const sessionId = readRequestValue(request, "x-session-id");
  const guestToken = readRequestValue(request, "x-guest-token");

  if (!guestToken) return null;

  return prisma.session.findFirst({
    where: {
      guestToken,
      expiresAt: { gt: new Date() },
      ...(sessionId ? { id: sessionId } : {})
    },
    select: {
      id: true,
      guestToken: true,
      userId: true,
      locale: true
    }
  });
}

export async function requireSession(request: FastifyRequest, reply: FastifyReply): Promise<SessionContext | null> {
  const guestToken = readRequestValue(request, "x-guest-token");

  if (!guestToken) {
    reply.code(401).send({ error: "Session required" });
    return null;
  }

  const session = await getOptionalSession(request);

  if (!session) {
    reply.code(401).send({ error: "Invalid or expired session" });
    return null;
  }

  return session;
}

export async function requireUserSession(request: FastifyRequest, reply: FastifyReply): Promise<SessionContext | null> {
  const session = await requireSession(request, reply);
  if (!session) return null;
  if (!session.userId) {
    reply.code(401).send({ error: "Login required" });
    return null;
  }
  return session;
}

export async function attachSessionToUser(session: SessionContext, userId: string) {
  const analysisIds = await prisma.analysis.findMany({
    where: {
      sessionId: session.id,
      OR: [{ userId: null }, { userId }]
    },
    select: { id: true }
  });
  const ids = analysisIds.map((analysis) => analysis.id);

  await prisma.$transaction(async (tx) => {
    await tx.session.update({
      where: { id: session.id },
      data: {
        userId,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      }
    });
    await tx.analysis.updateMany({
      where: { id: { in: ids } },
      data: { userId }
    });
    if (ids.length > 0) {
      await tx.payment.updateMany({
        where: { analysisId: { in: ids } },
        data: { userId }
      });
    }
    await tx.analyticsEvent.updateMany({
      where: { sessionId: session.id, userId: null },
      data: { userId }
    });
    await tx.habitProgram.updateMany({
      where: { sessionId: session.id, userId: null },
      data: { userId }
    });
    await tx.habitNavigatorThread.updateMany({
      where: { sessionId: session.id, userId: null },
      data: { userId }
    });
  });
}

export async function requireAnalysisAccess(
  request: FastifyRequest,
  reply: FastifyReply,
  analysisId: string
) {
  const session = await requireSession(request, reply);
  if (!session) return null;

  const analysis = await prisma.analysis.findFirst({
    where: {
      id: analysisId,
      OR: [
        { sessionId: session.id },
        ...(session.userId ? [{ userId: session.userId }] : [])
      ]
    },
    include: {
      payment: true,
      mediaAssets: true
    }
  });

  if (!analysis) {
    reply.code(404).send({ error: "Analysis not found" });
    return null;
  }

  return { session, analysis };
}

export async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  const token = readHeader(request, "x-admin-token");
  const session = readHeader(request, "x-admin-session");

  if (env.ADMIN_API_TOKEN && token === env.ADMIN_API_TOKEN) {
    return { token };
  }

  if (await verifyAdminSessionToken(session)) {
    return { token: "admin-session" };
  }

  reply.code(403).send({ error: "Admin access required" });
  return null;
}

export async function writeAdminAudit(action: string, targetType: string, targetId?: string, payload?: unknown) {
  await prisma.adminAuditLog.create({
    data: {
      action,
      targetType,
      targetId,
      payload: payload === undefined ? undefined : JSON.parse(JSON.stringify(payload))
    }
  });
}
