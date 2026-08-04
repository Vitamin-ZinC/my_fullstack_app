import { Prisma, type TelegramCommunityChat, type TelegramCommunityCommitmentStatus, type TelegramCommunityMember } from "@prisma/client";
import { env } from "../env.js";
import { prisma } from "../lib/prisma.js";
import { getTelegramCommunitySettings } from "./habitSettings.js";
import { getOpenAiClient, hasOpenAiClient } from "./openaiClient.js";
import { renderPromptTemplate, resolveActivePrompt, TELEGRAM_COMMUNITY_SYSTEM_PROMPT_KEY } from "./reportPrompts.js";

type CommunityTelegramUser = {
  id: number;
  is_bot?: boolean;
  username?: string;
  first_name?: string;
  last_name?: string;
};

type CommunityTelegramChat = {
  id: number | string;
  type: "private" | "group" | "supergroup" | "channel" | string;
  title?: string;
  username?: string;
};

type CommunityTelegramMessage = {
  message_id: number;
  text?: string;
  chat: CommunityTelegramChat;
  from?: CommunityTelegramUser;
  reply_to_message?: {
    from?: CommunityTelegramUser;
    text?: string;
  };
};

type CommunityCallbackQuery = {
  id: string;
  data?: string;
  from: CommunityTelegramUser;
  message?: CommunityTelegramMessage;
};

type CommunityChatMemberUpdate = {
  chat: CommunityTelegramChat;
  from: CommunityTelegramUser;
  new_chat_member: { status: string; user: CommunityTelegramUser };
};

export type TelegramCommunityUpdate = {
  update_id: number;
  message?: CommunityTelegramMessage;
  callback_query?: CommunityCallbackQuery;
  my_chat_member?: CommunityChatMemberUpdate;
};

type CommunityChatUpdateInput = {
  status?: "PENDING" | "ACTIVE" | "PAUSED" | "LEFT";
  timezone?: string;
  schedulesEnabled?: boolean;
  aiRepliesEnabled?: boolean;
  smartPingEnabled?: boolean;
  morningTime?: string;
  middayTime?: string;
  eveningTime?: string;
  quietHoursStart?: string;
  quietHoursEnd?: string;
};

const communityRateLimit = new Map<string, { count: number; resetAt: number }>();
const COMMUNITY_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const COMMUNITY_RATE_LIMIT_MAX = 10;
const SMART_PING_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export function isTelegramCommunityConfigured() {
  return Boolean(
    env.TELEGRAM_COMMUNITY_BOT_TOKEN
    && env.TELEGRAM_COMMUNITY_BOT_USERNAME
    && env.TELEGRAM_COMMUNITY_WEBHOOK_SECRET
  );
}

export function isCommunityGroup(chat?: Pick<CommunityTelegramChat, "type"> | null) {
  return chat?.type === "group" || chat?.type === "supergroup";
}

export function shouldCommunityBotReply(input: {
  text: string;
  botUsername?: string | null;
  replyToBot?: boolean;
}) {
  const username = input.botUsername?.trim().replace(/^@+/, "").toLowerCase();
  if (input.replyToBot) return true;
  if (!username) return false;
  return input.text.toLowerCase().includes(`@${username}`);
}

export function buildSmartPingTargets<T extends {
  optedIn: boolean;
  mentionEnabled: boolean;
  status: string;
  lastActivityAt?: Date | null;
}>(members: T[], dateKey: string, timezone: string) {
  return members.filter((member) => (
    member.optedIn
    && member.mentionEnabled
    && member.status === "ACTIVE"
    && (!member.lastActivityAt || localDateKey(member.lastActivityAt, timezone) !== dateKey)
  ));
}

export async function processTelegramCommunityUpdate(update: TelegramCommunityUpdate) {
  if (update.my_chat_member) return processCommunityMembershipUpdate(update.my_chat_member);
  if (update.callback_query) return processCommunityCallback(update.callback_query);
  if (update.message) return processCommunityMessage(update.message);
  return { ok: true, ignored: true };
}

