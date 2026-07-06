import { createHash, randomBytes } from "node:crypto";
import { env } from "../env.js";
import { prisma } from "../lib/prisma.js";
import { getTelegramPolicySettings } from "./habitSettings.js";
import { askHabitNavigator } from "./habitNavigator.js";
import { getOpenAiApiKey } from "./openaiClient.js";

type TelegramUser = {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
};

type TelegramMessage = {
  message_id: number;
  text?: string;
  voice?: { file_id: string; duration?: number; mime_type?: string };
  audio?: { file_id: string; duration?: number; mime_type?: string; file_name?: string };
  chat: { id: number | string; type?: string };
  from?: TelegramUser;
};

type TelegramCallbackQuery = {
  id: string;
  data?: string;
  message?: TelegramMessage;
  from?: TelegramUser;
};

export type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
};

const telegramRateLimit = new Map<string, { count: number; resetAt: number }>();

export function isTelegramConfigured() {
  return Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_BOT_USERNAME);
}

export function createTelegramRawToken() {
  return randomBytes(24).toString("base64url");
}

export function hashTelegramToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function buildTelegramConnectUrl(token: string) {
  if (!env.TELEGRAM_BOT_USERNAME) return "";
  return `https://t.me/${env.TELEGRAM_BOT_USERNAME}?start=${encodeURIComponent(token)}`;
}

async function buildTelegramWebLoginUrl(account?: { telegramUserId?: string; userId?: string | null; sessionId?: string | null } | null) {
  const baseUrl = env.PUBLIC_API_URL?.replace(/\/$/, "");
  if (!baseUrl) return "";
  const settings = await getTelegramPolicySettings();
  if (!settings.webLoginEnabled || !account?.telegramUserId || !account.sessionId) return `${baseUrl}/habits`;

  const token = createTelegramRawToken();
  await prisma.telegramWebLoginToken.create({
    data: {
      tokenHash: hashTelegramToken(token),
      telegramUserId: account.telegramUserId,
      userId: account.userId ?? undefined,
      sessionId: account.sessionId,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000)
    }
  });
  return `${baseUrl}/habits?telegramLogin=${encodeURIComponent(token)}`;
}

export async function sendTelegramMessage(chatId: string, text: string, replyMarkup?: unknown) {
  if (!env.TELEGRAM_BOT_TOKEN) return { ok: false, skipped: true };
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
      ...(replyMarkup ? { reply_markup: replyMarkup } : {})
    })
  });
  if (!response.ok) {
    throw new Error(`Telegram sendMessage failed: ${response.status}`);
  }
  return response.json();
}

export async function processTelegramUpdate(update: TelegramUpdate) {
  if (update.callback_query) {
    return processTelegramCallback(update.callback_query);
  }
  if (update.message) {
    return processTelegramMessage(update.message);
  }
  return { ok: true, ignored: true };
}

async function processTelegramCallback(callback: TelegramCallbackQuery) {
  const chatId = callback.message?.chat.id ? String(callback.message.chat.id) : null;
  const telegramUserId = callback.from?.id ? String(callback.from.id) : null;
  if (!chatId || !telegramUserId) return { ok: true, ignored: true };
  const account = await findTelegramAccount(telegramUserId);
  if (!account) {
    await sendTelegramMessage(chatId, "Сначала подключи Telegram через кабинет ORKEN.LIFE.");
    return { ok: true };
  }
  const data = callback.data ?? "";
  if (data === "today") {
    await sendTelegramMessage(chatId, await buildTodayText(account), await defaultKeyboard(account));
  } else if (data === "checkin") {
    await sendTelegramMessage(chatId, await completeTodayFromTelegram(account), await defaultKeyboard(account));
  } else if (data === "metrics") {
    await sendTelegramMessage(chatId, await buildMetricsText(account), await defaultKeyboard(account));
  }
  return { ok: true };
}

