const { test, expect } = require("@playwright/test");
const path = require("node:path");

const apiBase = process.env.E2E_API_BASE ?? "http://localhost:3001";
const appBase = process.env.E2E_APP_BASE ?? "http://localhost:3000";
const testPhotoPath = path.join(__dirname, "..", "assets", "ikigai-cones.jpg");
const corsHeaders = {
  "access-control-allow-origin": appBase,
  "access-control-allow-credentials": "true",
  "access-control-allow-headers": "content-type,x-session-id,x-guest-token,x-locale",
  "access-control-allow-methods": "GET,POST,PUT,PATCH,OPTIONS"
};

async function fulfillJson(route, json) {
  if (route.request().method() === "OPTIONS") {
    await route.fulfill({ status: 204, headers: corsHeaders });
    return;
  }
  await route.fulfill({ json, headers: corsHeaders });
}

const diagnosticText = "Параметр сформирован как развернутый диагностический ответ: он объясняет рабочее проявление, пользу, риск и следующий шаг развития.";
const habitConfig = {
  amount: 800,
  currency: "usd",
  priceLabel: "$8",
  trialDays: 30
};
const habitCycles = [
  { id: 1, code: "foundation", title: "ОСНОВА", label: "Цикл 1", areas: ["Энергия", "Ясность", "Устойчивость"], goal: "Собрать опору.", weeks: 12 },
  { id: 2, code: "realization", title: "РЕАЛИЗАЦИЯ", label: "Цикл 2", areas: ["Роль", "Формат", "Ценность"], goal: "Перевести выводы в действия.", weeks: 12 },
  { id: 3, code: "growth", title: "РОСТ", label: "Цикл 3", areas: ["Масштаб", "Влияние", "Выбор"], goal: "Усилить рабочее.", weeks: 12 },
  { id: 4, code: "integration", title: "ИНТЕГРАЦИЯ", label: "Цикл 4", areas: ["Смысл", "Баланс", "Долгосрочность"], goal: "Интегрировать путь.", weeks: 12 }
];

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
    lastCheckinAt: null,
    checkins: []
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
    profile: { name: "Client", onboardingWeakZone: "profession" },
    currentCycle: 1,
    currentWeek: 1,
    currentSortOrder: 1,
    startedAt: "2026-07-02T00:00:00.000Z",
    createdAt: "2026-07-02T00:00:00.000Z",
    activeEnrollment,
    enrollments: [activeEnrollment],
    cycles: habitCycles,
    insights: [],
    metrics: [],
    rewards: [{ id: "reward-1", type: "start", label: "Старт программы", xp: 10, createdAt: "2026-07-02T00:00:00.000Z" }],
    settings: {
      reminderEnabled: true,
      reminderTime: "09:00",
      weeklyFreezes: 1,
      subscriptionStatus: "TRIAL",
      trialStartedAt: "2026-07-02T00:00:00.000Z",
      trialEndsAt: "2026-08-01T00:00:00.000Z",
      trialDaysLeft: 30
    },
    stats: {
      xp: 10,
      daysInProgram: 1,
      checkinsDone: 0,
      insightsCount: 0,
      streakDays: 0,
      currentCycle: 1,
      currentWeek: 1,
      currentSortOrder: 1,
      totalWeeks: 48,
      completedWeekCheckins: 0,
      weekProgress: 0,
      wellnessScore: null,
      rank: { title: "Начало пути", level: 1, nextTitle: "Практик Икигай", nextAtXp: 420, progress: 2, currentSortOrder: 1 }
    }
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

test("partner referral is captured before leaving the landing", async ({ page }) => {
  await page.route(`${apiBase}/api/content/ru`, async (route) => fulfillJson(route, { locale: "ru", value: null }));
  await page.goto(`${appBase}/?ref=COACH-AUDIT-2026`);

  await expect.poll(() => page.evaluate(() => window.localStorage.getItem("orken_referral_code"))).toBe("COACH-AUDIT-2026");
  await expect(page).toHaveURL(`${appBase}/`);

  await page.getByRole("link", { name: "Пройти диагностику" }).first().click();
  await expect(page).toHaveURL(/\/flow\/voice$/);
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem("orken_referral_code"))).toBe("COACH-AUDIT-2026");
});