async function processCommunityMembershipUpdate(update: CommunityChatMemberUpdate) {
  if (!isCommunityGroup(update.chat)) return { ok: true, ignored: true };
  const status = update.new_chat_member.status;
  if (["left", "kicked"].includes(status)) {
    await prisma.telegramCommunityChat.updateMany({
      where: { telegramChatId: String(update.chat.id) },
      data: { status: "LEFT", schedulesEnabled: false }
    });
    return { ok: true, left: true };
  }
  if (!["member", "administrator"].includes(status)) return { ok: true, ignored: true };

  const chat = await upsertCommunityChat(update.chat, String(update.from.id));
  const settings = await getTelegramCommunitySettings();
  await sendTelegramCommunityMessage(chat.telegramChatId, [
    settings.welcomeTemplate,
    "",
    "По умолчанию расписание выключено. Администратор группы может запустить его командой /activate."
  ].join("\n"), communityJoinKeyboard());
  return { ok: true, registered: true };
}

async function processCommunityMessage(message: CommunityTelegramMessage) {
  if (message.from?.is_bot) return { ok: true, ignored: true };
  if (!isCommunityGroup(message.chat)) {
    if (message.chat.type === "private") {
      const username = env.TELEGRAM_COMMUNITY_BOT_USERNAME?.trim().replace(/^@+/, "");
      const addUrl = username ? `https://t.me/${username}?startgroup=orken` : null;
      await sendTelegramCommunityMessage(String(message.chat.id), [
        "Этот бот работает только в группах и не подключается к личным данным ORKEN.LIFE.",
        addUrl ? `Добавить в комьюнити: ${addUrl}` : "Добавление в группы станет доступно после настройки бота."
      ].join("\n\n"));
    }
    return { ok: true, ignored: true };
  }
  if (!message.from) return { ok: true, ignored: true };

  const chat = await upsertCommunityChat(message.chat);
  const member = await upsertCommunityMember(chat.id, message.from, true);
  const text = message.text?.trim() ?? "";
  const { command, argument } = parseCommand(text);

  if (command === "/activate") return activateCommunity(chat, message.from.id);
  if (command === "/pause") return pauseCommunity(chat, message.from.id);
  if (command === "/status") return sendCommunityStatus(chat);
  if (command === "/help" || command === "/start") {
    await sendTelegramCommunityMessage(chat.telegramChatId, communityHelpText(), communityJoinKeyboard());
    return { ok: true };
  }
  if (command === "/join") return joinCommunity(chat, member);
  if (command === "/leave") return leaveCommunity(chat, member);
  if (command === "/mentions_on") return updateCommunityMentions(chat, member, true);
  if (command === "/mentions_off") return updateCommunityMentions(chat, member, false);
  if (command === "/focus") return saveCommunityFocus(chat, member, argument);
  if (command === "/done") return markCommunityCommitment(chat, member, "DONE");
  if (command === "/partial") return markCommunityCommitment(chat, member, "PARTIAL");
  if (command === "/leaderboard") return sendCommunityLeaderboard(chat);
  if (command === "/wake_up" || command === "/ping_all") return manualCommunityWake(chat, message.from.id);
  if (command === "/life") {
    await sendTelegramCommunityMessage(chat.telegramChatId, "Диагностика и Навигатор привычек ORKEN.LIFE: https://orken.life");
    return { ok: true };
  }
  if (command) {
    await sendTelegramCommunityMessage(chat.telegramChatId, communityHelpText(), communityJoinKeyboard());
    return { ok: true };
  }

  const replyToBot = Boolean(
    message.reply_to_message?.from?.is_bot
    && normalizeUsername(message.reply_to_message.from.username) === normalizeUsername(env.TELEGRAM_COMMUNITY_BOT_USERNAME)
  );
  if (
    chat.status !== "ACTIVE"
    || !chat.aiRepliesEnabled
    || !text
    || !shouldCommunityBotReply({ text, botUsername: env.TELEGRAM_COMMUNITY_BOT_USERNAME, replyToBot })
  ) {
    return { ok: true, ignored: true };
  }
  if (!allowCommunityAction(chat.telegramChatId, member.telegramUserId)) {
    await sendTelegramCommunityMessage(chat.telegramChatId, "Возьму паузу: слишком много обращений подряд. Вернитесь через несколько минут.");
    return { ok: true, rateLimited: true };
  }

  const reply = await generateCommunityReply(chat, member, stripBotMention(text));
  await sendTelegramCommunityMessage(chat.telegramChatId, reply);
  return { ok: true };
}

