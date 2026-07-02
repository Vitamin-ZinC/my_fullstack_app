const { test, expect } = require("@playwright/test");

const apiBase = "http://localhost:3001";
const appBase = "http://localhost:3000";
const pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAASElEQVR4nO3PQQ0AIBDAMMC/5+ONAvZoFSzZnpldtwJ8NgEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAb4GSAABlzm3xQAAAABJRU5ErkJggg==";
const corsHeaders = {
  "access-control-allow-origin": appBase,
  "access-control-allow-credentials": "true",
  "access-control-allow-headers": "content-type,x-session-id,x-guest-token,x-locale",
  "access-control-allow-methods": "GET,POST,PUT,OPTIONS"
};

async function fulfillJson(route, json) {
  if (route.request().method() === "OPTIONS") {
    await route.fulfill({ status: 204, headers: corsHeaders });
    return;
  }
  await route.fulfill({ json, headers: corsHeaders });
}

const diagnosticText = "Параметр сформирован как развернутый диагностический ответ: он объясняет рабочее проявление, пользу, риск и следующий шаг развития.";

function createHabitProgram(overrides = {}) {
  const activeEnrollment = {
    id: "habit-enrollment-1",
    slug: "sleep-foundation",
    cycle: 1,
    week: 1,
    title: "Сон как фундамент",
    focus: "Вернуть базовый ресурс без давления",
    essence: "Устойчивость начинается с восстановления.",
    practice: "Выбери один вечерний якорь на 10 минут.",
    why: "Так решения становятся спокойнее и точнее.",
    book: "Атомные привычки",
    zone: "resource",
    status: "ACTIVE",
    sortOrder: 1,
    checkinsDone: 0,
    lastCheckinAt: null
  };
  const base = {
    id: "habit-program-1",
    status: "ACTIVE",
    source: "analysis-report",
    title: "Навигатор привычек ORKEN.LIFE",
    weakZone: "profession",
    archetype: "Продуктовый стратег",
    topRole: "Продуктовый стратег",
    careerAction: "Неделя 1: собрать один маленький шаг и проверить его в реальности.",
    finalInsight: "Комплексный AI-анализ показывает сильный вектор к структурной коммуникации.",
    startedAt: "2026-07-02T00:00:00.000Z",
    createdAt: "2026-07-02T00:00:00.000Z",
    activeEnrollment,
    enrollments: [activeEnrollment],
    insights: [],
    metrics: [],
    rewards: [{ id: "reward-1", type: "start", label: "Старт программы", xp: 10, createdAt: "2026-07-02T00:00:00.000Z" }],
    stats: { xp: 10, daysInProgram: 1, checkinsDone: 0, insightsCount: 0, streakDays: 0, currentWeek: 1 }
  };

  return {
    ...base,
    ...overrides,
    stats: { ...base.stats, ...(overrides.stats || {}) },
    activeEnrollment: overrides.activeEnrollment ?? activeEnrollment,
    enrollments: overrides.enrollments ?? [overrides.activeEnrollment ?? activeEnrollment]
  };
}

test.use({
  permissions: ["microphone", "camera"],
  launchOptions: {
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"]
  }
});

