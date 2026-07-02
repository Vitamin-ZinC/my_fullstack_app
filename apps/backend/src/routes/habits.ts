import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { env } from "../env.js";
import { requireAnalysisAccess, requireSession, type SessionContext } from "../lib/auth.js";
import { prisma } from "../lib/prisma.js";
import { getOpenAiClient, hasOpenAiClient } from "../services/openaiClient.js";

const navigatorMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string().min(1).max(2000)
});

const navigatorContextSchema = z.object({
  name: z.string().max(120).optional(),
  mode: z.enum(["state", "path", "chat"]).default("chat"),
  cycle: z.string().max(200).optional(),
  week: z.number().int().min(1).max(52).optional(),
  habit: z.string().max(300).optional(),
  weakZone: z.string().max(80).optional(),
  topRole: z.string().max(200).optional(),
  energy: z.number().int().min(0).max(10).optional(),
  clarity: z.number().int().min(0).max(10).optional(),
  stability: z.number().int().min(0).max(10).optional(),
  streakDays: z.number().int().min(0).max(5000).optional(),
  careerAction: z.string().max(1000).optional(),
  recentInsight: z.string().max(1000).optional()
});

const navigatorRequestSchema = z.object({
  message: z.string().min(1).max(2000),
  messages: z.array(navigatorMessageSchema).max(12).default([]),
  context: navigatorContextSchema.default({ mode: "chat" }),
  programId: z.string().optional(),
  threadId: z.string().optional()
});

const metricSchema = z.object({
  programId: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  energy: z.number().int().min(0).max(10),
  clarity: z.number().int().min(0).max(10),
  stability: z.number().int().min(0).max(10)
});

const checkinSchema = z.object({
  programId: z.string(),
  enrollmentId: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  completed: z.boolean().default(true),
  note: z.string().trim().max(1000).optional(),
  energy: z.number().int().min(0).max(10).optional(),
  clarity: z.number().int().min(0).max(10).optional(),
  stability: z.number().int().min(0).max(10).optional()
});

const insightSchema = z.object({
  programId: z.string(),
  enrollmentId: z.string().optional(),
  text: z.string().trim().min(2).max(2000),
  source: z.string().trim().max(40).default("user")
});

type NavigatorContext = z.infer<typeof navigatorContextSchema>;

