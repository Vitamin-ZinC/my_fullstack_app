import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { env } from "../env.js";

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
  context: navigatorContextSchema.default({ mode: "chat" })
});

type NavigatorContext = z.infer<typeof navigatorContextSchema>;

export async function habitsRoutes(app: FastifyInstance) {
  app.post("/api/habits/navigator", async (request, reply) => {
    const body = navigatorRequestSchema.parse(request.body ?? {});
    if (!env.OPENAI_API_KEY) {
      return { reply: buildFallbackReply(body.context), model: "local-fallback" };
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
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
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      request.log.warn({ status: response.status, error: errorText.slice(0, 240) }, "OpenAI habits navigator failed");
      return reply.code(502).send({ error: "AI navigator is temporarily unavailable" });
    }

    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    const answer = data.choices?.[0]?.message?.content?.trim();
    return {
      reply: answer || buildFallbackReply(body.context),
      model: env.OPENAI_MODEL
    };
  });
}

function buildNavigatorSystemPrompt(context: NavigatorContext) {
  return [
    "Ты — Пингви, AI-навигация ORKEN.LIFE для трекера привычек.",
    "Отвечай по-русски, кратко и конкретно: 2-5 предложений, затем один уточняющий вопрос.",
    "Ты помогаешь в трех сценариях: ежедневное состояние и как его улучшать, путь развития по диагностике, обычный дружелюбный разговор.",
    "Не давай медицинских диагнозов, не обещай гарантированный результат, не делай выводов о личности как о факте.",
    "Если пользователь пишет о кризисе, самоповреждении или опасности, мягко предложи обратиться к близкому человеку и профессиональной помощи.",
    "Опирайся на контекст ниже и предлагай маленький следующий шаг на сегодня.",
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
    return `Сейчас ориентир такой: энергия ${context.energy ?? "?"}/10, ясность ${context.clarity ?? "?"}/10, устойчивость ${context.stability ?? "?"}/10. Выберите один маленький шаг: 10 минут восстановления, один понятный фокус или короткая отметка по привычке "${context.habit || "текущей недели"}". Что из этого реально сделать сегодня?`;
  }
  if (context.mode === "path") {
    return `Ваш текущий вектор — ${context.topRole || context.weakZone || "развитие по Икигай"}. На сегодня лучше не расширять план, а сделать один проверочный шаг: сформулировать результат, показать его одному человеку или записать инсайт после практики. Какой шаг выберем?`;
  }
  return `Я рядом. Можно разобрать состояние, путь развития или просто поговорить без задачи. С чего начнем: энергия, фокус, привычка или то, что сейчас больше всего давит?`;
}
