const { test, expect } = require("@playwright/test");
const path = require("node:path");

const apiBase = "http://localhost:3001";
const appBase = "http://localhost:3000";
const screenshotDir = path.join(__dirname, "..", "output", "playwright");
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

async function mockPublicConfig(page) {
  await page.route(`${apiBase}/api/content/ru`, async (route) => fulfillJson(route, { locale: "ru", value: null }));
  await page.route(`${apiBase}/api/payments/config`, async (route) => fulfillJson(route, {
    amount: 300,
    currency: "usd",
    priceLabel: "$3"
  }));
  await page.route(`${apiBase}/api/habits/config`, async (route) => fulfillJson(route, {
    amount: 800,
    currency: "usd",
    priceLabel: "$8",
    trialDays: 14
  }));
}

test("landing grid and icons remain aligned on desktop and mobile", async ({ page }) => {
  await mockPublicConfig(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(appBase);

  await expect(page.getByRole("heading", { name: "Что анализирует ORKEN.LIFE" })).toBeVisible();
  await expect(page.locator(".landing-pain-row svg")).toHaveCount(4);
  await expect(page.locator(".landing-signal-card .signal-icon svg")).toHaveCount(2);
  await expect(page.locator(".landing-card-heading svg")).toHaveCount(3);
  await expect(page.getByText("1 фото + запись голоса 30–60 сек")).toBeVisible();
  await expect(page.getByRole("link", { name: "orken.eco@gmail.com" })).toHaveAttribute("href", "mailto:orken.eco@gmail.com");

  const primaryCtas = page.locator(".landing-product-card > .btn-primary");
  await expect(primaryCtas).toHaveCount(2);
  const ctaHeights = await primaryCtas.evaluateAll((nodes) => nodes.map((node) => Math.round(node.getBoundingClientRect().height)));
  expect(new Set(ctaHeights).size).toBe(1);
  expect(ctaHeights[0]).toBeGreaterThanOrEqual(52);

  const contentWidths = await page.locator(".landing-two-col, .landing-product-grid, .landing-section > .card").evaluateAll(
    (nodes) => nodes.map((node) => Math.round(node.getBoundingClientRect().width))
  );
  expect(Math.max(...contentWidths) - Math.min(...contentWidths)).toBeLessThanOrEqual(1);

  await page.screenshot({
    path: path.join(screenshotDir, "landing-audit-desktop.png"),
    fullPage: true
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByText("Ты вроде бы справляешься, но постоянно устаёшь")).toBeVisible();
  const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(mobileOverflow).toBeLessThanOrEqual(1);
  await page.screenshot({
    path: path.join(screenshotDir, "landing-audit-mobile.png"),
    fullPage: true
  });
});

test("media consent gates voice recording and face upload", async ({ page }) => {
  await page.route(`${apiBase}/api/content/ru`, async (route) => fulfillJson(route, { locale: "ru", value: null }));
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto(`${appBase}/flow/voice`);
  await expect(page.getByTestId("voice-consent")).toContainText("обработку аудиозаписи");
  await expect(page.getByTestId("voice-record-button")).toBeDisabled();
  await page.getByTestId("voice-consent").locator("input").check();
  await expect(page.getByTestId("voice-record-button")).toBeEnabled();
  await page.screenshot({
    path: path.join(screenshotDir, "voice-consent-mobile.png"),
    fullPage: true
  });

  await page.goto(`${appBase}/flow/face`);
  await expect(page.getByTestId("face-consent")).toContainText("обработку изображения лица");
  await expect(page.getByTestId("face-file-button")).toBeDisabled();
  await page.getByTestId("face-consent").locator("input").check();
  await expect(page.getByTestId("face-file-button")).toBeEnabled();
  const faceOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(faceOverflow).toBeLessThanOrEqual(1);
  await page.screenshot({
    path: path.join(screenshotDir, "face-consent-mobile.png"),
    fullPage: true
  });
});