const DEFAULT_HABITS = [
  {
    slug: "sleep-foundation",
    cycle: 1,
    week: 1,
    title: "Сон как фундамент",
    focus: "Вернуть базовый ресурс без давления на продуктивность",
    essence: "Устойчивость начинается с восстановления, а не с новой нагрузки.",
    practice: "Выбери один вечерний якорь на 10 минут: экран в сторону, вода, короткая запись мыслей.",
    why: "Когда ресурс стабилен, решения по работе становятся спокойнее и точнее.",
    book: "Атомные привычки — Джеймс Клир",
    zone: "resource"
  },
  {
    slug: "morning-focus",
    cycle: 1,
    week: 2,
    title: "Утренний фокус",
    focus: "Выбрать одно главное действие дня",
    essence: "Фокус снижает шум и помогает видеть реальный прогресс.",
    practice: "До сообщений сформулируй одну задачу, которая продвинет тебя к профессиональному вектору.",
    why: "Один ясный шаг лучше длинного списка, который создает ощущение долга.",
    book: "Эссенциализм — Грег МакКеон",
    zone: "clarity"
  },
  {
    slug: "energy-log",
    cycle: 1,
    week: 3,
    title: "Лог энергии",
    focus: "Понять, какие задачи дают и забирают ресурс",
    essence: "Икигай проявляется там, где энергия не только тратится, но и возвращается.",
    practice: "После одной рабочей задачи отметь: +, 0 или - по энергии и коротко почему.",
    why: "Через неделю появится карта задач, на которую можно опереться без догадок.",
    book: "Designing Your Life — Билл Бернетт и Дэйв Эванс",
    zone: "passion"
  },
  {
    slug: "value-packaging",
    cycle: 1,
    week: 4,
    title: "Упаковка ценности",
    focus: "Сформулировать, за какой конкретный результат тебе могут платить",
    essence: "Потенциал становится стратегией, когда его можно объяснить конкретному человеку.",
    practice: "Запиши одну фразу: кому ты помогаешь, с какой болью и к какому результату.",
    why: "Рынок реагирует не на общий талант, а на понятное обещание результата.",
    book: "Obviously Awesome — Эйприл Данфорд",
    zone: "vocation"
  },
  {
    slug: "small-proof",
    cycle: 1,
    week: 5,
    title: "Малое доказательство",
    focus: "Проверить идею маленьким действием",
    essence: "Уверенность растет от контакта с реальностью, а не от идеального плана.",
    practice: "Покажи формулировку ценности одному человеку и спроси, что в ней понятно и что нет.",
    why: "Обратная связь помогает отличить живой вектор от красивой гипотезы.",
    book: "Lean Startup — Эрик Рис",
    zone: "profession"
  },
  {
    slug: "conversation-bridge",
    cycle: 1,
    week: 6,
    title: "Разговор без продажи",
    focus: "Услышать язык людей, которым может быть полезна твоя роль",
    essence: "Сильный профессиональный вектор говорит словами реальных людей.",
    practice: "Проведи 15-минутный разговор и зафиксируй 3 фразы собеседника дословно.",
    why: "Так появляется эмпатия к рынку без ощущения, что надо срочно продавать.",
    book: "The Mom Test — Роб Фитцпатрик",
    zone: "mission"
  },
  {
    slug: "portfolio-signal",
    cycle: 1,
    week: 7,
    title: "Сигнал портфолио",
    focus: "Собрать один видимый артефакт компетенции",
    essence: "Компетенция становится заметной, когда у нее есть форма.",
    practice: "Опиши один кейс, схему, чек-лист или мини-разбор, который показывает твой способ мышления.",
    why: "Даже небольшой артефакт снижает разрыв между внутренним потенциалом и внешним доверием.",
    book: "Show Your Work — Остин Клеон",
    zone: "profession"
  },
  {
    slug: "weekly-review",
    cycle: 1,
    week: 8,
    title: "Мягкий обзор недели",
    focus: "Собрать выводы без самокритики",
    essence: "Ритм держится лучше, когда обзор помогает, а не оценивает.",
    practice: "Ответь на три вопроса: что дало ресурс, что прояснилось, что стоит упростить.",
    why: "Так программа остается живой и адаптируется под реальную неделю.",
    book: "Getting Things Done — Дэвид Аллен",
    zone: "stability"
  },
  {
    slug: "skill-rep",
    cycle: 1,
    week: 9,
    title: "Повтор ключевого навыка",
    focus: "Укрепить один навык, который поддерживает выбранный вектор",
    essence: "Рост чаще похож на короткие повторения, чем на редкие рывки.",
    practice: "Выдели 20 минут на один повтор: объяснить, написать, показать или посчитать.",
    why: "Малые повторы создают ощущение владения без перегруза.",
    book: "Peak — Андерс Эрикссон",
    zone: "profession"
  },
  {
    slug: "boundary-reset",
    cycle: 1,
    week: 10,
    title: "Граница нагрузки",
    focus: "Найти один лишний источник напряжения",
    essence: "Икигай не раскрывается, если вся энергия уходит на компенсацию перегруза.",
    practice: "Выбери одно обязательство, которое можно уменьшить, перенести или сказать по нему честное нет.",
    why: "Свободный ресурс нужен не меньше, чем мотивация.",
    book: "Essentialism — Грег МакКеон",
    zone: "resource"
  },
  {
    slug: "offer-draft",
    cycle: 1,
    week: 11,
    title: "Черновик предложения",
    focus: "Собрать первый вариант профессионального оффера",
    essence: "Черновик делает направление обсуждаемым и улучшаемым.",
    practice: "Собери 4 строки: для кого, какая проблема, какой результат, почему тебе можно доверять.",
    why: "Это переводит отчет из идеи в рабочий контур.",
    book: "Building a StoryBrand — Дональд Миллер",
    zone: "vocation"
  },
  {
    slug: "integration-day",
    cycle: 1,
    week: 12,
    title: "День интеграции",
    focus: "Собрать целостный вывод по циклу",
    essence: "Смысл появляется, когда отдельные наблюдения связываются в картину.",
    practice: "Запиши один абзац: что я понял о себе, о рынке и о следующем шаге.",
    why: "Так программа не превращается в список галочек, а сохраняет личный смысл.",
    book: "The Practice — Сет Годин",
    zone: "ikigai"
  }
] as const;

