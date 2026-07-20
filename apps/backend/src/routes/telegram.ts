import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { env } from "../env.js";
import { requireSession } from "../lib/auth.js";
import { prisma } from "../lib/prisma.js";
import {
  buildTelegramConnectUrl,
  createTelegramRawToken,
  hashTelegramToken,
  isTelegramConfigured,
  processTelegramUpdate,
  type TelegramUpdate
} from "../services/telegramBot.js";

const statusQuerySchema = z.object({
  programId: z.string().optional()
});

const linkTokenSchema = z.object({
  programId: z.string().optional()
});

const preferencesSchema = z.object({
  programId: z.string(),
  telegramEnabled: z.boolean().optional(),
  reminderTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  timezone: z.string().min(2).max(80).optional(),
  quietHoursStart: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  quietHoursEnd: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  motivationFrequency: z.enum(["off", "daily", "weekdays", "weekly"]).optional()
});

const webLoginSchema = z.object({
  token: z.string().min(16).max(200)
});

export async function telegramRoutes(app: FastifyInstance) {
  app.get("/api/telegram/status", async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    const query = statusQuerySchema.parse(request.query ?? {});
    const program = query.programId ? await requireTelegramProgram(session, reply, query.programId) : await findAnyProgram(session);
    if (query.programId && !program) return;
    const account = await prisma.telegramAccount.findFirst({
      where: {
        OR: [
          ...(session.userId ? [{ userId: session.userId }] : []),
          { sessionId: session.id }
        ]
      },
      orderBy: { updatedAt: "desc" }
    });
    const preferences = program
      ? await prisma.habitNotificationPreference.findUnique({ where: { programId: program.id } })
      : null;
    return {
      configured: isTelegramConfigured(),
      linked: Boolean(account && account.status === "ACTIVE"),
      account: account ? serializeTelegramAccount(account) : null,
      preferences: preferences ? serializePreferences(preferences) : null
    };
  });

  app.post("/api/telegram/link-token", async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    const body = linkTokenSchema.parse(request.body ?? {});
    if (!isTelegramConfigured()) {
      return reply.code(503).send({ error: "Telegram bot is not configured" });
    }
    const program = body.programId ? await requireTelegramProgram(session, reply, body.programId) : await findAnyProgram(session);
    if (body.programId && !program) return;
    const token = createTelegramRawToken();
    const issuedAt = new Date();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    await prisma.$transaction(async (tx) => {
      await tx.telegramLinkToken.updateMany({
        where: {
          usedAt: null,
          OR: [
            ...(session.userId ? [{ userId: session.userId }] : []),
            { sessionId: session.id }
          ]
        },
        data: { usedAt: issuedAt }
      });
      await tx.telegramLinkToken.create({
        data: {
          tokenHash: hashTelegramToken(token),
          userId: session.userId,
          sessionId: session.id,
          programId: program?.id,
          expiresAt
        }
      });
    });
    return {
      configured: true,
      connectUrl: buildTelegramConnectUrl(token),
      expiresAt: expiresAt.toISOString()
    };
  });

  app.patch("/api/telegram/preferences", async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    const body = preferencesSchema.parse(request.body ?? {});
    const program = await requireTelegramProgram(session, reply, body.programId);
    if (!program) return;
    const preferences = await prisma.habitNotificationPreference.upsert({
      where: { programId: body.programId },
      update: {
        telegramEnabled: body.telegramEnabled,
        reminderTime: body.reminderTime,
        timezone: body.timezone,
        quietHoursStart: body.quietHoursStart,
        quietHoursEnd: body.quietHoursEnd,
        motivationFrequency: body.motivationFrequency
      },
      create: {
        programId: body.programId,
        telegramEnabled: body.telegramEnabled ?? false,
        reminderTime: body.reminderTime ?? program.reminderTime ?? "09:00",
        timezone: body.timezone ?? "Europe/Moscow",
        quietHoursStart: body.quietHoursStart,
        quietHoursEnd: body.quietHoursEnd,
        motivationFrequency: body.motivationFrequency ?? "daily"
      }
    });
    return { preferences: serializePreferences(preferences) };
  });

  app.post("/api/telegram/web-login/verify", async (request, reply) => {
    const body = webLoginSchema.parse(request.body ?? {});
    const tokenHash = hashTelegramToken(body.token);
    const loginToken = await prisma.telegramWebLoginToken.findFirst({
      where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } }
    });
    if (!loginToken) {
      return reply.code(401).send({ error: "Invalid or expired Telegram login token" });
    }

    const session = await prisma.session.findFirst({
      where: { id: loginToken.sessionId, expiresAt: { gt: new Date() } },
      select: { id: true, guestToken: true, userId: true, locale: true }
    });
    if (!session) {
      await prisma.telegramWebLoginToken.update({ where: { id: loginToken.id }, data: { usedAt: new Date() } });
      return reply.code(401).send({ error: "Linked web session has expired" });
    }

    await prisma.telegramWebLoginToken.update({ where: { id: loginToken.id }, data: { usedAt: new Date() } });
    return {
      sessionId: session.id,
      guestToken: session.guestToken,
      userId: session.userId,
      locale: session.locale
    };
  });

  app.post("/api/telegram/webhook/:secret", async (request, reply) => {
    const params = z.object({ secret: z.string() }).parse(request.params ?? {});
    if (env.TELEGRAM_WEBHOOK_SECRET && params.secret !== env.TELEGRAM_WEBHOOK_SECRET) {
      return reply.code(403).send({ error: "Invalid webhook secret" });
    }
    if (!env.TELEGRAM_BOT_TOKEN) {
      return reply.code(503).send({ error: "Telegram bot is not configured" });
    }
    await processTelegramUpdate(request.body as TelegramUpdate);
    return { ok: true };
  });
}

async function requireTelegramProgram(session: { id: string; userId: string | null }, reply: any, programId: string) {
  const program = await prisma.habitProgram.findFirst({
    where: {
      id: programId,
      OR: [
        { sessionId: session.id },
        ...(session.userId ? [{ userId: session.userId }] : [])
      ]
    },
    select: { id: true, reminderTime: true }
  });
  if (!program) {
    reply.code(404).send({ error: "Habit program not found" });
    return null;
  }
  return program;
}

async function findAnyProgram(session: { id: string; userId: string | null }) {
  return prisma.habitProgram.findFirst({
    where: {
      status: "ACTIVE",
      OR: [
        { sessionId: session.id },
        ...(session.userId ? [{ userId: session.userId }] : [])
      ]
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, reminderTime: true }
  });
}

function serializeTelegramAccount(account: any) {
  return {
    id: account.id,
    telegramUserId: account.telegramUserId,
    chatId: account.chatId,
    username: account.username,
    firstName: account.firstName,
    lastName: account.lastName,
    status: account.status,
    linkedAt: account.linkedAt.toISOString(),
    lastSeenAt: account.lastSeenAt.toISOString()
  };
}

function serializePreferences(preferences: any) {
  return {
    programId: preferences.programId,
    telegramEnabled: preferences.telegramEnabled,
    reminderTime: preferences.reminderTime,
    timezone: preferences.timezone,
    quietHoursStart: preferences.quietHoursStart,
    quietHoursEnd: preferences.quietHoursEnd,
    motivationFrequency: preferences.motivationFrequency,
    lastReminderAt: preferences.lastReminderAt?.toISOString() ?? null
  };
}
