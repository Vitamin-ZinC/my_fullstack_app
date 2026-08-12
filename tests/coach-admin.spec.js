const { test, expect } = require("@playwright/test");

const apiBase = "http://localhost:3001";
const appBase = "http://localhost:3000";
const corsHeaders = {
  "access-control-allow-origin": appBase,
  "access-control-allow-credentials": "true",
  "access-control-allow-headers": "content-type,x-admin-session,x-admin-token",
  "access-control-allow-methods": "GET,POST,PATCH,PUT,OPTIONS"
};

async function fulfillJson(route, json, status = 200) {
  if (route.request().method() === "OPTIONS") return route.fulfill({ status: 204, headers: corsHeaders });
  return route.fulfill({ status, json, headers: corsHeaders });
}

const publicContent = {
  heroEyebrow: "Партнёрская программа ORKEN", heroTitle: "Технология между сессиями",
  heroLead: "Помогайте клиентам видеть прогресс между встречами.", heroPrimaryCta: "Стать партнёром",
  heroSecondaryCta: "Условия сотрудничества", pricingEyebrow: "Тарифы платформы",
  pricingTitle: "Пакет под текущую практику", pricingLead: "Самостоятельные подписки не занимают места.",
  applicationEyebrow: "Заявка на партнёрство", applicationTitle: "Хочу стать партнёром ORKEN",
  applicationLead: "После заявки отправим условия сотрудничества.", applicationSubmitLabel: "Получить условия"
};

const snapshot = {
  profiles: [{ id: "coach-1", partnerCorePartnerId: "partner-1", displayName: "Анна Орлова", slug: "anna-orlova", headline: "Карьерный коуч", bio: null, city: "Алматы", specializations: ["Карьера"], languages: ["ru"], avatarUrl: null, coverImageUrl: null, status: "PENDING_REVIEW", moderationNote: null, featured: false, acceptingOrders: false, calendlyConnected: true, createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-12T00:00:00.000Z" }],
  plans: [{ id: "plan-5", code: "starter", name: "До 5 клиентов", description: "Для частной практики", includedClients: 5, amount: 3900, currency: "usd", customQuote: false }],
  sitePlans: [{ id: "site-1", code: "standard", name: "Стандартный сайт", setupAmount: 7500, monthlySupportAmount: 500, currency: "usd", active: true }],
  subscriptions: [{ id: "sub-1", coach: "Анна Орлова", plan: "До 5 клиентов", status: "ACTIVE", amount: 3900, currency: "usd", clientLimit: 5, currentPeriodEnd: "2026-09-12T00:00:00.000Z" }],
  orders: [{ id: "order-1", coach: "Анна Орлова", client: "client@example.com", service: "Ведение", status: "ACTIVE", amount: 12000, currency: "usd", createdAt: "2026-08-12T00:00:00.000Z" }],
  offers: [{ id: "offer-1", coachProfileId: "coach-1", type: "ONGOING_SUPPORT", paymentModel: "CLIENT_PAID", title: "Ведение", description: "Еженедельная обратная связь", amount: 12000, currency: "usd", status: "PENDING_REVIEW", coachShareBps: null, platformShareBps: null, calendlyEventTypeUri: null, calendlySchedulingUrl: null, moderationNote: null, createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-12T00:00:00.000Z" }],
  rewardsPendingReview: [{ id: "reward-1", title: "Разбор цели", description: "Короткий разбор от коуча", pointsCost: 500, entitlementType: "manual", entitlementValue: null, status: "PENDING_REVIEW", moderationNote: null }],
  cancellationPolicy: { hoursBeforeStart: 24, refundPercent: 100 }, publicContent
};

test("coach administration is split into usable sections and saves public content", async ({ page }) => {
  let savedContent = null;
  await page.addInitScript(() => window.sessionStorage.setItem("levelup_admin_session", "admin-session"));
  await page.route(`${apiBase}/api/admin/coaches/platform`, (route) => fulfillJson(route, snapshot));
  await page.route(`${apiBase}/api/admin/settings/coach_public_content_ru`, async (route) => {
    savedContent = route.request().postDataJSON()?.value;
    await fulfillJson(route, { key: "coach_public_content_ru", value: savedContent, updatedAt: "2026-08-12T00:00:00.000Z" });
  });

  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${appBase}/admin/coaches`);
    await expect(page.getByRole("button", { name: "Профили" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }

  await page.getByRole("button", { name: "Пакеты" }).click();
  await expect(page.getByRole("heading", { name: "До 5 клиентов" })).toBeVisible();
  await page.getByRole("button", { name: "Услуги" }).click();
  await expect(page.getByRole("heading", { name: "Ведение" })).toBeVisible();
  await page.getByRole("button", { name: "Публичная страница" }).click();
  await page.getByLabel("Главный заголовок").fill("Новый заголовок для коучей");
  await page.getByRole("button", { name: "Сохранить тексты" }).click();
  await expect.poll(() => savedContent?.heroTitle).toBe("Новый заголовок для коучей");
});

