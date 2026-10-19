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

test("public coach profiles show included services and photos without offering a zero-price checkout", async ({ page }, info) => {
  const coach = { ...snapshot.profiles[0], status: "APPROVED", acceptingOrders: false,
    avatarUrl: `${appBase}/coach-avatar-fixture.svg`,
    services: [
      { ...snapshot.offers[0], id: "included", status: "APPROVED", paymentModel: "INCLUDED", title: "Поддержка в программе", amount: 0 },
      { ...snapshot.offers[0], id: "paid", status: "APPROVED", paymentModel: "CLIENT_PAID", title: "Личное ведение" }
    ], bio: "Работаем над целями и отслеживаем прогресс между встречами." };
  const requests = [];
  await page.addInitScript(() => localStorage.setItem("levelup_locale", "ru"));
  await page.route(`${appBase}/coach-avatar-fixture.svg`, route => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400"><rect width="300" height="400" fill="#127780"/></svg>' }));
  await page.route(`${apiBase}/api/coaches**`, route => {
    requests.push(route.request().url());
    return fulfillJson(route, new URL(route.request().url()).pathname === "/api/coaches" ? { coaches: [coach], filters: { cities: [coach.city], specializations: coach.specializations } } : { coach, servicesCommerceEnabled: true });
  });
  await page.route(`${apiBase}/api/content/*`, route => fulfillJson(route, { value: null }));
  await page.goto(`${appBase}/coaches`);
  await expect(page.getByRole("heading", { name: coach.displayName })).toBeVisible();
  expect(requests.some(url => url.includes("accepting=true"))).toBe(false);
  await expect(page.getByText("от", { exact: false }).filter({ hasText: /120/ }).first()).toBeVisible();
  await page.getByRole("link", { name: "Посмотреть профиль" }).click();
  const included = page.locator("article").filter({ has: page.getByRole("heading", { name: "Поддержка в программе" }) });
  await expect(included.getByText("Включено в программу коуча", { exact: true })).toBeVisible();
  await expect(included.locator("button")).toHaveCount(0);
  const paid = page.locator("article").filter({ has: page.getByRole("heading", { name: "Личное ведение" }) });
  await expect(paid.getByRole("button", { name: "Запись временно закрыта" })).toBeDisabled();
  for (const width of [360, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByRole("img", { name: coach.displayName })).toBeVisible();
    expect(await page.getByRole("img", { name: coach.displayName }).evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`public-coach-services-${width}.png`), fullPage: true });
  }
});

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
    if (path.endsWith("/catalog")) {
      const payload = route.request().postDataJSON();
      decisions.push({ path, ...payload });
      Object.assign(data.profiles.find(profile => path.includes(profile.id)), payload);
      return fulfillJson(route, payload);
    }
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

test("admin recommends approved coaches without changing moderation or publication time", async ({ page }) => {
  const data = structuredClone(snapshot);
  data.profiles[0].status = "APPROVED";
  data.profiles[0].publicSince = "2026-10-01T00:00:00.000Z";
  const decisions = [];
  await moderationFixture(page, data, decisions);
  await page.goto(`${appBase}/admin/coaches`);
  const recommend = page.getByRole("button", { name: "Рекомендовать: Анна Орлова" });
  await expect(recommend).toHaveAttribute("aria-pressed", "false");
  await recommend.click();
  await expect(recommend).toHaveAttribute("aria-pressed", "true");
  expect(decisions).toEqual([{ path: "/api/admin/coaches/coach-1/catalog", featured: true }]);
  expect(data.profiles[0].status).toBe("APPROVED");
  expect(data.profiles[0].publicSince).toBe("2026-10-01T00:00:00.000Z");
});