async function processTelegramMessage(message: TelegramMessage) {
  const text = message.text?.trim() ?? "";
  const chatId = String(message.chat.id);
  const telegramUserId = message.from?.id ? String(message.from.id) : null;
  if (!telegramUserId) return { ok: true, ignored: true };

  if (text.startsWith("/start")) {
    const token = text.split(/\s+/)[1];
    if (!token) {
      await sendTelegramMessage(chatId, "Открой подключение Telegram из кабинета ORKEN.LIFE, чтобы я понял, чей это путь.");
      return { ok: true };
    }
    return linkTelegramAccount(token, chatId, message.from);
  }

  const account = await findTelegramAccount(telegramUserId);
  if (!account) {
    await sendTelegramMessage(chatId, "Я пока не связан с кабинетом. Открой ORKEN.LIFE -> Привычки -> Настройки -> Подключить Telegram.");
    return { ok: true };
  }

  await prisma.telegramAccount.update({
    where: { id: account.id },
    data: { chatId, lastSeenAt: new Date(), status: "ACTIVE" }
  });

  if (!(await allowTelegramAction(telegramUserId))) {
    await sendTelegramMessage(chatId, "Слишком много сообщений подряд. Попробуй ещё раз через несколько минут.");
    return { ok: true, rateLimited: true };
  }

  if (!text && (message.voice || message.audio)) {
    const file = message.voice ?? message.audio;
    if (!file) return { ok: true, ignored: true };
    await sendTelegramMessage(chatId, "Слушаю голосовое и передаю ORKEN...");
    const transcript = await transcribeTelegramAudio(file.file_id, file.mime_type).catch(() => null);
    if (!transcript) {
      await sendTelegramMessage(chatId, "Не получилось разобрать голосовое. Напиши вопрос текстом или попробуй ещё раз короче.");
      return { ok: true };
    }
    await sendTelegramMessage(chatId, await askOrkenFromTelegram(account, `Голосовое сообщение пользователя:\n${transcript}`), await defaultKeyboard(account));
    return { ok: true };
  }

  if (text === "/today") {
    await sendTelegramMessage(chatId, await buildTodayText(account), await defaultKeyboard(account));
    return { ok: true };
  }
  if (text === "/checkin") {
    await sendTelegramMessage(chatId, await completeTodayFromTelegram(account), await defaultKeyboard(account));
    return { ok: true };
  }
  if (text === "/metrics") {
    await sendTelegramMessage(chatId, await buildMetricsText(account), await defaultKeyboard(account));
    return { ok: true };
  }
  if (text === "/stop") {
    await disableTelegram(account.id);
    await sendTelegramMessage(chatId, "Telegram-напоминания отключены. Связку можно включить снова в кабинете.");
    return { ok: true };
  }
  if (text.startsWith("/insight")) {
    const insight = text.replace(/^\/insight\b/i, "").trim();
    await sendTelegramMessage(chatId, await saveInsightFromTelegram(account, insight), await defaultKeyboard(account));
    return { ok: true };
  }
  if (text.startsWith("/orken")) {
    const question = text.replace(/^\/orken\b/i, "").trim() || "Что мне сделать сегодня?";
    await sendTelegramMessage(chatId, await askOrkenFromTelegram(account, question), await defaultKeyboard(account));
    return { ok: true };
  }
  if (text.startsWith("/")) {
    await sendTelegramMessage(chatId, helpText(), await defaultKeyboard(account));
    return { ok: true };
  }

  await sendTelegramMessage(chatId, await askOrkenFromTelegram(account, text || "Что мне сделать сегодня?"), await defaultKeyboard(account));
  return { ok: true };
}

async function linkTelegramAccount(token: string, chatId: string, from?: TelegramUser) {
  const tokenHash = hashTelegramToken(token);
  const link = await prisma.telegramLinkToken.findFirst({
    where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } }
  });
  if (!link) {
    await sendTelegramMessage(chatId, "Ссылка устарела. Создай новую в кабинете ORKEN.LIFE.");
    return { ok: true, linked: false };
  }

  const account = await prisma.telegramAccount.upsert({
    where: { telegramUserId: String(from?.id ?? chatId) },
    update: {
      userId: link.userId,
      sessionId: link.sessionId,
      chatId,
      username: from?.username,
      firstName: from?.first_name,
      lastName: from?.last_name,
      status: "ACTIVE",
      lastSeenAt: new Date()
    },
    create: {
      userId: link.userId,
      sessionId: link.sessionId,
      telegramUserId: String(from?.id ?? chatId),
      chatId,
      username: from?.username,
      firstName: from?.first_name,
      lastName: from?.last_name
    }
  });

  await prisma.telegramLinkToken.update({ where: { id: link.id }, data: { usedAt: new Date() } });
  if (link.programId) {
    await prisma.habitNotificationPreference.upsert({
      where: { programId: link.programId },
      update: { telegramEnabled: true },
      create: { programId: link.programId, telegramEnabled: true }
    });
  }

  await sendTelegramMessage(account.chatId, [
    "Готово, Telegram подключён к ORKEN.LIFE.",
    "Я вижу твой кабинет через backend и могу напоминать про текущий шаг.",
    "",
    "Команды: /today, /checkin, /metrics, /insight текст, /orken вопрос, /stop."
  ].join("\n"), await defaultKeyboard(account));
  return { ok: true, linked: true };
}

