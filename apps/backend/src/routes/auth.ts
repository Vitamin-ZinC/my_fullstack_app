import { createHash, randomBytes } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { env } from "../env.js";
import {
  attachSessionToUser,
  createGuestSession,
  getOptionalSession,
  getRequestedLocale,
  hashPassword,
  requireSession,
  verifyPassword
} from "../lib/auth.js";
import { prisma } from "../lib/prisma.js";
import { sendMagicLinkEmail } from "../services/email.js";
import { handleReferralSignup, normalizeReferralCode } from "../services/partnerCore.js";

const emailSchema = z.string().trim().email().max(254).transform((value) => value.toLowerCase());
const passwordSchema = z.string().min(8).max(128);
const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().trim().min(1).max(120).optional(),
  referralCode: z.string().trim().max(120).optional()
});
const loginSchema = z.object({
  email: emailSchema,
  password: passwordSchema
});
const magicLinkRequestSchema = z.object({
  email: emailSchema
});
const magicLinkVerifySchema = z.object({
  token: z.string().trim().min(24).max(512),
  referralCode: z.string().trim().max(120).optional()
});

export async function authRoutes(app: FastifyInstance) {
  app.post("/api/auth/guest", async (request) => {
    const body = z.object({ locale: z.string().optional() }).parse(request.body ?? {});
    const session = await createGuestSession(request, body.locale ?? getRequestedLocale(request));
    return { guestToken: session.guestToken, sessionId: session.id };
  });

  app.get("/api/auth/session", async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    const user = session.userId
      ? await prisma.user.findUnique({
        where: { id: session.userId },
        select: {
          id: true,
          email: true,
          name: true,
          locale: true,
          role: true,
          status: true,
          emailVerifiedAt: true,
          lastLoginAt: true,
          createdAt: true
        }
      })
      : null;
    return { sessionId: session.id, guestToken: session.guestToken, userId: session.userId, locale: session.locale, user };
  });

  app.post("/api/auth/register", async (request, reply) => {
    const body = registerSchema.parse(request.body ?? {});
    const session = await getOrCreateAuthSession(request);
    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing?.passwordHash) {
      return reply.code(409).send({ error: "User already has a password" });
    }

    const passwordHash = hashPassword(body.password);
    const user = await prisma.user.upsert({
      where: { email: body.email },
      update: {
        name: body.name ?? existing?.name,
        passwordHash,
        emailVerifiedAt: existing?.emailVerifiedAt ?? new Date(),
        lastLoginAt: new Date(),
        locale: session.locale
      },
      create: {
        email: body.email,
        name: body.name,
        passwordHash,
        emailVerifiedAt: new Date(),
        lastLoginAt: new Date(),
        locale: session.locale
      }
    });
    await attachSessionToUser(session, user.id);
    await prisma.analyticsEvent.create({
      data: {
        name: "user_registered",
        locale: session.locale,
        sessionId: session.id,
        userId: user.id,
        properties: { method: "password" }
      }
    });
    await handleReferralSignup({
      userId: user.id,
      email: user.email,
      referralCode: normalizeReferralCode(body.referralCode),
      request
    }).catch((error) => app.log.error({ error, userId: user.id }, "partner referral signup failed"));
    return buildAuthResponse(session, user);
  });

  app.post("/api/auth/login", async (request, reply) => {
    const body = loginSchema.parse(request.body ?? {});
    const session = await getOrCreateAuthSession(request);
    const user = await prisma.user.findUnique({ where: { email: body.email } });
    if (!user?.passwordHash || !verifyPassword(body.password, user.passwordHash)) {
      return reply.code(401).send({ error: "Invalid email or password" });
    }
    if (user.status !== "ACTIVE") return reply.code(403).send({ error: "User is disabled" });

    const nextUser = await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), locale: session.locale }
    });
    await attachSessionToUser(session, nextUser.id);
    await prisma.analyticsEvent.create({
      data: {
        name: "user_logged_in",
        locale: session.locale,
        sessionId: session.id,
        userId: nextUser.id,
        properties: { method: "password" }
      }
    });
    return buildAuthResponse(session, nextUser);
  });

  app.post("/api/auth/magic-link/request", async (request, reply) => {
    const body = magicLinkRequestSchema.parse(request.body ?? {});
    const session = await getOrCreateAuthSession(request);
    const token = randomBytes(32).toString("base64url");
    const tokenHash = hashMagicToken(token);
    const expiresAt = new Date(Date.now() + 20 * 60 * 1000);
    await prisma.loginToken.create({
      data: {
        email: body.email,
        tokenHash,
        purpose: "MAGIC_LOGIN",
        expiresAt
      }
    });

    const loginUrl = new URL("/login", env.APP_ORIGIN);
    loginUrl.searchParams.set("token", token);
    const emailResult = await sendMagicLinkEmail({
      email: body.email,
      loginUrl: loginUrl.toString(),
      locale: session.locale
    });

    await prisma.analyticsEvent.create({
      data: {
        name: emailResult.emailSent ? "magic_link_sent" : "magic_link_failed",
        locale: session.locale,
        sessionId: session.id,
        userId: session.userId,
        properties: JSON.parse(JSON.stringify({ emailDomain: body.email.split("@")[1], emailId: emailResult.emailId, error: emailResult.error }))
      }
    });

    if (!emailResult.emailSent && env.NODE_ENV === "production") {
      return reply.code(502).send({ error: "Magic link email could not be sent" });
    }

    return {
      ok: true,
      emailSent: emailResult.emailSent,
      expiresAt: expiresAt.toISOString(),
      ...(env.NODE_ENV === "production" ? {} : { debugLoginUrl: loginUrl.toString() })
    };
  });

  app.post("/api/auth/magic-link/verify", async (request, reply) => {
    const body = magicLinkVerifySchema.parse(request.body ?? {});
    const session = await getOrCreateAuthSession(request);
    const tokenHash = hashMagicToken(body.token);
    const token = await prisma.loginToken.findFirst({
      where: {
        tokenHash,
        purpose: "MAGIC_LOGIN",
        consumedAt: null,
        expiresAt: { gt: new Date() }
      }
    });
    if (!token) return reply.code(400).send({ error: "Magic link is invalid or expired" });

    const user = await prisma.$transaction(async (tx) => {
      const nextUser = await tx.user.upsert({
        where: { email: token.email },
        update: {
          emailVerifiedAt: new Date(),
          lastLoginAt: new Date(),
          locale: session.locale
        },
        create: {
          email: token.email,
          emailVerifiedAt: new Date(),
          lastLoginAt: new Date(),
          locale: session.locale
        }
      });
      await tx.loginToken.update({
        where: { id: token.id },
        data: { consumedAt: new Date() }
      });
      return nextUser;
    });
    await attachSessionToUser(session, user.id);
    await prisma.analyticsEvent.create({
      data: {
        name: "user_logged_in",
        locale: session.locale,
        sessionId: session.id,
        userId: user.id,
        properties: { method: "magic_link" }
      }
    });
    await handleReferralSignup({
      userId: user.id,
      email: user.email,
      referralCode: normalizeReferralCode(body.referralCode),
      request
    }).catch((error) => app.log.error({ error, userId: user.id }, "partner referral signup failed"));
    return buildAuthResponse(session, user);
  });

  app.post("/api/auth/logout", async (request, reply) => {
    const session = await getOptionalSession(request);
    if (session) {
      await prisma.session.update({
        where: { id: session.id },
        data: { expiresAt: new Date() }
      });
    }
    reply.clearCookie("refreshToken");
    return { ok: true };
  });
}

async function getOrCreateAuthSession(request: FastifyRequest) {
  const existing = await getOptionalSession(request);
  if (existing) return existing;
  return createGuestSession(request, getRequestedLocale(request));
}

function hashMagicToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function buildAuthResponse(session: { id: string; guestToken: string; locale: string }, user: {
  id: string;
  email: string;
  name: string | null;
  locale: string;
  role: string;
  status: string;
  emailVerifiedAt: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
}) {
  return {
    sessionId: session.id,
    guestToken: session.guestToken,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      locale: user.locale,
      role: user.role,
      status: user.status,
      emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
      createdAt: user.createdAt.toISOString()
    }
  };
}
