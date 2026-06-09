import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getRequestedLocale, requireSession } from "../lib/auth.js";
import { prisma } from "../lib/prisma.js";

export async function authRoutes(app: FastifyInstance) {
  app.post("/api/auth/guest", async (request) => {
    const body = z.object({ locale: z.string().optional() }).parse(request.body ?? {});
    const locale = (body.locale ?? getRequestedLocale(request)).slice(0, 12);
    const userAgentHeader = request.headers["user-agent"];
    const userAgent = Array.isArray(userAgentHeader) ? userAgentHeader[0] : userAgentHeader;
    const session = await prisma.session.create({
      data: {
        guestToken: randomUUID(),
        locale,
        userAgent,
        ipAddress: request.ip,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }
    });
    return { guestToken: session.guestToken, sessionId: session.id };
  });

  app.get("/api/auth/session", async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    return { sessionId: session.id, userId: session.userId, locale: session.locale };
  });

  app.post("/api/auth/logout", async (_request, reply) => {
    reply.clearCookie("refreshToken");
    return { ok: true };
  });
}
