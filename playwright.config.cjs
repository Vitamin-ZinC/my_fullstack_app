const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "tests",
  timeout: 120000,
  workers: 1,
  webServer: {
    command: "npm --workspace apps/frontend run build && npm --workspace apps/frontend run start",
    reuseExistingServer: true,
    timeout: 180000,
    url: "http://localhost:3000"
  }
});