export async function habitsRoutes(app: FastifyInstance) {
  app.get("/api/habits/me", async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;

    const [program, latestReport] = await Promise.all([
      findActiveProgram(session),
      findLatestReport(session)
    ]);

    return {
      program: program ? serializeProgram(program) : null,
      latestReport
    };
  });

  app.post("/api/habits/enroll-from-report/:analysisId", async (request, reply) => {
    const params = z.object({ analysisId: z.string() }).parse(request.params);
    const access = await requireAnalysisAccess(request, reply, params.analysisId);
    if (!access) return;
    if (access.analysis.status !== "DONE") return reply.code(409).send({ error: "Analysis is not ready" });

    const existing = await prisma.habitProgram.findFirst({
      where: {
        analysisId: access.analysis.id,
        status: "ACTIVE",
        OR: access.session.userId
          ? [{ userId: access.session.userId }, { sessionId: access.session.id }]
          : [{ sessionId: access.session.id }]
      },
      include: programInclude()
    });
    if (existing) return { program: serializeProgram(existing) };

    await ensureHabitDefinitions();
    const definitions = await prisma.habitDefinition.findMany({
      where: { active: true },
      orderBy: [{ cycle: "asc" }, { week: "asc" }]
    });

    const profile = buildProgramProfile(access.analysis.reportFull ?? access.analysis.reportFree);
    const program = await prisma.habitProgram.create({
      data: {
        userId: access.session.userId,
        sessionId: access.session.id,
        analysisId: access.analysis.id,
        source: "analysis-report",
        title: profile.title,
        weakZone: profile.weakZone,
        archetype: profile.archetype,
        topRole: profile.topRole,
        careerAction: profile.careerAction,
        finalInsight: profile.finalInsight,
        profile: profile.raw,
        enrollments: {
          create: definitions.map((definition, index) => ({
            habitDefinitionId: definition.id,
            title: personalizeHabitTitle(definition.title, profile.weakZone, index),
            focus: definition.focus,
            essence: definition.essence,
            practice: definition.practice,
            why: definition.why,
            book: definition.book,
            zone: definition.zone,
            week: definition.week,
            sortOrder: index + 1
          }))
        },
        insights: profile.finalInsight
          ? {
            create: [{
              text: `Стартовый вывод из диагностики: ${profile.finalInsight}`,
              source: "analysis-report"
            }]
          }
          : undefined,
        rewards: {
          create: [{
            type: "program_started",
            label: "Программа привычек сохранена в кабинете",
            xp: 25
          }]
        }
      },
      include: programInclude()
    });

    await prisma.analyticsEvent.create({
      data: {
        name: "habit_program_started",
        locale: access.analysis.locale,
        sessionId: access.session.id,
        userId: access.session.userId,
        analysisId: access.analysis.id,
        properties: { programId: program.id, source: "analysis-report" }
      }
    });

    return { program: serializeProgram(program) };
  });

  app.post("/api/habits/metrics", async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    const body = metricSchema.parse(request.body ?? {});
    const program = await requireHabitProgram(session, reply, body.programId);
    if (!program) return;
    const date = dayFromInput(body.date);

    await prisma.habitDailyMetric.upsert({
      where: { programId_date: { programId: body.programId, date } },
      update: { energy: body.energy, clarity: body.clarity, stability: body.stability },
      create: { programId: body.programId, date, energy: body.energy, clarity: body.clarity, stability: body.stability }
    });

    return { program: serializeProgram(await loadProgram(body.programId)) };
  });

  app.post("/api/habits/checkins", async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    const body = checkinSchema.parse(request.body ?? {});
    const program = await requireHabitProgram(session, reply, body.programId);
    if (!program) return;

    const enrollment = await prisma.habitEnrollment.findFirst({
      where: { id: body.enrollmentId, programId: body.programId }
    });
    if (!enrollment) return reply.code(404).send({ error: "Habit enrollment not found" });

    const date = dayFromInput(body.date);
    const existing = await prisma.habitCheckin.findUnique({
      where: { enrollmentId_date: { enrollmentId: body.enrollmentId, date } }
    });

    await prisma.habitCheckin.upsert({
      where: { enrollmentId_date: { enrollmentId: body.enrollmentId, date } },
      update: {
        completed: body.completed,
        note: body.note,
        energy: body.energy,
        clarity: body.clarity,
        stability: body.stability
      },
      create: {
        programId: body.programId,
        enrollmentId: body.enrollmentId,
        date,
        completed: body.completed,
        note: body.note,
        energy: body.energy,
        clarity: body.clarity,
        stability: body.stability
      }
    });

    if (body.energy !== undefined && body.clarity !== undefined && body.stability !== undefined) {
      await prisma.habitDailyMetric.upsert({
        where: { programId_date: { programId: body.programId, date } },
        update: { energy: body.energy, clarity: body.clarity, stability: body.stability },
        create: { programId: body.programId, date, energy: body.energy, clarity: body.clarity, stability: body.stability }
      });
    }

    if (body.completed && !existing?.completed) {
      await prisma.habitRewardEvent.create({
        data: {
          programId: body.programId,
          type: "daily_checkin",
          label: `Мягкий шаг: ${enrollment.title}`,
          xp: 10
        }
      });
    }

    return { program: serializeProgram(await loadProgram(body.programId)) };
  });

  app.post("/api/habits/insights", async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    const body = insightSchema.parse(request.body ?? {});
    const program = await requireHabitProgram(session, reply, body.programId);
    if (!program) return;

    if (body.enrollmentId) {
      const enrollment = await prisma.habitEnrollment.findFirst({
        where: { id: body.enrollmentId, programId: body.programId }
      });
      if (!enrollment) return reply.code(404).send({ error: "Habit enrollment not found" });
    }

    await prisma.habitInsight.create({
      data: {
        programId: body.programId,
        enrollmentId: body.enrollmentId,
        text: body.text,
        source: body.source
      }
    });
    await prisma.habitRewardEvent.create({
      data: {
        programId: body.programId,
        type: "insight_saved",
        label: "Инсайт сохранен в архив",
        xp: 15
      }
    });

    return { program: serializeProgram(await loadProgram(body.programId)) };
  });

  app.post("/api/habits/navigator", async (request, reply) => {
    const session = await requireSession(request, reply);
    if (!session) return;
    const body = navigatorRequestSchema.parse(request.body ?? {});
    const program = body.programId ? await requireHabitProgram(session, reply, body.programId) : null;
    if (body.programId && !program) return;

    const thread = await getOrCreateNavigatorThread(session, body.threadId, body.programId, body.message);
    await prisma.habitNavigatorMessage.create({
      data: { threadId: thread.id, role: "user", text: body.message }
    });

    if (!hasOpenAiClient()) {
      const fallback = buildFallbackReply(body.context);
      await prisma.habitNavigatorMessage.create({
        data: { threadId: thread.id, role: "assistant", text: fallback, model: "local-fallback" }
      });
      return { reply: fallback, model: "local-fallback", threadId: thread.id };
    }

    const openai = getOpenAiClient();
    if (!openai) {
      const fallback = buildFallbackReply(body.context);
      await prisma.habitNavigatorMessage.create({
        data: { threadId: thread.id, role: "assistant", text: fallback, model: "local-fallback" }
      });
      return { reply: fallback, model: "local-fallback", threadId: thread.id };
    }

    try {
      const response = await openai.chat.completions.create({
        model: env.OPENAI_MODEL,
        temperature: 0.45,
        max_tokens: 600,
        messages: [
          { role: "system", content: buildNavigatorSystemPrompt(body.context) },
          ...body.messages.slice(-10).map((message) => ({
            role: message.role,
            content: message.text
          })),
          { role: "user", content: body.message }
        ]
      });

      const answer = response.choices?.[0]?.message?.content?.trim() || buildFallbackReply(body.context);
      await prisma.habitNavigatorMessage.create({
        data: { threadId: thread.id, role: "assistant", text: answer, model: env.OPENAI_MODEL }
      });
      return {
        reply: answer,
        model: env.OPENAI_MODEL,
        threadId: thread.id
      };
    } catch (error) {
      request.log.warn({
        error: error instanceof Error ? error.message.slice(0, 240) : String(error).slice(0, 240)
      }, "OpenAI-compatible habits navigator failed");
      const fallback = buildFallbackReply(body.context);
      await prisma.habitNavigatorMessage.create({
        data: { threadId: thread.id, role: "assistant", text: fallback, model: "local-fallback" }
      });
      return { reply: fallback, model: "local-fallback", threadId: thread.id };
    }
  });
}

