import { env } from "../env.js";
import { prisma } from "../lib/prisma.js";
import { getHabitAiSettings } from "./habitSettings.js";
import { getOpenAiClient, hasOpenAiClient } from "./openaiClient.js";
import { HABIT_NAVIGATOR_SYSTEM_PROMPT_KEY, renderPromptTemplate, resolveActivePrompt } from "./reportPrompts.js";

export type HabitNavigatorIdentity = {
  userId?: string | null;
  sessionId?: string | null;
  locale?: string;
};

export type HabitNavigatorMessageInput = {
  role: "user" | "assistant";
  text: string;
};

export type HabitNavigatorRequest = {
  identity: HabitNavigatorIdentity;
  programId?: string;
  threadId?: string;
  message: string;
  messages?: HabitNavigatorMessageInput[];
  context?: Record<string, unknown>;
  channel?: "WEB" | "TELEGRAM";
};

export type HabitNavigatorResult = {
  reply: string;
  model: string;
  threadId?: string;
};

const navigatorProgramInclude = {
  enrollments: {
    orderBy: { sortOrder: "asc" as const },
    include: {
      habitDefinition: { select: { slug: true } },
      checkins: { orderBy: { date: "desc" as const } },
      dailyTasks: { orderBy: { dayIndex: "asc" as const } },
      weekSummaries: { orderBy: { createdAt: "desc" as const } }
    }
  },
  insights: {
    orderBy: { createdAt: "desc" as const },
    take: 12,
    include: { enrollment: { select: { title: true } } }
  },
  dailyMetrics: { orderBy: { date: "desc" as const }, take: 8 },
  rewards: { orderBy: { createdAt: "desc" as const }, take: 12 },
  weekSummaries: {
    orderBy: { createdAt: "desc" as const },
    take: 8,
    include: { enrollment: { select: { title: true } } }
  },
  analysis: { select: { reportFree: true, reportFull: true, completedAt: true } }
};

export async function askHabitNavigator(request: HabitNavigatorRequest): Promise<HabitNavigatorResult> {
  const channel = request.channel ?? "WEB";
  const program = await findNavigatorProgram(request.identity, request.programId);
  const thread = await resolveNavigatorThread(request.identity, program?.id ?? null, request.threadId);
  const userText = request.message.trim();

  if (!userText) {
    return {
      reply: "Напиши один вопрос или выбери быстрый сценарий.",
      model: "fallback",
      threadId: thread?.id
    };
  }

  if (thread) {
    await prisma.habitNavigatorMessage.create({
      data: { threadId: thread.id, role: "user", text: userText, channel }
    });
  }

  const memory = program ? buildNavigatorMemory(program) : null;
  const fallback = buildFallbackReply(request.context, memory);

  if (!hasOpenAiClient()) {
    if (thread) {
      await prisma.habitNavigatorMessage.create({
        data: { threadId: thread.id, role: "assistant", text: fallback, model: "fallback", channel }
      });
    }
    return { reply: fallback, model: "fallback", threadId: thread?.id };
  }

  const openai = getOpenAiClient();
  if (!openai) return { reply: fallback, model: "fallback", threadId: thread?.id };

  try {
    const settings = await getHabitAiSettings(env.OPENAI_MODEL);
    const response = await openai.chat.completions.create({
      model: env.OPENAI_MODEL,
      temperature: settings.navigatorTemperature,
      max_tokens: 650,
      messages: [
        { role: "system", content: await buildNavigatorSystemPrompt(request.context, memory, channel, request.identity.locale ?? "ru") },
        ...(request.messages ?? []).slice(-10).map((item) => ({
          role: item.role,
          content: item.text.slice(0, 1200)
        })),
        { role: "user", content: userText.slice(0, 1800) }
      ]
    });
    const reply = response.choices?.[0]?.message?.content?.trim() || fallback;
    if (thread) {
      await prisma.habitNavigatorMessage.create({
        data: { threadId: thread.id, role: "assistant", text: reply, model: env.OPENAI_MODEL, channel }
      });
      await prisma.habitNavigatorThread.update({ where: { id: thread.id }, data: { updatedAt: new Date() } });
    }
    return { reply, model: env.OPENAI_MODEL, threadId: thread?.id };
  } catch {
    if (thread) {
      await prisma.habitNavigatorMessage.create({
        data: { threadId: thread.id, role: "assistant", text: fallback, model: "fallback", channel }
      });
    }
    return { reply: fallback, model: "fallback", threadId: thread?.id };
  }
}

