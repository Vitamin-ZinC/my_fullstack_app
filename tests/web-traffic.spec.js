const { test, expect } = require("@playwright/test");

const apiBase = process.env.E2E_API_BASE ?? "http://localhost:3001";
const appBase = process.env.E2E_APP_BASE ?? "http://localhost:3000";
const choiceKey = "orken_analytics_choice_v2";
const headers = { "access-control-allow-origin": appBase, "access-control-allow-credentials": "true",
  "access-control-allow-headers": "content-type,x-admin-session,x-admin-token,x-traffic-visitor,x-traffic-visit,x-locale,x-session-id,x-guest-token",
  "access-control-allow-methods": "GET,POST,PUT,OPTIONS" };
const fulfill = (route, json, status = 200) => route.fulfill(route.request().method() === "OPTIONS" ? { status: 204, headers } : { status, json, headers });

async function trafficFixture(page, options = {}) {
  const views = [];
  // Never send synthetic test traffic to the real Google property.
  await page.route("https://www.googletagmanager.com/**", route => route.fulfill({ contentType: "application/javascript", body: "/* Google stub */" }));
  await page.route(/https:\/\/[^/]*google-analytics\.com\//, route => route.fulfill({ status: 204 }));
  await page.addInitScript(() => localStorage.setItem("levelup_locale", "ru"));
  await page.route(`${apiBase}/api/**`, route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/traffic/config") return fulfill(route, { enabled: options.enabled !== false, retentionDays: 180 });
    if (path === "/api/traffic/views") {
      if (route.request().method() === "POST") views.push(route.request().postDataJSON());
      return fulfill(route, { ok: true });
    }
    if (path === "/api/content/ru" || path === "/api/content/en") return fulfill(route, { value: null });
    if (path === "/api/auth/guest") return fulfill(route, { sessionId: "guest", guestToken: "synthetic" });
    if (path === "/api/auth/session") return fulfill(route, { user: null, sessionId: "guest", guestToken: "synthetic" });
    if (["/api/me", "/api/habits/me", "/api/coach/workspace", "/api/partners/portal/me"].includes(path)) return fulfill(route, { error: "Unauthorized" }, 401);
    if (path === "/api/me/reports") return fulfill(route, []);
    if (path === "/api/coaches") return fulfill(route, { coaches: [], filters: { cities: [], specializations: [] } });
    return fulfill(route, {});
  });
  return views;
}

test("optional analytics waits for consent, counts route views once and never sends private URL parameters", async ({ page }) => {
  const views = await trafficFixture(page);
  await page.goto(`${appBase}/login?access_token=private-magic-token&utm_source=telegram&utm_medium=social&utm_campaign=autumn_launch`);
  await expect(page.getByRole("region", { name: "Настройки аналитики" })).toBeVisible();
  expect(views).toHaveLength(0);
  expect(await page.evaluate(() => localStorage.getItem("orken_analytics_browser_v1"))).toBeNull();
  await page.getByRole("button", { name: "Разрешить аналитику", exact: true }).click();
  await expect.poll(() => views.length).toBe(1);
  expect(views[0].page).toBe("/login"); expect(views[0].source).toBe("telegram");
  expect(views[0].campaign).toBe("autumn_launch");
  expect(JSON.stringify(views)).not.toContain("private-magic-token");
  const firstVisit = views[0].visitId;
  await page.goto(`${appBase}/privacy`);
  await expect.poll(() => views.length).toBe(2);
  expect(views[1].page).toBe("/privacy"); expect(views[1].visitId).toBe(firstVisit);
  await page.getByRole("button", { name: "Настройки аналитики", exact: true }).click();
  await page.getByRole("button", { name: "Не разрешать", exact: true }).click();
  expect(await page.evaluate(() => localStorage.getItem("orken_analytics_browser_v1"))).toBeNull();
  await page.goto(`${appBase}/login`);
  await expect(page.getByRole("button", { name: "Настройки аналитики", exact: true })).toBeVisible();
  expect(views).toHaveLength(2);
  await page.goto(`${appBase}/admin/traffic`);
  await expect(page.getByRole("region", { name: "Настройки аналитики" })).toHaveCount(0);
  expect(views).toHaveLength(2);
});