function programInclude() {
  return {
    enrollments: {
      orderBy: { sortOrder: "asc" as const },
      include: { checkins: { orderBy: { date: "desc" as const } } }
    },
    insights: {
      orderBy: { createdAt: "desc" as const },
      include: { enrollment: { select: { title: true } } }
    },
    dailyMetrics: { orderBy: { date: "desc" as const }, take: 14 },
    rewards: { orderBy: { createdAt: "desc" as const } }
  };
}

function habitProgramWhere(session: SessionContext) {
  return {
    OR: [
      { sessionId: session.id },
      ...(session.userId ? [{ userId: session.userId }] : [])
    ]
  };
}

async function findActiveProgram(session: SessionContext) {
  return prisma.habitProgram.findFirst({
    where: { status: "ACTIVE", ...habitProgramWhere(session) },
    orderBy: { createdAt: "desc" },
    include: programInclude()
  });
}

async function findLatestReport(session: SessionContext) {
  const analysis = await prisma.analysis.findFirst({
    where: { status: "DONE", ...habitProgramWhere(session) },
    orderBy: { completedAt: "desc" },
    select: { id: true, completedAt: true, reportFree: true, reportFull: true }
  });
  if (!analysis) return null;
  const preview = asReportPreview(analysis.reportFull) ?? asReportPreview(analysis.reportFree);
  return {
    analysisId: analysis.id,
    profession: preview?.profession ?? null,
    summary: preview?.summary ?? null,
    completedAt: analysis.completedAt?.toISOString() ?? null
  };
}

