import { env } from "../env.js";
import { prisma } from "../lib/prisma.js";

export const REPORT_PRICE_AMOUNT_KEY = "report_price_amount";
export const REPORT_PRICE_CURRENCY_KEY = "report_price_currency";

function readPositiveInteger(value: unknown, fallback: number) {
  const numberValue = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : fallback;
}

function readCurrency(value: unknown, fallback: string) {
  return typeof value === "string" && /^[a-z]{3}$/i.test(value) ? value.toLowerCase() : fallback.toLowerCase();
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