test("ORKEN.LIFE frontend flow works with mocked backend", async ({ page }) => {
  let contactRequests = 0;
  await page.route(`${apiBase}/api/content/ru`, async (route) => fulfillJson(route, { locale: "ru", value: null }));
  await page.route(`${apiBase}/api/auth/guest`, async (route) => fulfillJson(route, { sessionId: "test-session", guestToken: "test-token" }));
  await page.route(`${apiBase}/api/analyses`, async (route) => fulfillJson(route, {
    analysisId: "analysis-test",
    audioUploadUrl: `${apiBase}/uploads/audio-test`,
    photoUploadUrl: `${apiBase}/uploads/photo-test`
  }));
  await page.route(`${apiBase}/uploads/**`, async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }
    expect(route.request().method()).toBe("PUT");
    await route.fulfill({ status: 200, body: "ok", headers: corsHeaders });
  });
  await page.route(`${apiBase}/api/analyses/analysis-test/confirm`, async (route) => {
    const body = route.request().postDataJSON();
    expect(body.ikigaiAnswers).toEqual({ love: [], good_at: [], world_needs: [], paid_for: [] });
    expect(body.clientMetrics.voiceDurationSeconds).toBeGreaterThanOrEqual(30);
    await fulfillJson(route, { status: "QUEUED", jobId: "job-test" });
  });
  await page.route(`${apiBase}/api/analyses/analysis-test/stream**`, async (route) => route.fulfill({
    status: 200,
    headers: { ...corsHeaders, "content-type": "text/event-stream" },
    body: "data: {\"status\":\"DONE\",\"progress\":100,\"log\":\"Report ready\"}\n\n"
  }));
  await page.route(`${apiBase}/api/analyses/analysis-test/status`, async (route) => fulfillJson(route, { status: "DONE", progress: 100 }));
  await page.route(`${apiBase}/api/analyses/analysis-test/contact`, async (route) => {
    contactRequests += 1;
    expect(route.request().postDataJSON()).toEqual({ email: "test@orken.life" });
    await fulfillJson(route, { ok: true, emailSent: true, emailId: "email-test" });
  });
  await page.route(`${apiBase}/api/analyses/analysis-test/report/free`, async (route) => fulfillJson(route, {
    reportFree: {
      profession: "Продуктовый стратег",
      summary: "Короткий бесплатный отчет сформирован и дает один понятный профессиональный вектор.",
      ikigai_scores: { love: 82, good_at: 77, world_needs: 74, paid_for: 69 },
      key_insight: "Уже виден паттерн стратегии, упаковки пользы и рыночной проверки.",
      paid_report_teaser: "Полный отчет открывает голос, лицо, роли, риски и 30-дневный маршрут.",
      paid_report_preview: ["Голос", "Лицо", "Зоны Икигай", "Топ ролей", "Риски", "План"]
    }
  }));
  await page.route(`${apiBase}/api/analyses/analysis-test/report/full`, async (route) => fulfillJson(route, {
    reportFull: {
      profession: "Product strategist",
      summary: "Full AI report generated from the same analysis.",
      ikigai_scores: { love: 82, good_at: 77, world_needs: 74, paid_for: 69 },
      voice_analysis: {
        timbre: "Тембр звучит спокойно и помогает удерживать доверие в экспертном разговоре.",
        emotionality: diagnosticText,
        confidence: diagnosticText,
        pace: diagnosticText,
        energy: diagnosticText,
        leadership: diagnosticText,
        anxiety: diagnosticText,
        communication: diagnosticText,
        charisma: diagnosticText,
        analytical: diagnosticText,
        sociality: diagnosticText,
        persuasion: diagnosticText,
        motivation: diagnosticText
      },
      face_analysis: {
        emotionality: diagnosticText,
        leadership: diagnosticText,
        confidence: diagnosticText,
        thinkingType: diagnosticText,
        sociality: diagnosticText,
        stressTolerance: diagnosticText,
        analytical: diagnosticText,
        motivation: diagnosticText,
        empathy: diagnosticText,
        openness: diagnosticText,
        communication: diagnosticText,
        discipline: diagnosticText,
        ambition: diagnosticText
      },
      top_roles: [{
        name: "Product strategist",
        match: 87,
        why: "Combines analysis, market view and structured communication.",
        voiceEvidence: "Voice supports calm expert communication.",
        faceEvidence: "Visual signal supports focus and structure.",
        strengths: "Research, prioritization and explanation.",
        risks: "Can overprepare before market validation."
      }],
      ikigai_zones: {
        passion: { title: "Страсть", insight: "Интерес связан с исследованием и развитием идей.", recommendation: "Проверить один формат регулярной практики." },
        mission: { title: "Миссия", insight: "Польза возникает через ясность для рынка.", recommendation: "Сформулировать одну проблему аудитории." },
        profession: { title: "Профессия", insight: "Профессиональная зона сильна через стратегию и продукт.", recommendation: "Собрать короткий оффер." },
        vocation: { title: "Призвание", insight: "Монетизация связана с консультациями и внедрением.", recommendation: "Показать оффер трем людям." },
        ikigai: { title: "Икигай", insight: "Центр реализации находится в экспертной стратегии.", recommendation: "Проверить ценность за 30 дней." }
      },
      career_action: "Validate one paid offer this week.",
      final_insight: "Комплексный AI-анализ показывает синхронизацию внешнего проявления и внутреннего потенциала. Уверенность в голосе и собранный визуальный сигнал создают фундамент для продуктовой стратегии, управления и обучения других."
    }
  }));
  await page.route(`${apiBase}/api/payments/config`, async (route) => fulfillJson(route, {
    amount: 300,
    currency: "usd",
    priceLabel: "$3"
  }));
  await page.route(`${apiBase}/api/payments/create-checkout-session`, async (route) => {
    expect(route.request().postDataJSON()).toMatchObject({ analysisId: "analysis-test", promoCode: "FREE100" });
    await fulfillJson(route, {
      url: `${appBase}/report/analysis-test/full`,
      sessionId: "promo-analysis-test",
      amount: 0,
      originalAmount: 300,
      discountAmount: 300,
      currency: "usd",
      promoCode: "FREE100"
    });
  });
  await page.route(`${apiBase}/api/habits/enroll-from-report/analysis-test`, async (route) => {
    expect(route.request().method()).toBe("POST");
    await fulfillJson(route, { program: createHabitProgram() });
  });

  await page.goto(`${appBase}/`);
  await expect(page.getByText("ORKEN.LIFE").first()).toBeVisible();
  await page.getByTestId("landing-start-primary").click();
  await expect(page).toHaveURL(/\/flow\/voice$/);

  await expect(page.getByTestId("voice-record-button")).toBeEnabled({ timeout: 30000 });
  await page.getByTestId("voice-record-button").click();
  await expect(page.getByTestId("voice-stop-locked")).toBeVisible();
  await expect(page.getByTestId("voice-stop-button")).toHaveCount(0);
  const firstTopic = await page.getByTestId("voice-active-topic").innerText();
  await page.waitForTimeout(7600);
  await expect.poll(async () => page.getByTestId("voice-active-topic").innerText()).not.toBe(firstTopic);
  await page.waitForTimeout(23100);
  await expect(page.getByTestId("voice-stop-button")).toBeVisible({ timeout: 5000 });
  await page.getByTestId("voice-stop-button").click();
  await expect(page.locator("audio[controls]")).toBeVisible({ timeout: 15000 });
  await page.getByTestId("voice-next-link").click();
  await expect(page).toHaveURL(/\/flow\/face$/);

  await expect(page.getByTestId("face-file-button")).toBeEnabled({ timeout: 30000 });
  await page.getByTestId("face-file-input").setInputFiles({
    name: "face.png",
    mimeType: "image/png",
    buffer: Buffer.from(pngBase64, "base64")
  });
  await expect(page.getByTestId("face-metrics")).toBeVisible({ timeout: 10000 });
  await expect(page.getByTestId("face-next-link")).toHaveText("Узнать результат");
  const confirmResponse = page.waitForResponse(`${apiBase}/api/analyses/analysis-test/confirm`);
  await page.getByTestId("face-next-link").click();
  await confirmResponse;
  await expect(page).toHaveURL(/\/flow\/analysis$/, { timeout: 15000 });
  await expect(page.getByTestId("free-report-link")).toBeVisible({ timeout: 10000 });

  await page.getByTestId("analysis-email-input").fill("random input");
  await page.getByTestId("free-report-link").click();
  await expect(page.getByText("Введите корректный email адрес")).toBeVisible();
  await expect(page).toHaveURL(/\/flow\/analysis$/);
  expect(contactRequests).toBe(0);

  await page.getByTestId("analysis-email-input").fill("test@orken.life");
  const contactResponse = page.waitForResponse(`${apiBase}/api/analyses/analysis-test/contact`);
  await page.getByTestId("free-report-link").click();
  await contactResponse;
  expect(contactRequests).toBe(1);
  await expect(page).toHaveURL(/\/report\/analysis-test\/free$/);
  await expect(page.getByText("Продуктовый стратег")).toBeVisible();
  await page.getByTestId("open-pro-report-link").click();

  await expect(page).toHaveURL(/\/pay\/analysis-test$/);
  await expect(page.locator(".card-art")).toHaveCount(0);
  await page.getByTestId("promo-code-input").fill("FREE100");
  const checkoutResponse = page.waitForResponse(`${apiBase}/api/payments/create-checkout-session`);
  await page.getByTestId("checkout-button").click();
  await checkoutResponse;
  await expect(page).toHaveURL(/\/report\/analysis-test\/full$/, { timeout: 15000 });
  await expect(page.getByTestId("full-report-page")).toBeVisible();
  await expect(page.getByText("Product strategist").first()).toBeVisible();
  await expect(page.getByText("8. Итоговое аналитическое заключение")).toBeVisible();
  await expect(page.getByText("Нажмите на один из разделов диаграммы Икигай")).toBeVisible();
  await expect(page.getByTestId("ikigai-hotspot-passion")).toBeVisible();
  await page.getByTestId("ikigai-hotspot-passion").click();
  await expect(page.getByTestId("ikigai-zone-panel")).toContainText("Страсть");
  await expect(page.getByTestId("ikigai-zone-panel")).toContainText("Интерес связан");
  await expect(page.getByText("Тембр звучит спокойно")).toBeVisible();
  await expect(page.getByText("Комплексный AI-анализ показывает")).toBeVisible();

  await page.evaluate(() => {
    window.print = () => {
      window.sessionStorage.setItem("print-called", "1");
    };
  });
  await page.getByTestId("save-report-pdf-button").click();
  await expect.poll(async () => page.evaluate(() => window.sessionStorage.getItem("print-called"))).toBe("1");

  await page.getByTestId("activate-habits-link").click();
  await expect(page).toHaveURL(/\/habits\?from=ikigai&analysisId=analysis-test$/);
  await expect(page.getByTestId("habits-app")).toBeVisible();
  await expect(page.getByText("Навигатор привычек ORKEN.LIFE")).toBeVisible({ timeout: 15000 });
});

