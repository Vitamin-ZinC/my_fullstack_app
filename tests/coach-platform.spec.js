const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");

const apiBase = "http://localhost:3001";
const appBase = "http://localhost:3000";
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
    plans: [{ id: "plan-5", code: "starter", name: "До 5 клиентов", description: "Для частной практики", includedClients: 5, amount: 3900, currency: "usd", customQuote: false }],
    subscription: { id: "sub-1", plan: { id: "plan-5", code: "starter", name: "До 5 клиентов", description: "Для частной практики", includedClients: 5, amount: 3900, currency: "usd", customQuote: false }, status: "ACTIVE", clientLimit: 5, coachPaidClients: 1, clientPaidClients: 1, availableSlots: 4, currentPeriodEnd: "2026-09-12T10:00:00.000Z", graceEndsAt: null, cancelAtPeriodEnd: false },
    clients: [{ relationshipId: "rel-1", userId: "user-1", email: "client@example.com", name: "Илья", avatarUrl: null, status: "ACTIVE", funding: "COACH_PAID", metricsConsent: true, journalConsent: false, accessEndsAt: null, lastCheckinAt: "2026-08-12T08:00:00.000Z", weeklyAverage: 6.7, latestEnergy: 6, latestClarity: 7, latestStability: 7, attentionReason: null }],
    serviceOffers: [offer()], counts: { coachPaidClients: 1, clientPaidClients: 1, attention: 0, openAssignments: 2 },
    integrations: { calendly: { connected: true, status: "ACTIVE" }, telegramBotUsername: "orken_bot" },
    sites: [], sitePlans: [{ id: "site-1", code: "standard", name: "Стандартный сайт", setupAmount: 7500, monthlySupportAmount: 500, currency: "usd" }], rewards: []
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

async function installApiMocks(page) {
  let coachingActive = false;
  await page.route(`${apiBase}/api/**`, async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    if (method === "OPTIONS") return fulfillJson(route, {});
    if (url.pathname === "/api/auth/guest") return fulfillJson(route, { sessionId: "session-1", guestToken: "guest-1" }, 201);
    if (url.pathname === "/api/coaches") return fulfillJson(route, { coaches: [{ ...profile(), services: [offer()], siteUrl: "https://anna-orlova.orken.life" }], filters: { cities: ["Алматы"], specializations: ["Карьера", "Лидерство"], languages: ["ru"] } });
    if (url.pathname === "/api/coach/workspace") return fulfillJson(route, workspace());
    if (url.pathname === "/api/habits/progress") return fulfillJson(route, { ...progress(), period: url.searchParams.get("period") || "days" });
    if (url.pathname === "/api/habits/archive/search") return fulfillJson(route, { insights: [{ id: "insight-1", text: "Сегодня стало легче удерживать фокус", source: url.searchParams.get("author") === "coach" ? "coach_message" : "user", habitTitle: "Утренний фокус", createdAt: "2026-08-12T08:00:00.000Z" }], metrics: [{ date: "2026-08-12", energy: 6, clarity: 7, stability: 7, wellness: 6.7 }] });
    if (url.pathname === "/api/habits/coaching" && method === "GET") return fulfillJson(route, { relationships: [{ coach: profile(), relationshipId: "rel-1", status: coachingActive ? "ACTIVE" : "PENDING", funding: "CLIENT_PAID", metricsConsent: coachingActive, journalConsent: false, accessEndsAt: "2026-09-12T10:00:00.000Z", messages: [], assignments: [], habitAssignments: [], rewards: [] }], orders: [{ id: "order-1", coachProfileId: "coach-1", coachName: "Анна Орлова", serviceTitle: "Персональное ведение", type: "ONGOING_SUPPORT", status: "ACTIVE", amount: 12000, currency: "usd", bookingDeadline: null, bookedAt: null }] });
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
  await expect(page.getByText(/доступ коучу ещё не открыт/)).toBeVisible();
  await page.getByText("Метрики и привычки", { exact: true }).click();
  await expect(page.getByText("Программа оплачена, но доступ коучу ещё не открыт")).toHaveCount(0);
  await expect(page.getByPlaceholder("Ответить коучу")).toBeEnabled();
});
