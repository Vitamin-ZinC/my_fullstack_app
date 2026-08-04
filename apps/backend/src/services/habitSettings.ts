export const HABIT_WEEK_SUMMARY_MODE_KEY = "habit_week_summary_mode";
export const HABIT_WEEK_SUMMARY_MODEL_KEY = "habit_week_summary_model";
export const HABIT_NAVIGATOR_TEMPERATURE_KEY = "habit_navigator_temperature";
export const TELEGRAM_RATE_LIMIT_WINDOW_MS_KEY = "telegram_rate_limit_window_ms";
export const TELEGRAM_RATE_LIMIT_MAX_KEY = "telegram_rate_limit_max";
export const TELEGRAM_REMINDER_TEMPLATE_KEY = "telegram_reminder_template";
export const TELEGRAM_WEB_LOGIN_ENABLED_KEY = "telegram_web_login_enabled";
export const TELEGRAM_WELCOME_TEMPLATE_KEY = "telegram_welcome_template";
export const TELEGRAM_TODAY_TEMPLATE_KEY = "telegram_today_template";
export const TELEGRAM_COMMUNITY_MORNING_TEMPLATE_KEY = "telegram_community_morning_template";
export const TELEGRAM_COMMUNITY_MIDDAY_TEMPLATE_KEY = "telegram_community_midday_template";
export const TELEGRAM_COMMUNITY_EVENING_TEMPLATE_KEY = "telegram_community_evening_template";
export const TELEGRAM_COMMUNITY_WELCOME_TEMPLATE_KEY = "telegram_community_welcome_template";
export const TELEGRAM_COMMUNITY_TEMPERATURE_KEY = "telegram_community_temperature";
export const HABIT_ASSISTANT_AVATAR_URL_KEY = "habit_assistant_avatar_url";
export const HABIT_WEEK_SUMMARY_MODE_RULE = "rule";
export const HABIT_WEEK_SUMMARY_MODE_LLM = "llm";

export type HabitWeekSummaryMode = typeof HABIT_WEEK_SUMMARY_MODE_RULE | typeof HABIT_WEEK_SUMMARY_MODE_LLM;

function readMode(value: unknown): HabitWeekSummaryMode {
  return value === HABIT_WEEK_SUMMARY_MODE_LLM ? HABIT_WEEK_SUMMARY_MODE_LLM : HABIT_WEEK_SUMMARY_MODE_RULE;
}

