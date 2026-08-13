import { createHmac, randomBytes } from "node:crypto";
import type {
  DemoAccessCodeCreated,
  DemoAccessCodeSummary,
  DemoCoachClient,
  DemoMetricPoint,
  DemoWorkspaceResponse
} from "@levelup/contracts";
import { env } from "../env.js";
import { prisma } from "../lib/prisma.js";

export const DEMO_SESSION_COOKIE = "orken_demo_session";
export const DEMO_SESSION_TTL_SECONDS = 8 * 60 * 60;

function demoSecret() {
  return env.ADMIN_SESSION_SECRET || env.JWT_ACCESS_SECRET;
}

export function normalizeDemoAccessCode(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

export function hashDemoValue(purpose: "code" | "session", value: string) {
  return createHmac("sha256", demoSecret())
    .update(`orken-demo:${purpose}:${value}`)
    .digest("hex");
}

function generateReadableCode() {
  const raw = randomBytes(8).toString("hex").toUpperCase();
  return `ORKEN-DEMO-${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}`;
}

function toCodeSummary(record: {
  id: string;
  label: string;
  codeHint: string;
  active: boolean;
  expiresAt: Date | null;
  maxSessions: number | null;
  sessionsCreated: number;
  createdAt: Date;
  updatedAt: Date;
}, activeSessions: number): DemoAccessCodeSummary {
  return {
    id: record.id,
    label: record.label,
    codeHint: record.codeHint,
    active: record.active,
    expiresAt: record.expiresAt?.toISOString() ?? null,
    maxSessions: record.maxSessions,
    sessionsCreated: record.sessionsCreated,
    activeSessions,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
}

export async function listDemoAccessCodes(): Promise<DemoAccessCodeSummary[]> {
  const now = new Date();
  const records = await prisma.demoAccessCode.findMany({
    orderBy: [{ active: "desc" }, { createdAt: "desc" }]
  });
  const activeCounts = await Promise.all(records.map((record) => prisma.demoSession.count({
    where: {
      accessCodeId: record.id,
      revokedAt: null,
      expiresAt: { gt: now }
    }
  })));
  return records.map((record, index) => toCodeSummary(record, activeCounts[index] ?? 0));
}

export async function createDemoAccessCode(input: {
  label: string;
  expiresAt?: Date | null;
  maxSessions?: number | null;
}): Promise<DemoAccessCodeCreated> {
  const code = generateReadableCode();
  const normalized = normalizeDemoAccessCode(code);
  const record = await prisma.demoAccessCode.create({
    data: {
      label: input.label.trim(),
      codeHash: hashDemoValue("code", normalized),
      codeHint: `ORKEN-DEMO-****-${normalized.slice(-4)}`,
      expiresAt: input.expiresAt ?? null,
      maxSessions: input.maxSessions ?? null
    }
  });
  return { accessCode: toCodeSummary(record, 0), code };
}

export async function setDemoAccessCodeActive(id: string, active: boolean) {
  const now = new Date();
  const record = await prisma.$transaction(async (tx) => {
    const updated = await tx.demoAccessCode.update({ where: { id }, data: { active } });
    if (!active) {
      await tx.demoSession.updateMany({
        where: { accessCodeId: id, revokedAt: null },
        data: { revokedAt: now }
      });
    }
    return updated;
  });
  return toCodeSummary(record, 0);
}

export async function redeemDemoAccessCode(code: string) {
  const now = new Date();
  const normalized = normalizeDemoAccessCode(code);
  const accessCode = await prisma.demoAccessCode.findUnique({
    where: { codeHash: hashDemoValue("code", normalized) }
  });
  if (!accessCode || !accessCode.active || (accessCode.expiresAt && accessCode.expiresAt <= now)) {
    return null;
  }

  const sessionToken = randomBytes(32).toString("base64url");
  const requestedExpiry = new Date(now.getTime() + DEMO_SESSION_TTL_SECONDS * 1000);
  const expiresAt = accessCode.expiresAt && accessCode.expiresAt < requestedExpiry
    ? accessCode.expiresAt
    : requestedExpiry;

  const created = await prisma.$transaction(async (tx) => {
    if (accessCode.maxSessions !== null) {
      const claimed = await tx.demoAccessCode.updateMany({
        where: {
          id: accessCode.id,
          active: true,
          sessionsCreated: { lt: accessCode.maxSessions }
        },
        data: { sessionsCreated: { increment: 1 } }
      });
      if (claimed.count !== 1) return null;
    } else {
      await tx.demoAccessCode.update({
        where: { id: accessCode.id },
        data: { sessionsCreated: { increment: 1 } }
      });
    }

    return tx.demoSession.create({
      data: {
        accessCodeId: accessCode.id,
        tokenHash: hashDemoValue("session", sessionToken),
        expiresAt
      }
    });
  });
  if (!created) return null;
  return {
    token: sessionToken,
    session: {
      active: true as const,
      label: accessCode.label,
      expiresAt: created.expiresAt.toISOString()
    }
  };
}

export async function getDemoSession(token: string | undefined) {
  if (!token) return null;
  const now = new Date();
  const session = await prisma.demoSession.findUnique({
    where: { tokenHash: hashDemoValue("session", token) },
    include: { accessCode: true }
  });
  if (
    !session ||
    session.revokedAt ||
    session.expiresAt <= now ||
    !session.accessCode.active ||
    (session.accessCode.expiresAt && session.accessCode.expiresAt <= now)
  ) return null;

  if (now.getTime() - session.lastSeenAt.getTime() > 5 * 60 * 1000) {
    void prisma.demoSession.update({ where: { id: session.id }, data: { lastSeenAt: now } });
  }
  return {
    id: session.id,
    accessCodeId: session.accessCodeId,
    response: {
      active: true as const,
      label: session.accessCode.label,
      expiresAt: session.expiresAt.toISOString()
    }
  };
}

export async function revokeDemoSession(token: string | undefined) {
  if (!token) return;
  await prisma.demoSession.updateMany({
    where: { tokenHash: hashDemoValue("session", token), revokedAt: null },
    data: { revokedAt: new Date() }
  });
}

function isoDate(daysFromToday: number, hour = 9, minute = 0) {
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  date.setDate(date.getDate() + daysFromToday);
  return date.toISOString();
}

function metricSeries(): DemoMetricPoint[] {
  const values = [
    [5, 6, 5], [6, 6, 5], [5, 7, 6], [7, 7, 6], [6, 7, 7], [7, 8, 7], [8, 8, 7],
    [7, 8, 8], [8, 7, 8], [8, 8, 8], [7, 8, 8], [8, 9, 8], [8, 8, 9], [9, 9, 8]
  ];
  return values.map(([energy, clarity, stability], index) => ({
    date: isoDate(index - values.length + 1).slice(0, 10),
    energy,
    clarity,
    stability
  }));
}

function demoClients(): DemoCoachClient[] {
  return [
    { id: "demo-client-anna", name: "Анна Смирнова", initials: "АС", status: "ACTIVE", todayCompleted: true, weeklyAverage: 8.2, trend: 0.8, lastCheckin: isoDate(0, 8, 40), program: "Карьерный фокус" },
    { id: "demo-client-maria", name: "Мария Ким", initials: "МК", status: "ATTENTION", todayCompleted: false, weeklyAverage: 4.6, trend: -1.4, lastCheckin: isoDate(-1, 20, 10), program: "Восстановление ресурса" },
    { id: "demo-client-daniyar", name: "Данияр Садыков", initials: "ДС", status: "ACTIVE", todayCompleted: true, weeklyAverage: 7.4, trend: 0.3, lastCheckin: isoDate(0, 7, 55), program: "Лидерский трек" },
    { id: "demo-client-elena", name: "Елена Волкова", initials: "ЕВ", status: "ACTIVE", todayCompleted: true, weeklyAverage: 7.9, trend: 0.6, lastCheckin: isoDate(0, 9, 15), program: "Баланс и устойчивость" },
    { id: "demo-client-roman", name: "Роман Алиев", initials: "РА", status: "PAUSED", todayCompleted: false, weeklyAverage: 6.1, trend: -0.1, lastCheckin: isoDate(-3, 18, 30), program: "Новый профессиональный вектор" },
    { id: "demo-client-aliya", name: "Алия Нур", initials: "АН", status: "ACTIVE", todayCompleted: false, weeklyAverage: 7.0, trend: 0.4, lastCheckin: isoDate(-1, 21, 0), program: "Фокус и энергия" }
  ];
}

export function buildDemoWorkspace(): DemoWorkspaceResponse {
  const metrics = metricSeries();
  const clients = demoClients();
  const feedback = [
    { id: "feedback-1", date: isoDate(-1, 16, 30), text: "На этой неделе фокус не на скорости, а на устойчивом ритме. Оставь одно главное действие на утро и сверяй состояние вечером.", status: "READ" as const },
    { id: "feedback-2", date: isoDate(-4, 12, 0), text: "Рост ясности уже заметен. Перед следующей сессией запиши три решения, которые стало легче принимать.", status: "READ" as const }
  ];
  const assignments = [
    { id: "assignment-1", title: "Сформулировать один приоритет на ближайшие 30 дней", dueAt: isoDate(2, 18, 0), completed: false },
    { id: "assignment-2", title: "Отметить три ситуации, которые дают энергию", dueAt: isoDate(-2, 18, 0), completed: true }
  ];
  const insights = [
    { id: "insight-1", date: isoDate(0, 9, 10), text: "Когда начинаю день без сообщений, быстрее понимаю, что действительно важно.", energy: 9 },
    { id: "insight-2", date: isoDate(-2, 20, 40), text: "Сложный разговор оказался легче после того, как заранее записала желаемый результат.", energy: 8 },
    { id: "insight-3", date: isoDate(-6, 19, 20), text: "Усталость усиливается, когда пытаюсь завершить все задачи одновременно.", energy: 6 }
  ];
  const habits = [
    { id: "habit-1", title: "Один приоритет до 10:00", completionRate: 86, streak: 6, assignedByCoach: true },
    { id: "habit-2", title: "Вечерняя сверка состояния", completionRate: 71, streak: 4, assignedByCoach: false },
    { id: "habit-3", title: "10 минут без экрана перед сном", completionRate: 64, streak: 3, assignedByCoach: true }
  ];

  return {
    synthetic: true,
    generatedAt: new Date().toISOString(),
    coach: {
      profile: { name: "Алексей Морозов", specialty: "Карьерный коуч", city: "Алматы" },
      stats: { activeClients: 5, completedToday: 3, needsAttention: 1, monthlyRevenue: 780 },
      clients,
      selectedClient: { client: clients[0], metrics, insights, feedback, assignments, habits },
      schedule: {
        timezone: "Asia/Almaty",
        upcoming: [
          { id: "meeting-1", clientName: "Анна Смирнова", startsAt: isoDate(1, 10, 0), durationMinutes: 60, type: "Коуч-сессия" },
          { id: "meeting-2", clientName: "Данияр Садыков", startsAt: isoDate(1, 15, 30), durationMinutes: 45, type: "Сверка прогресса" },
          { id: "meeting-3", clientName: "Елена Волкова", startsAt: isoDate(3, 12, 0), durationMinutes: 60, type: "Коуч-сессия" }
        ],
        availability: [
          { weekday: "Понедельник", hours: "10:00-18:00" },
          { weekday: "Среда", hours: "10:00-18:00" },
          { weekday: "Пятница", hours: "09:00-15:00" }
        ]
      },
      plan: {
        name: "Команда 15",
        includedClients: 15,
        usedClients: 6,
        monthlyAmount: 109,
        currency: "USD",
        renewsAt: isoDate(18),
        options: [
          { name: "Старт 5", includedClients: 5, monthlyAmount: 39 },
          { name: "Команда 15", includedClients: 15, monthlyAmount: 109 },
          { name: "Практика 30", includedClients: 30, monthlyAmount: 199 },
          { name: "Больше 30", includedClients: null, monthlyAmount: null }
        ]
      }
    },
    client: {
      profile: { name: "Анна Смирнова", level: "Уверенный ритм", xp: 1240, streak: 6 },
      metrics,
      habits: habits.map((habit, index) => ({ ...habit, completedToday: index < 2 })),
      coach: { name: "Алексей Морозов", specialty: "Карьерный коуч", program: "Карьерный фокус", daysLeft: 24 },
      feedback,
      assignments,
      insights
    }
  };
}