async function processCommunityCallback(callback: CommunityCallbackQuery) {
  const message = callback.message;
  if (!message || !isCommunityGroup(message.chat)) return { ok: true, ignored: true };
  const chat = await upsertCommunityChat(message.chat);
  const member = await upsertCommunityMember(chat.id, callback.from, true);
  const data = callback.data ?? "";
  let answer = "Готово";

  if (data === "community:join") {
    await prisma.telegramCommunityMember.update({
      where: { id: member.id },
      data: { optedIn: true, mentionEnabled: true, status: "ACTIVE" }
    });
    answer = "Вы участвуете в ритме комьюнити";
  } else if (data === "community:done") {
    answer = await markCommunityCommitment(chat, member, "DONE", false);
  } else if (data === "community:partial") {
    answer = await markCommunityCommitment(chat, member, "PARTIAL", false);
  } else if (data === "community:skip") {
    answer = await markCommunityCommitment(chat, member, "SKIPPED", false);
  } else {
    return { ok: true, ignored: true };
  }

  await answerTelegramCommunityCallback(callback.id, answer.slice(0, 180));
  return { ok: true };
}

async function activateCommunity(chat: TelegramCommunityChat, telegramUserId: number) {
  if (!(await isTelegramCommunityAdmin(chat.telegramChatId, String(telegramUserId)))) {
    await sendTelegramCommunityMessage(chat.telegramChatId, "Включить расписание может только администратор группы.");
    return { ok: true, forbidden: true };
  }
  const updated = await prisma.telegramCommunityChat.update({
    where: { id: chat.id },
    data: { status: "ACTIVE", schedulesEnabled: true }
  });
  await sendTelegramCommunityMessage(updated.telegramChatId, [
    "Комьюнити-режим включён.",
    `Расписание: ${updated.morningTime}, ${updated.middayTime}, ${updated.eveningTime} (${updated.timezone}).`,
    "Участие добровольное: /join. Настройки доступны администратору ORKEN.LIFE."
  ].join("\n"), communityJoinKeyboard());
  return { ok: true, activated: true };
}

async function pauseCommunity(chat: TelegramCommunityChat, telegramUserId: number) {
  if (!(await isTelegramCommunityAdmin(chat.telegramChatId, String(telegramUserId)))) {
    await sendTelegramCommunityMessage(chat.telegramChatId, "Поставить бота на паузу может только администратор группы.");
    return { ok: true, forbidden: true };
  }
  await prisma.telegramCommunityChat.update({ where: { id: chat.id }, data: { status: "PAUSED", schedulesEnabled: false } });
  await sendTelegramCommunityMessage(chat.telegramChatId, "Автоматическое расписание поставлено на паузу. Публичные цели и баллы сохранены.");
  return { ok: true, paused: true };
}

async function sendCommunityStatus(chat: TelegramCommunityChat) {
  const [members, commitments] = await Promise.all([
    prisma.telegramCommunityMember.count({ where: { chatId: chat.id, optedIn: true, status: "ACTIVE" } }),
    prisma.telegramCommunityCommitment.count({ where: { chatId: chat.id, dateKey: localDateKey(new Date(), chat.timezone) } })
  ]);
  await sendTelegramCommunityMessage(chat.telegramChatId, [
    `Статус: ${chat.status}.`,
    `Расписание: ${chat.schedulesEnabled ? "включено" : "выключено"}.`,
    `AI-ответы: ${chat.aiRepliesEnabled ? "включены" : "выключены"}.`,
    `Участников по согласию: ${members}. Фокусов сегодня: ${commitments}.`
  ].join("\n"));
  return { ok: true };
}

