type TelegramHostWindow = Window & {
  Telegram?: {
    WebApp?: {
      openTelegramLink?: (url: string) => void;
    };
  };
};

export function normalizeTelegramConnectUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "t.me") {
    throw new Error("Invalid Telegram connect URL");
  }
  return url.toString();
}

export function openTelegramConnectUrl(value: string) {
  const url = normalizeTelegramConnectUrl(value);
  const telegramWebApp = (window as TelegramHostWindow).Telegram?.WebApp;
  if (typeof telegramWebApp?.openTelegramLink === "function") {
    telegramWebApp.openTelegramLink(url);
    return;
  }
  window.location.assign(url);
}
