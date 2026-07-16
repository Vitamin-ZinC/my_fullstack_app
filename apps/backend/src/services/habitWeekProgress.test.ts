import assert from "node:assert/strict";
import test from "node:test";

import {
  capHabitWeekCheckins,
  getNextHabitPosition,
  HABIT_WEEK_TARGET_CHECKINS,
  shouldAutoAdvanceHabitWeek
} from "./habitWeekProgress.js";

test("habit week progress caps display at 7 but auto-advances overflowed weeks", () => {
  assert.equal(HABIT_WEEK_TARGET_CHECKINS, 7);
  assert.equal(capHabitWeekCheckins(9), 7);
  assert.equal(shouldAutoAdvanceHabitWeek(9), true);
  assert.equal(shouldAutoAdvanceHabitWeek(6), false);
});

test("habit week auto-advance opens the next weekly position", () => {
  assert.deepEqual(getNextHabitPosition(1, 48), {
    nextSortOrder: 2,
    isComplete: false,
    nextCycle: 1,
    nextWeek: 2
  });
  assert.deepEqual(getNextHabitPosition(12, 48), {
    nextSortOrder: 13,
    isComplete: false,
    nextCycle: 2,
    nextWeek: 1
  });
});