async function findTelegramAccount(telegramUserId: string) {
  return prisma.telegramAccount.findUnique({ where: { telegramUserId } });
}

async function disableTelegram(accountId: string) {
  const account = await prisma.telegramAccount.update({
    where: { id: accountId },
    data: { status: "STOPPED" }
  });
  const program = await findProgramForAccount(account);
  if (program) {
    await prisma.habitNotificationPreference.upsert({
      where: { programId: program.id },
      update: { telegramEnabled: false },
      create: { programId: program.id, telegramEnabled: false }
    });
  }
}

async function findProgramForAccount(account: { userId?: string | null; sessionId?: string | null }) {
  const ownership = [
    ...(account.userId ? [{ userId: account.userId }] : []),
    ...(account.sessionId ? [{ sessionId: account.sessionId }] : [])
  ];
  if (ownership.length === 0) return null;
  return prisma.habitProgram.findFirst({
    where: {
      status: "ACTIVE",
      OR: ownership
    },
    orderBy: { createdAt: "desc" },
    include: {
      enrollments: {
        orderBy: { sortOrder: "asc" },
        include: {
          checkins: { orderBy: { date: "desc" } },
          dailyTasks: { orderBy: { dayIndex: "asc" } }
        }
      },
      dailyMetrics: { orderBy: { date: "desc" }, take: 1 }
    }
  });
}

function activeEnrollment(program: Awaited<ReturnType<typeof findProgramForAccount>>) {
  if (!program) return null;
  const currentSortOrder = Math.min(((program.currentCycle - 1) * 12) + program.currentWeek, program.enrollments.length || 1);
  return program.enrollments.find((enrollment) => enrollment.sortOrder === currentSortOrder)
    ?? program.enrollments.find((enrollment) => enrollment.status === "ACTIVE")
    ?? program.enrollments[0]
    ?? null;
}

function nextTask(enrollment: ReturnType<typeof activeEnrollment>) {
  if (!enrollment) return null;
  return enrollment.dailyTasks.find((task) => !task.completedAt) ?? enrollment.dailyTasks[enrollment.dailyTasks.length - 1] ?? null;
}

async function buildTodayText(account: { userId?: string | null; sessionId?: string | null }) {
  const program = await findProgramForAccount(account);
  const enrollment = activeEnrollment(program);
  if (!program || !enrollment) return "Я пока не вижу активную программу привычек. Открой кабинет ORKEN.LIFE и запусти привычки.";
  const task = nextTask(enrollment);
  return [
    `Сегодня: ${enrollment.title}`,
    task ? `${task.title}\n${task.microAction}\n${task.whyToday}` : enrollment.practice,
    "",
    `Прогресс недели: ${enrollment.checkins.filter((item) => item.completed).length}/7.`,
    "Когда сделаешь шаг, нажми /checkin."
  ].join("\n");
}

async function completeTodayFromTelegram(account: { userId?: string | null; sessionId?: string | null }) {
  const program = await findProgramForAccount(account);
  const enrollment = activeEnrollment(program);
  if (!program || !enrollment) return "Активная привычка не найдена.";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const existing = await prisma.habitCheckin.findUnique({
    where: { enrollmentId_date: { enrollmentId: enrollment.id, date: today } }
  });
  await prisma.habitCheckin.upsert({
    where: { enrollmentId_date: { enrollmentId: enrollment.id, date: today } },
    update: { completed: true },
    create: {
      programId: program.id,
      enrollmentId: enrollment.id,
      date: today,
      completed: true,
      note: "Отмечено в Telegram"
    }
  });
  if (!existing?.completed) {
    await completeNextDailyTask(program.id, enrollment.id, today);
    await prisma.habitRewardEvent.create({
      data: {
        programId: program.id,
        type: "daily_checkin",
        label: "Отметка привычки в Telegram",
        xp: 10
      }
    });
  }
  return existing?.completed
    ? "Сегодня уже было отмечено. Повторно XP не начисляю, чтобы прогресс оставался честным."
    : "Сегодня отмечено! +10 XP. Хороший маленький шаг.";
}