test("legacy ikigai flow route launches analysis instead of showing the map step", async ({ page }) => {
  await page.route(`${apiBase}/api/content/ru`, async (route) => fulfillJson(route, { locale: "ru", value: null }));
  await page.route(`${apiBase}/api/analyses/analysis-test/confirm`, async (route) => {
    expect(route.request().postDataJSON()).toEqual({
      ikigaiAnswers: { love: [], good_at: [], world_needs: [], paid_for: [] }
    });
    await fulfillJson(route, { status: "QUEUED", jobId: "job-test" });
  });
  await page.route(`${apiBase}/api/analyses/analysis-test/stream**`, async (route) => route.fulfill({
    status: 200,
    headers: { ...corsHeaders, "content-type": "text/event-stream" },
    body: "data: {\"status\":\"DONE\",\"progress\":100,\"log\":\"Report ready\"}\n\n"
  }));
  await page.route(`${apiBase}/api/analyses/analysis-test/status`, async (route) => fulfillJson(route, { status: "DONE", progress: 100 }));

  await page.addInitScript(({ apiUrl }) => {
    window.sessionStorage.setItem("levelup_session_id", "test-session");
    window.sessionStorage.setItem("levelup_guest_token", "test-token");
    window.sessionStorage.setItem("levelup_analysis_id", "analysis-test");
    window.sessionStorage.setItem("levelup_audio_upload_url", `${apiUrl}/uploads/audio-test`);
    window.sessionStorage.setItem("levelup_photo_upload_url", `${apiUrl}/uploads/photo-test`);
  }, { apiUrl: apiBase });

  const confirmResponse = page.waitForResponse(`${apiBase}/api/analyses/analysis-test/confirm`);
  await page.goto(`${appBase}/flow/ikigai`);
  await confirmResponse;
  await expect(page).toHaveURL(/\/flow\/analysis$/, { timeout: 15000 });
  await expect(page.getByText("Карта Икигай")).toHaveCount(0);
});