async function findNavigatorProgram(identity: HabitNavigatorIdentity, programId?: string) {
  const accessWhere = {
    OR: [
      ...(identity.userId ? [{ userId: identity.userId }] : []),
      ...(identity.sessionId ? [{ sessionId: identity.sessionId }] : [])
    ]
  };
  if (accessWhere.OR.length === 0) return null;

  if (programId) {
    return prisma.habitProgram.findFirst({
      where: { id: programId, ...accessWhere },
      include: navigatorProgramInclude
    });
  }

  return prisma.habitProgram.findFirst({
    where: { status: "ACTIVE", ...accessWhere },
    orderBy: { createdAt: "desc" },
    include: navigatorProgramInclude
  });
}

async function resolveNavigatorThread(identity: HabitNavigatorIdentity, programId: string | null, threadId?: string) {
  if (threadId) {
    const existing = await prisma.habitNavigatorThread.findFirst({
      where: {
        id: threadId,
        OR: [
          ...(identity.userId ? [{ userId: identity.userId }] : []),
          ...(identity.sessionId ? [{ sessionId: identity.sessionId }] : []),
          ...(programId ? [{ programId }] : [])
        ]
      }
    });
    if (existing) return existing;
  }

  return prisma.habitNavigatorThread.create({
    data: {
      programId: programId ?? undefined,
      userId: identity.userId ?? undefined,
      sessionId: identity.sessionId ?? undefined,
      title: "Pingvi"
    }
  });
}

function buildNavigatorMemory(program: any) {
  const activeEnrollment = findActiveEnrollment(program);
  const activeTasks = activeEnrollment?.dailyTasks ?? [];
  const todayTask = activeTasks.find((task: any) => !task.completedAt) ?? activeTasks[activeTasks.length - 1] ?? null;
  const allCheckins = program.enrollments.flatMap((enrollment: any) => enrollment.checkins ?? []);
  const completedCheckins = allCheckins.filter((checkin: any) => checkin.completed);
  const xp = (program.rewards ?? []).reduce((sum: number, reward: any) => sum + reward.xp, 0);

  return {
    title: program.title,
    source: program.source,
    weakZone: program.weakZone,
    archetype: program.archetype,
    topRole: program.topRole,
    careerAction: program.careerAction,
    finalInsight: program.finalInsight,
    currentCycle: program.currentCycle,
    currentWeek: program.currentWeek,
    currentSortOrder: program.currentSortOrder,
    stats: {
      xp,
      checkinsDone: completedCheckins.length,
      insightsCount: (program.insights ?? []).length,
      streakDays: calculateStreak(completedCheckins.map((checkin: any) => checkin.date))
    },
    activeHabit: activeEnrollment ? {
      title: activeEnrollment.title,
      focus: activeEnrollment.focus,
      essence: activeEnrollment.essence,
      practice: activeEnrollment.practice,
      why: activeEnrollment.why,
      checkinsDone: activeEnrollment.checkins?.filter((checkin: any) => checkin.completed).length ?? 0
    } : null,
    todayTask: todayTask ? {
      title: todayTask.title,
      taskText: todayTask.taskText,
      microAction: todayTask.microAction,
      whyToday: todayTask.whyToday,
      completedAt: todayTask.completedAt
    } : null,
    recentMetrics: (program.dailyMetrics ?? []).slice(0, 5).map((metric: any) => ({
      date: metric.date.toISOString().slice(0, 10),
      energy: metric.energy,
      clarity: metric.clarity,
      stability: metric.stability
    })),
    recentInsights: (program.insights ?? []).slice(0, 8).map((insight: any) => ({
      text: insight.text,
      habitTitle: insight.enrollment?.title ?? null,
      createdAt: insight.createdAt.toISOString()
    })),
    weekSummaries: (program.weekSummaries ?? []).slice(0, 6).map((summary: any) => ({
      cycle: summary.cycle,
      week: summary.week,
      habitTitle: summary.enrollment?.title ?? null,
      completionMode: summary.completionMode,
      checkinsDone: summary.checkinsDone,
      summary: summary.summary,
      pingviFeedback: summary.pingviFeedback,
      createdAt: summary.createdAt.toISOString()
    })),
    latestReport: summarizeReport(program.analysis)
  };
}

function findActiveEnrollment(program: any) {
  const currentSortOrder = Math.min(((program.currentCycle - 1) * 12) + program.currentWeek, program.enrollments.length || 1);
  return program.enrollments.find((enrollment: any) => enrollment.sortOrder === currentSortOrder)
    ?? program.enrollments.find((enrollment: any) => enrollment.status === "ACTIVE")
    ?? program.enrollments[0]
    ?? null;
}