test("voice flow renews an expired guest session before recording", async ({ page }) => {
  let analysisRequests = 0;
  let guestRequests = 0;
  await page.addInitScript(() => {
    window.localStorage.setItem("levelup_session_id", "expired-session");
    window.localStorage.setItem("levelup_guest_token", "expired-token");
  });
  await page.route(`${apiBase}/api/content/ru`, async (route) => fulfillJson(route, { locale: "ru", value: null }));
  await page.route(`${apiBase}/api/auth/guest`, async (route) => {
    guestRequests += 1;
    await fulfillJson(route, { sessionId: "fresh-session", guestToken: "fresh-token" });
  });
  await page.route(`${apiBase}/api/analyses`, async (route) => {
    analysisRequests += 1;
    const headers = route.request().headers();
    if (analysisRequests === 1) {
      expect(headers["x-session-id"]).toBe("expired-session");
      expect(headers["x-guest-token"]).toBe("expired-token");
      await route.fulfill({
        status: 401,
        json: { error: "Invalid or expired session" },
        headers: corsHeaders
      });
      return;
    }
    expect(headers["x-session-id"]).toBe("fresh-session");
    expect(headers["x-guest-token"]).toBe("fresh-token");
    await fulfillJson(route, {
      analysisId: "renewed-analysis",
      audioUploadUrl: `${apiBase}/uploads/renewed-audio`,
      photoUploadUrl: `${apiBase}/uploads/renewed-photo`
    });
  });

  await page.goto(`${appBase}/flow/voice`);
  await page.getByTestId("voice-consent").getByRole("checkbox").check();
  await page.getByTestId("voice-record-button").click();

  await expect.poll(() => page.evaluate(() => window.localStorage.getItem("levelup_session_id"))).toBe("fresh-session");
  await expect(page.getByText("Invalid or expired session")).toHaveCount(0);
  expect(analysisRequests).toBe(2);
  expect(guestRequests).toBe(1);
});

