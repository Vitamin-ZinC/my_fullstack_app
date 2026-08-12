import assert from "node:assert/strict";
import test from "node:test";
import { assertCoachRewardAffordable, availableCoachSlots, coachConsultationRefundAmount, hasValidCoachRevenueSplit, shouldMigrateCoachSubscriptions } from "./coachRules.js";

test("only coach-funded clients consume package slots", () => {
  assert.equal(availableCoachSlots(5, 3), 2);
  assert.equal(availableCoachSlots(5, 8), 0);
  assert.equal(availableCoachSlots(null, 3), null);
});

test("published paid services require a complete revenue split", () => {
  assert.equal(hasValidCoachRevenueSplit(5_000, 5_000), true);
  assert.equal(hasValidCoachRevenueSplit(8_000, 2_000), true);
  assert.equal(hasValidCoachRevenueSplit(5_000, null), false);
  assert.equal(hasValidCoachRevenueSplit(5_000, 4_999), false);
});

test("consultation cancellation applies the configured cutoff and percentage", () => {
  const now = new Date("2026-08-12T10:00:00.000Z");
  assert.equal(coachConsultationRefundAmount({ amount: 10_000, scheduledFor: new Date("2026-08-13T11:00:00.000Z"), now, cancellationHours: 24, refundPercent: 80 }), 8_000);
  assert.equal(coachConsultationRefundAmount({ amount: 10_000, scheduledFor: new Date("2026-08-12T18:00:00.000Z"), now, cancellationHours: 24, refundPercent: 100 }), 0);
  assert.equal(coachConsultationRefundAmount({ amount: 10_000, scheduledFor: null, now, cancellationHours: 24, refundPercent: 100 }), 10_000);
});

test("coach price versions migrate existing subscriptions only on explicit renewal mode", () => {
  assert.equal(shouldMigrateCoachSubscriptions("NEW_ONLY"), false);
  assert.equal(shouldMigrateCoachSubscriptions("NEXT_RENEWAL"), true);
});

test("coach reward debit rejects insufficient balances", () => {
  assert.doesNotThrow(() => assertCoachRewardAffordable(500, 500));
  assert.throws(() => assertCoachRewardAffordable(499, 500), /Not enough ORKEN Points/);
  assert.throws(() => assertCoachRewardAffordable(500, 0), /Invalid ORKEN Points cost/);
});