async function completeNextDailyTask(programId: string, enrollmentId: string, date: Date) {
  const task = await prisma.habitDailyTask.findFirst({
    where: { programId, enrollmentId, completedAt: null },
    orderBy: { dayIndex: "asc" }
  });
  if (!task) return;
  await prisma.habitDailyTask.update({
    where: { id: task.id },
    data: { date, completedAt: new Date(), xpAwarded: 10 }
  });
}

async function buildMetricsText(account: { userId?: string | null; sessionId?: string | null }) {
  const program = await findProgramForAccount(account);
  if (!program) return "Пока нет активной программы.";
  const metric = program.dailyMetrics[0];
  if (!metric) return "Сегодняшние метрики ещё не сохранены. Открой кабинет и оцени энергию, ясность и устойчивость.";
  return `Последние метрики: энергия ${metric.energy}/10, ясность ${metric.clarity}/10, устойчивость ${metric.stability}/10.`;
}

async function saveInsightFromTelegram(account: { userId?: string | null; sessionId?: string | null }, text: string) {
  if (!text) return "Напиши так: /insight один короткий вывод";
  const program = await findProgramForAccount(account);
  const enrollment = activeEnrollment(program);
  if (!program) return "Активная программа не найдена.";
  await prisma.habitInsight.create({
    data: {
      programId: program.id,
      enrollmentId: enrollment?.id,
      text: text.slice(0, 1000),
      source: "telegram"
    }
  });
  await prisma.habitRewardEvent.create({
    data: {
      programId: program.id,
      type: "insight_saved",
      label: "Инсайт из Telegram",
      xp: 15
    }
  });
  return "Инсайт сохранён в архив. +15 XP.";
}

async function askOrkenFromTelegram(account: { userId?: string | null; sessionId?: string | null }, question: string) {
  const result = await askHabitNavigator({
    identity: { userId: account.userId, sessionId: account.sessionId, locale: "ru" },
    message: question,
    context: { mode: "chat", source: "telegram" },
    channel: "TELEGRAM"
  });
  return result.reply;
}

export async function sendDueTelegramReminders(now = new Date()) {
  if (!isTelegramConfigured()) return { checked: 0, sent: 0 };
  const preferences = await prisma.habitNotificationPreference.findMany({
    where: {
      telegramEnabled: true,
      motivationFrequency: { not: "off" }
    },
    include: {
      program: {
        include: {
          enrollments: {
            orderBy: { sortOrder: "asc" },
            include: {
              checkins: { orderBy: { date: "desc" } },
              dailyTasks: { orderBy: { dayIndex: "asc" } }
            }
          },
          dailyMetrics: { orderBy: { date: "desc" }, take: 1 }
        }
      }
    }
  });

  let sent = 0;
  for (const preference of preferences) {
    if (!isReminderDue(preference, now)) continue;
    const ownership = [
      ...(preference.program.userId ? [{ userId: preference.program.userId }] : []),
      ...(preference.program.sessionId ? [{ sessionId: preference.program.sessionId }] : [])
    ];
    if (ownership.length === 0) continue;
    const account = await prisma.telegramAccount.findFirst({
      where: { status: "ACTIVE", OR: ownership },
      orderBy: { updatedAt: "desc" }
    });
    if (!account) continue;

    const enrollment = activeEnrollment(preference.program);
    const task = nextTask(enrollment);
    const metric = preference.program.dailyMetrics[0];
    const settings = await getTelegramPolicySettings();
    const text = renderTelegramTemplate(settings.reminderTemplate, {
      habitTitle: enrollment ? `• ${enrollment.title}` : "Открой кабинет и выбери мягкий шаг.",
      taskText: task ? `${task.title}\n${task.microAction}` : enrollment?.practice ?? "",
      metricText: metric ? `Последняя метрика: энергия ${metric.energy}/10, ясность ${metric.clarity}/10, устойчивость ${metric.stability}/10.` : ""
    });

    try {
      await sendTelegramMessage(account.chatId, text, await defaultKeyboard(account));
      await prisma.habitNotificationPreference.update({
        where: { id: preference.id },
        data: { lastReminderAt: now }
      });
      sent += 1;
    } catch (error) {
      console.error("Telegram reminder failed", {
        preferenceId: preference.id,
        error: error instanceof Error ? error.message : error
      });
    }
  }
  return { checked: preferences.length, sent };
}