test("admin business reports show subscription types and export CSV on mobile", async ({ page }) => {
  let requestedDays = "";
  await page.addInitScript(() => window.sessionStorage.setItem("levelup_admin_session", "admin-report-session"));
  await page.route(`${apiBase}/api/admin/reports/business**`, async (route) => {
    requestedDays = new URL(route.request().url()).searchParams.get("days") ?? "";
    await fulfillJson(route, {
      generatedAt: "2026-08-12T08:00:00.000Z",
      range: { days: Number(requestedDays), from: "2026-07-13T08:00:00.000Z", to: "2026-08-12T08:00:00.000Z" },
      users: { total: 120, newInPeriod: 18, activeInPeriod: 44 },
      diagnostics: {
        createdInPeriod: 30,
        completedInPeriod: 24,
        failedInPeriod: 2,
        byStatus: [{ key: "DONE", count: 24 }, { key: "FAILED", count: 2 }, { key: "PROCESSING", count: 4 }]
      },
      payments: {
        createdInPeriod: 12,
        succeededInPeriod: 10,
        promoUsesInPeriod: 3,
        byStatus: [{ key: "SUCCEEDED", count: 10 }, { key: "PENDING", count: 2 }],
        revenue: [{ amount: 3000, currency: "usd" }],
        discounts: [{ amount: 450, currency: "usd" }],
        recent: [{
          id: "payment-report-1",
          userEmail: "report@example.com",
          productType: "DIAGNOSTIC_REPORT",
          status: "SUCCEEDED",
          amount: 300,
          originalAmount: 500,
          discountAmount: 200,
          currency: "usd",
          promoCode: "WELCOME",
          createdAt: "2026-08-11T08:00:00.000Z",
          paidAt: "2026-08-11T08:01:00.000Z"
        }]
      },
      subscriptions: {
        totalPrograms: 70,
        createdInPeriod: 14,
        trialStartedInPeriod: 12,
        paidCurrent: 9,
        cancellingCurrent: 1,
        trialsEndingWithin7Days: 4,
        cohortTrialToPaidPercent: 25,
        byStatus: [{ key: "TRIAL", count: 50 }, { key: "ACTIVE", count: 9 }, { key: "EXPIRED_TRIAL", count: 11 }],
        byAccessType: [{ key: "STANDARD_TRIAL", count: 50 }, { key: "PAID_SUBSCRIPTION", count: 9 }, { key: "GIFTED_DAYS", count: 6 }, { key: "PARTNER_BONUS", count: 5 }],
        estimatedMrr: { amount: 7200, currency: "usd" },
        estimatedArr: { amount: 86400, currency: "usd" },
        rows: [{
          id: "program-report-1",
          userId: "user-report-1",
          userEmail: "subscriber@example.com",
          title: "Навигатор привычек ORKEN.LIFE",
          planType: "HABITS_MONTHLY",
          accessType: "GIFTED_DAYS",
          status: "TRIAL",
          source: "analysis-report",
          trialStartedAt: "2026-08-01T00:00:00.000Z",
          trialEndsAt: "2026-09-01T00:00:00.000Z",
          currentPeriodEnd: null,
          cancelAtPeriodEnd: false,
          createdAt: "2026-08-01T00:00:00.000Z",
          updatedAt: "2026-08-11T00:00:00.000Z"
        }]
      },
      coaches: {
        applicationsTotal: 8,
        applicationsInPeriod: 3,
        byStatus: [{ key: "NEW", count: 3 }, { key: "APPROVED", count: 5 }],
        byPracticeFormat: [{ key: "individual", count: 6 }, { key: "groups", count: 2 }],
        byInterest: [{ key: "referral", count: 5 }, { key: "marketplace", count: 3 }]
      },
      partners: {
        attributedUsersTotal: 20,
        attributionsInPeriod: 6,
        bonusesAppliedTotal: 18,
        eventsInPeriod: 16,
        eventsByType: [{ key: "SIGNUP", count: 6 }, { key: "PAYMENT", count: 10 }],
        redemptionsInPeriod: 2,
        redemptionsByStatus: [{ key: "FULFILLED", count: 2 }]
      }
    });
  });
  await page.route(`${apiBase}/api/admin/partner-core`, async (route) => fulfillJson(route, {
    configured: true,
    project: { name: "Orken" },
    programs: [],
    referralLinks: [],
    placements: [],
    partners: [{ id: "partner-1", email: "coach@example.com", account_type: "coach", project_status: "approved", referral_links_count: 2, conversions_count: 4, payable_cents: 1200 }],
    redemptions: [],
    walletOperations: [],
    ledgerEntries: [],
    reviewTasks: []
  }));

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${appBase}/admin/reports`);
  await expect(page.getByRole("heading", { name: "Отчёты и аналитика" })).toBeVisible();
  await expect(page.getByText("Подаренные дни").first()).toBeVisible();
  await expect(page.getByText("subscriber@example.com")).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "CSV" }).click();
  await expect((await download).suggestedFilename()).toBe("orken-report-2026-08-12.csv");

  await page.getByRole("combobox", { name: "Период" }).selectOption("7");
  await page.getByRole("button", { name: "Применить" }).click();
  await expect.poll(() => requestedDays).toBe("7");
});

test("ORKEN.LIFE frontend flow works with mocked backend", async ({ page }) => {
  let contactRequests = 0;
  await page.route(`${apiBase}/api/content/ru`, async (route) => fulfillJson(route, { locale: "ru", value: null }));
  await page.route(`${apiBase}/api/auth/guest`, async (route) => fulfillJson(route, { sessionId: "test-session", guestToken: "test-token" }));
  await page.route(`${apiBase}/api/analyses`, async (route) => {
    expect(route.request().postDataJSON()).toMatchObject({ audioConsent: true });
    await fulfillJson(route, {
      analysisId: "analysis-test",
      audioUploadUrl: `${apiBase}/uploads/audio-test`,
      photoUploadUrl: `${apiBase}/uploads/photo-test`
    });
  });
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
  await page.route(`${apiBase}/api/analyses/analysis-test/photo/validate`, async (route) => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().postDataJSON()).toEqual({ consent: true });
    await fulfillJson(route, { suitable: true, cached: false, confidence: 0.97 });
  });
  await page.route(`${apiBase}/api/analyses/analysis-test/audio/validate`, async (route) => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().postDataJSON()).toEqual({ consent: true });
    await fulfillJson(route, { suitable: true, cached: false, wordCount: 42 });
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
      top_roles: [
        ["Product strategist", 87],
        ["AI product researcher", 82],
        ["Learning experience designer", 78],
        ["Innovation program manager", 73],
        ["Independent strategy consultant", 68]
      ].map(([name, match]) => ({
        name,
        match,
        why: `${name} combines analysis, market view and structured communication.`,
        voiceEvidence: "Voice supports calm expert communication.",
        faceEvidence: "Visual signal supports focus and structure.",
        strengths: "Research, prioritization and explanation.",
        risks: "Can overprepare before market validation."
      })),
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
    await fulfillJson(route, { program: createHabitProgram(), config: habitConfig });
  });

  await page.goto(`${appBase}/`);
  await expect(page.getByText("ORKEN.LIFE").first()).toBeVisible();
  await page.getByTestId("landing-start-primary").click();
  await expect(page).toHaveURL(/\/flow\/voice$/);

  await expect(page.getByTestId("voice-record-button")).toBeDisabled({ timeout: 30000 });
  await page.getByTestId("voice-consent").locator("input").check();
  await expect(page.getByTestId("voice-record-button")).toBeEnabled();
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

  await expect(page.getByTestId("face-file-button")).toBeDisabled({ timeout: 30000 });
  await page.getByTestId("face-consent").locator("input").check();
  await expect(page.getByTestId("face-file-button")).toBeEnabled();
  await page.getByTestId("face-file-input").setInputFiles(testPhotoPath);
  await expect(page.getByTestId("face-metrics")).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("Фото подходит для анализа.")).toBeVisible();
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
  await expect(page.getByText("5. ТОП-5 профессиональных направлений с уклоном в будущее")).toBeVisible();
  await expect(page.locator(".role-card")).toHaveCount(5);
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
  await expect(page.getByRole("heading", { name: "Главная: где я сейчас" })).toBeVisible({ timeout: 15000 });
});

test("face step rejects an unsuitable photo and allows a valid replacement", async ({ page }) => {
  let validationAttempts = 0;
  await page.addInitScript(({ apiUrl }) => {
    window.sessionStorage.setItem("levelup_session_id", "photo-reject-session");
    window.sessionStorage.setItem("levelup_guest_token", "photo-reject-token");
    window.sessionStorage.setItem("levelup_analysis_id", "analysis-photo-reject");
    window.sessionStorage.setItem("levelup_audio_upload_url", `${apiUrl}/uploads/audio-photo-reject`);
    window.sessionStorage.setItem("levelup_photo_upload_url", `${apiUrl}/uploads/photo-photo-reject`);
  }, { apiUrl: apiBase });
  await page.route(`${apiBase}/api/content/ru`, async (route) => fulfillJson(route, { locale: "ru", value: null }));
  await page.route(`${apiBase}/uploads/photo-photo-reject`, async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }
    await route.fulfill({ status: 200, body: "ok", headers: corsHeaders });
  });
  await page.route(`${apiBase}/api/analyses/analysis-photo-reject/photo/validate`, async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }
    validationAttempts += 1;
    if (validationAttempts > 1) {
      await route.fulfill({
        status: 200,
        json: { suitable: true, cached: false, confidence: 0.96 },
        headers: corsHeaders
      });
      return;
    }
    await route.fulfill({
      status: 422,
      json: {
        error: "На фото не обнаружено лицо. Пожалуйста, загрузите другое фото",
        code: "PHOTO_PERSON_REQUIRED",
        retryable: false
      },
      headers: corsHeaders
    });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${appBase}/flow/face`);
  await expect(page.getByTestId("face-file-button")).toBeDisabled({ timeout: 15000 });
  await page.getByTestId("face-consent").locator("input").check();
  await expect(page.getByTestId("face-file-button")).toBeEnabled();
  await page.getByTestId("face-file-input").setInputFiles(testPhotoPath);

  await expect(page.getByText("На фото не обнаружено лицо. Пожалуйста, загрузите другое фото")).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId("face-metrics")).toBeVisible();
  await expect(page.getByTestId("face-next-link")).toHaveCount(0);

  await page.getByTestId("face-file-input").setInputFiles(testPhotoPath);
  await expect(page.getByText("Фото подходит для анализа.")).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId("face-next-link")).toHaveText("Узнать результат");
  expect(validationAttempts).toBe(2);
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
    latestReport: null,
    config: habitConfig
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
      }),
      config: habitConfig
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
        activeEnrollment: {
          ...program.activeEnrollment,
          checkinsDone: 1,
          checkins: [{ id: "checkin-1", date: "2026-07-02", completed: true, note: "Audit", energy: 6, clarity: 6, stability: 6, createdAt: "2026-07-02T00:02:00.000Z" }]
        },
        rewards: [
          ...program.rewards,
          { id: "reward-2", type: "checkin", label: "Шаг отмечен", xp: 10, createdAt: "2026-07-02T00:02:00.000Z" }
        ]
      }),
      config: habitConfig
    });
  });
  await page.route(`${apiBase}/api/habits/navigator`, async (route) => fulfillJson(route, {
    reply: "Пингви видит состояние и предлагает один маленький шаг на сегодня.",
    threadId: "thread-test",
    model: "test"
  }));

  await page.goto(`${appBase}/habits`);
  await expect(page.getByTestId("habits-app")).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole("heading", { name: "Главная: где я сейчас" })).toBeVisible();
  await page.locator(".habits-nav button").filter({ hasText: "Мой путь" }).click();
  await expect(page.getByRole("heading", { name: "Мой путь" })).toBeVisible();

  await page.getByRole("button", { name: /Сохранить состояние/ }).click();
  await expect(page.getByText("Состояние сохранено")).toBeVisible();

  await page.getByRole("button", { name: /Отметить сегодня/ }).click();
  await expect(page.getByText("Привычка дня отмечена").first()).toBeVisible();

  await page.locator(".habits-nav button").filter({ hasText: "ORKEN" }).click();
  await expect(page.getByRole("heading", { name: "Быстрые вопросы" })).toBeVisible();
  await page.getByRole("button", { name: "Какой один шаг сделать сегодня?" }).click();
  await expect(page.getByText("Пингви видит состояние")).toBeVisible({ timeout: 10000 });
});

