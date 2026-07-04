export const HABIT_WEEK_SUMMARY_MODE_KEY = "habit_week_summary_mode";
export const HABIT_WEEK_SUMMARY_MODEL_KEY = "habit_week_summary_model";
export const HABIT_NAVIGATOR_TEMPERATURE_KEY = "habit_navigator_temperature";
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
