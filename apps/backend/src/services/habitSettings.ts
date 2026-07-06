export const HABIT_WEEK_SUMMARY_MODE_KEY = "habit_week_summary_mode";
export const HABIT_WEEK_SUMMARY_MODEL_KEY = "habit_week_summary_model";
export const HABIT_NAVIGATOR_TEMPERATURE_KEY = "habit_navigator_temperature";
export const TELEGRAM_RATE_LIMIT_WINDOW_MS_KEY = "telegram_rate_limit_window_ms";
export const TELEGRAM_RATE_LIMIT_MAX_KEY = "telegram_rate_limit_max";
export const TELEGRAM_REMINDER_TEMPLATE_KEY = "telegram_reminder_template";
export const TELEGRAM_WEB_LOGIN_ENABLED_KEY = "telegram_web_login_enabled";
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
          TELEGRAM_WEB_LOGIN_ENABLED_KEY
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
      "Команды: /checkin, /today, /metrics или просто задай вопрос."
    ].join("\n")),
    webLoginEnabled: readBoolean(values.get(TELEGRAM_WEB_LOGIN_ENABLED_KEY), true)
  };
}
