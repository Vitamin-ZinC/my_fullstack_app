import { setTimeout as delay } from "node:timers/promises";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireUserSession, hashPassword } from "../lib/auth.js";
import { prisma } from "../lib/prisma.js";
import { hashAccountToken, issueAccountEmail, deliverWelcomeEmail } from "../services/accountEmail.js";
import { sendAccountEmail } from "../services/email.js";

const emailSchema = z.object({ email: z.string().trim().email().max(254).transform(s => s.toLowerCase()) });
const tokenSchema = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) });
const limits = { config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } };

export async function accountSecurityRoutes(app: FastifyInstance) {
  app.post("/api/auth/password/reset/request", limits, async (request, reply) => {
    const started = Date.now();
    const parsed = emailSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Введите корректный email." });
    const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
    if (user?.status === "ACTIVE") await issueAccountEmail(user, "PASSWORD_RESET");
    await delay(Math.max(0, 300 - (Date.now() - started)));
    return { ok: true };
  });
  app.post("/api/auth/email/verification/request", limits, async (request, reply) => {
    const session = await requireUserSession(request, reply);
    if (!session?.userId) return;
    const user = await prisma.user.findUnique({ where: { id: session.userId } });
    if (user?.status === "ACTIVE" && !user.emailVerifiedAt) await issueAccountEmail(user, "EMAIL_VERIFY");
    return { ok: true };
  });
  app.post("/api/auth/email/verification/confirm", limits, async (request, reply) => {
    const parsed = tokenSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Ссылка недействительна или срок её действия истёк." });
    const user = await consumeAccountToken(parsed.data.token, "EMAIL_VERIFY");
    if (!user) return reply.code(400).send({ error: "Ссылка недействительна или срок её действия истёк." });
    void deliverWelcomeEmail(user.id).catch(() => app.log.warn("welcome_email_retry_pending"));
    return { ok: true };
  });
  app.post("/api/auth/password/reset/confirm", limits, async (request, reply) => {
    const parsed = tokenSchema.extend({ password: z.string().min(8).max(128) }).safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "Проверьте ссылку и новый пароль: минимум 8 символов." });
    const user = await consumeAccountToken(parsed.data.token, "PASSWORD_RESET", hashPassword(parsed.data.password));
    if (!user) return reply.code(400).send({ error: "Ссылка недействительна или срок её действия истёк." });
    void sendAccountEmail({ ...user, kind: "password_changed", id: hashAccountToken(parsed.data.token) }).catch(() => undefined);
    void deliverWelcomeEmail(user.id).catch(() => app.log.warn("welcome_email_retry_pending"));
    return { ok: true };
  });
}

export async function consumeAccountToken(raw: string, purpose: "EMAIL_VERIFY" | "PASSWORD_RESET", passwordHash?: string) {
  try {
    return await prisma.$transaction(async tx => {
      const now = new Date();
      const token = await tx.loginToken.findFirst({ where: { tokenHash: hashAccountToken(raw), purpose, consumedAt: null, expiresAt: { gt: now } } });
      if (!token) return null;
      const user = await tx.user.findUnique({ where: { email: token.email } });
      if (!user || user.status !== "ACTIVE") return null;
      const claimed = await tx.loginToken.updateMany({ where: { id: token.id, consumedAt: null, expiresAt: { gt: now }, purpose }, data: { consumedAt: now } });
      if (claimed.count !== 1) return null;
      const updated = await tx.user.update({ where: { id: user.id }, data: { emailVerifiedAt: user.emailVerifiedAt ?? now, ...(passwordHash ? { passwordHash } : {}) } });
      if (passwordHash) {
        await tx.session.updateMany({ where: { userId: user.id }, data: { expiresAt: now } });
        await tx.loginToken.updateMany({ where: { email: user.email, consumedAt: null }, data: { consumedAt: now } });
      }
      return updated;
    });
  } catch (error) {
    if ((error as { code?: string }).code === "P2034") return null;
    throw error;
  }
}
