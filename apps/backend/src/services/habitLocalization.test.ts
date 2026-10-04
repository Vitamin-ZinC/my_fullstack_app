import assert from "node:assert/strict";
import test from "node:test";
import { localizeStaticText, normalizeUiLocale, translateGeneratedSystemText, translateSystemText } from "@levelup/contracts";
import { localizeHabitProgramSummary } from "./habitLocalization.js";
import { HABIT_CYCLES, HABIT_DEFINITIONS } from "./habitCatalog.js";

test("locale negotiation accepts supported regional codes and rejects arbitrary values", () => {
  assert.equal(normalizeUiLocale("en-US"), "en");
  assert.equal(normalizeUiLocale("ru_RU"), "ru");
  assert.equal(normalizeUiLocale("english", "ru"), "ru");
  assert.equal(normalizeUiLocale("../../en", "ru"), "ru");
  assert.equal(normalizeUiLocale(undefined, "en"), "en");
});

test("system text translates without changing Russian or unknown records", () => {
  assert.equal(translateSystemText("Энергия", "en"), "Energy");
  assert.equal(translateSystemText("Энергия", "ru"), "Энергия");
  assert.equal(translateSystemText("My private journal entry", "en"), "My private journal entry");
  assert.equal(translateGeneratedSystemText("Сон как фундамент: день 3", "en"), "Sleep as a foundation: day 3");
});

test("all built-in habit weeks and cycles have English system copy", () => {
  assert.equal(HABIT_DEFINITIONS.length, 48);
  for (const habit of HABIT_DEFINITIONS) {
    for (const field of ["title", "focus", "essence", "practice", "why", "book"] as const) {
      assert.doesNotMatch(translateSystemText(habit[field], "en"), /[А-Яа-яЁё]/, `${habit.slug}.${field}`);
    }
    const dailyTask = `Что сделать: ${habit.practice} Время: 10 мин. Если совсем нет сил: ${habit.practice} за 30 секунд.`;
    const englishTask = translateGeneratedSystemText(dailyTask, "en");
    assert.doesNotMatch(englishTask, /[А-Яа-яЁё]/, `${habit.slug}.dailyTask`);
    assert.match(englishTask, /^What to do: .* Time: 10 min\. If you have no energy: .* for 30 seconds\.$/);
  }
  assert.doesNotMatch(JSON.stringify(localizeStaticText(HABIT_CYCLES, "en")), /[А-Яа-яЁё]/);
});

test("program localization preserves XP, achievements, notes, diagnostics and custom habits", () => {
  const definition = HABIT_DEFINITIONS[0];
  const enrollment = { ...definition, id: "enrollment", checkins: [{ note: "Энергия", completed: true }], dailyTasks: [], todayTask: null };
  const custom = { ...enrollment, id: "custom", slug: "coach-custom", title: "Энергия", practice: "Моя авторская привычка" };
  const program = {
    id: "program", title: "Навигатор привычек ORKEN.LIFE", activeEnrollment: enrollment, todayTask: null,
    enrollments: [enrollment, custom], cycles: [], profile: { name: "Энергия" },
    insights: [{ text: "Энергия", source: "user" }], careerAction: "Исходный отчёт", finalInsight: "Исходный отчёт",
    rewards: [{ id: "xp", label: "Отметка привычки", xp: 15 }],
    weekSummaries: [{ summary: "Исходная история", pingviFeedback: "Исходная переписка", rewardLabel: "Пауза недели" }],
    rankHistory: [{ rankTitle: "Новичок пути", monthXp: 123 }],
    stats: { xp: 999, checkinsDone: 42, rank: { title: "Новичок пути", level: 1 } }
  };
  const before = structuredClone(program);
  const localized = localizeHabitProgramSummary(program, "en");
  assert.equal(localized.enrollments[0].title, "Sleep as a foundation");
  assert.equal(localized.stats.xp, 999);
  assert.equal(localized.stats.checkinsDone, 42);
  assert.deepEqual(localized.insights, program.insights);
  assert.deepEqual(localized.profile, program.profile);
  assert.deepEqual(localized.enrollments[0].checkins, program.enrollments[0].checkins);
  assert.deepEqual(localized.enrollments[1], custom);
  assert.equal(localized.finalInsight, program.finalInsight);
  assert.equal(localized.weekSummaries[0].summary, "Исходная история");
  assert.equal(localized.rewards[0].xp, 15);
  assert.deepEqual(program, before);
  assert.equal(localizeHabitProgramSummary(program, "ru"), program);
});
