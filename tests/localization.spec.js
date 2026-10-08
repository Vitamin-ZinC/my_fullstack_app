const { test, expect } = require("@playwright/test");
test.setTimeout(30000);
const apiBase = process.env.E2E_API_BASE ?? "http://localhost:3001";
const appBase = process.env.E2E_APP_BASE ?? "http://localhost:3000";
const cors = {
  "access-control-allow-origin": appBase, "access-control-allow-credentials": "true",
  "access-control-allow-headers": "content-type,x-session-id,x-guest-token,x-locale,x-partner-csrf",
  "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS"
};
async function json(route, value, status = 200) {
  await route.fulfill(route.request().method() === "OPTIONS"
    ? { status: 204, headers: cors } : { status, json: value, headers: cors });
}
async function english(page) {
  await page.addInitScript(() => {
    localStorage.setItem("levelup_locale", "en");
    localStorage.setItem("levelup_session_id", "same-session");
    localStorage.setItem("levelup_guest_token", "same-token");
  });
  await page.route(`${apiBase}/api/content/*`, route => json(route, { value: null }));
}
async function noRussianSystemCopy(page, allow = []) {
  const text = await page.locator("body").innerText();
  const withoutRecords = allow.reduce((value, record) => value.replaceAll(record, ""), text);
  expect(withoutRecords.match(/[А-Яа-яЁё][А-Яа-яЁё\s,.!?-]*/g) ?? []).toEqual([]);
}
async function fits(page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 ? [] : [...document.querySelectorAll("body *")].filter(element => element.getBoundingClientRect().right > innerWidth + 1).map(element => `${element.tagName}.${element.className}`).slice(0, 12));
  expect(overflow).toEqual([]);
}
const coach = { id: "coach", slug: "coach", displayName: "Анна", status: "APPROVED", specializations: [], languages: ["en"], acceptingOrders: true, featured: false };
const workspace = {
  profile: coach, plans: [], subscription: null, clients: [], serviceOffers: [],
  counts: { coachPaidClients: 0, clientPaidClients: 0, attention: 0, openAssignments: 0 },
  integrations: { calendly: { connected: false, status: "NOT_CONNECTED" }, telegramBotUsername: "orken_bot" },
  scheduling: { provider: "ORKEN", timezone: "Europe/Moscow", slotDurationMinutes: 60, bufferBeforeMinutes: 0, bufferAfterMinutes: 15, minNoticeMinutes: 1440, bookingHorizonDays: 30, active: true, availabilityRules: [], availabilityExceptions: [], integrations: {} },
  appointments: [], sites: [], sitePlans: [], rewards: [],
  commerce: { packagesEnabled: true, sitesEnabled: true, servicesEnabled: true }
};

for (const width of [360, 768, 1024, 1440]) {
  test(`English landing and role entry points fit at ${width}px`, async ({ page }, info) => {
    await english(page);
    await page.setViewportSize({ width, height: 900 });
    await page.route(`${apiBase}/api/payments/config`, route => json(route, { amount: 300, currency: "usd", priceLabel: "$3" }));
    await page.route(`${apiBase}/api/habits/config`, route => json(route, { amount: 800, currency: "usd", priceLabel: "$8", trialDays: 14 }));
    await page.goto(`${appBase}/?lang=en`);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    const mobileMenu = page.getByRole("button", { name: "Open Menu", exact: true });
    const hasMobileMenu = await mobileMenu.isVisible();
    if (hasMobileMenu) await mobileMenu.click();
    await expect(page.getByRole("link", { name: "About us", exact: true }).first()).toBeVisible();
    if (hasMobileMenu) await page.getByRole("link", { name: "About us", exact: true }).first().click();
    await noRussianSystemCopy(page);
    await fits(page);
    await expect(page).toHaveTitle("Ikigai - ORKEN.LIFE");
    await page.screenshot({ path: info.outputPath(`landing-${width}.png`), fullPage: true });
    for (const [route, heading] of [["/login", /Sign in|Login/], ["/coach", "Coach login"], ["/partners", /Partner|partner/], ["/admin", /Admin|Administration/]]) {
      if (route === "/coach") await page.route(`${apiBase}/api/coach/workspace`, r => json(r, { error: "Partner login required" }, 401));
      if (route === "/partners") await page.route(`${apiBase}/api/partners/portal/me`, r => json(r, { error: "Partner login required" }, 401));
      await page.goto(`${appBase}${route}`);
      await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible();
      await noRussianSystemCopy(page);
      await fits(page);
      await expect(page).toHaveTitle("Ikigai - ORKEN.LIFE");
      await page.screenshot({ path: info.outputPath(`${route.slice(1)}-${width}.png`), fullPage: true });
    }
  });
}

