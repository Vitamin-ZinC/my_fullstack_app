export const REPORT_PRICE_AMOUNT_KEY = "report_price_amount";
export const REPORT_PRICE_CURRENCY_KEY = "report_price_currency";
export const HABIT_PRICE_AMOUNT_KEY = "habit_subscription_price_amount";
export const HABIT_PRICE_CURRENCY_KEY = "habit_subscription_price_currency";
export const HABIT_TRIAL_DAYS_KEY = "habit_trial_days";
export const HABIT_ASSISTANT_AVATAR_URL_KEY = "habit_assistant_avatar_url";

const DEFAULT_HABIT_PRICE_AMOUNT = 800;
const DEFAULT_HABIT_PRICE_CURRENCY = "usd";
const DEFAULT_HABIT_TRIAL_DAYS = 30;

function readPositiveInteger(value: unknown, fallback: number) {
  const numberValue = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : fallback;
}

function readNonNegativeInteger(value: unknown, fallback: number) {
  const numberValue = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isInteger(numberValue) && numberValue >= 0 ? numberValue : fallback;
}

function readCurrency(value: unknown, fallback: string) {
  return typeof value === "string" && /^[a-z]{3}$/i.test(value) ? value.toLowerCase() : fallback.toLowerCase();
}

function readPublicPathOrUrl(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return /^(https?:\/\/|\/)/i.test(trimmed) ? trimmed : fallback;
}

export function formatPriceLabel(amount: number, currency: string) {
  const normalizedCurrency = currency.toUpperCase();
  const majorAmount = amount / 100;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: normalizedCurrency,
      maximumFractionDigits: Number.isInteger(majorAmount) ? 0 : 2
    }).format(majorAmount);
  } catch {
    return `${amount} ${currency.toLowerCase()}`;
  }
}

export async function getReportPriceConfig() {
  const [{ env }, { prisma }] = await Promise.all([
    import("../env.js"),
    import("../lib/prisma.js")
  ]);
  const settings = await prisma.appSetting.findMany({
    where: { key: { in: [REPORT_PRICE_AMOUNT_KEY, REPORT_PRICE_CURRENCY_KEY] } }
  });
  const values = new Map(settings.map((setting) => [setting.key, setting.value]));
  const amount = readPositiveInteger(values.get(REPORT_PRICE_AMOUNT_KEY), env.PRICE_AMOUNT);
  const currency = readCurrency(values.get(REPORT_PRICE_CURRENCY_KEY), env.PRICE_CURRENCY);

  return {
    amount,
    currency,
    priceLabel: formatPriceLabel(amount, currency)
  };
}

export async function getHabitSubscriptionConfig() {
  const { prisma } = await import("../lib/prisma.js");
  const settings = await prisma.appSetting.findMany({
    where: { key: { in: [HABIT_PRICE_AMOUNT_KEY, HABIT_PRICE_CURRENCY_KEY, HABIT_TRIAL_DAYS_KEY, HABIT_ASSISTANT_AVATAR_URL_KEY] } }
  });
  const values = new Map(settings.map((setting) => [setting.key, setting.value]));
  const amount = readPositiveInteger(values.get(HABIT_PRICE_AMOUNT_KEY), DEFAULT_HABIT_PRICE_AMOUNT);
  const currency = readCurrency(values.get(HABIT_PRICE_CURRENCY_KEY), DEFAULT_HABIT_PRICE_CURRENCY);
  const trialDays = readNonNegativeInteger(values.get(HABIT_TRIAL_DAYS_KEY), DEFAULT_HABIT_TRIAL_DAYS);
  const assistantAvatarUrl = readPublicPathOrUrl(values.get(HABIT_ASSISTANT_AVATAR_URL_KEY), "/assets/orken12.jpg");

  return {
    amount,
    currency,
    priceLabel: formatPriceLabel(amount, currency),
    trialDays,
    assistantAvatarUrl
  };
}