test("Google tag requires new consent, sends only public page data and stops on withdrawal", async ({ page }) => {
  await trafficFixture(page);
  const scripts = [];
  page.on("request", request => { if (request.url().startsWith("https://www.googletagmanager.com/")) scripts.push(request.url()); });
  await page.addInitScript(() => localStorage.setItem("orken_analytics_choice_v1", JSON.stringify({ choice: "allow", expiresAt: Date.now() + 86400000 })));
  await page.goto(`${appBase}/privacy`);
  await expect(page.getByRole("region", { name: "Настройки аналитики" })).toBeVisible();
  expect(scripts).toHaveLength(0);
  await page.getByRole("button", { name: "Разрешить аналитику", exact: true }).click();
  await expect.poll(() => scripts.length).toBe(1);
  expect(scripts[0]).toBe("https://www.googletagmanager.com/gtag/js?id=G-T661WL38LP");
  const calls = await page.evaluate(() => window.dataLayer.map(value => Array.from(value)));
  expect(calls.find(value => value[0] === "config")[2]).toMatchObject({ send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false });
  expect(calls.filter(value => value[0] === "event")).toEqual([["event", "page_view", { send_to: "G-T661WL38LP", page_location: `${appBase}/privacy`, page_referrer: "", page_title: "ORKEN.LIFE" }]]);
  await page.evaluate(() => { document.cookie = "_ga=synthetic; Path=/"; document.cookie = "_ga_T661WL38LP=synthetic; Path=/"; });
  await page.getByRole("button", { name: "Настройки аналитики", exact: true }).click();
  await page.getByRole("button", { name: "Не разрешать", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window["ga-disable-G-T661WL38LP"])).toBe(true);
  expect(await page.evaluate(() => document.cookie)).not.toContain("_ga");
  await page.reload();
  expect(scripts).toHaveLength(1);
});

test("Google tag stays absent on sensitive URLs, disabled collection and privacy signals", async ({ page }) => {
  await trafficFixture(page);
  const scripts = [];
  page.on("request", request => { if (request.url().includes("googletagmanager.com")) scripts.push(request.url()); });
  await page.addInitScript(key => localStorage.setItem(key, JSON.stringify({ choice: "allow", expiresAt: Date.now() + 86400000 })), choiceKey);
  for (const path of ["/privacy?access_token=synthetic-secret", "/privacy#synthetic-secret", "/login", "/account", "/coach", "/partners"]) {
    await page.goto(`${appBase}${path}`);
    await expect(page.getByRole("button", { name: "Настройки аналитики", exact: true })).toBeVisible();
    expect(scripts).toHaveLength(0);
  }
  await trafficFixture(page, { enabled: false });
  await page.goto(`${appBase}/privacy`);
  await expect(page.getByRole("button", { name: "Настройки аналитики", exact: true })).toBeVisible();
  expect(scripts).toHaveLength(0);
  await trafficFixture(page);
  await page.addInitScript(() => Object.defineProperty(navigator, "globalPrivacyControl", { value: true, configurable: true }));
  await page.goto(`${appBase}/privacy`);
  await expect(page.getByRole("button", { name: "Настройки аналитики", exact: true })).toBeVisible();
  expect(scripts).toHaveLength(0);
});

test("decline persists across tabs, privacy signals override opt-in and token UTMs are dropped", async ({ page, context }) => {
  const views = await trafficFixture(page);
  await page.goto(`${appBase}/login?utm_source=user@example.com&utm_campaign=session_secret`);
  await page.getByRole("button", { name: "Разрешить аналитику", exact: true }).click();
  await expect.poll(() => views.length).toBe(1);
  expect(views[0].source).toBe("direct"); expect(views[0].campaign).toBeUndefined();
  await page.evaluate(key => {
    localStorage.setItem(key, JSON.stringify({ choice: "deny", expiresAt: Date.now() + 86400000 }));
    window.dispatchEvent(new StorageEvent("storage", { key }));
  }, choiceKey);
  await page.getByRole("button", { name: "Настройки аналитики", exact: true }).click();
  await page.getByRole("button", { name: "Не разрешать", exact: true }).click();
  await page.reload();
  await expect(page.getByRole("region", { name: "Настройки аналитики" })).toHaveCount(0);
  expect(views).toHaveLength(1);
  await page.addInitScript(key => {
    localStorage.setItem(key, JSON.stringify({ choice: "allow", expiresAt: Date.now() + 86400000 }));
    Object.defineProperty(navigator, "globalPrivacyControl", { value: true, configurable: true });
  }, choiceKey);
  await page.reload();
  await page.getByRole("button", { name: "Настройки аналитики", exact: true }).click();
  await expect(page.getByText("В браузере включён запрет отслеживания. Аналитика отключена.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Разрешить аналитику", exact: true })).toBeDisabled();
  expect(views).toHaveLength(1);
});