test("language switch preserves coach registration inputs, identity and request language", async ({ page }) => {
  await english(page);
  await page.route(`${apiBase}/api/coach/workspace`, r => json(r, { error: "Partner login required" }, 401));
  let submitted;
  await page.route(`${apiBase}/api/partners/portal/register`, async route => {
    if (route.request().method() === "OPTIONS") return json(route, {});
    expect(route.request().headers()["x-locale"]).toBe("en");
    submitted = route.request().postDataJSON();
    await json(route, { error: "Registration could not be completed" }, 400);
  });
  await page.goto(`${appBase}/coach?lang=en`);
  await page.getByRole("button", { name: "Register", exact: true }).click();
  await page.getByLabel("First and last name").fill("Jane Doe");
  await page.getByLabel("Email", { exact: true }).fill("jane@example.com");
  await page.getByRole("button", { name: "Русский", exact: true }).click();
  await expect(page.getByLabel("Имя и фамилия")).toHaveValue("Jane Doe");
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue("jane@example.com");
  await page.getByRole("button", { name: "English", exact: true }).click();
  await expect(page.getByLabel("First and last name")).toHaveValue("Jane Doe");
  const passwords = page.locator('input[type="password"]');
  await passwords.nth(0).fill("temporary-test-password");
  await passwords.nth(1).fill("temporary-test-password");
  await page.locator('input[type="checkbox"]').check();
  await page.locator('form').getByRole("button").last().click();
  await expect.poll(() => submitted?.displayName).toBe("Jane Doe");
  expect(await page.evaluate(() => [localStorage.getItem("levelup_session_id"), localStorage.getItem("levelup_guest_token")])).toEqual(["same-session", "same-token"]);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});

