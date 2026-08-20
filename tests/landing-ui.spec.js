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

async function mockPublicConfig(page, contentValue = null) {
  await page.route(`${apiBase}/api/content/ru`, async (route) => fulfillJson(route, { locale: "ru", value: contentValue }));
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

test("landing grid, navigation and role links work on desktop and mobile", async ({ page }) => {
  await mockPublicConfig(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(appBase);

  await expect(page.getByRole("heading", { name: /Поймите себя.*Выберите следующий вектор роста/ })).toBeVisible();
  await expect(page.locator(".landing-v2-pains svg")).toHaveCount(3);
  await expect(page.locator(".landing-v2-product-icon svg")).toHaveCount(2);
  await expect(page.locator(".landing-v2-hero-art img")).toBeVisible();
  await expect(page.getByText("1 фото + запись голоса 30–60 сек")).toBeVisible();
  await expect(page.getByRole("link", { name: "orken.eco@gmail.com" })).toHaveAttribute("href", "mailto:orken.eco@gmail.com");

  const primaryCtas = page.locator(".landing-v2-product > .landing-v2-button");
  await expect(primaryCtas).toHaveCount(2);
  const ctaHeights = await primaryCtas.evaluateAll((nodes) => nodes.map((node) => Math.round(node.getBoundingClientRect().height)));
  expect(new Set(ctaHeights).size).toBe(1);
  expect(ctaHeights[0]).toBeGreaterThanOrEqual(52);

  const contentWidths = await page.locator(".landing-v2-product-grid, .landing-v2-band-inner, .landing-v2-footer-inner").evaluateAll(
    (nodes) => nodes.map((node) => Math.round(node.getBoundingClientRect().width))
  );
  expect(Math.max(...contentWidths) - Math.min(...contentWidths)).toBeLessThanOrEqual(1);

  await page.getByText("Обратная связь", { exact: true }).click();
  await expect(page.getByRole("menuitem", { name: "Публичная оферта" })).toHaveAttribute("href", "/offer");
  await expect(page.getByRole("menuitem", { name: "Политика конфиденциальности" })).toHaveAttribute("href", "/privacy");

  await page.getByText("Кабинет", { exact: true }).click();
  await expect(page.getByRole("menuitem", { name: "Публичная оферта" })).not.toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Кабинет пользователя" })).toHaveAttribute("href", "/account");
  await expect(page.getByRole("menuitem", { name: "Кабинет клиента" })).toHaveAttribute("href", "/habits");
  await expect(page.getByRole("menuitem", { name: "Кабинет коуча" })).toHaveAttribute("href", "/coach");
  await expect(page.getByRole("menuitem", { name: "Кабинет партнёра" })).toHaveAttribute("href", "/partners");

  for (const route of ["/offer", "/privacy", "/account", "/habits", "/coach", "/partners"]) {
    const response = await page.request.get(`${appBase}${route}`);
    expect(response.status(), route).toBe(200);
  }

  await page.getByText("Кабинет", { exact: true }).click();

  await page.screenshot({
    path: path.join(screenshotDir, "landing-audit-desktop.png"),
    fullPage: true
  });
  await page.addStyleTag({ content: "#app.landing-v2-shell{height:auto!important;min-height:100vh}.landing-v2-screen{overflow:visible!important;flex:none!important}.landing-v2-nav{flex:none!important}" });
  await page.screenshot({
    path: path.join(screenshotDir, "landing-full-desktop.png"),
    fullPage: true
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByText("Ты вроде бы справляешься, но постоянно устаёшь")).toBeVisible();
  await page.getByRole("button", { name: "Открыть меню" }).click();
  await expect(page.getByRole("link", { name: "Коучам и HR" })).toBeVisible();
  const mobileOverflow = await page.locator(".landing-v2-screen").evaluate((node) => node.scrollWidth - node.clientWidth);
  expect(mobileOverflow).toBeLessThanOrEqual(1);
  await page.getByRole("button", { name: "Закрыть меню" }).click();
  await page.screenshot({
    path: path.join(screenshotDir, "landing-audit-mobile.png"),
    fullPage: true
  });
  await page.addStyleTag({ content: "#app.landing-v2-shell{height:auto!important;min-height:100vh}.landing-v2-screen{overflow:visible!important;flex:none!important}.landing-v2-nav{flex:none!important}" });
  await page.screenshot({
    path: path.join(screenshotDir, "landing-full-mobile.png"),
    fullPage: true
  });
});

test("legacy landing content cannot overwrite the versioned v2 copy", async ({ page }) => {
  await mockPublicConfig(page, {
    landing: {
      titlePrefix: "Старый заголовок",
      titleAccent: "не должен отображаться",
      productsTitle: "Старый блок"
    }
  });
  await page.goto(appBase);

  await expect(page.getByRole("heading", { name: /Поймите себя.*Выберите следующий вектор роста/ })).toBeVisible();
  await expect(page.getByText("Старый заголовок")).toHaveCount(0);
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