function readModel(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function readTemperature(value: unknown, fallback: number) {
  const numberValue = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(numberValue) ? Math.max(0, Math.min(1, numberValue)) : fallback;
}

export async function getHabitAiSettings(defaultModel: string) {
  const { prisma } = await import("../lib/prisma.js");
  const settings = await prisma.appSetting.findMany({
    where: {
      key: {
        in: [
          HABIT_WEEK_SUMMARY_MODE_KEY,
          HABIT_WEEK_SUMMARY_MODEL_KEY,
          HABIT_NAVIGATOR_TEMPERATURE_KEY
        ]
      }
    }
  });
  const values = new Map(settings.map((setting) => [setting.key, setting.value]));

  return {
    weekSummaryMode: readMode(values.get(HABIT_WEEK_SUMMARY_MODE_KEY)),
    weekSummaryModel: readModel(values.get(HABIT_WEEK_SUMMARY_MODEL_KEY), defaultModel),
    navigatorTemperature: readTemperature(values.get(HABIT_NAVIGATOR_TEMPERATURE_KEY), 0.45)
  };
}

function readInteger(value: unknown, fallback: number, min: number, max: number) {
  const numberValue = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isInteger(numberValue) ? Math.max(min, Math.min(max, numberValue)) : fallback;
}

function readBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function readTemplate(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export async function getTelegramPolicySettings() {
  const { prisma } = await import("../lib/prisma.js");
  const settings = await prisma.appSetting.findMany({
    where: {
      key: {
        in: [
          TELEGRAM_RATE_LIMIT_WINDOW_MS_KEY,
          TELEGRAM_RATE_LIMIT_MAX_KEY,
          TELEGRAM_REMINDER_TEMPLATE_KEY,
          TELEGRAM_WEB_LOGIN_ENABLED_KEY,
          TELEGRAM_WELCOME_TEMPLATE_KEY,
          TELEGRAM_TODAY_TEMPLATE_KEY
        ]
      }
    }
  });
  const values = new Map(settings.map((setting) => [setting.key, setting.value]));

  return {
    rateLimitWindowMs: readInteger(values.get(TELEGRAM_RATE_LIMIT_WINDOW_MS_KEY), 10 * 60 * 1000, 60 * 1000, 24 * 60 * 60 * 1000),
    rateLimitMax: readInteger(values.get(TELEGRAM_RATE_LIMIT_MAX_KEY), 20, 1, 500),
    reminderTemplate: readTemplate(values.get(TELEGRAM_REMINDER_TEMPLATE_KEY), [
      "ORKEN на связи. Сегодняшний мягкий шаг:",
      "{{habitTitle}}",
      "{{taskText}}",
      "{{metricText}}",
      "",
      "Кнопки ниже помогут отметить шаг, сохранить состояние или открыть кабинет."
    ].join("\n")),
    welcomeTemplate: readTemplate(values.get(TELEGRAM_WELCOME_TEMPLATE_KEY), [
      "Привет! Я твой личный ИИ-помощник ORKEN от Навигатора привычек ORKEN.LIFE. 🚀",
      "",
      "Я помогаю тебе оставаться в фокусе, отслеживать прогресс и прокачивать дисциплину прямо в мессенджере. Вот что я умею делать:",
      "",
      "1. Подтягивать твою текущую привычку на сегодня из личного кабинета: что сделать, если нет сил, зачем и сколько времени нужно.",
      "2. Фиксировать внутреннее состояние: энергию, ясность и устойчивость.",
      "3. Сохранять важные инсайты и мысли в личный Архив.",
      "4. Начислять XP за ежедневные активности в общий профиль на сайте.",
      "",
      "Давай начнем. Синхронизируем твой аккаунт."
    ].join("\n")),
    todayTemplate: readTemplate(values.get(TELEGRAM_TODAY_TEMPLATE_KEY), [
      "Сегодня: {{habitTitle}}",
      "",
      "1. Что нужно сделать",
      "{{whatToDo}}",
      "",
      "2. Если нет сил",
      "{{lowEnergy}}",
      "",
      "3. Зачем",
      "{{why}}",
      "",
      "4. Время",
      "{{time}}",
      "",
      "Прогресс недели: {{weekProgress}}/7."
    ].join("\n")),
    webLoginEnabled: readBoolean(values.get(TELEGRAM_WEB_LOGIN_ENABLED_KEY), true)
  };
}

export async function getTelegramCommunitySettings() {
  const { prisma } = await import("../lib/prisma.js");
  const settings = await prisma.appSetting.findMany({
    where: {
      key: {
        in: [
          TELEGRAM_COMMUNITY_MORNING_TEMPLATE_KEY,
          TELEGRAM_COMMUNITY_MIDDAY_TEMPLATE_KEY,
          TELEGRAM_COMMUNITY_EVENING_TEMPLATE_KEY,
          TELEGRAM_COMMUNITY_WELCOME_TEMPLATE_KEY,
          TELEGRAM_COMMUNITY_TEMPERATURE_KEY
        ]
      }
    }
  });
  const values = new Map(settings.map((setting) => [setting.key, setting.value]));

  return {
    morningTemplate: readTemplate(values.get(TELEGRAM_COMMUNITY_MORNING_TEMPLATE_KEY), [
      "Доброе утро. Выберите одну главную задачу дня.",
      "Напишите: /focus что именно вы завершите сегодня.",
      "Один конкретный результат полезнее длинного списка намерений."
    ].join("\n")),
    middayTemplate: readTemplate(values.get(TELEGRAM_COMMUNITY_MIDDAY_TEMPLATE_KEY), [
      "Дневная сверка ORKEN.",
      "Какой самый маленький шаг приблизит вас к утреннему фокусу за следующие 20 минут?",
      "Можно ответить прямо на это сообщение."
    ].join("\n")),
    eveningTemplate: readTemplate(values.get(TELEGRAM_COMMUNITY_EVENING_TEMPLATE_KEY), [
      "Вечерняя сверка.",
      "Отметьте результат кнопкой ниже. Частичное выполнение тоже считается движением, если вы честно фиксируете следующий шаг."
    ].join("\n")),
    welcomeTemplate: readTemplate(values.get(TELEGRAM_COMMUNITY_WELCOME_TEMPLATE_KEY), [
      "Я — ORKEN для комьюнити. Помогаю группе формулировать фокус, отмечать результат и поддерживать рабочий ритм без публичного давления.",
      "Администратор может включить расписание командой /activate. Участие добровольное: /join — войти, /leave — выйти."
    ].join("\n")),
    temperature: readTemperature(values.get(TELEGRAM_COMMUNITY_TEMPERATURE_KEY), 0.55)
  };
}