test("coach workspace translates all tabs while preserving coach profile data", async ({ page }, info) => {
  await english(page);
  await page.route(`${apiBase}/api/coach/workspace`, route => json(route, workspace));
  await page.goto(`${appBase}/coach`);
  await expect(page.getByRole("heading", { name: /quick actions/i })).toBeVisible();
  for (const name of ["Clients", "Schedule", "Services", "Package", "Site", "Telegram", "Rewards", "Profile"]) {
    await page.getByRole("button", { name, exact: true }).first().click();
    await noRussianSystemCopy(page, ["Анна"]);
    await fits(page);
  }
  for (const width of [360, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await fits(page);
    await page.screenshot({ path: info.outputPath(`coach-profile-${width}.png`), fullPage: true });
  }
});

test("coach sees private moderation feedback, edits an existing service and submits corrected copy", async ({ page }) => {
  await english(page);
  const data = structuredClone(workspace);
  data.profile.status = "DRAFT";
  data.profile.moderationNote = "Добавьте образование и методику";
  data.serviceOffers = [{ id: "own-offer", coachProfileId: "coach", type: "ONGOING_SUPPORT", paymentModel: "CLIENT_PAID", title: "Моя услуга", description: "Исходное описание услуги", amount: 12000, currency: "usd", status: "DRAFT", moderationNote: "Уточните состав услуги", coachShareBps: null, platformShareBps: null }];
  let edited;
  let submitted;
  await page.route(`${apiBase}/api/coach/workspace`, route => json(route, data));
  await page.route(`${apiBase}/api/coach/services`, async route => {
    if (route.request().method() === "OPTIONS") return json(route, {});
    edited = route.request().postDataJSON();
    Object.assign(data.serviceOffers[0], edited, { moderationNote: null, status: "DRAFT" });
    await json(route, { offer: data.serviceOffers[0] });
  });
  await page.route(`${apiBase}/api/coach/services/own-offer/submit-review`, async route => {
    if (route.request().method() === "OPTIONS") return json(route, {});
    submitted = true;
    data.serviceOffers[0].status = "PENDING_REVIEW";
    await json(route, { offer: data.serviceOffers[0] });
  });
  await page.goto(`${appBase}/coach`);
  await expect(page.getByText("Добавьте образование и методику", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Services", exact: true }).first().click();
  await expect(page.getByText("Уточните состав услуги", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Edit service" })).toBeVisible();
  await page.getByLabel("What the client gets", { exact: true }).fill("Clear corrected service description");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect.poll(() => edited?.id).toBe("own-offer");
  expect(edited.description).toBe("Clear corrected service description");
  expect(edited.coachShareBps).toBeUndefined();
  await expect(page.getByText("Уточните состав услуги", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Submit for moderation", exact: true }).click();
  await expect.poll(() => submitted).toBe(true);
});

test("client feedback and progress translate without changing private messages", async ({ page }, info) => {
  await english(page);
  await page.route(`${apiBase}/api/habits/coaching`, route => json(route, {
    relationships: [{ coach, relationshipId: "relationship", status: "ACTIVE", funding: "COACH_PAID", metricsConsent: true, journalConsent: false,
      messages: [{ id: "message", authorRole: "COACH", text: "Энергия", createdAt: "2026-09-30T09:00:00Z" }], assignments: [], habitAssignments: [], rewards: [] }], orders: []
  }));
  await page.route(`${apiBase}/api/habits/progress**`, route => json(route, {
    period: "days", points: [{ date: "2026-09-30", energy: 6, clarity: 7, stability: 5 }],
    averages: { energy: 6, clarity: 7, stability: 5, wellness: 60 }, habitCompletionPercent: 70, currentStreak: 4, correlations: []
  }));
  await page.goto(`${appBase}/habits/coaching`);
  await expect(page.getByRole("heading", { name: "My coach", exact: true })).toBeVisible();
  await expect(page.getByText("Энергия", { exact: true })).toBeVisible();
  await page.locator('input[placeholder]').fill("My unchanged reply");
  await page.getByRole("button", { name: "Русский", exact: true }).click();
  await expect(page.locator('input[placeholder]')).toHaveValue("My unchanged reply");
  await page.getByRole("button", { name: "English", exact: true }).click();
  await noRussianSystemCopy(page, ["Анна", "Энергия"]);
  await page.goto(`${appBase}/habits/progress`);
  await expect(page.getByRole("heading", { name: "My Progress", exact: true })).toBeVisible();
  await expect(page.getByText("Energy", { exact: true }).first()).toBeVisible();
  await noRussianSystemCopy(page);
  for (const width of [360, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await fits(page);
    await page.screenshot({ path: info.outputPath(`progress-${width}.png`), fullPage: true });
  }
});

test("partner statistics use English labels and keep attribution data intact", async ({ page }) => {
  await english(page);
  await page.route(`${apiBase}/api/partners/portal/me`, route => json(route, { partner: { partnerCorePartnerId: "partner", displayName: "Анна", status: "APPROVED", email: "coach@example.com" }, expiresAt: "2030-01-01T00:00:00Z" }));
  await page.route(`${apiBase}/api/partners/portal/dashboard`, route => json(route, {
    partner: { partnerCorePartnerId: "partner", status: "APPROVED" }, metrics: { clicks: 10, registrations: 1, payments: 1 }, referralLinks: [], offers: [],
    registrations: [{ id: "registration", customerRef: "client@example.com", campaign: "Моя кампания", registeredAt: "2026-09-30T09:00:00Z", status: "REGISTERED" }],
    payments: [{ id: "payment", customerRef: "client@example.com", paidAt: "2026-09-30T09:00:00Z", amountCents: 800, commissionCents: 80, currency: "USD", status: "SUCCEEDED" }], leads: [], conversions: [], payouts: {}
  }));
  await page.route(`${apiBase}/api/partners/portal/ledger`, route => json(route, { ledger: [] }));
  await page.route(`${apiBase}/api/partners/portal/payouts`, route => json(route, { payouts: [] }));
  await page.goto(`${appBase}/partners`);
  await page.getByRole("button", { name: "Results", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Registrations" })).toBeVisible();
  await expect(page.getByText("Моя кампания")).toBeVisible();
  await expect(page.getByText("$8.00", { exact: true })).toBeVisible();
  await noRussianSystemCopy(page, ["Анна", "Моя кампания", "А"]);
});

test("English legal documents, diagnostics consent and isolated content override", async ({ page }) => {
  await english(page);
  await page.route(`${apiBase}/api/content/en`, route => json(route, { value: { landing: { v2: { menu: { about: "Our story" } } } } }));
  await page.goto(`${appBase}/`);
  await expect(page.getByRole("link", { name: "Our story", exact: true })).toBeAttached();
  await page.getByRole("button", { name: "Русский", exact: true }).click();
  await expect(page.getByRole("link", { name: "О нас", exact: true })).toBeAttached();
  await page.getByRole("button", { name: "English", exact: true }).click();
  for (const route of ["/privacy", "/offer", "/flow/voice", "/flow/face", "/demo", "/docs", "/founder-chat"]) {
    await page.goto(`${appBase}${route}`);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await noRussianSystemCopy(page);
    await fits(page);
  }
});

test("admin sections render English with an existing admin session", async ({ page }, info) => {
  await english(page);
  await page.addInitScript(() => sessionStorage.setItem("levelup_admin_session", "localization-admin"));
  await page.route(`${apiBase}/api/admin/stats`, route => json(route, { analysesTotal: 5, analysesByStatus: [], paymentsSucceeded: 2, revenueSucceeded: 600, eventsLast24h: 10, failedAnalyses: 0, habitProgramsActive: 3, habitProgramsTotal: 3, habitXpTotal: 123, habitCheckinsTotal: 7, habitInsightsTotal: 3 }));
  await page.route(`${apiBase}/api/admin/analyses**`, route => json(route, []));
  await page.goto(`${appBase}/admin`);
  await expect(page.getByRole("link", { name: "Users", exact: true }).first()).toBeVisible();
  await noRussianSystemCopy(page);
  for (const width of [360, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await fits(page);
    await page.screenshot({ path: info.outputPath(`admin-${width}.png`), fullPage: true });
  }
});

test("admin coach content saves English independently from Russian", async ({ page }) => {
  await english(page);
  await page.addInitScript(() => sessionStorage.setItem("levelup_admin_session", "localization-admin"));
  const settings = [{ key: "coach_public_content_en", value: { heroTitle: "Existing English headline" } }, { key: "coach_public_content_ru", value: { heroTitle: "Русский заголовок" } }];
  await page.route(`${apiBase}/api/admin/settings`, route => json(route, settings));
  await page.route(`${apiBase}/api/admin/demo-access-codes`, route => json(route, []));
  await page.route(`${apiBase}/api/admin/coaches/platform`, route => json(route, {
    profiles: [], plans: [], sitePlans: [], subscriptions: [], orders: [], offers: [], rewardsPendingReview: [],
    publicContent: { heroTitle: "Русский заголовок" }, cancellationPolicy: { hoursBeforeStart: 24, refundPercent: 100 }
  }));
  let saved;
  await page.route(`${apiBase}/api/admin/settings/*`, async route => {
    if (route.request().method() === "OPTIONS") return json(route, {});
    saved = { key: new URL(route.request().url()).pathname.split("/").at(-1), ...route.request().postDataJSON() };
    await json(route, saved);
  });
  await page.goto(`${appBase}/admin/coaches`);
  await page.getByRole("button", { name: "Public page", exact: true }).click();
  await page.getByRole("combobox", { name: "Language", exact: true }).selectOption("en");
  await expect(page.getByLabel("Main heading", { exact: true })).toHaveValue("Existing English headline");
  await page.getByLabel("Main heading", { exact: true }).fill("New English headline");
  await page.getByRole("button", { name: "Save texts", exact: true }).click();
  await expect.poll(() => saved?.key).toBe("coach_public_content_en");
  expect(saved.value.heroTitle).toBe("New English headline");
  expect(settings[1].value.heroTitle).toBe("Русский заголовок");
});
