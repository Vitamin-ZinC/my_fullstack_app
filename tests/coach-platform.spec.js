const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");

const appBase = process.env.E2E_APP_BASE || "http://localhost:3000";
const screenshotDir = path.resolve("output/playwright/coach-platform");
const captureScreenshots = process.env.CAPTURE_COACHES_SCREENSHOTS === "1";
const corsHeaders = {
  "access-control-allow-origin": appBase,
  "access-control-allow-credentials": "true",
  "access-control-allow-headers": "content-type,x-session-id,x-guest-token,x-locale,x-partner-csrf",
  "access-control-allow-methods": "GET,POST,PATCH,PUT,OPTIONS"
};

async function fulfillJson(route, json, status = 200) {
  if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: corsHeaders });
  return route.fulfill({ status, json, headers: corsHeaders });
}

function profile(overrides = {}) {
  return {
    id: "coach-1", partnerCorePartnerId: "partner-1", displayName: "Анна Орлова", slug: "anna-orlova",
    headline: "Карьерный коуч", bio: "Помогаю вернуть ясность и собрать план действий.", city: "Алматы",
    specializations: ["Карьера", "Лидерство"], languages: ["ru"], avatarUrl: null, coverImageUrl: null,
    status: "APPROVED", moderationNote: null, featured: true, acceptingOrders: true, calendlyConnected: true,
    createdAt: "2026-08-01T10:00:00.000Z", updatedAt: "2026-08-12T10:00:00.000Z", ...overrides
  };
}

function offer() {
  return {
    id: "offer-1", coachProfileId: "coach-1", type: "ONGOING_SUPPORT", paymentModel: "CLIENT_PAID",
    title: "Персональное ведение", description: "Еженедельная обратная связь и привычки.", amount: 12000,
    currency: "usd", status: "APPROVED", coachShareBps: 7000, platformShareBps: 3000,
    calendlyEventTypeUri: "https://api.calendly.com/event_types/1", calendlySchedulingUrl: "https://calendly.com/anna/session",
    moderationNote: null, createdAt: "2026-08-01T10:00:00.000Z", updatedAt: "2026-08-12T10:00:00.000Z"
  };
}

function workspace() {
  return {
    profile: profile(),
    plans: [{ id: "plan-5", code: "starter", name: "До 5 клиентов", description: "Для частной практики", includedClients: 5, amount: 3900, currency: "usd", customQuote: false }, { id: "plan-15", code: "practice", name: "До 15 клиентов", description: "Для устойчивой практики", includedClients: 15, amount: 10900, currency: "usd", customQuote: false }],
    subscription: { id: "sub-1", plan: { id: "plan-5", code: "starter", name: "До 5 клиентов", description: "Для частной практики", includedClients: 5, amount: 3900, currency: "usd", customQuote: false }, status: "ACTIVE", clientLimit: 5, coachPaidClients: 1, clientPaidClients: 1, availableSlots: 4, currentPeriodEnd: "2026-09-12T10:00:00.000Z", graceEndsAt: null, cancelAtPeriodEnd: false },
    clients: [{ relationshipId: "rel-1", userId: "user-1", email: "client@example.com", name: "Илья", avatarUrl: null, status: "ACTIVE", funding: "COACH_PAID", metricsConsent: true, journalConsent: false, accessEndsAt: null, lastCheckinAt: "2026-08-12T08:00:00.000Z", weeklyAverage: 6.7, latestEnergy: 6, latestClarity: 7, latestStability: 7, attentionReason: null }],
    serviceOffers: [offer()], counts: { coachPaidClients: 1, clientPaidClients: 1, attention: 0, openAssignments: 2 },
    integrations: { calendly: { connected: true, status: "ACTIVE" }, telegramBotUsername: "orken_bot" },
    scheduling: { provider: "ORKEN", timezone: "Europe/Moscow", slotDurationMinutes: 60, bufferBeforeMinutes: 0, bufferAfterMinutes: 15, minNoticeMinutes: 720, bookingHorizonDays: 30, active: true, availabilityRules: [1,2,3,4,5].map(weekday => ({ id: `rule-${weekday}`, weekday, startMinute: 540, endMinute: 1080, active: true })), availabilityExceptions: [], integrations: { google: { connected: false, status: "DISCONNECTED", calendarName: null }, calendly: { connected: true, status: "ACTIVE" } } },
    appointments: [],
    sites: [], sitePlans: [{ id: "site-1", code: "standard", name: "Стандартный сайт", setupAmount: 7500, monthlySupportAmount: 500, currency: "usd" }], rewards: [],
    commerce: { packagesEnabled: true, sitesEnabled: true, servicesEnabled: false }
  };
}

