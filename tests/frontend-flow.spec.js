const { test, expect } = require("@playwright/test");

const apiBase = "http://localhost:3001";
const appBase = "http://localhost:3000";
const pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAASElEQVR4nO3PQQ0AIBDAMMC/5+ONAvZoFSzZnpldtwJ8NgEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAb4GSAABlzm3xQAAAABJRU5ErkJggg==";
const corsHeaders = {
  "access-control-allow-origin": appBase,
  "access-control-allow-credentials": "true",
  "access-control-allow-headers": "content-type,x-session-id,x-guest-token,x-locale",
  "access-control-allow-methods": "GET,POST,PUT,OPTIONS"
};

async function fulfillJson(route, json) {
  if (route.request().method() === "OPTIONS") {
    await route.fulfill({ status: 204, headers: corsHeaders });
    return;
  }
  await route.fulfill({ json, headers: corsHeaders });
}

test.use({
  permissions: ["microphone", "camera"],
  launchOptions: {
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"]
  }
});

test("ORKEN.LIFE frontend flow works with mocked backend", async ({ page }) => {
  await page.route(`${apiBase}/api/content/ru`, async (route) => fulfillJson(route, { locale: "ru", value: null }));
  await page.route(`${apiBase}/api/auth/guest`, async (route) => fulfillJson(route, { sessionId: "test-session", guestToken: "test-token" }));
  await page.route(`${apiBase}/api/analyses`, async (route) => fulfillJson(route, {
      analysisId: "analysis-test",
      audioUploadUrl: `${apiBase}/uploads/audio-test`,
      photoUploadUrl: `${apiBase}/uploads/photo-test`
  }));
  await page.route(`${apiBase}/uploads/**`, async (route) => {
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }
    expect(route.request().method()).toBe("PUT");
    await route.fulfill({ status: 200, body: "ok", headers: corsHeaders });
  });
  await page.route(`${apiBase}/api/analyses/analysis-test/confirm`, async (route) => fulfillJson(route, { status: "QUEUED", jobId: "job-test" }));
  await page.route(`${apiBase}/api/analyses/analysis-test/stream**`, async (route) => route.fulfill({
    status: 200,
    headers: { ...corsHeaders, "content-type": "text/event-stream" },
    body: "data: {\"status\":\"DONE\",\"progress\":100,\"log\":\"Отчёт готов\"}\n\n"
  }));
  await page.route(`${apiBase}/api/analyses/analysis-test/status`, async (route) => fulfillJson(route, { status: "DONE", progress: 100 }));
  await page.route(`${apiBase}/api/analyses/analysis-test/report/free`, async (route) => fulfillJson(route, {
      reportFree: {
        profession: "Продуктовый стратег",
        summary: "Короткий бесплатный отчёт сформирован.",
        ikigai_scores: { love: 82, good_at: 77, world_needs: 74, paid_for: 69 }
      }
  }));

  await page.goto(`${appBase}/`);
  await expect(page.getByText("ORKEN.LIFE").first()).toBeVisible();
  await page.getByTestId("landing-start-primary").click();
  await expect(page).toHaveURL(/\/flow\/voice$/);

  await page.getByTestId("voice-record-button").click();
  await expect(page.getByTestId("voice-stop-button")).toBeVisible();
  await page.waitForTimeout(6200);
  await page.getByTestId("voice-stop-button").click();
  await expect(page.locator("audio[controls]")).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId("voice-next-link")).toBeVisible();
  await page.getByTestId("voice-next-link").click();
  await expect(page).toHaveURL(/\/flow\/face$/);

  await expect(page.getByTestId("face-file-button")).toBeEnabled();
  await page.getByTestId("face-file-input").setInputFiles({
    name: "face.png",
    mimeType: "image/png",
    buffer: Buffer.from(pngBase64, "base64")
  });
  await expect(page.getByTestId("face-metrics")).toBeVisible({ timeout: 10000 });
  await expect(page.getByTestId("face-next-link")).toBeVisible();
  await page.getByTestId("face-next-link").click();
  await expect(page).toHaveURL(/\/flow\/ikigai$/);

  await page.getByTestId("ikigai-love").fill("исследования, обучение");
  await page.getByTestId("ikigai-good_at").fill("стратегия, продукт");
  await page.getByTestId("ikigai-world_needs").fill("ясность, автоматизация");
  await page.getByTestId("ikigai-paid_for").fill("консалтинг, внедрение");
  await page.getByTestId("ikigai-submit-button").click();
  await expect(page).toHaveURL(/\/flow\/analysis$/);
  await expect(page.getByTestId("free-report-link")).toBeVisible({ timeout: 10000 });
  await expect(page.getByTestId("analysis-email-input")).toBeVisible();

  await page.getByTestId("analysis-email-input").fill("test@orken.life");
  await page.getByTestId("free-report-link").click();
  await expect(page).toHaveURL(/\/report\/analysis-test\/free$/);
  await expect(page.getByText("Profession / Профессия")).toBeVisible();
  await expect(page.getByText("Продуктовый стратег")).toBeVisible();
  await expect(page.getByTestId("open-pro-report-link")).toBeVisible();

  await page.getByTestId("open-pro-report-link").click();
  await expect(page).toHaveURL(/\/pay\/analysis-test$/);
  await expect(page.getByTestId("payment-page")).toBeVisible();
  await expect(page.locator('[data-testid="promo-code-input"]')).toHaveCount(0);
  await expect(page.getByText("Промокод")).toHaveCount(0);
  await expect(page.getByTestId("checkout-button")).toBeVisible();

  await page.goto(`${appBase}/habits`);
  await expect(page.getByTestId("habits-frame")).toBeVisible();
  const habitsFrame = page.frameLocator('[data-testid="habits-frame"]');
  await expect(habitsFrame.getByText("ORKEN.LIFE").first()).toBeVisible({ timeout: 15000 });
});