async function joinCommunity(chat: TelegramCommunityChat, member: TelegramCommunityMember) {
  await prisma.telegramCommunityMember.update({
    where: { id: member.id },
    data: { optedIn: true, mentionEnabled: true, status: "ACTIVE" }
  });
  await sendTelegramCommunityMessage(chat.telegramChatId, `${displayName(member)}, участие включено. Запишите фокус: /focus один конкретный результат дня.`);
  return { ok: true };
}

async function leaveCommunity(chat: TelegramCommunityChat, member: TelegramCommunityMember) {
  await prisma.telegramCommunityMember.update({
    where: { id: member.id },
    data: { optedIn: false, mentionEnabled: false }
  });
  await sendTelegramCommunityMessage(chat.telegramChatId, `${displayName(member)}, участие и упоминания отключены. Ваши прошлые публичные отметки остаются в истории группы.`);
  return { ok: true };
}

async function updateCommunityMentions(chat: TelegramCommunityChat, member: TelegramCommunityMember, enabled: boolean) {
  if (!member.optedIn && enabled) {
    await sendTelegramCommunityMessage(chat.telegramChatId, "Сначала включите участие командой /join.");
    return { ok: true };
  }
  await prisma.telegramCommunityMember.update({ where: { id: member.id }, data: { mentionEnabled: enabled } });
  await sendTelegramCommunityMessage(chat.telegramChatId, `${displayName(member)}, упоминания ${enabled ? "включены" : "отключены"}.`);
  return { ok: true };
}

async function saveCommunityFocus(chat: TelegramCommunityChat, member: TelegramCommunityMember, text: string) {
  const focus = text.trim().slice(0, 500);
  if (focus.length < 3) {
    await sendTelegramCommunityMessage(chat.telegramChatId, "Добавьте конкретный результат: /focus что именно вы завершите сегодня");
    return { ok: true };
  }
  const dateKey = localDateKey(new Date(), chat.timezone);
  await prisma.$transaction([
    prisma.telegramCommunityMember.update({
      where: { id: member.id },
      data: { optedIn: true, status: "ACTIVE", lastActivityAt: new Date() }
    }),
    prisma.telegramCommunityCommitment.upsert({
      where: { chatId_memberId_dateKey: { chatId: chat.id, memberId: member.id, dateKey } },
      update: { text: focus },
      create: { chatId: chat.id, memberId: member.id, dateKey, text: focus }
    })
  ]);
  await sendTelegramCommunityMessage(chat.telegramChatId, `${displayName(member)}, фокус сохранён: ${focus}`);
  return { ok: true };
}

async function markCommunityCommitment(
  chat: TelegramCommunityChat,
  member: TelegramCommunityMember,
  status: TelegramCommunityCommitmentStatus,
  sendMessage = true
): Promise<any> {
  const dateKey = localDateKey(new Date(), chat.timezone);
  const targetPoints = status === "DONE" ? 2 : status === "PARTIAL" ? 1 : 0;
  const existing = await prisma.telegramCommunityCommitment.findUnique({
    where: { chatId_memberId_dateKey: { chatId: chat.id, memberId: member.id, dateKey } }
  });
  const previousPoints = existing?.pointsAwarded ?? 0;
  const pointsDelta = targetPoints - previousPoints;

  await prisma.$transaction(async (tx) => {
    await tx.telegramCommunityCommitment.upsert({
      where: { chatId_memberId_dateKey: { chatId: chat.id, memberId: member.id, dateKey } },
      update: {
        status,
        pointsAwarded: targetPoints,
        completedAt: status === "DONE" ? new Date() : null
      },
      create: {
        chatId: chat.id,
        memberId: member.id,
        dateKey,
        text: "Участие в вечерней сверке",
        status,
        pointsAwarded: targetPoints,
        completedAt: status === "DONE" ? new Date() : null
      }
    });
    await tx.telegramCommunityMember.update({
      where: { id: member.id },
      data: {
        optedIn: true,
        status: "ACTIVE",
        lastCheckinAt: new Date(),
        lastActivityAt: new Date(),
        ...(pointsDelta ? { points: { increment: pointsDelta } } : {})
      }
    });
  });

  const label = status === "DONE"
    ? "Фокус выполнен. +2 community-балла."
    : status === "PARTIAL"
      ? "Частично выполнено. +1 community-балл. Зафиксируйте следующий шаг."
      : "Сегодня без результата. Баллы не списываются — завтра можно начать заново.";
  if (sendMessage) await sendTelegramCommunityMessage(chat.telegramChatId, `${displayName(member)}: ${label}`);
  return label;
}