function progress() {
  return {
    period: "days",
    points: Array.from({ length: 14 }, (_, index) => ({ date: `2026-08-${String(index + 1).padStart(2, "0")}`, energy: 5 + index % 3, clarity: 6 + index % 2, stability: 6, wellness: 6 })),
    averages: { energy: 6, clarity: 6.5, stability: 6, wellness: 6.2 }, habitCompletionPercent: 78, currentStreak: 6,
    correlations: [{ habitTitle: "Утренний фокус", metric: "clarity", differencePercent: 25, completedDays: 7, comparisonDays: 7, message: "В дни выполнения привычки «Утренний фокус» ясность была выше на 25%. Это наблюдаемая связь, а не доказанная причина." }]
  };
}

function clientDetail() {
  return {
    client: { ...workspace().clients[0], journalConsent: true },
    metrics: progress().points,
    insights: [{ id: "insight-1", enrollmentId: "enrollment-1", habitTitle: "Утренний фокус", text: "Сегодня получилось остановиться и выбрать главное.", source: "user", createdAt: "2026-08-12T08:30:00.000Z" }],
    messages: [{ id: "message-1", relationshipId: "rel-1", authorRole: "COACH", text: "Сохрани текущий ритм и обрати внимание на ясность после отдыха.", readAt: null, createdAt: "2026-08-12T09:00:00.000Z" }],
    assignments: [{ id: "assignment-1", relationshipId: "rel-1", title: "Зафиксировать приоритет", details: "Запиши один главный приоритет на неделю.", dueAt: null, status: "OPEN", completedAt: null, createdAt: "2026-08-12T09:10:00.000Z" }],
    habitAssignments: [],
    correlations: progress().correlations
  };
}

async function installApiMocks(page, options = {}) {
  let coachingActive = false;
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    if (method === "OPTIONS") return fulfillJson(route, {});
    if (url.pathname === "/api/auth/guest") return fulfillJson(route, { sessionId: "session-1", guestToken: "guest-1" }, 201);
    if (url.pathname === "/api/coaches") return fulfillJson(route, { coaches: [{ ...profile(), services: [offer()], siteUrl: "https://anna-orlova.orken.life" }], filters: { cities: ["Алматы"], specializations: ["Карьера", "Лидерство"], languages: ["ru"] } });
    if (url.pathname === "/api/coach/workspace") return fulfillJson(route, options.withoutSubscription ? { ...workspace(), subscription: null, clients: [], counts: { coachPaidClients: 0, clientPaidClients: 0, attention: 0, openAssignments: 0 } } : workspace());
    if (url.pathname.startsWith("/api/coach/subscription/checkout/") && method === "POST") return fulfillJson(route, { url: `${appBase}/coach?subscription_checkout=mock` });
    if (url.pathname === "/api/coach/invites" && method === "POST") return fulfillJson(route, { inviteId: "invite-1", connectUrl: `${appBase}/habits/coaching?coach_invite=invite-token`, expiresAt: "2026-08-27T10:00:00.000Z" }, 201);
    if (url.pathname === "/api/coach/clients/rel-1" && method === "GET") return fulfillJson(route, clientDetail());
    if (url.pathname === "/api/coach/clients/rel-1/messages" && method === "POST") return fulfillJson(route, clientDetail().messages[0], 201);
    if (url.pathname === "/api/habits/progress") return fulfillJson(route, { ...progress(), period: url.searchParams.get("period") || "days" });
    if (url.pathname === "/api/habits/archive/search") return fulfillJson(route, { insights: [{ id: "insight-1", text: "Сегодня стало легче удерживать фокус", source: url.searchParams.get("author") === "coach" ? "coach_message" : "user", habitTitle: "Утренний фокус", createdAt: "2026-08-12T08:00:00.000Z" }], metrics: [{ date: "2026-08-12", energy: 6, clarity: 7, stability: 7, wellness: 6.7 }] });
    if (url.pathname === "/api/habits/coaching" && method === "GET") return fulfillJson(route, { relationships: [{ coach: profile(), relationshipId: "rel-1", status: coachingActive ? "ACTIVE" : "PENDING", funding: "CLIENT_PAID", metricsConsent: coachingActive, journalConsent: false, accessEndsAt: "2026-09-12T10:00:00.000Z", messages: clientDetail().messages, assignments: clientDetail().assignments, habitAssignments: [], rewards: [] }], orders: [{ id: "order-1", coachProfileId: "coach-1", coachName: "Анна Орлова", serviceTitle: "Персональное ведение", type: "ONGOING_SUPPORT", status: "ACTIVE", amount: 12000, currency: "usd", bookingDeadline: null, bookedAt: null }] });
    if (url.pathname === "/api/habits/coaching/rel-1/consent" && method === "PATCH") { coachingActive = route.request().postDataJSON().metricsConsent; return fulfillJson(route, { relationshipId: "rel-1", status: coachingActive ? "ACTIVE" : "PENDING", metricsConsent: coachingActive, journalConsent: false }); }
    if (url.pathname === "/api/coach/attribution") return fulfillJson(route, { captured: true });
    return fulfillJson(route, { error: `Unmocked ${method} ${url.pathname}` }, 404);
  });
}

