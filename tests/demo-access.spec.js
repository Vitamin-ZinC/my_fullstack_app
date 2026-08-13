const { test, expect } = require("@playwright/test");

const metrics = Array.from({ length: 14 }, (_, index) => ({
  date: `2026-08-${String(index + 1).padStart(2, "0")}`,
  energy: 5 + (index % 4),
  clarity: 6 + (index % 3),
  stability: 5 + (index % 4)
}));

const client = { id: "client-1", name: "Анна Смирнова", initials: "АС", status: "ACTIVE", todayCompleted: true, weeklyAverage: 8.2, trend: 0.8, lastCheckin: "2026-08-13T08:40:00.000Z", program: "Карьерный фокус" };
const feedback = [{ id: "feedback-1", date: "2026-08-12T16:30:00.000Z", text: "На этой неделе фокус не на скорости, а на устойчивом ритме.", status: "READ" }];
const assignments = [{ id: "assignment-1", title: "Сформулировать один приоритет", dueAt: "2026-08-15T18:00:00.000Z", completed: false }];
const insights = [{ id: "insight-1", date: "2026-08-13T09:10:00.000Z", text: "Когда начинаю день без сообщений, быстрее понимаю главное.", energy: 9 }];
const habits = [{ id: "habit-1", title: "Один приоритет до 10:00", completionRate: 86, streak: 6, assignedByCoach: true }];

const workspace = {
  synthetic: true,
  generatedAt: "2026-08-13T10:00:00.000Z",
  coach: {
    profile: { name: "Алексей Морозов", specialty: "Карьерный коуч", city: "Алматы" },
    stats: { activeClients: 5, completedToday: 3, needsAttention: 1, monthlyRevenue: 780 },
    clients: [client, { ...client, id: "client-2", name: "Мария Ким", initials: "МК", status: "ATTENTION", todayCompleted: false }],
    selectedClient: { client, metrics, insights, feedback, assignments, habits },
    schedule: { timezone: "Asia/Almaty", upcoming: [{ id: "meeting-1", clientName: "Анна Смирнова", startsAt: "2026-08-14T10:00:00.000Z", durationMinutes: 60, type: "Коуч-сессия" }], availability: [{ weekday: "Понедельник", hours: "10:00-18:00" }] },
    plan: { name: "Команда 15", includedClients: 15, usedClients: 6, monthlyAmount: 109, currency: "USD", renewsAt: "2026-08-31T09:00:00.000Z", options: [{ name: "Старт 5", includedClients: 5, monthlyAmount: 39 }, { name: "Команда 15", includedClients: 15, monthlyAmount: 109 }] }
  },
  client: {
    profile: { name: "Анна Смирнова", level: "Уверенный ритм", xp: 1240, streak: 6 },
    metrics,
    habits: habits.map((habit) => ({ ...habit, completedToday: true })),
    coach: { name: "Алексей Морозов", specialty: "Карьерный коуч", program: "Карьерный фокус", daysLeft: 24 },
    feedback,
    assignments,
    insights
  }
};

async function mockDemoApi(page) {
  let authenticated = false;
  await page.route("http://localhost:3001/api/demo/**", async (route) => {
    const url = new URL(route.request().url());
    const headers = { "content-type": "application/json", "access-control-allow-origin": "http://localhost:3100", "access-control-allow-credentials": "true" };
    if (url.pathname === "/api/demo/access") {
      authenticated = true;
      return route.fulfill({ status: 200, headers, body: JSON.stringify({ active: true, label: "E2E demo", expiresAt: "2026-08-14T18:00:00.000Z" }) });
    }
    if (url.pathname === "/api/demo/workspace" && authenticated) return route.fulfill({ status: 200, headers, body: JSON.stringify(workspace) });
    if (url.pathname === "/api/demo/logout") return route.fulfill({ status: 200, headers, body: JSON.stringify({ ok: true }) });
    return route.fulfill({ status: 401, headers, body: JSON.stringify({ error: "Demo access required" }) });
  });
}

