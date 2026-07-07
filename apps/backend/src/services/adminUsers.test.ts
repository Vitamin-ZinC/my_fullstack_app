import test from "node:test";
import assert from "node:assert/strict";
import { calculateGiftedTrialEnd, calculateTrialDaysLeft } from "./adminUsers.js";

test("calculateGiftedTrialEnd extends a future trial end date", () => {
  const now = new Date("2026-07-07T12:00:00.000Z");
  const currentTrialEndsAt = new Date("2026-07-10T12:00:00.000Z");

  assert.equal(
    calculateGiftedTrialEnd({ now, currentTrialEndsAt, days: 5 }).toISOString(),
    "2026-07-15T12:00:00.000Z"
  );
});

test("calculateGiftedTrialEnd starts from now when current trial is absent or expired", () => {
  const now = new Date("2026-07-07T12:00:00.000Z");

  assert.equal(
    calculateGiftedTrialEnd({ now, currentTrialEndsAt: null, days: 2 }).toISOString(),
    "2026-07-09T12:00:00.000Z"
  );
  assert.equal(
    calculateGiftedTrialEnd({ now, currentTrialEndsAt: new Date("2026-07-01T12:00:00.000Z"), days: 2 }).toISOString(),
    "2026-07-09T12:00:00.000Z"
  );
});

test("calculateTrialDaysLeft rounds up partial days", () => {
  const now = new Date("2026-07-07T12:00:00.000Z");
  assert.equal(calculateTrialDaysLeft(new Date("2026-07-08T11:59:00.000Z"), now), 1);
  assert.equal(calculateTrialDaysLeft(new Date("2026-07-08T12:01:00.000Z"), now), 2);
  assert.equal(calculateTrialDaysLeft(new Date("2026-07-01T12:00:00.000Z"), now), 0);
});