async function assertResponsive(page, url, heading, widths) {
  for (const width of widths) {
    await page.setViewportSize({ width, height: width <= 768 ? 900 : 820 });
    await page.goto(`${appBase}${url}`);
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    if (captureScreenshots) {
      fs.mkdirSync(screenshotDir, { recursive: true });
      await page.screenshot({ path: path.join(screenshotDir, `${url.replaceAll("/", "-").slice(1)}-${width}.png`), fullPage: true });
    }
  }
}

test("coach catalog and workspace are responsive and actionable", async ({ page }) => {
  await installApiMocks(page);
  await assertResponsive(page, "/coaches", "Выберите коуча для личного сопровождения", [360, 768, 1024, 1440]);
  await expect(page.getByRole("link", { name: /Посмотреть профиль/ })).toBeVisible();

  await assertResponsive(page, "/coach", "Рабочий обзор", [360, 768, 1024, 1440]);
  await page.getByRole("button", { name: "Пакет" }).first().click();
  await expect(page.getByText("Текущий пакет: До 5 клиентов")).toBeVisible();
  await expect(page.getByText(/1 из 5 мест занято/)).toBeVisible();
  await page.getByRole("button", { name: "Расписание" }).first().click();
  await expect(page.getByRole("heading", { name: "Где вести расписание" })).toBeVisible();
  await expect(page.getByText("В ORKEN", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Клиенты" }).first().click();
  await page.getByLabel("Кто оплачивает доступ").selectOption("CLIENT_PAID");
  await page.getByRole("button", { name: "Создать приглашение" }).click();
  await expect(page.locator('input[value*="coach_invite=invite-token"]')).toBeVisible();
  await page.getByRole("button", { name: "Открыть" }).click();
  await expect(page.getByRole("heading", { name: "Прогресс внутреннего состояния" })).toBeVisible();
  await expect(page.locator(".recharts-line-curve")).toHaveCount(3);
  await page.getByRole("button", { name: /Инсайты/ }).click();
  await expect(page.getByText(/получилось остановиться/)).toBeVisible();
  await page.getByRole("button", { name: /Обратная связь/ }).click();
  await expect(page.getByRole("heading", { name: "Новая обратная связь" })).toBeVisible();
  for (const width of [360, 1440]) {
    await page.setViewportSize({ width, height: width === 360 ? 900 : 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    if (captureScreenshots) await page.screenshot({ path: path.join(screenshotDir, `coach-scheduling-${width}.png`), fullPage: true });
  }
});

test("client progress, archive, and explicit coach consent work on target widths", async ({ page }) => {
  await installApiMocks(page);
  await assertResponsive(page, "/habits/progress", "Мой прогресс", [360, 768, 1024, 1440]);
  await expect(page.locator(".recharts-line-curve")).toHaveCount(3);
  await expect(page.getByText(/ясность была выше на 25%/)).toBeVisible();

  await assertResponsive(page, "/habits/archive", "Мои записи", [360, 768, 1024, 1440]);
  await page.getByLabel("Автор").selectOption("coach");
  await page.getByRole("button", { name: "Найти" }).click();
  await expect(page.getByText(/Коуч · Утренний фокус/)).toBeVisible();

  await assertResponsive(page, "/habits/coaching", "Мой коуч", [360, 768, 1024, 1440]);
  await expect(page.getByRole("heading", { name: "Обратная связь от коуча" })).toBeVisible();
  await expect(page.getByText(/Сохрани текущий ритм/)).toBeVisible();
  await expect(page.getByText(/доступ коучу ещё не открыт/)).toBeVisible();
  await page.getByText("Метрики и привычки", { exact: true }).click();
  await expect(page.getByText("Программа оплачена, но доступ коучу ещё не открыт")).toHaveCount(0);
  await expect(page.getByPlaceholder("Ответить коучу")).toBeEnabled();
});

test("coach without a package can invite a self-paying client and open package checkout", async ({ page }) => {
  await installApiMocks(page, { withoutSubscription: true });
  await page.goto(`${appBase}/coach`);
  await page.getByRole("button", { name: "Клиенты" }).first().click();
  await expect(page.getByText("Пакет клиентов не подключён")).toBeVisible();
  await expect(page.getByLabel("Кто оплачивает доступ")).toHaveValue("CLIENT_PAID");
  expect(await page.getByLabel("Кто оплачивает доступ").locator("option[value=COACH_PAID]").evaluate((option) => option.disabled)).toBe(true);
  await page.getByRole("button", { name: "Создать приглашение" }).click();
  await expect(page.locator('input[value*="coach_invite=invite-token"]')).toBeVisible();
  await page.getByRole("button", { name: "Выбрать пакет" }).click();
  await expect(page.getByRole("button", { name: "Подключить пакет" }).first()).toBeEnabled();
  await page.getByRole("button", { name: "Подключить пакет" }).first().click();
  await expect(page).toHaveURL(/subscription_checkout=mock/);
});
