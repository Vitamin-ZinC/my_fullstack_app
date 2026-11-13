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

test("English normalization preserves English diagnostics and localizes every generated fallback", async () => {
  process.env.DATABASE_URL ??= "postgresql://levelup:dev_password@localhost:5432/levelup";
  const { normalizeFullReportValue } = await import("./aiReport.js");
  const existing = "Your result: Clear delivery. What it means: This can help explain an idea without pressure. Recommendation: Test one short presentation and ask for feedback.";
  const report = normalizeFullReportValue({
    profession: "Product strategist",
    summary: "A working hypothesis about a professional direction based on the questionnaire and practical experiments.",
    voice_analysis: { communication: existing }, top_roles: []
  }, "en");
  assert.equal(report.voice_analysis.communication, existing);
  assert.equal(report.top_roles.length, 5);
  assert.doesNotMatch(JSON.stringify(report), /[А-Яа-яЁё]/);
  assert.match(report.face_analysis.communication, /Your result:/);
  assert.match(report.face_analysis.communication, /What it means:/);
  assert.match(report.face_analysis.communication, /Recommendation:/);
});

test("legacy free report presentation removes fictional questionnaire references without mutating saved data", async () => {
  const { normalizeFreeReportValue } = await import("./aiReport.js");
  const original = {
    profession: "Исследователь", summary: "Пустая анкета пока не раскрывает ваши интересы. В рассказе вы описали интерес к исследованиям.",
    key_insight: "Фотография и манера речи дают лишь осторожную подсказку, но не позволяют делать выводы о характере. Проверьте интерес к исследованиям через один небольшой проект.",
    ikigai_scores: { love: 70, good_at: 70, paid_for: 60, world_needs: 65 },
    paid_report_teaser: "Полный отчёт содержит пять направлений и маршрут на 30 дней.", paid_report_preview: ["Голос", "Фото", "Икигай", "Маршрут"]
  };
  const before = structuredClone(original);
  const result = normalizeFreeReportValue(original, "ru", false);
  assert.doesNotMatch(result.summary, /анкет/);
  assert.match(result.summary, /интерес к исследованиям/);
  assert.doesNotMatch(result.key_insight || "", /лишь осторожную подсказку/);
  assert.deepEqual(original, before);
  const researcher = normalizeFreeReportValue({ ...original, summary: "Вы рассказали о проектировании анкет и исследовании клиентов. Это направление стоит проверить на практике." }, "ru", false);
  assert.match(researcher.summary, /проектировании анкет/);
  assert.match(normalizeFreeReportValue(original, "ru", true).summary, /анкета/);
});

test("premium preview deduplicates role promises without mistaking the role of voice for a profession", async () => {
  const { normalizeFreeReportValue } = await import("./aiReport.js");
  const report = normalizeFreeReportValue({ profession: "Исследователь", summary: "Практическое направление для исследования и проверки рабочих интересов.", key_insight: "Проверьте направление через небольшой проект и обратную связь.", ikigai_scores: { love: 70, good_at: 65, world_needs: 65, paid_for: 60 }, paid_report_teaser: "Пять направлений и план на тридцать дней.", paid_report_preview: ["ТОП-5 направлений", "Топ-3 перспективные роли", "Роль голоса в общении", "План на 30 дней"] });
  const preview = report.paid_report_preview ?? [];
  assert.equal(preview.filter(item => item.startsWith("ТОП-5")).length, 1);
  assert.ok(preview.includes("Роль голоса в общении"));
  assert.equal(new Set(preview).size, preview.length);
  assert.ok(preview.length >= 4);
});