test("consent panel fits mobile and desktop, supports English and storage denial does not break pages", async ({ page }, info) => {
  await trafficFixture(page);
  await page.goto(`${appBase}/login`);
  await expect(page.getByRole("region", { name: "Настройки аналитики" })).toBeVisible();
  for (const width of [360, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByRole("button", { name: "Не разрешать", exact: true })).toBeInViewport();
    await expect(page.getByRole("button", { name: "Разрешить аналитику", exact: true })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`analytics-consent-${width}.png`), fullPage: true });
  }
  await page.getByRole("button", { name: "English", exact: true }).click();
  await expect(page.getByRole("button", { name: "Allow analytics", exact: true })).toBeVisible();
  await page.addInitScript(() => { const set = Storage.prototype.setItem; Storage.prototype.setItem = function(key, value) { if (key.startsWith("orken_analytics")) throw new DOMException("Blocked", "SecurityError"); return set.call(this, key, value); }; });
  await page.reload();
  await expect(page.locator("main")).toBeVisible();
});

test("traffic admin has independent metrics, period filters, toggle, CSV, empty/error states and responsive tables", async ({ page }, info) => {
  await trafficFixture(page);
  let enabled = true; let failed = false; let empty = false;
  const periods = [];
  await page.addInitScript(() => sessionStorage.setItem("levelup_admin_session", "synthetic-admin"));
  await page.route(`${apiBase}/api/admin/**`, route => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/admin/settings/traffic_analytics_enabled") {
      if (route.request().method() === "PUT") enabled = route.request().postDataJSON().value;
      return fulfill(route, { key: "traffic_analytics_enabled", value: enabled });
    }
    if (url.pathname !== "/api/admin/reports/traffic") return fulfill(route, []);
    if (failed) return fulfill(route, { error: "Synthetic report failure" }, 503);
    const days = Number(url.searchParams.get("days")); periods.push(days);
    const from = "2026-10-01T00:00:00Z"; const to = "2026-10-22T12:00:00Z";
    return fulfill(route, { generatedAt: to, range: { days, from, to, timezone: "UTC" }, enabled, retentionDays: 180,
      observedSince: empty ? null : from, totals: { visitors: empty ? 0 : 25, visits: 40, pageViews: 80 },
      daily: Array.from({ length: 7 }, (_, index) => ({ date: `2026-10-${index + 10}`, visitors: index * 2, visits: index * 3, pageViews: index * 4 })),
      sources: [{ source: "telegram", medium: "social", campaign: "autumn_launch", visits: 30, registrations: 4, paidReports: 1 }],
      pages: [{ page: "/coaches/[profile]", pageViews: 30, visitors: 20 }], devices: [{ device: "mobile", visits: 32 }],
      conversions: { registrationVisits: 4, diagnosticVisits: 8, paidReportVisits: 1 }, business: { registrations: 50, diagnostics: 60, paidReports: 12 } });
  });
  await page.goto(`${appBase}/admin/traffic`);
  await expect(page.getByRole("heading", { name: "Посещаемость и конверсии", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Источники и кампании", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "7 дней", exact: true }).click();
  await expect.poll(() => periods.at(-1)).toBe(7);
  await page.getByLabel("Сбор аналитики", { exact: true }).click();
  await expect(page.getByText("Сбор отключён администратором. Сохранённая статистика доступна для просмотра.")).toBeVisible();
  const download = page.waitForEvent("download"); await page.getByRole("button", { name: "Скачать CSV", exact: true }).click();
  expect((await download).suggestedFilename()).toBe("orken-traffic-7d.csv");
  for (const width of [360, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const registration = page.getByText("Зарегистрировались", { exact: true });
    expect(await registration.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`analytics-admin-${width}.png`), fullPage: true });
  }
  await page.getByRole("button", { name: "English", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Traffic and Conversions", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sources and Campaigns", exact: true })).toBeVisible();
  empty = true;
  await page.getByRole("button", { name: "Refresh", exact: true }).last().click();
  await expect(page.getByText(/No visits yet/)).toBeVisible();
  failed = true;
  await page.getByRole("button", { name: "Refresh", exact: true }).last().click();
  await expect(page.getByRole("alert").filter({ hasText: "Synthetic report failure" })).toBeVisible();
});