function isReminderDue(preference: {
  reminderTime: string;
  timezone: string;
  quietHoursStart?: string | null;
  quietHoursEnd?: string | null;
  motivationFrequency: string;
  lastReminderAt?: Date | null;
}, now: Date) {
  const local = localTimeParts(now, preference.timezone);
  if (local.hhmm !== preference.reminderTime) return false;
  if (preference.lastReminderAt && localDateKey(preference.lastReminderAt, preference.timezone) === local.dateKey) return false;
  if (preference.quietHoursStart && preference.quietHoursEnd && isInQuietHours(local.hhmm, preference.quietHoursStart, preference.quietHoursEnd)) {
    return false;
  }
  if (preference.motivationFrequency === "weekdays" && (local.weekday === 6 || local.weekday === 7)) return false;
  if (preference.motivationFrequency === "weekly" && local.weekday !== 1) return false;
  return true;
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
      hour12: false,
      weekday: "short"
    }).formatToParts(date);
    const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
    const weekday = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(value("weekday")) + 1;
    return {
      dateKey: `${value("year")}-${value("month")}-${value("day")}`,
      hhmm: `${value("hour")}:${value("minute")}`,
      weekday: weekday || 1
    };
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

async function allowTelegramAction(telegramUserId: string) {
  const settings = await getTelegramPolicySettings();
  const now = Date.now();
  const current = telegramRateLimit.get(telegramUserId);
  if (!current || current.resetAt <= now) {
    telegramRateLimit.set(telegramUserId, { count: 1, resetAt: now + settings.rateLimitWindowMs });
    return true;
  }
  if (current.count >= settings.rateLimitMax) return false;
  current.count += 1;
  return true;
}

async function transcribeTelegramAudio(fileId: string, mimeType?: string) {
  const apiKey = getOpenAiApiKey();
  if (!apiKey || !env.TELEGRAM_BOT_TOKEN) return null;
  const fileInfoResponse = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${encodeURIComponent(fileId)}`);
  if (!fileInfoResponse.ok) return null;
  const fileInfo = await fileInfoResponse.json() as { ok?: boolean; result?: { file_path?: string } };
  const filePath = fileInfo.result?.file_path;
  if (!fileInfo.ok || !filePath) return null;
  const fileResponse = await fetch(`https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${filePath}`);
  if (!fileResponse.ok) return null;
  const buffer = Buffer.from(await fileResponse.arrayBuffer());
  if (buffer.length < 16 || buffer.length > 20 * 1024 * 1024) return null;

  const formData = new FormData();
  formData.set("model", env.OPENAI_TRANSCRIPTION_MODEL);
  formData.set("response_format", "json");
  formData.set("file", new Blob([buffer], { type: mimeType || "audio/ogg" }), filePath.split("/").pop() || "voice.ogg");

  const response = await fetch(`${env.OPENAI_BASE_URL.replace(/\/$/, "")}/audio/transcriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData
  });
  if (!response.ok) return null;
  const data = await response.json() as { text?: string };
  return data.text?.trim() || null;
}

function renderTelegramTemplate(template: string, variables: Record<string, string>) {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key) => variables[key] ?? match).trim();
}

async function defaultKeyboard(account?: { telegramUserId?: string; userId?: string | null; sessionId?: string | null } | null) {
  const keyboard = {
    inline_keyboard: [
      [
        { text: "📍 Сегодня", callback_data: "today" },
        { text: "✅ Отметить", callback_data: "checkin" }
      ],
      [
        { text: "📊 Метрики", callback_data: "metrics" }
      ]
    ] as Array<Array<{ text: string; callback_data?: string; url?: string }>>
  };
  const cabinetUrl = await buildTelegramWebLoginUrl(account);
  if (cabinetUrl) {
    keyboard.inline_keyboard.push([
      { text: "Открыть кабинет", url: cabinetUrl }
    ]);
  }
  return keyboard;
}
function helpText() {
  return [
    "Команды ORKEN.LIFE:",
    "/today - показать сегодняшний шаг",
    "/checkin - отметить выполнение",
    "/metrics - показать последние показатели",
    "/insight текст - сохранить инсайт в архив",
    "/orken вопрос - спросить ORKEN с учетом привычек",
    "/stop - отключить Telegram-напоминания"
  ].join("\n");
}