function summarizeReport(analysis: any) {
  if (!analysis) return null;
  const full = analysis.reportFull as any;
  const free = analysis.reportFree as any;
  return {
    completedAt: analysis.completedAt?.toISOString?.() ?? null,
    summary: free?.summary ?? null,
    topRole: full?.top_role?.title ?? null,
    finalInsight: full?.final_insight ?? null
  };
}

async function buildNavigatorSystemPrompt(context: Record<string, unknown> | undefined, memory: ReturnType<typeof buildNavigatorMemory> | null, channel: string, locale: string) {
  const prompt = await resolveActivePrompt(HABIT_NAVIGATOR_SYSTEM_PROMPT_KEY, locale);
  return renderPromptTemplate(prompt.content, {
    channel,
    frontendContext: clipText(JSON.stringify(context ?? {}), 1600),
    backendContext: memory ? formatNavigatorMemory(memory) : "No linked habits program is available."
  });
}

function formatNavigatorMemory(memory: ReturnType<typeof buildNavigatorMemory>) {
  const lines = [
    `Program: ${memory.title}`,
    `Source: ${memory.source}`,
    `Stats: cycle ${memory.currentCycle}, week ${memory.currentWeek}, ${memory.stats.checkinsDone} checkins, ${memory.stats.insightsCount} insights, ${memory.stats.xp} XP, streak ${memory.stats.streakDays}`,
    `Profile: weakZone=${memory.weakZone ?? "unknown"}, archetype=${memory.archetype ?? "unknown"}, topRole=${memory.topRole ?? "unknown"}`
  ];
  if (memory.activeHabit) {
    lines.push(
      "Active habit:",
      `- ${memory.activeHabit.title}; focus: ${memory.activeHabit.focus}; practice: ${memory.activeHabit.practice}; checkins: ${memory.activeHabit.checkinsDone}/7`
    );
  }
  if (memory.todayTask) {
    lines.push(
      "Backend daily task:",
      `- ${memory.todayTask.title}: ${memory.todayTask.microAction}. ${memory.todayTask.whyToday}`
    );
  }
  if (memory.recentMetrics.length > 0) {
    lines.push("Recent metrics:", ...memory.recentMetrics.map((metric: { date: string; energy: number; clarity: number; stability: number }) => (
      `- ${metric.date}: energy ${metric.energy}/10, clarity ${metric.clarity}/10, stability ${metric.stability}/10`
    )));
  }
  if (memory.recentInsights.length > 0) {
    lines.push("Recent insights:", ...memory.recentInsights.map((insight: { createdAt: string; habitTitle?: string | null; text: string }) => (
      `- ${insight.createdAt}${insight.habitTitle ? ` (${insight.habitTitle})` : ""}: ${clipText(insight.text, 420)}`
    )));
  }
  if (memory.weekSummaries.length > 0) {
    lines.push("Backend week summaries:", ...memory.weekSummaries.map((summary: { cycle: number; week: number; completionMode: string; checkinsDone: number; summary: string }) => (
      `- Cycle ${summary.cycle}, week ${summary.week}, ${summary.completionMode}, ${summary.checkinsDone}/7: ${clipText(summary.summary, 420)}`
    )));
  }
  if (memory.latestReport) {
    lines.push(
      "Latest report:",
      `- role: ${memory.latestReport.topRole ?? "unknown"}; insight: ${clipText(memory.latestReport.finalInsight ?? memory.latestReport.summary ?? "", 420)}`
    );
  }
  return lines.join("\n");
}

function buildFallbackReply(context: Record<string, unknown> | undefined, memory: ReturnType<typeof buildNavigatorMemory> | null) {
  const mode = typeof context?.mode === "string" ? context.mode : "chat";
  const habit = memory?.activeHabit?.title;
  if (mode === "state") {
    return `Я вижу текущую привычку${habit ? ` "${habit}"` : ""}. Начни с одного маленького шага: оцени состояние, выбери минимальное действие и отметь его без давления.`;
  }
  if (memory?.todayTask) {
    return `На сегодня у тебя есть шаг: ${memory.todayTask.microAction}. Сделай минимальную версию и потом отметь день.`;
  }
  return `Я рядом. Задай один вопрос про текущую привычку, состояние или следующий шаг, и я отвечу по данным, которые есть в кабинете.`;
}

function clipText(value: string, max = 700) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function calculateStreak(dates: Date[]) {
  const completed = new Set(dates.map((date) => date.toISOString().slice(0, 10)));
  let cursor = new Date();
  let streak = 0;
  while (completed.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}
