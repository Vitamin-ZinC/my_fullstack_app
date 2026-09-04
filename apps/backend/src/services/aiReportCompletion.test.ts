import assert from "node:assert/strict";
import test from "node:test";

test("full report completion fills missing diagnostic sections before schema validation", async () => {
  process.env.DATABASE_URL ??= "postgresql://levelup:dev_password@localhost:5432/levelup";
  process.env.PARTNER_CORE_URL = "";

  const { mergeFullReportParts, normalizeFullReportValue } = await import("./aiReport.js");
  const report = normalizeFullReportValue({
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

  assert.match(report.face_analysis.communication, /Ваш результат:/);
  assert.match(report.face_analysis.communication, /Что это значит:/);
  assert.match(report.face_analysis.communication, /Рекомендация:/);
  assert.equal(report.top_roles.length, 5);
  assert.equal(new Set(report.top_roles.map((role) => role.name.toLocaleLowerCase())).size, 5);
  assert.ok(report.ikigai_zones);

  const reassembled = mergeFullReportParts(
    {
      profession: report.profession,
      summary: report.summary,
      ikigai_scores: report.ikigai_scores,
      voice_analysis: report.voice_analysis,
      face_analysis: report.face_analysis
    },
    {
      top_roles: report.top_roles.slice(0, 2),
      ikigai_zones: report.ikigai_zones,
      career_action: report.career_action,
      final_insight: report.final_insight
    },
    report.top_roles.slice(2)
  );
  assert.equal(reassembled.top_roles.length, 5);
  assert.deepEqual(reassembled.top_roles.map((role) => role.name), report.top_roles.map((role) => role.name));
});

test("free report normalizes incorrect premium role count and route duration", async () => {
  process.env.DATABASE_URL ??= "postgresql://levelup:dev_password@localhost:5432/levelup";
  process.env.PARTNER_CORE_URL = "";

  const { normalizeFreeReportValue } = await import("./aiReport.js");
  const report = normalizeFreeReportValue({
    profession: "Продуктовый стратег",
    summary: "Сильнее всего сейчас проявляется способность соединять анализ, людей и практические решения.",
    ikigai_scores: { love: 80, good_at: 72, paid_for: 65, world_needs: 70 },
    key_insight: "Полезно проверить эту профессиональную гипотезу через один небольшой проект и внешнюю обратную связь.",
    paid_report_teaser: "В полном отчёте будут Топ-3 роли и пошаговый 90-дневный маршрут.",
    paid_report_preview: [
      "Топ-3 перспективные роли следующего карьерного уровня",
      "Пошаговый 90-дневный план перехода",
      "Расширенный анализ голоса",
      "Персональные зоны Икигай"
    ]
  });

  assert.match(report.paid_report_teaser ?? "", /ТОП-5/);
  assert.match(report.paid_report_teaser ?? "", /30-дневный/);
  assert.doesNotMatch(JSON.stringify(report), /Топ-3|90-дневный/);
});
