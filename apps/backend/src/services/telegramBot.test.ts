import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/orken_test";
process.env.TELEGRAM_BOT_TOKEN ??= "test-token";
process.env.TELEGRAM_BOT_USERNAME = "@myorken_bot";

const { buildTelegramConnectUrl } = await import("./telegramBot.js");

test("Telegram connect URL uses the current bot username without a leading at-sign", () => {
  assert.equal(
    buildTelegramConnectUrl("token with spaces"),
    "https://t.me/myorken_bot?start=token%20with%20spaces"
  );
});