test("demo code opens isolated coach and client workspaces", async ({ page }) => {
  await mockDemoApi(page);
  await page.goto("http://localhost:3100/demo");
  await expect(page.getByRole("heading", { name: "Кабинеты коуча и клиента" })).toBeVisible();
  await page.getByLabel("Код доступа").fill("ORKEN-DEMO-TEST-TEST-TEST");
  await page.getByRole("button", { name: /Открыть демо/ }).click();
  await expect(page.getByRole("heading", { name: /Добрый день, Алексей/ })).toBeVisible();
  await page.screenshot({ path: "output/playwright/demo-desktop.png", fullPage: true });
  await page.getByRole("button", { name: /Клиент/ }).first().click();
  await expect(page.getByRole("heading", { name: /Добрый день, Анна/ })).toBeVisible();
  await page.getByRole("button", { name: "Мой коуч" }).click();
  await expect(page.getByText("На этой неделе фокус не на скорости, а на устойчивом ритме.")).toBeVisible();
});

test("demo stays within the mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await mockDemoApi(page);
  await page.goto("http://localhost:3100/demo");
  await page.getByLabel("Код доступа").fill("ORKEN-DEMO-TEST-TEST-TEST");
  await page.getByRole("button", { name: /Открыть демо/ }).click();
  await expect(page.getByRole("heading", { name: /Добрый день, Алексей/ })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.screenshot({ path: "output/playwright/demo-mobile.png", fullPage: true });
});

test("admin can create and revoke demo access without seeing stored plaintext", async ({ page }) => {
  await page.addInitScript(() => window.sessionStorage.setItem("levelup_admin_session", "e2e-admin-session"));
  let codes = [];
  await page.route("http://localhost:3001/api/admin/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const headers = { "content-type": "application/json", "access-control-allow-origin": "http://localhost:3100" };
    if (url.pathname === "/api/admin/coaches/platform") {
      return route.fulfill({ status: 200, headers, body: JSON.stringify({
        profiles: [], plans: [], sitePlans: [], subscriptions: [], orders: [], offers: [], rewardsPendingReview: [],
        cancellationPolicy: { hoursBeforeStart: 24, refundPercent: 100 },
        publicContent: { heroEyebrow: "Партнёрство", heroTitle: "Для коучей", heroLead: "Описание", heroPrimaryCta: "Подать заявку", heroSecondaryCta: "Условия", pricingEyebrow: "Тарифы", pricingTitle: "Пакеты", pricingLead: "Описание", applicationEyebrow: "Заявка", applicationTitle: "Стать партнёром", applicationLead: "Описание", applicationSubmitLabel: "Отправить" }
      }) });
    }
    if (url.pathname === "/api/admin/demo-access-codes" && request.method() === "GET") {
      return route.fulfill({ status: 200, headers, body: JSON.stringify(codes) });
    }
    if (url.pathname === "/api/admin/demo-access-codes" && request.method() === "POST") {
      const accessCode = { id: "demo-1", label: "Демонстрация для коуча", codeHint: "ORKEN-DEMO-****-CDEF", active: true, expiresAt: "2026-09-13T10:00:00.000Z", maxSessions: 50, sessionsCreated: 0, activeSessions: 0, createdAt: "2026-08-13T10:00:00.000Z", updatedAt: "2026-08-13T10:00:00.000Z" };
      codes = [accessCode];
      return route.fulfill({ status: 200, headers, body: JSON.stringify({ accessCode, code: "ORKEN-DEMO-ABCD-1234-CDEF" }) });
    }
    return route.fulfill({ status: 404, headers, body: JSON.stringify({ error: "Not mocked" }) });
  });
  await page.goto("http://localhost:3100/admin/coaches");
  await expect(page.getByRole("heading", { name: "Демо-доступ к кабинетам" })).toBeVisible();
  await page.getByRole("button", { name: /Создать код/ }).click();
  await expect(page.getByText("ORKEN-DEMO-ABCD-1234-CDEF")).toBeVisible();
  await expect(page.getByText("ORKEN-DEMO-****-CDEF")).toBeVisible();
});