async function sendCommunityLeaderboard(chat: TelegramCommunityChat) {
  const members = await prisma.telegramCommunityMember.findMany({
    where: { chatId: chat.id, optedIn: true, status: "ACTIVE" },
    orderBy: [{ points: "desc" }, { updatedAt: "asc" }],
    take: 10
  });
  const lines = members.map((member, index) => `${index + 1}. ${displayName(member)} — ${member.points}`);
  await sendTelegramCommunityMessage(chat.telegramChatId, lines.length
    ? ["Community-баллы:", ...lines, "", "Это отдельная игровая метрика группы, не XP личного кабинета."].join("\n")
    : "Пока никто не включил участие. Команда: /join");
  return { ok: true };
}

async function manualCommunityWake(chat: TelegramCommunityChat, telegramUserId: number) {
  if (!(await isTelegramCommunityAdmin(chat.telegramChatId, String(telegramUserId)))) {
    await sendTelegramCommunityMessage(chat.telegramChatId, "Пинг участников доступен только администратору группы.");
    return { ok: true, forbidden: true };
  }
  const sent = await sendCommunitySmartPing(chat, new Date(), true);
  if (!sent) await sendTelegramCommunityMessage(chat.telegramChatId, "Пинг не отправлен: действует кулдаун, тихие часы или нет участников с разрешёнными упоминаниями.");
  return { ok: true, sent };
}

async function generateCommunityReply(chat: TelegramCommunityChat, member: TelegramCommunityMember, message: string) {
  const fallback = "Сформулируйте один результат, который можно проверить сегодня, и выберите действие на ближайшие 20 минут.";
  if (!hasOpenAiClient()) return fallback;
  const client = getOpenAiClient();
  if (!client) return fallback;

  const dateKey = localDateKey(new Date(), chat.timezone);
  const commitment = await prisma.telegramCommunityCommitment.findUnique({
    where: { chatId_memberId_dateKey: { chatId: chat.id, memberId: member.id, dateKey } }
  });
  try {
    const [prompt, settings] = await Promise.all([
      resolveActivePrompt(TELEGRAM_COMMUNITY_SYSTEM_PROMPT_KEY, "ru"),
      getTelegramCommunitySettings()
    ]);
    const systemPrompt = renderPromptTemplate(prompt.content, {
      groupTitle: chat.title || "ORKEN community",
      displayName: displayName(member),
      publicCommitment: commitment?.text || "не указан",
      communityPoints: String(member.points)
    });
    const response = await client.chat.completions.create({
      model: env.OPENAI_MODEL,
      temperature: settings.temperature,
      max_tokens: 420,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message.slice(0, 1600) }
      ]
    });
    return response.choices?.[0]?.message?.content?.trim() || fallback;
  } catch {
    return fallback;
  }
}