async function requireHabitProgram(session: SessionContext, reply: { code: (statusCode: number) => { send: (payload: unknown) => void } }, programId: string) {
  const program = await prisma.habitProgram.findFirst({
    where: { id: programId, ...habitProgramWhere(session) },
    select: { id: true }
  });
  if (!program) {
    reply.code(404).send({ error: "Habit program not found" });
    return null;
  }
  return program;
}

async function loadProgram(programId: string) {
  return prisma.habitProgram.findUniqueOrThrow({
    where: { id: programId },
    include: programInclude()
  });
}

async function ensureHabitDefinitions() {
  await Promise.all(DEFAULT_HABITS.map((habit) => prisma.habitDefinition.upsert({
    where: { slug: habit.slug },
    update: { ...habit, active: true },
    create: habit
  })));
}

function serializeProgram(program: any) {
  const enrollments = program.enrollments.map((enrollment: any) => {
    const doneCheckins = enrollment.checkins.filter((checkin: any) => checkin.completed);
    return {
      id: enrollment.id,
      week: enrollment.week,
      title: enrollment.title,
      focus: enrollment.focus,
      essence: enrollment.essence,
      practice: enrollment.practice,
      why: enrollment.why,
      book: enrollment.book,
      zone: enrollment.zone,
      status: enrollment.status,
      sortOrder: enrollment.sortOrder,
      checkinsDone: doneCheckins.length,
      lastCheckinAt: doneCheckins[0]?.date?.toISOString() ?? null
    };
  });
  const checkins = program.enrollments.flatMap((enrollment: any) => enrollment.checkins);
  const completedCheckins = checkins.filter((checkin: any) => checkin.completed);
  const currentWeek = Math.min(Math.max(1, Math.ceil(daysBetween(program.startedAt, new Date()) / 7)), enrollments.length || 1);
  const activeEnrollment = enrollments.find((enrollment: any) => enrollment.sortOrder === currentWeek)
    ?? enrollments.find((enrollment: any) => enrollment.status === "ACTIVE")
    ?? enrollments[0]
    ?? null;

  return {
    id: program.id,
    status: program.status,
    source: program.source,
    title: program.title,
    weakZone: program.weakZone,
    archetype: program.archetype,
    topRole: program.topRole,
    careerAction: program.careerAction,
    finalInsight: program.finalInsight,
    startedAt: program.startedAt.toISOString(),
    createdAt: program.createdAt.toISOString(),
    activeEnrollment,
    enrollments,
    insights: program.insights.map((insight: any) => ({
      id: insight.id,
      enrollmentId: insight.enrollmentId,
      habitTitle: insight.enrollment?.title ?? null,
      text: insight.text,
      source: insight.source,
      createdAt: insight.createdAt.toISOString()
    })),
    metrics: program.dailyMetrics.map((metric: any) => ({
      id: metric.id,
      date: metric.date.toISOString().slice(0, 10),
      energy: metric.energy,
      clarity: metric.clarity,
      stability: metric.stability
    })),
    rewards: program.rewards.map((reward: any) => ({
      id: reward.id,
      type: reward.type,
      label: reward.label,
      xp: reward.xp,
      createdAt: reward.createdAt.toISOString()
    })),
    stats: {
      xp: program.rewards.reduce((sum: number, reward: any) => sum + reward.xp, 0),
      daysInProgram: Math.max(1, daysBetween(program.startedAt, new Date())),
      checkinsDone: completedCheckins.length,
      insightsCount: program.insights.length,
      streakDays: calculateStreak(completedCheckins.map((checkin: any) => checkin.date)),
      currentWeek
    }
  };
}

