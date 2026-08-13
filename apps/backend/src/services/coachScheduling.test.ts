import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
const { generateCoachSlots } = await import("./coachScheduling.js");

const mondayRule = [{ weekday: 1, startMinute: 9 * 60, endMinute: 12 * 60, active: true }];

test("generates internal slots in the coach timezone", () => {
  const slots = generateCoachSlots({
    from: new Date("2026-08-17T00:00:00.000Z"),
    to: new Date("2026-08-18T00:00:00.000Z"),
    now: new Date("2026-08-16T00:00:00.000Z"),
    timezone: "Europe/Moscow",
    durationMinutes: 60,
    minNoticeMinutes: 0,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 0,
    rules: mondayRule,
    exceptions: [],
    busy: []
  });
  assert.deepEqual(slots.map((slot) => slot.startsAt), [
    "2026-08-17T06:00:00.000Z",
    "2026-08-17T07:00:00.000Z",
    "2026-08-17T08:00:00.000Z"
  ]);
});

test("excludes busy periods and applies the post-meeting buffer", () => {
  const slots = generateCoachSlots({
    from: new Date("2026-08-17T00:00:00.000Z"),
    to: new Date("2026-08-18T00:00:00.000Z"),
    now: new Date("2026-08-16T00:00:00.000Z"),
    timezone: "Europe/Moscow",
    durationMinutes: 60,
    minNoticeMinutes: 0,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 15,
    rules: mondayRule,
    exceptions: [],
    busy: [{ startsAt: new Date("2026-08-17T07:10:00.000Z"), endsAt: new Date("2026-08-17T07:40:00.000Z") }]
  });
  assert.deepEqual(slots.map((slot) => slot.startsAt), ["2026-08-17T08:00:00.000Z"]);
});

test("a closed-date exception removes the whole day", () => {
  const slots = generateCoachSlots({
    from: new Date("2026-08-17T00:00:00.000Z"),
    to: new Date("2026-08-18T00:00:00.000Z"),
    now: new Date("2026-08-16T00:00:00.000Z"),
    timezone: "Europe/Moscow",
    durationMinutes: 60,
    minNoticeMinutes: 0,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 0,
    rules: mondayRule,
    exceptions: [{ date: new Date("2026-08-17T00:00:00.000Z"), isAvailable: false, startMinute: null, endMinute: null }],
    busy: []
  });
  assert.equal(slots.length, 0);
});

test("minimum notice removes slots too close to now", () => {
  const slots = generateCoachSlots({
    from: new Date("2026-08-17T00:00:00.000Z"),
    to: new Date("2026-08-18T00:00:00.000Z"),
    now: new Date("2026-08-17T05:30:00.000Z"),
    timezone: "Europe/Moscow",
    durationMinutes: 60,
    minNoticeMinutes: 90,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 0,
    rules: mondayRule,
    exceptions: [],
    busy: []
  });
  assert.deepEqual(slots.map((slot) => slot.startsAt), ["2026-08-17T07:00:00.000Z", "2026-08-17T08:00:00.000Z"]);
});