test("Telegram connection works in WebView and exposes a manual fallback", async ({ page }) => {
  const program = createHabitProgram();
  await page.addInitScript(() => {
    window.Telegram = {
      WebApp: {
        openTelegramLink: (url) => window.sessionStorage.setItem("telegram-connect-url", url)
      }
    };
  });
  await page.route(`${apiBase}/api/auth/guest`, async (route) => fulfillJson(route, { sessionId: "telegram-session", guestToken: "telegram-token" }));
  await page.route(`${apiBase}/api/habits/me`, async (route) => fulfillJson(route, {
    program,
    latestReport: null,
    config: habitConfig
  }));
  await page.route(`${apiBase}/api/telegram/status**`, async (route) => fulfillJson(route, {
    configured: true,
    linked: false,
    account: null,
    preferences: null
  }));
  await page.route(`${apiBase}/api/telegram/link-token`, async (route) => {
    expect(route.request().method()).toBe("POST");
    expect(route.request().postDataJSON()).toEqual({ programId: "habit-program-1" });
    await fulfillJson(route, {
      configured: true,
      connectUrl: "https://t.me/myorken_bot?start=connect-test",
      expiresAt: "2026-07-20T15:15:00.000Z"
    });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${appBase}/habits`);
  await expect(page.getByTestId("habits-app")).toBeVisible({ timeout: 15000 });
  await page.getByRole("button", { name: /Мой путь/ }).click();
  await page.getByRole("button", { name: "Подключить Telegram" }).click();

  await expect.poll(() => page.evaluate(() => window.sessionStorage.getItem("telegram-connect-url"))).toBe("https://t.me/myorken_bot?start=connect-test");
  const manualTelegramLink = page.getByRole("link", { name: "Открыть бота вручную" });
  await expect(manualTelegramLink).toBeVisible();
  await expect(manualTelegramLink).toHaveAttribute("href", "https://t.me/myorken_bot?start=connect-test");
});

test("account Telegram connection uses the same WebView-safe flow", async ({ page }) => {
  const user = {
    id: "telegram-user",
    email: "coach@example.com",
    name: "Coach",
    locale: "ru",
    role: "USER",
    status: "ACTIVE",
    emailVerifiedAt: "2026-07-20T10:00:00.000Z",
    lastLoginAt: "2026-07-20T10:00:00.000Z",
    createdAt: "2026-07-20T10:00:00.000Z"
  };
  await page.addInitScript(() => {
    window.Telegram = {
      WebApp: {
        openTelegramLink: (url) => window.sessionStorage.setItem("account-telegram-connect-url", url)
      }
    };
  });
  await page.route(`${apiBase}/api/auth/guest`, async (route) => fulfillJson(route, { sessionId: "account-telegram-session", guestToken: "account-telegram-token" }));
  await page.route(`${apiBase}/api/me`, async (route) => fulfillJson(route, { user, reportCount: 0, lastAnalysis: null }));
  await page.route(`${apiBase}/api/me/reports`, async (route) => fulfillJson(route, []));
  await page.route(`${apiBase}/api/habits/me`, async (route) => fulfillJson(route, {
    program: createHabitProgram(),
    latestReport: null,
    config: habitConfig
  }));
  await page.route(`${apiBase}/api/telegram/status**`, async (route) => fulfillJson(route, {
    configured: true,
    linked: false,
    account: null,
    preferences: null
  }));
  await page.route(`${apiBase}/api/telegram/link-token`, async (route) => fulfillJson(route, {
    configured: true,
    connectUrl: "https://t.me/myorken_bot?start=account-connect-test",
    expiresAt: "2026-07-20T15:15:00.000Z"
  }));

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${appBase}/account`);
  await expect(page.getByTestId("account-page")).toBeVisible({ timeout: 15000 });
  await page.getByText("Подключение Telegram-бота").click();
  await page.getByRole("button", { name: "Подключить Telegram" }).click();

  await expect.poll(() => page.evaluate(() => window.sessionStorage.getItem("account-telegram-connect-url"))).toBe("https://t.me/myorken_bot?start=account-connect-test");
  const manualTelegramLink = page.getByRole("link", { name: "Открыть бота вручную" });
  await expect(manualTelegramLink).toBeVisible();
  await expect(manualTelegramLink).toHaveAttribute("href", "https://t.me/myorken_bot?start=account-connect-test");
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
  await page.route(`${apiBase}/api/habits/me`, async (route) => fulfillJson(route, {
    program: createHabitProgram(),
    latestReport: null,
    config: habitConfig
  }));

  await page.goto(`${appBase}/login`);
  await page.getByText("Пароль").click();
  await page.getByText("Нет аккаунта? Создать").click();
  await page.getByPlaceholder("Как к вам обращаться").fill("Client");
  await page.getByPlaceholder("you@email.com").fill("client@orken.life");
  await page.getByPlaceholder("минимум 8 символов").fill("strongpass1");
  await page.getByTestId("password-auth-submit").click();

  await expect(page).toHaveURL(/\/account$/, { timeout: 10000 });
  await expect(page.getByTestId("account-page")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Навигатор привычек" })).toBeVisible();
  await page.getByText("История диагностик").click();
  await expect(page.getByText("Продуктовый стратег")).toBeVisible();
  await expect(page.getByRole("link", { name: "Открыть PRO" })).toBeVisible();
});
