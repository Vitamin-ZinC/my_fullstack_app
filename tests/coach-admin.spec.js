const { test, expect } = require("@playwright/test");

const apiBase = process.env.E2E_API_BASE ?? "http://localhost:3001";
const appBase = process.env.E2E_APP_BASE ?? "http://localhost:3000";
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
  await moderationFixture(page, structuredClone(snapshot));
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
  await expect(page.getByText("Ведение", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Публичная страница" }).click();
  await page.getByLabel("Главный заголовок").fill("Новый заголовок для коучей");
  await page.getByRole("button", { name: "Сохранить тексты" }).click();
  await expect.poll(() => savedContent?.heroTitle).toBe("Новый заголовок для коучей");
});

async function moderationFixture(page, data, decisions = []) {
  await page.addInitScript(() => { sessionStorage.setItem("levelup_admin_session", "synthetic-admin"); localStorage.setItem("levelup_locale", "ru"); });
  await page.route(`${apiBase}/api/content/*`, route => fulfillJson(route, { value: null }));
  await page.route(`${apiBase}/api/admin/**`, async route => {
    if (route.request().method() === "OPTIONS") return fulfillJson(route, {});
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/admin/coaches/platform") return fulfillJson(route, data);
    if (path.endsWith("/status")) {
      const payload = route.request().postDataJSON();
      decisions.push({ path, ...payload });
      const record = path.includes("/offers/") ? data.offers.find(offer => path.includes(offer.id)) : data.profiles.find(profile => path.includes(profile.id));
      Object.assign(record, payload);
      return fulfillJson(route, { ok: true });
    }
    return fulfillJson(route, []);
  });
}

test("private profile review is complete, responsive and does not approve on preview", async ({ page }, info) => {
  const data = structuredClone(snapshot);
  data.profiles[0].bio = "Работаю с карьерными переходами. Методика и опыт для проверки.";
  data.profiles[0].languages = ["ru", "en"];
  const decisions = [];
  await moderationFixture(page, data, decisions);
  await page.goto(`${appBase}/admin/coaches`);
  for (const width of [360, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.getByRole("button", { name: "Проверить", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText(data.profiles[0].bio)).toBeVisible();
    await expect(dialog.getByText("Карьера", { exact: true })).toBeVisible();
    await expect(dialog.getByText("ru, en", { exact: true })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Вернуть на доработку" })).toBeDisabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`moderation-profile-${width}.png`) });
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
  }
  expect(decisions).toEqual([]);
  await page.getByRole("button", { name: "Проверить", exact: true }).click();
  await page.getByRole("dialog").getByLabel("Комментарий коучу").fill("Добавьте описание метода и образования.");
  await page.getByRole("dialog").getByRole("button", { name: "Вернуть на доработку" }).click();
  await expect.poll(() => decisions[0]?.status).toBe("DRAFT");
  expect(decisions[0].moderationNote).toBe("Добавьте описание метода и образования.");
  await expect(page.getByText("На доработке", { exact: true })).toBeVisible();
  await expect(page.getByText("Возвращено на доработку", { exact: true })).toBeVisible();
});

test("service review shows owner, price and format, validates shares and permits included services", async ({ page }, info) => {
  const data = structuredClone(snapshot);
  data.offers[0].coachName = data.profiles[0].displayName;
  data.offers.push({ ...data.offers[0], id: "included-offer", title: "Поддержка в программе", status: "REJECTED", paymentModel: "INCLUDED", amount: 0, moderationNote: "Уточните формат" });
  const decisions = [];
  await moderationFixture(page, data, decisions);
  await page.goto(`${appBase}/admin/coaches`);
  await page.getByRole("button", { name: "Услуги", exact: true }).click();
  await expect(page.getByText(/120,00\s*\$ \/ мес/, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Проверить", exact: true }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Анна Орлова", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Ежемесячное ведение", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Одобрить", exact: true })).toBeDisabled();
  await dialog.getByLabel("Доля коуча, %").fill("70");
  await dialog.getByLabel("Доля платформы, %").fill("20");
  await expect(dialog.getByRole("button", { name: "Одобрить", exact: true })).toBeDisabled();
  await dialog.getByLabel("Доля платформы, %").fill("30");
  await page.setViewportSize({ width: 360, height: 900 });
  await page.screenshot({ path: info.outputPath("moderation-service-mobile.png") });
  await dialog.getByRole("button", { name: "Одобрить", exact: true }).click();
  await expect.poll(() => decisions[0]?.coachShareBps).toBe(7000);
  expect(decisions[0].platformShareBps).toBe(3000);
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText("Услуга одобрена", { exact: true })).toBeVisible();
  await page.getByLabel("Статус", { exact: true }).selectOption("APPROVED");
  await page.getByRole("button", { name: "Проверить", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Сохранить доли", exact: true })).toBeDisabled();
  await dialog.getByLabel("Доля коуча, %").fill("80");
  await dialog.getByLabel("Доля платформы, %").fill("20");
  await dialog.getByRole("button", { name: "Сохранить доли", exact: true }).click();
  await expect.poll(() => decisions[1]?.coachShareBps).toBe(8000);
  await expect(dialog).not.toBeVisible();
  await page.getByLabel("Статус", { exact: true }).selectOption("REJECTED");
  await page.getByRole("button", { name: "Проверить", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "Поддержка в программе" })).toBeVisible();
  await expect(dialog.getByLabel("Доля коуча, %")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Одобрить", exact: true }).click();
  await expect.poll(() => decisions[2]?.status).toBe("APPROVED");
  expect(decisions[2].coachShareBps).toBeUndefined();
});

test("English moderation retains user copy and translates review controls", async ({ page }) => {
  const data = structuredClone(snapshot);
  await moderationFixture(page, data);
  await page.goto(`${appBase}/admin/coaches?lang=en`);
  await page.getByRole("button", { name: "Review", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Анна Орлова", exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Request changes" })).toBeVisible();
  await expect(dialog.getByLabel("Comment for the coach")).toBeVisible();
  await dialog.getByRole("button", { name: "Close review" }).click();
  await page.getByRole("button", { name: "Services", exact: true }).click();
  await page.getByRole("button", { name: "Review", exact: true }).click();
  await expect(dialog.getByText("Monthly subscription", { exact: true })).toBeVisible();
  await expect(dialog.getByLabel("Coach's share, %")).toBeVisible();
});
