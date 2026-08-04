const { test, expect } = require("@playwright/test");
const fs = require("node:fs");

const apiBase = "http://localhost:3001";
const appBase = "http://localhost:3000";
const corsHeaders = {
  "access-control-allow-origin": appBase,
  "access-control-allow-credentials": "true",
  "access-control-allow-headers": "content-type,x-admin-session,x-admin-token",
  "access-control-allow-methods": "GET,POST,PATCH,PUT,OPTIONS"
};

async function fulfillJson(route, json, status = 200) {
  if (route.request().method() === "OPTIONS") {
    await route.fulfill({ status: 204, headers: corsHeaders });
    return;
  }
  await route.fulfill({ status, json, headers: corsHeaders });
}

test("admin manages a separate disabled-until-configured community bot", async ({ page }) => {
  let savedChat = null;
  await page.addInitScript(() => {
    window.sessionStorage.setItem("levelup_admin_session", "test-admin-session");
  });
  await page.route(`${apiBase}/api/admin/settings`, (route) => fulfillJson(route, []));
  await page.route(`${apiBase}/api/admin/telegram-community`, (route) => fulfillJson(route, {
    configured: false,
    username: null,
    chats: [{
      id: "chat-1",
      telegramChatId: "-100123",
      type: "supergroup",
      title: "ORKEN Test Community",
      username: null,
      status: "PENDING",
      timezone: "Europe/Moscow",
      schedulesEnabled: false,
      aiRepliesEnabled: true,
      smartPingEnabled: false,
      morningTime: "08:30",
      middayTime: "13:30",
      eveningTime: "21:00",
      quietHoursStart: "22:00",
      quietHoursEnd: "08:30",
      lastHumanMessageAt: null,
      lastWakeAt: null,
      memberCount: 14,
      commitmentCount: 4,
      postCount: 3,
      createdAt: "2026-08-04T00:00:00.000Z",
      updatedAt: "2026-08-04T00:00:00.000Z"
    }]
  }));
  await page.route(`${apiBase}/api/admin/telegram-community/chats/chat-1`, async (route) => {
    savedChat = route.request().postDataJSON();
    await fulfillJson(route, { chat: { id: "chat-1" } });
  });

  await page.goto(`${appBase}/admin/integrations`);
  await expect(page.getByRole("heading", { name: "ORKEN Community Bot" })).toBeVisible();
  await expect(page.getByText("Ожидает токен", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "ORKEN Test Community" })).toBeVisible();
  await expect(page.getByText(/14 участников · 4 фокусов · 3 публикаций/)).toBeVisible();
  if (process.env.CAPTURE_COMMUNITY_ADMIN === "1") {
    fs.mkdirSync("output/playwright/telegram-community", { recursive: true });
    await page.screenshot({ path: "output/playwright/telegram-community/admin-integrations.png", fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: "output/playwright/telegram-community/admin-integrations-mobile.png", fullPage: true });
  }

  const community = page.locator(".admin-community-chat");
  await community.getByLabel("Статус").selectOption("ACTIVE");
  await community.getByLabel("Расписание").selectOption("true");
  await community.getByLabel("Smart Ping").selectOption("true");
  await community.getByRole("button", { name: "Сохранить группу" }).click();

  await expect.poll(() => savedChat).not.toBeNull();
  expect(savedChat).toMatchObject({
    status: "ACTIVE",
    schedulesEnabled: true,
    aiRepliesEnabled: true,
    smartPingEnabled: true,
    timezone: "Europe/Moscow"
  });
});
