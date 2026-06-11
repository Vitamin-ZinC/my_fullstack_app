import assert from "node:assert/strict";
import test from "node:test";
import { calculatePromoDiscount, normalizePromoCode, resolvePromoCodeDiscount, type PromoCodeLike } from "./promoCodes.js";

const activePercent: PromoCodeLike = {
  active: true,
  amountOff: null,
  currency: null,
  discountType: "PERCENT",
  expiresAt: null,
  maxRedemptions: null,
  percentOff: 20,
  redemptions: 0,
  startsAt: null
};
const priceAmount = 300;

test("normalizePromoCode trims and uppercases input", () => {
  assert.equal(normalizePromoCode(" welcome20 "), "WELCOME20");
});

test("calculatePromoDiscount supports percent and clamps to amount", () => {
  assert.equal(calculatePromoDiscount(activePercent, priceAmount), 60);
  assert.equal(calculatePromoDiscount({ ...activePercent, percentOff: 100 }, priceAmount), priceAmount);
  assert.equal(calculatePromoDiscount({ ...activePercent, percentOff: 150 }, priceAmount), priceAmount);
});

test("calculatePromoDiscount supports fixed amount discounts", () => {
  assert.equal(calculatePromoDiscount({
    ...activePercent,
    discountType: "FIXED_AMOUNT",
    amountOff: 500,
    percentOff: null
  }, priceAmount), priceAmount);
});

test("resolvePromoCodeDiscount rejects inactive, expired, future and exhausted promos", () => {
  const now = new Date("2026-06-09T00:00:00.000Z");
  assert.throws(() => resolvePromoCodeDiscount({ ...activePercent, active: false }, priceAmount, "usd", now), /not active/);
  assert.throws(() => resolvePromoCodeDiscount({ ...activePercent, startsAt: new Date("2026-06-10T00:00:00.000Z") }, priceAmount, "usd", now), /not active yet/);
  assert.throws(() => resolvePromoCodeDiscount({ ...activePercent, expiresAt: new Date("2026-06-08T00:00:00.000Z") }, priceAmount, "usd", now), /expired/);
  assert.throws(() => resolvePromoCodeDiscount({ ...activePercent, maxRedemptions: 3, redemptions: 3 }, priceAmount, "usd", now), /limit/);
});

test("resolvePromoCodeDiscount validates fixed amount currency case-insensitively", () => {
  const promo = { ...activePercent, discountType: "FIXED_AMOUNT" as const, amountOff: 100, percentOff: null, currency: "USD" };
  assert.equal(resolvePromoCodeDiscount(promo, priceAmount, "usd"), 100);
  assert.throws(() => resolvePromoCodeDiscount(promo, priceAmount, "eur"), /currency/);
});
