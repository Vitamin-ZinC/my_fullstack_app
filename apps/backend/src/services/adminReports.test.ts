import assert from "node:assert/strict";
import test from "node:test";
import { resolveAdminSubscriptionAccessType, resolveAdminSubscriptionStatus } from "./adminReports.js";

const base = {
  stripeSubscriptionId: null,
  subscriptionStatus: "TRIAL",
  trialEndsAt: new Date("2026-09-01T00:00:00.000Z"),
  partnerBonusApplied: false,
  giftedDays: false
};

test("subscription access classification keeps paid access authoritative", () => {
  assert.equal(resolveAdminSubscriptionAccessType({
    ...base,
    stripeSubscriptionId: "sub_123",
    partnerBonusApplied: true,
    giftedDays: true
  }), "PAID_SUBSCRIPTION");
});

test("subscription access classification distinguishes partner, gift, trial and free access", () => {
  assert.equal(resolveAdminSubscriptionAccessType({ ...base, partnerBonusApplied: true }), "PARTNER_BONUS");
  assert.equal(resolveAdminSubscriptionAccessType({ ...base, giftedDays: true }), "GIFTED_DAYS");
  assert.equal(resolveAdminSubscriptionAccessType(base), "STANDARD_TRIAL");
  assert.equal(resolveAdminSubscriptionAccessType({ ...base, subscriptionStatus: "ACTIVE", trialEndsAt: null }), "FREE_ACCESS");
});

test("expired trials are reported separately without changing stored status", () => {
  assert.equal(resolveAdminSubscriptionStatus("TRIAL", new Date("2026-07-01T00:00:00.000Z"), new Date("2026-08-01T00:00:00.000Z")), "EXPIRED_TRIAL");
  assert.equal(resolveAdminSubscriptionStatus("ACTIVE", null, new Date("2026-08-01T00:00:00.000Z")), "ACTIVE");
});