test("habits tracker records daily marks and uses AI navigator", async ({ page }) => {
  const program = createHabitProgram();
  await page.route(`${apiBase}/api/auth/guest`, async (route) => fulfillJson(route, { sessionId: "habit-session", guestToken: "habit-token" }));
  await page.route(`${apiBase}/api/habits/me`, async (route) => fulfillJson(route, {
    program,
    latestReport: null
  }));
  await page.route(`${apiBase}/api/habits/metrics`, async (route) => {
    expect(route.request().postDataJSON()).toMatchObject({
      programId: "habit-program-1",
      energy: 6,
      clarity: 6,
      stability: 6
    });
    await fulfillJson(route, {
      program: createHabitProgram({
        metrics: [{ id: "metric-1", date: "2026-07-02", energy: 6, clarity: 6, stability: 6 }]
      })
    });
  });
  await page.route(`${apiBase}/api/habits/checkins`, async (route) => {
    expect(route.request().postDataJSON()).toMatchObject({
      programId: "habit-program-1",
      enrollmentId: "habit-enrollment-1",
      completed: true
    });
    await fulfillJson(route, {
      program: createHabitProgram({
        stats: { xp: 20, checkinsDone: 1, streakDays: 1 },
        activeEnrollment: { ...program.activeEnrollment, checkinsDone: 1 },
        rewards: [
          ...program.rewards,
          { id: "reward-2", type: "checkin", label: "Шаг отмечен", xp: 10, createdAt: "2026-07-02T00:02:00.000Z" }
        ]
      })
    });
  });
  await page.route(`${apiBase}/api/habits/navigator`, async (route) => fulfillJson(route, {
    reply: "Пингви видит состояние и предлагает один маленький шаг на сегодня.",
    threadId: "thread-test",
    model: "test"
  }));

  await page.goto(`${appBase}/habits`);
  await expect(page.getByTestId("habits-app")).toBeVisible({ timeout: 15000 });
  await expect(page.getByText("Навигатор привычек ORKEN.LIFE")).toBeVisible();
  await expect(page.getByText("Сегодняшний фокус")).toBeVisible();

  await page.getByRole("button", { name: /Сохранить состояние/ }).click();
  await expect(page.getByText("Метрика дня сохранена")).toBeVisible();

  await page.getByPlaceholder("Короткая заметка к сегодняшнему шагу").fill("Audit");
  await page.getByRole("button", { name: /Сохранить мягкий шаг/ }).click();
  await expect(page.getByText("Шаг отмечен, награда добавлена")).toBeVisible();

  await page.getByRole("button", { name: /^Навигатор$/ }).click();
  await expect(page.getByText("AI Навигатор")).toBeVisible();
  await page.getByRole("button", { name: "Что сделать сегодня?" }).click();
  await expect(page.getByText("Пингви видит состояние")).toBeVisible({ timeout: 10000 });
});