export async function sendDueTelegramCommunityPosts(now = new Date()) {
  if (!isTelegramCommunityConfigured()) return { checked: 0, sent: 0, pings: 0 };
  const chats = await prisma.telegramCommunityChat.findMany({
    where: { status: "ACTIVE", schedulesEnabled: true }
  });
  const settings = await getTelegramCommunitySettings();
  let sent = 0;
  let pings = 0;

  for (const chat of chats) {
    const local = localTimeParts(now, chat.timezone);
    if (isInQuietHours(local.hhmm, chat.quietHoursStart, chat.quietHoursEnd)) continue;
    if (local.hhmm === chat.morningTime) {
      if (await sendScheduledCommunityPost(chat, "MORNING", local.dateKey, settings.morningTemplate, morningKeyboard())) sent += 1;
    }
    if (local.hhmm === chat.middayTime) {
      if (await sendScheduledCommunityPost(chat, "MIDDAY", local.dateKey, settings.middayTemplate)) sent += 1;
    }
    if (local.hhmm === chat.eveningTime) {
      if (await sendScheduledCommunityPost(chat, "EVENING", local.dateKey, settings.eveningTemplate, eveningKeyboard())) sent += 1;
    }
    if (chat.smartPingEnabled && local.hhmm === "21:30") {
      if (await shouldSendLowResponsePing(chat, local.dateKey) && await sendCommunitySmartPing(chat, now, false)) pings += 1;
    }
  }
  return { checked: chats.length, sent, pings };
}

async function shouldSendLowResponsePing(chat: TelegramCommunityChat, dateKey: string) {
  const [members, responded] = await Promise.all([
    prisma.telegramCommunityMember.count({ where: { chatId: chat.id, optedIn: true, status: "ACTIVE" } }),
    prisma.telegramCommunityCommitment.count({
      where: { chatId: chat.id, dateKey, status: { in: ["DONE", "PARTIAL", "SKIPPED"] } }
    })
  ]);
  return members > 0 && responded / members < 0.3;
}

async function sendCommunitySmartPing(chat: TelegramCommunityChat, now: Date, manual: boolean) {
  if (chat.lastWakeAt && now.getTime() - chat.lastWakeAt.getTime() < SMART_PING_COOLDOWN_MS) return false;
  const local = localTimeParts(now, chat.timezone);
  if (isInQuietHours(local.hhmm, chat.quietHoursStart, chat.quietHoursEnd)) return false;
  const members = await prisma.telegramCommunityMember.findMany({
    where: { chatId: chat.id, optedIn: true, mentionEnabled: true, status: "ACTIVE" }
  });
  const targets = buildSmartPingTargets(members, local.dateKey, chat.timezone).slice(0, 20);
  if (targets.length === 0) return false;
  const mentions = targets.map(communityMention).join(" ");
  const text = [
    manual ? "Мягкая сверка от администратора." : "Вечерняя сверка: пока ответили не все.",
    mentions,
    "Отметьте результат кнопкой ниже. Если день пошёл иначе, можно выбрать «Не сегодня» — без штрафов и публичного давления."
  ].join("\n");
  await sendTelegramCommunityMessage(chat.telegramChatId, text, eveningKeyboard(), "HTML");
  await prisma.telegramCommunityChat.update({ where: { id: chat.id }, data: { lastWakeAt: now } });
  await prisma.telegramCommunityPost.upsert({
    where: { chatId_dateKey_type: { chatId: chat.id, dateKey: local.dateKey, type: "WAKE" } },
    update: { sentAt: now },
    create: { chatId: chat.id, dateKey: local.dateKey, type: "WAKE", sentAt: now }
  });
  return true;
}

async function sendScheduledCommunityPost(
  chat: TelegramCommunityChat,
  type: "MORNING" | "MIDDAY" | "EVENING",
  dateKey: string,
  text: string,
  replyMarkup?: unknown
) {
  try {
    await prisma.telegramCommunityPost.create({ data: { chatId: chat.id, dateKey, type } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return false;
    throw error;
  }
  try {
    const response = await sendTelegramCommunityMessage(chat.telegramChatId, text, replyMarkup) as { result?: { message_id?: number } };
    await prisma.$transaction([
      prisma.telegramCommunityPost.update({
        where: { chatId_dateKey_type: { chatId: chat.id, dateKey, type } },
        data: { telegramMessageId: response.result?.message_id ? String(response.result.message_id) : null }
      }),
      prisma.telegramCommunityChat.update({
        where: { id: chat.id },
        data: type === "MORNING"
          ? { lastMorningAt: new Date() }
          : type === "MIDDAY"
            ? { lastMiddayAt: new Date() }
            : { lastEveningAt: new Date() }
      })
    ]);
    return true;
  } catch (error) {
    await prisma.telegramCommunityPost.delete({ where: { chatId_dateKey_type: { chatId: chat.id, dateKey, type } } }).catch(() => undefined);
    throw error;
  }
}

export async function sendTelegramCommunityMessage(
  chatId: string,
  text: string,
  replyMarkup?: unknown,
  parseMode?: "HTML"
) {
  if (!env.TELEGRAM_COMMUNITY_BOT_TOKEN) return { ok: false, skipped: true };
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_COMMUNITY_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: text.slice(0, 4096),
      disable_web_page_preview: true,
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      ...(parseMode ? { parse_mode: parseMode } : {})
    })
  });
  if (!response.ok) throw new Error(`Telegram community sendMessage failed: ${response.status}`);
  return response.json();
}

