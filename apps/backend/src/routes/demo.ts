import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { env } from "../env.js";
import {
  buildDemoWorkspace,
  DEMO_SESSION_COOKIE,
  DEMO_SESSION_TTL_SECONDS,
  getDemoSession,
  redeemDemoAccessCode,
  revokeDemoSession
} from "../services/demoAccess.js";

const accessSchema = z.object({
  code: z.string().trim().min(8).max(80)
});

function cookieOptions(maxAge = DEMO_SESSION_TTL_SECONDS) {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge
  };
}

async function requireDemoSession(request: FastifyRequest, reply: FastifyReply) {
  const session = await getDemoSession(request.cookies[DEMO_SESSION_COOKIE]);
  if (!session) {
    reply.clearCookie(DEMO_SESSION_COOKIE, cookieOptions(0));
    reply.code(401).send({ error: "Demo access required" });
    return null;
  }
  return session;
}

export async function demoRoutes(app: FastifyInstance) {
  app.post("/api/demo/access", {
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } }
  }, async (request, reply) => {
    const body = accessSchema.parse(request.body ?? {});
    const redeemed = await redeemDemoAccessCode(body.code);
    if (!redeemed) {
      return reply.code(401).send({ error: "Код недействителен, исчерпан или истёк" });
    }
    const remainingSeconds = Math.max(1, Math.floor((new Date(redeemed.session.expiresAt).getTime() - Date.now()) / 1000));
    reply.setCookie(DEMO_SESSION_COOKIE, redeemed.token, cookieOptions(remainingSeconds));
    return redeemed.session;
  });

  app.get("/api/demo/session", async (request, reply) => {
    const session = await requireDemoSession(request, reply);
    if (!session) return;
    return session.response;
  });

  app.get("/api/demo/workspace", async (request, reply) => {
    const session = await requireDemoSession(request, reply);
    if (!session) return;
    return buildDemoWorkspace();
  });

  app.post("/api/demo/logout", async (request, reply) => {
    await revokeDemoSession(request.cookies[DEMO_SESSION_COOKIE]);
    reply.clearCookie(DEMO_SESSION_COOKIE, cookieOptions(0));
    return { ok: true };
  });
}
