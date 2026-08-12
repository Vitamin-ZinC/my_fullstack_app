const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");

const apiBase = "http://localhost:3001";
const appBase = "http://localhost:3000";
const corsHeaders = {
  "access-control-allow-origin": appBase,
  "access-control-allow-credentials": "true",
  "access-control-allow-headers": "content-type,x-session-id,x-guest-token,x-locale",
  "access-control-allow-methods": "GET,POST,OPTIONS"
};

const captureScreenshots = process.env.CAPTURE_COACHES_SCREENSHOTS === "1";
const screenshotDir = path.resolve("output/playwright/coaches");

async function capture(page, name) {
  if (!captureScreenshots) return;
  fs.mkdirSync(screenshotDir, { recursive: true });
  await page.screenshot({ path: path.join(screenshotDir, name), fullPage: true });
}

async function fulfillJson(route, json, status = 200) {
  if (route.request().method() === "OPTIONS") {
    await route.fulfill({ status: 204, headers: corsHeaders });
    return;
  }
  await route.fulfill({ status, json, headers: corsHeaders });
}

test("public coaches page keeps rates private and submits a partnership lead", async ({ page }) => {
  let applicationBody = null;
  await page.route(`${apiBase}/api/coaches/config`, async (route) => {
    await fulfillJson(route, {
      plans: [
        { id: "plan-5", code: "starter", name: "До 5 клиентов", description: "Для частной практики", includedClients: 5, amount: 3900, currency: "usd", customQuote: false },
        { id: "plan-15", code: "team", name: "До 15 клиентов", description: "Для растущей практики", includedClients: 15, amount: 10900, currency: "usd", customQuote: false }
      ],
      sitePlans: [{ id: "site-standard", code: "standard", name: "Стандартный сайт", setupAmount: 7500, monthlySupportAmount: 500, currency: "usd" }],
      content: {
        heroEyebrow: "Партнёрская программа ORKEN",
        heroTitle: "Технология, которая продолжает вашу работу между сессиями",
        heroLead: "Добавьте AI-диагностику и трекер состояний в свою практику.",
        heroPrimaryCta: "Стать партнёром",
        heroSecondaryCta: "Условия сотрудничества",
        pricingEyebrow: "Тарифы платформы",
        pricingTitle: "Пакет под текущую практику",
        pricingLead: "Клиенты с собственной подпиской не занимают места.",
        applicationEyebrow: "Заявка на партнёрство",
        applicationTitle: "Хочу стать партнёром ORKEN",
        applicationLead: "После отправки мы пришлём закрытый материал.",
        applicationSubmitLabel: "Получить условия сотрудничества"
      }
    });
  });
  await page.route(`${apiBase}/api/coaches/applications`, async (route) => {
    applicationBody = route.request().postDataJSON();
    await fulfillJson(route, { applicationId: "lead-1", status: "received", materialDelivery: "sent" }, 201);
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${appBase}/for-coaches`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("между сессиями");
  await expect(page.getByRole("heading", { name: "Экономика для коуча" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Реферальная программа" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Витрина коучей" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "White Label" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Личное сопровождение" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/\b10\s*%|\b50\s*%/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await capture(page, "coaches-mobile.png");

  if (captureScreenshots) {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.reload();
    await capture(page, "coaches-desktop.png");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
  }

  await page.getByLabel("Имя и фамилия *").fill("Анна Коуч");
  await page.getByLabel("E-mail *").fill("anna@example.com");
  await page.getByLabel("Telegram").fill("@anna_coach");
  await page.getByText("Получать доход с рекомендаций", { exact: true }).click();
  await page.getByText(/Я согласен/).click();
  await expect(page.getByRole("button", { name: /Получить условия/ })).toBeEnabled();
  await page.getByRole("button", { name: /Получить условия/ }).click();

  await expect(page.getByRole("heading", { name: "Заявка принята" })).toBeVisible();
  expect(applicationBody).toMatchObject({
    fullName: "Анна Коуч",
    email: "anna@example.com",
    telegram: "@anna_coach",
    interests: ["referral"],
    consent: true
  });
  expect(applicationBody.idempotencyKey).toBeTruthy();
});

test("private coach material renders only after token API succeeds", async ({ page }) => {
  await page.route(`${apiBase}/api/coaches/material/**`, async (route) => {
    await fulfillJson(route, {
        version: "coach-v1",
        title: "Коммерческие условия сотрудничества с ORKEN.LIFE",
        expiresAt: "2026-08-18T00:00:00.000Z",
        intro: "Закрытый материал",
        wholesale: [{ product: "AI-диагностика", retail: "$3", partnerPrice: "$2" }],
        referral: { rate: "10%", basis: "Оплаты", duration: "Пока активна подписка", payoutRule: "После периода возвратов" },
        personal: { rate: "50%", standardSlotLimit: "До 10 клиентов", workloadRule: "Только при свободном слоте" },
        visibilityRules: ["По персональной ссылке виден закреплённый коуч"],
        onboardingSteps: ["Проверка заявки"],
        legalNotes: ["Применяется соглашение"],
        partnerPortalUrl: "/partners",
        supportEmail: "orken.eco@gmail.com"
      }
    );
  });
  await page.goto(`${appBase}/coaches/material/${"a".repeat(43)}`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Коммерческие условия");
  await expect(page.getByText("10%", { exact: true })).toBeVisible();
  await expect(page.getByText("50%", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Сохранить в PDF/ })).toBeVisible();
  await capture(page, "coaches-private-material.png");
});
