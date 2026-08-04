const token = process.env.TELEGRAM_COMMUNITY_BOT_TOKEN?.trim();
const expectedUsername = process.env.TELEGRAM_COMMUNITY_BOT_USERNAME?.trim().replace(/^@+/, "");
const secret = process.env.TELEGRAM_COMMUNITY_WEBHOOK_SECRET?.trim();
const origin = (process.env.PUBLIC_API_URL || process.env.APP_ORIGIN || "https://orken.life").replace(/\/$/, "");

if (!token) throw new Error("TELEGRAM_COMMUNITY_BOT_TOKEN is required");
if (!secret || secret.length < 16) throw new Error("TELEGRAM_COMMUNITY_WEBHOOK_SECRET must contain at least 16 characters");

async function telegram(method, payload = {}) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(`${method} failed: ${result.description || response.status}`);
  return result.result;
}

const me = await telegram("getMe");
if (expectedUsername && me.username?.toLowerCase() !== expectedUsername.toLowerCase()) {
  throw new Error(`Configured username does not match token owner: expected @${expectedUsername}, got @${me.username || "unknown"}`);
}

await telegram("setWebhook", {
  url: `${origin}/api/telegram/community/webhook`,
  secret_token: secret,
  allowed_updates: ["message", "callback_query", "my_chat_member"],
  drop_pending_updates: false
});

await telegram("setMyCommands", {
  scope: { type: "all_group_chats" },
  commands: [
    { command: "join", description: "Включить добровольное участие" },
    { command: "focus", description: "Записать фокус дня" },
    { command: "done", description: "Отметить выполнение" },
    { command: "partial", description: "Отметить частичный результат" },
    { command: "leaderboard", description: "Показать community-баллы" },
    { command: "life", description: "Открыть ORKEN.LIFE" },
    { command: "help", description: "Показать команды" }
  ]
});

await telegram("setMyCommands", {
  scope: { type: "all_chat_administrators" },
  commands: [
    { command: "activate", description: "Включить расписание группы" },
    { command: "pause", description: "Поставить расписание на паузу" },
    { command: "wake_up", description: "Мягко напомнить участникам" },
    { command: "status", description: "Показать состояние группы" },
    { command: "help", description: "Показать команды" }
  ]
});

console.log(JSON.stringify({
  ok: true,
  bot: `@${me.username}`,
  webhook: `${origin}/api/telegram/community/webhook`,
  privacyMode: "Configure /setprivacy in BotFather; keep enabled for the initial release"
}, null, 2));
