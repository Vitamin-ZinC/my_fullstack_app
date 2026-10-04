import assert from "node:assert/strict";
import test from "node:test";
import { buildFallbackFreeReport, buildFallbackReport } from "./report.js";

test("English fallback localizes system copy without rewriting answers", () => {
  const answers = { love: ["Энергия"], good_at: ["Мой опыт"], world_needs: ["Мои клиенты"], paid_for: ["Моя практика"] };
  const before = structuredClone(answers);
  const report = buildFallbackReport(answers, "en");
  assert.equal(report.profession, "Product strategist");
  assert.ok(report.summary.includes('"Мой опыт"'));
  assert.ok(report.ikigai_zones?.passion.insight.includes("Энергия"));
  assert.ok(!/[А-Яа-яЁё]/.test(report.career_action));
  const free = buildFallbackFreeReport(report, "en");
  assert.equal(free.profession, report.profession);
  assert.ok(free.summary.startsWith(report.summary));
  assert.ok(free.paid_report_preview?.every(value => !/[А-Яа-яЁё]/.test(value)));
  assert.deepEqual(answers, before);
  assert.equal(buildFallbackReport(answers).profession, "Продуктовый стратег");
});