function buildProgramProfile(report: unknown) {
  const full = asFullReport(report);
  const free = asReportPreview(report);
  const topRole = full?.top_roles?.[0];
  const weakZone = full?.ikigai_scores ? weakestIkigaiZone(full.ikigai_scores) : null;
  const profession = full?.profession ?? free?.profession ?? "Икигай-направление";
  return {
    title: `Путь привычек: ${topRole?.name ?? profession}`,
    weakZone,
    archetype: profession,
    topRole: topRole?.name ?? profession,
    careerAction: full?.career_action ?? null,
    finalInsight: full?.final_insight ?? free?.summary ?? null,
    raw: JSON.parse(JSON.stringify({
      profession,
      topRole: topRole?.name,
      weakZone,
      summary: full?.summary ?? free?.summary,
      strengths: topRole?.strengths,
      risks: topRole?.risks
    }))
  };
}

function asReportPreview(value: unknown): { profession?: string; summary?: string } | null {
  if (!value || typeof value !== "object") return null;
  return value as { profession?: string; summary?: string };
}

function asFullReport(value: unknown): {
  profession?: string;
  summary?: string;
  career_action?: string;
  final_insight?: string;
  ikigai_scores?: Record<string, number>;
  top_roles?: Array<{ name?: string; strengths?: string; risks?: string }>;
} | null {
  if (!value || typeof value !== "object") return null;
  return value as {
    profession?: string;
    summary?: string;
    career_action?: string;
    final_insight?: string;
    ikigai_scores?: Record<string, number>;
    top_roles?: Array<{ name?: string; strengths?: string; risks?: string }>;
  };
}

function weakestIkigaiZone(scores: Record<string, number>) {
  const labels: Record<string, string> = {
    love: "passion",
    world_needs: "mission",
    good_at: "profession",
    paid_for: "vocation"
  };
  const weakest = Object.entries(scores).sort((a, b) => a[1] - b[1])[0]?.[0];
  return weakest ? labels[weakest] ?? weakest : null;
}

