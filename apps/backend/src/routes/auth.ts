import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma.js";

export async function authRoutes(app: FastifyInstance) {
  app.post("/api/auth/guest", async () => {
    const session = await prisma.session.create({
      data: {
        guestToken: randomUUID(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }
    });
    return { guestToken: session.guestToken, sessionId: session.id };
  });

  app.post("/api/auth/logout", async (_request, reply) => {
    reply.clearCookie("refreshToken");
    return { ok: true };
  });
}
