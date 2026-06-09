export type PromoCodeLike = {
  active: boolean;
  amountOff: number | null;
  currency: string | null;
  discountType: "PERCENT" | "FIXED_AMOUNT";
  expiresAt: Date | null;
  maxRedemptions: number | null;
  percentOff: number | null;
  redemptions: number;
  startsAt: Date | null;
};

export function normalizePromoCode(code: string) {
  return code.trim().toUpperCase();
}

export function validatePromoCode(promo: PromoCodeLike | null | undefined, amount: number, currency: string, now = new Date()) {
  if (!promo || !promo.active) throw new Error("Promo code is not active");
  if (promo.startsAt && promo.startsAt > now) throw new Error("Promo code is not active yet");
  if (promo.expiresAt && promo.expiresAt <= now) throw new Error("Promo code has expired");
  if (promo.maxRedemptions !== null && promo.redemptions >= promo.maxRedemptions) {
    throw new Error("Promo code redemption limit reached");
  }
  if (promo.currency && promo.currency.toLowerCase() !== currency.toLowerCase()) {
    throw new Error("Promo code currency does not match this payment");
  }
  if (amount < 0) throw new Error("Payment amount must be positive");
}

export function calculatePromoDiscount(promo: PromoCodeLike, amount: number) {
  const rawDiscount = promo.discountType === "PERCENT"
    ? Math.floor(amount * ((promo.percentOff ?? 0) / 100))
    : (promo.amountOff ?? 0);
  return Math.min(Math.max(rawDiscount, 0), amount);
}

export function resolvePromoCodeDiscount(promo: PromoCodeLike | null | undefined, amount: number, currency: string, now = new Date()) {
  validatePromoCode(promo, amount, currency, now);
  return calculatePromoDiscount(promo!, amount);
}