function personalizeHabitTitle(title: string, weakZone: string | null, index: number) {
  if (index !== 3 || !weakZone) return title;
  const labels: Record<string, string> = {
    passion: "Ценность через энергию",
    mission: "Ценность через пользу людям",
    profession: "Ценность через навык",
    vocation: "Ценность через оплату"
  };
  return labels[weakZone] ?? title;
}

function dayFromInput(value?: string) {
  const source = value ?? new Date().toISOString().slice(0, 10);
  return new Date(`${source}T00:00:00.000Z`);
}

function daysBetween(start: Date, end: Date) {
  const startDay = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const endDay = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  return Math.floor((endDay - startDay) / 86400000) + 1;
}

function calculateStreak(dates: Date[]) {
  const days = new Set(dates.map((date) => date.toISOString().slice(0, 10)));
  let cursor = dayFromInput();
  if (!days.has(cursor.toISOString().slice(0, 10))) {
    cursor = new Date(cursor.getTime() - 86400000);
  }
  let streak = 0;
  while (days.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor = new Date(cursor.getTime() - 86400000);
  }
  return streak;
}

async function getOrCreateNavigatorThread(session: SessionContext, threadId: string | undefined, programId: string | undefined, firstMessage: string) {
  if (threadId) {
    const existing = await prisma.habitNavigatorThread.findFirst({
      where: { id: threadId, ...habitProgramWhere(session) }
    });
    if (existing) return existing;
  }
  return prisma.habitNavigatorThread.create({
    data: {
      programId,
      userId: session.userId,
      sessionId: session.id,
      title: firstMessage.slice(0, 80)
    }
  });
}

function buildNavigatorSystemPrompt(context: NavigatorContext) {
  return [
    "Ты — Пингви, AI-навигация ORKEN.LIFE для кабинета привычек.",
    "Отвечай по-русски, кратко и конкретно: 2-5 предложений, затем один уточняющий вопрос.",
    "Помогай в трех сценариях: ежедневное состояние, путь развития по диагностике, обычный поддерживающий разговор.",
    "Не давай медицинских диагнозов, не обещай гарантированный результат, не делай выводов о личности как о факте.",
    "Тон мягкий: без давления, без чувства долга, с маленьким реалистичным шагом на сегодня.",
    "Если пользователь пишет о кризисе, самоповреждении или опасности, мягко предложи обратиться к близкому человеку и профессиональной помощи.",
    "",
    `Имя: ${context.name || "пользователь"}`,
    `Режим: ${context.mode}`,
    `Цикл/неделя: ${context.cycle || "не указано"} / ${context.week || "не указано"}`,
    `Текущая привычка: ${context.habit || "не указано"}`,
    `Зона роста Икигай: ${context.weakZone || "не указано"}`,
    `Профессиональный вектор: ${context.topRole || "не указано"}`,
    `Метрики: энергия ${context.energy ?? "?"}/10, ясность ${context.clarity ?? "?"}/10, устойчивость ${context.stability ?? "?"}/10`,
    `Стрик: ${context.streakDays ?? 0} дней`,
    `План из отчета: ${context.careerAction || "не указано"}`,
    `Последний инсайт: ${context.recentInsight || "не указано"}`
  ].join("\n");
}

function buildFallbackReply(context: NavigatorContext) {
  if (context.mode === "state") {
    return `Сейчас ориентир такой: энергия ${context.energy ?? "?"}/10, ясность ${context.clarity ?? "?"}/10, устойчивость ${context.stability ?? "?"}/10. На сегодня достаточно одного мягкого шага по привычке "${context.habit || "текущей недели"}" или 10 минут восстановления. Что будет реалистичнее прямо сегодня?`;
  }
  if (context.mode === "path") {
    return `Текущий вектор — ${context.topRole || context.weakZone || "развитие по Икигай"}. Лучше не расширять план, а проверить один маленький шаг: сформулировать результат, показать его одному человеку или записать инсайт после практики. Какой шаг выберем?`;
  }
  return "Я рядом. Можем разобрать состояние, путь развития или текущую привычку без давления и оценок. С чего начнем: энергия, фокус, привычка или то, что сейчас больше всего мешает?";
}