test("catalog connection survives client login and requires separate data consent", async ({ page }, info) => {
  const coach = { ...snapshot.profiles[0], status: "APPROVED", acceptingOrders: true, services: [{ ...snapshot.offers[0], paymentModel: "INCLUDED", amount: 0 }] };
  const hub = { relationships: [], orders: [], connectionRequests: [] };
  let authenticated = false, submitted = null;
  const guest = { sessionId: "synthetic-session", guestToken: "synthetic-token" };
  await page.addInitScript(() => localStorage.setItem("levelup_locale", "ru"));
  await page.route(`${apiBase}/api/**`, async route => {
    if (route.request().method() === "OPTIONS") return fulfillJson(route, {});
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/auth/guest") return fulfillJson(route, guest);
    if (path === "/api/auth/login") { authenticated = true; return fulfillJson(route, { ...guest, user: { id: "synthetic-client", email: "client@example.invalid", name: "Клиент" } }); }
    if (path === "/api/auth/session") return fulfillJson(route, { ...guest, user: authenticated ? { id: "synthetic-client", email: "client@example.invalid" } : null });
    if (path === "/api/coaches") return fulfillJson(route, { coaches: [coach], filters: { cities: [], specializations: [] } });
    if (path === "/api/coaches/anna-orlova") return fulfillJson(route, { coach, servicesCommerceEnabled: false });
    if (path === "/api/habits/coaching") return fulfillJson(route, authenticated ? hub : { error: "Login required" }, authenticated ? 200 : 401);
    if (path.endsWith("/connection-requests")) {
      submitted = route.request().postDataJSON();
      const request = { id: "request", coachProfileId: coach.id, coachName: coach.displayName, coachSlug: coach.slug, status: "PENDING", message: submitted.message, decisionNote: null, relationshipId: null, createdAt: "2026-10-19T00:00:00Z", decidedAt: null };
      hub.connectionRequests = [request]; return fulfillJson(route, { request });
    }
    if (path.endsWith("/consent")) { Object.assign(hub.relationships[0], route.request().postDataJSON(), { status: "ACTIVE" }); return fulfillJson(route, {}); }
    return fulfillJson(route, { value: null });
  });
  await page.goto(`${appBase}/coaches`);
  await page.getByRole("link", { name: "Подключиться", exact: true }).click();
  await expect(page.getByRole("link", { name: "Войти", exact: true })).toBeVisible();
  expect(submitted).toBeNull();
  await page.getByRole("link", { name: "Войти", exact: true }).click();
  await page.getByRole("button", { name: "Пароль", exact: true }).click();
  await page.getByLabel("Email", { exact: true }).fill("client@example.invalid");
  await page.getByLabel("Пароль", { exact: true }).fill("Synthetic-password-123");
  await page.getByTestId("password-auth-submit").click();
  await expect(page).toHaveURL(/\/habits\/coaching\?coach=anna-orlova/);
  await page.getByLabel("Что хотите обсудить с коучем? (необязательно)").fill("Карьерные цели");
  await page.getByRole("button", { name: "Отправить заявку", exact: true }).click();
  await expect(page.getByText("Ожидает ответа коуча", { exact: true })).toBeVisible();
  expect(submitted).toEqual({ message: "Карьерные цели" });
  hub.connectionRequests[0].status = "ACCEPTED";
  hub.connectionRequests[0].relationshipId = "relationship";
  hub.relationships = [{ coach, relationshipId: "relationship", status: "PENDING", funding: "SELF_FUNDED", metricsConsent: false, journalConsent: false, messages: [], assignments: [], habitAssignments: [], rewards: [] }];
  await page.reload();
  const metrics = page.getByLabel("Метрики и привычки", { exact: true });
  const journal = page.getByLabel("Дневник", { exact: true });
  await expect(metrics).not.toBeChecked(); await expect(journal).not.toBeChecked();
  await metrics.click();
  await expect(metrics).toBeChecked();
  await expect(page.getByText("Активная программа", { exact: true })).toBeVisible();
  await expect(journal).not.toBeChecked();
  for (const width of [360, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`client-connection-${width}.png`), fullPage: true });
  }
});

test("coach sees catalog applications and confirms the client's own tariff without charging", async ({ page }) => {
  const workspace = { profile: { ...snapshot.profiles[0], status: "APPROVED" }, plans: [], subscription: null, clients: [], serviceOffers: [], counts: { coachPaidClients: 0, clientPaidClients: 0, attention: 0, openAssignments: 0 }, integrations: {}, sites: [], sitePlans: [], rewards: [], commerce: { packagesEnabled: false, sitesEnabled: false, servicesEnabled: false }, scheduling: { provider: "ORKEN", active: false, availabilityRules: [] }, appointments: [], connectionRequests: [{ id: "request", coachProfileId: "coach-1", coachName: "Анна Орлова", coachSlug: "anna-orlova", status: "PENDING", message: "Карьерные цели", decisionNote: null, relationshipId: null, createdAt: "2026-10-19T00:00:00Z", decidedAt: null, client: { name: "Клиент", email: "client@example.invalid" } }] };
  let decision = null;
  await page.route(`${apiBase}/api/**`, async route => {
    if (route.request().method() === "OPTIONS") return fulfillJson(route, {});
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/coach/workspace") return fulfillJson(route, workspace);
    if (path.endsWith("/decision")) { decision = route.request().postDataJSON(); workspace.connectionRequests[0].status = "ACCEPTED"; return fulfillJson(route, { request: workspace.connectionRequests[0] }); }
    return fulfillJson(route, { value: null });
  });
  await page.goto(`${appBase}/coach`);
  const requests = page.getByRole("region", { name: "Заявки из каталога" });
  await expect(requests.getByText("Карьерные цели")).toBeVisible();
  await expect(requests.getByRole("button", { name: "Отклонить заявку" })).toBeDisabled();
  await requests.getByRole("button", { name: "Подтвердить подключение" }).click();
  await expect.poll(() => decision?.funding).toBe("SELF_FUNDED");
  expect(decision).toMatchObject({ decision: "accept", funding: "SELF_FUNDED" });
  await expect(page.getByText("Заявка подтверждена. Клиенту осталось разрешить доступ к данным.", { exact: true })).toBeVisible();
});

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