async function answerTelegramCommunityCallback(callbackId: string, text: string) {
  if (!env.TELEGRAM_COMMUNITY_BOT_TOKEN) return;
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_COMMUNITY_BOT_TOKEN}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackId, text })
  });
}

async function isTelegramCommunityAdmin(chatId: string, userId: string) {
  if (!env.TELEGRAM_COMMUNITY_BOT_TOKEN) return false;
  try {
    const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_COMMUNITY_BOT_TOKEN}/getChatMember`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, user_id: userId })
    });
    if (!response.ok) return false;
    const result = await response.json() as { ok?: boolean; result?: { status?: string } };
    return Boolean(result.ok && ["creator", "administrator"].includes(result.result?.status ?? ""));
  } catch {
    return false;
  }
}

async function upsertCommunityChat(chat: CommunityTelegramChat, installedByUserId?: string) {
  return prisma.telegramCommunityChat.upsert({
    where: { telegramChatId: String(chat.id) },
    update: {
      type: chat.type,
      title: chat.title,
      username: chat.username,
      ...(installedByUserId ? { installedByUserId } : {})
    },
    create: {
      telegramChatId: String(chat.id),
      type: chat.type,
      title: chat.title,
      username: chat.username,
      installedByUserId
    }
  });
}

async function upsertCommunityMember(chatId: string, user: CommunityTelegramUser, recordActivity: boolean) {
  const now = new Date();
  if (recordActivity) {
    await prisma.telegramCommunityChat.update({ where: { id: chatId }, data: { lastHumanMessageAt: now } });
  }
  return prisma.telegramCommunityMember.upsert({
    where: { chatId_telegramUserId: { chatId, telegramUserId: String(user.id) } },
    update: {
      username: user.username,
      firstName: user.first_name,
      lastName: user.last_name,
      status: "ACTIVE",
      ...(recordActivity ? { lastActivityAt: now } : {})
    },
    create: {
      chatId,
      telegramUserId: String(user.id),
      username: user.username,
      firstName: user.first_name,
      lastName: user.last_name,
      lastActivityAt: recordActivity ? now : null
    }
  });
}

export async function listTelegramCommunityChats() {
  const chats = await prisma.telegramCommunityChat.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { members: true, commitments: true, posts: true } }
    }
  });
  return chats.map((chat) => ({
    id: chat.id,
    telegramChatId: chat.telegramChatId,
    type: chat.type,
    title: chat.title,
    username: chat.username,
    status: chat.status,
    timezone: chat.timezone,
    schedulesEnabled: chat.schedulesEnabled,
    aiRepliesEnabled: chat.aiRepliesEnabled,
    smartPingEnabled: chat.smartPingEnabled,
    morningTime: chat.morningTime,
    middayTime: chat.middayTime,
    eveningTime: chat.eveningTime,
    quietHoursStart: chat.quietHoursStart,
    quietHoursEnd: chat.quietHoursEnd,
    lastHumanMessageAt: chat.lastHumanMessageAt?.toISOString() ?? null,
    lastWakeAt: chat.lastWakeAt?.toISOString() ?? null,
    memberCount: chat._count.members,
    commitmentCount: chat._count.commitments,
    postCount: chat._count.posts,
    createdAt: chat.createdAt.toISOString(),
    updatedAt: chat.updatedAt.toISOString()
  }));
}

export async function updateTelegramCommunityChat(id: string, input: CommunityChatUpdateInput) {
  return prisma.telegramCommunityChat.update({ where: { id }, data: input });
}

function parseCommand(text: string) {
  if (!text.startsWith("/")) return { command: "", argument: "" };
  const [head = "", ...rest] = text.split(/\s+/);
  return {
    command: head.split("@")[0].toLowerCase(),
    argument: rest.join(" ").trim()
  };
}

function stripBotMention(text: string) {
  const username = env.TELEGRAM_COMMUNITY_BOT_USERNAME?.trim().replace(/^@+/, "");
  return username ? text.replace(new RegExp(`@${escapeRegExp(username)}`, "ig"), "").trim() : text;
}

function normalizeUsername(value?: string | null) {
  return value?.trim().replace(/^@+/, "").toLowerCase() ?? "";
}

function allowCommunityAction(chatId: string, telegramUserId: string) {
  const key = `${chatId}:${telegramUserId}`;
  const now = Date.now();
  const current = communityRateLimit.get(key);
  if (!current || current.resetAt <= now) {
    communityRateLimit.set(key, { count: 1, resetAt: now + COMMUNITY_RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (current.count >= COMMUNITY_RATE_LIMIT_MAX) return false;
  current.count += 1;
  return true;
}

function communityJoinKeyboard() {
  return { inline_keyboard: [[{ text: "Участвовать добровольно", callback_data: "community:join" }]] };
}

function morningKeyboard() {
  return { inline_keyboard: [[{ text: "Включить участие", callback_data: "community:join" }]] };
}

function eveningKeyboard() {
  return {
    inline_keyboard: [[
      { text: "Выполнено", callback_data: "community:done" },
      { text: "Частично", callback_data: "community:partial" },
      { text: "Не сегодня", callback_data: "community:skip" }
    ]]
  };
}

function communityHelpText() {
  return [
    "Команды ORKEN Community:",
    "/join — добровольно участвовать",
    "/leave — выйти и отключить упоминания",
    "/focus результат — записать публичный фокус дня",
    "/done или /partial — отметить итог",
    "/leaderboard — community-баллы",
    "/mentions_on и /mentions_off — управление упоминаниями",
    "/life — открыть ORKEN.LIFE",
    "/status — состояние бота",
    "/activate, /pause, /wake_up — только для администратора группы"
  ].join("\n");
}

function displayName(member: Pick<TelegramCommunityMember, "username" | "firstName" | "telegramUserId">) {
  return member.username ? `@${member.username}` : member.firstName?.trim() || `участник ${member.telegramUserId}`;
}

function communityMention(member: Pick<TelegramCommunityMember, "username" | "firstName" | "telegramUserId">) {
  if (member.username) return `@${escapeHtml(member.username)}`;
  return `<a href="tg://user?id=${encodeURIComponent(member.telegramUserId)}">${escapeHtml(member.firstName || "Участник")}</a>`;
}

function localTimeParts(date: Date, timezone: string) {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone || "Europe/Moscow",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).formatToParts(date);
    const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
    return { dateKey: `${value("year")}-${value("month")}-${value("day")}`, hhmm: `${value("hour")}:${value("minute")}` };
  } catch {
    return localTimeParts(date, "Europe/Moscow");
  }
}

function localDateKey(date: Date, timezone: string) {
  return localTimeParts(date, timezone).dateKey;
}

function isInQuietHours(time: string, start: string, end: string) {
  const current = timeToMinutes(time);
  const startMinutes = timeToMinutes(start);
  const endMinutes = timeToMinutes(end);
  if (startMinutes === endMinutes) return false;
  if (startMinutes < endMinutes) return current >= startMinutes && current < endMinutes;
  return current >= startMinutes || current < endMinutes;
}

function timeToMinutes(value: string) {
  const [hours = "0", minutes = "0"] = value.split(":");
  return Number(hours) * 60 + Number(minutes);
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
