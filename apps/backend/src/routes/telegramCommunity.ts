import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { env } from "../env.js";
import { requireAdmin, writeAdminAudit } from "../lib/auth.js";
import { telegramCommunityQueue } from "../lib/queue.js";
import {
  isTelegramCommunityConfigured,
  listTelegramCommunityChats,
  sendTelegramCommunityMessage,
  updateTelegramCommunityChat,
  type TelegramCommunityUpdate
} from "../services/telegramCommunityBot.js";

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const communityChatUpdateSchema = z.object({
  status: z.enum(["PENDING", "ACTIVE", "PAUSED", "LEFT"]).optional(),
  timezone: z.string().trim().min(2).max(80).optional(),
  schedulesEnabled: z.boolean().optional(),
  aiRepliesEnabled: z.boolean().optional(),
  smartPingEnabled: z.boolean().optional(),
  morningTime: timeSchema.optional(),
  middayTime: timeSchema.optional(),
  eveningTime: timeSchema.optional(),
  quietHoursStart: timeSchema.optional(),
  quietHoursEnd: timeSchema.optional()
});
const announcementSchema = z.object({ text: z.string().trim().min(1).max(3500) });

export async function telegramCommunityRoutes(app: FastifyInstance) {
  app.post("/api/telegram/community/webhook", {
    config: { rateLimit: { max: 300, timeWindow: "1 minute" } }
  }, async (request, reply) => {
    if (!isTelegramCommunityConfigured()) {
      return reply.code(503).send({ error: "Telegram community bot is not configured" });
    }
    const header = request.headers["x-telegram-bot-api-secret-token"];
    const receivedSecret = Array.isArray(header) ? header[0] : header;
    if (!safeSecretEqual(receivedSecret, env.TELEGRAM_COMMUNITY_WEBHOOK_SECRET)) {
      return reply.code(403).send({ error: "Invalid webhook secret" });
    }
    const update = request.body as TelegramCommunityUpdate;
    if (!Number.isInteger(update?.update_id)) return reply.code(400).send({ error: "Invalid Telegram update" });
    await telegramCommunityQueue.add("process-update", update, {
      jobId: `telegram-community-${update.update_id}`
    });
    return { ok: true };
  });

  app.get("/api/admin/telegram-community", async (request, reply) => {
    if (!(await requireAdmin(request, reply))) return;
    return {
      configured: isTelegramCommunityConfigured(),
      username: env.TELEGRAM_COMMUNITY_BOT_USERNAME?.trim().replace(/^@+/, "") ?? null,
      chats: await listTelegramCommunityChats()
    };
  });

  app.patch("/api/admin/telegram-community/chats/:id", async (request, reply) => {
    if (!(await requireAdmin(request, reply))) return;
    const params = z.object({ id: z.string().min(1).max(120) }).parse(request.params);
    const body = communityChatUpdateSchema.parse(request.body ?? {});
    const chat = await updateTelegramCommunityChat(params.id, body);
    await writeAdminAudit("telegram_community.chat_update", "TelegramCommunityChat", chat.id, body);
    return { chat };
  });

  app.post("/api/admin/telegram-community/chats/:id/send", async (request, reply) => {
    if (!(await requireAdmin(request, reply))) return;
    if (!isTelegramCommunityConfigured()) return reply.code(503).send({ error: "Telegram community bot is not configured" });
    const params = z.object({ id: z.string().min(1).max(120) }).parse(request.params);
    const body = announcementSchema.parse(request.body ?? {});
    const chats = await listTelegramCommunityChats();
    const chat = chats.find((item) => item.id === params.id);
    if (!chat) return reply.code(404).send({ error: "Community chat not found" });
    await sendTelegramCommunityMessage(chat.telegramChatId, body.text);
    await writeAdminAudit("telegram_community.announcement", "TelegramCommunityChat", chat.id, { length: body.text.length });
    return { ok: true };
  });
}

function safeSecretEqual(received?: string, expected?: string) {
  if (!received || !expected) return false;
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}