test("password registration opens account with report history", async ({ page }) => {
  await page.route(`${apiBase}/api/auth/guest`, async (route) => fulfillJson(route, { sessionId: "auth-session", guestToken: "auth-token" }));
  await page.route(`${apiBase}/api/auth/register`, async (route) => {
    expect(route.request().postDataJSON()).toEqual({
      email: "client@orken.life",
      password: "strongpass1",
      name: "Client"
    });
    await fulfillJson(route, {
      sessionId: "auth-session",
      guestToken: "auth-token",
      user: {
        id: "user-auth",
        email: "client@orken.life",
        name: "Client",
        locale: "ru",
        role: "USER",
        status: "ACTIVE",
        emailVerifiedAt: "2026-07-02T00:00:00.000Z",
        lastLoginAt: "2026-07-02T00:00:00.000Z",
        createdAt: "2026-07-02T00:00:00.000Z"
      }
    });
  });
  await page.route(`${apiBase}/api/me`, async (route) => fulfillJson(route, {
    user: {
      id: "user-auth",
      email: "client@orken.life",
      name: "Client",
      locale: "ru",
      role: "USER",
      status: "ACTIVE",
      emailVerifiedAt: "2026-07-02T00:00:00.000Z",
      lastLoginAt: "2026-07-02T00:00:00.000Z",
      createdAt: "2026-07-02T00:00:00.000Z"
    },
    reportCount: 1,
    lastAnalysis: null
  }));
  await page.route(`${apiBase}/api/me/reports`, async (route) => fulfillJson(route, [{
    id: "analysis-auth",
    status: "DONE",
    createdAt: "2026-07-02T00:00:00.000Z",
    completedAt: "2026-07-02T00:01:00.000Z",
    profession: "Продуктовый стратег",
    summary: "Сохраненный отчет в личном кабинете.",
    fullReportAvailable: true,
    paymentStatus: "SUCCEEDED",
    amountPaid: 0,
    currency: "usd"
  }]));

  await page.goto(`${appBase}/login`);
  await page.getByText("Пароль").click();
  await page.getByText("Нет аккаунта? Создать").click();
  await page.getByPlaceholder("Как к вам обращаться").fill("Client");
  await page.getByPlaceholder("you@email.com").fill("client@orken.life");
  await page.getByPlaceholder("минимум 8 символов").fill("strongpass1");
  await page.getByTestId("password-auth-submit").click();

  await expect(page).toHaveURL(/\/account$/, { timeout: 10000 });
  await expect(page.getByTestId("account-page")).toBeVisible();
  await expect(page.getByText("Привычки и AI Навигатор")).toBeVisible();
  await expect(page.getByText("Продуктовый стратег")).toBeVisible();
  await expect(page.getByText("Полный отчёт")).toBeVisible();
});
