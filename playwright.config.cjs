const { defineConfig } = require("@playwright/test");

const port = process.env.E2E_PORT ?? "3000";
const appBase = process.env.E2E_APP_BASE ?? `http://localhost:${port}`;

module.exports = defineConfig({
  testDir: "tests",
  timeout: 120000,
  workers: 1,
  webServer: {
    command: `npm --workspace apps/frontend run build && npm --workspace apps/frontend exec -- next start -p ${port}`,
    reuseExistingServer: true,
    timeout: 180000,
    url: appBase
  }
});
