import assert from "node:assert/strict";
import test from "node:test";

test("full report completion fills missing diagnostic sections before schema validation", async () => {
  process.env.DATABASE_URL ??= "postgresql://levelup:dev_password@localhost:5432/levelup";
  process.env.PARTNER_CORE_URL = "";

  const { completeFullReportCandidate, reportFullSchema } = await import("./aiReport.js");
  const completed = completeFullReportCandidate({
    profession: "Продуктовый стратег",
    summary: "Пользователь лучше всего раскрывается там, где нужно соединять идеи, людей и практическую проверку.",
    ikigai_scores: { love: 80, good_at: 72, paid_for: 65, world_needs: 70 },
    voice_analysis: {
      pace: "Ваш результат: Темп речи выглядит рабочим и достаточно динамичным. Что это значит: в обсуждениях это может помогать быстро передавать мысль, но требует пауз. Рекомендация: добавляйте паузу после главного тезиса."
    },
    top_roles: [
      {
        name: "Продуктовый стратег",
        match: 86,
        why: "Роль подходит по сочетанию интереса к структуре, коммуникации и практическим экспериментам.",
        voiceEvidence: "Голосовой сигнал поддерживает гипотезу о динамичной подаче.",
        strengths: "Умеет переводить идеи в понятный маршрут.",
        risks: "Может слишком быстро переходить к нескольким вариантам сразу."
      }
    ],
    career_action: "Week 1: выбрать один эксперимент. Week 2: собрать обратную связь. Week 3: улучшить формат. Week 4: принять решение.",
    final_insight: "Комплексный AI-анализ показывает рабочую гипотезу о направлении развития через структуру, коммуникацию и практические проверки."
  });

  const report = reportFullSchema.parse(completed);

  assert.match(report.face_analysis.communication, /Ваш результат:/);
  assert.match(report.face_analysis.communication, /Что это значит:/);
  assert.match(report.face_analysis.communication, /Рекомендация:/);
  assert.equal(report.top_roles.length >= 3, true);
});
