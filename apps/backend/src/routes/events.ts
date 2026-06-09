import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getRequestedLocale, requireSession } from "../lib/auth.js";
import { prisma } from "../lib/prisma.js";

const eventSchema = z.object({
  name: z.string().min(1).max(80),
  analysisId: z.string().optional(),
  locale: z.string().optional(),
  properties: z.record(z.unknown()).optional()
});

export async function eventRoutes(app: FastifyInstance) {
  app.post("/api/events", async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    const body = eventSchema.parse(request.body);
    const locale = (body.locale ?? session.locale ?? getRequestedLocale(request)).slice(0, 12);

    await prisma.analyticsEvent.create({
      data: {
        name: body.name,
        locale,
        sessionId: session.id,
        userId: session.userId,
        analysisId: body.analysisId,
        properties: body.properties ? JSON.parse(JSON.stringify(body.properties)) : undefined
      }
    });

    return { ok: true };
  });
}
