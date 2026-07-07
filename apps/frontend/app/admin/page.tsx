"use client";

import { useEffect, useState } from "react";
import type { AdminStats, AppSetting, FeatureFlag, PromoCode, PromptTemplate, PromptTemplateInput } from "@levelup/contracts";
import {
  adminApi,
  contentSettingKey,
  defaultLocaleSettingKey,
  enabledLocalesSettingKey,
  habitNavigatorTemperatureSettingKey,
  habitPriceAmountSettingKey,
  habitPriceCurrencySettingKey,
  habitTrialDaysSettingKey,
  habitWeekSummaryModeSettingKey,
  habitWeekSummaryModelSettingKey,
  habitAssistantAvatarUrlSettingKey,
  reportPriceAmountSettingKey,
  reportPriceCurrencySettingKey,
  telegramRateLimitMaxSettingKey,
  telegramRateLimitWindowMsSettingKey,
  telegramReminderTemplateSettingKey,
  telegramTodayTemplateSettingKey,
  telegramWelcomeTemplateSettingKey,
  telegramWebLoginEnabledSettingKey
} from "@/lib/api";
import { defaultSiteText } from "@/lib/messages";

const emptyPromptForm: PromptTemplateInput = {
  key: "ikigai.report.free.user",
  locale: "ru",
  version: 1,
  status: "ACTIVE",
  title: "",
  content: ""
};

export default function AdminPage() {
  const adminText = defaultSiteText.ru.admin;
  const [password, setPassword] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [analyses, setAnalyses] = useState<unknown[]>([]);
  const [settings, setSettings] = useState<AppSetting[]>([]);
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [prompts, setPrompts] = useState<PromptTemplate[]>([]);
  const [promptDefaults, setPromptDefaults] = useState<PromptTemplateInput[]>([]);
  const [promptForm, setPromptForm] = useState<PromptTemplateInput>(emptyPromptForm);
  const [promoCodes, setPromoCodes] = useState<PromoCode[]>([]);
  const [activeTextLocale, setActiveTextLocale] = useState("ru");
  const [textDrafts, setTextDrafts] = useState<Record<string, string>>({
    ru: JSON.stringify(defaultSiteText.ru, null, 2),
    en: JSON.stringify(defaultSiteText.en, null, 2)
  });
  const [priceForm, setPriceForm] = useState({
    amount: "300",
    currency: "usd"
  });
  const [habitPriceForm, setHabitPriceForm] = useState({
    amount: "800",
    currency: "usd",
    trialDays: "30"
  });
  const [localeForm, setLocaleForm] = useState({
    enabledLocales: "ru,en",
    defaultLocale: "ru"
  });
  const [habitAiForm, setHabitAiForm] = useState({
    weekSummaryMode: "rule" as "rule" | "llm",
    weekSummaryModel: "gpt-4o-mini",
    navigatorTemperature: "0.45"
  });
  const [telegramPolicyForm, setTelegramPolicyForm] = useState({
    rateLimitWindowMs: "600000",
    rateLimitMax: "20",
    reminderTemplate: [
      "ORKEN на связи. Сегодняшний мягкий шаг:",
      "{{habitTitle}}",
      "{{taskText}}",
      "{{metricText}}",
      "",
      "Кнопки ниже помогут отметить шаг, сохранить состояние или открыть кабинет."
    ].join("\n"),
    welcomeTemplate: [
      "Привет! Я твой личный ИИ-помощник ORKEN от Навигатора привычек ORKEN.LIFE. 🚀",
      "",
      "Я помогаю тебе оставаться в фокусе, отслеживать прогресс и прокачивать дисциплину прямо в мессенджере. Вот что я умею делать:",
      "",
      "1. Подтягивать твою текущую привычку на сегодня из личного кабинета: что сделать, если нет сил, зачем и сколько времени нужно.",
      "2. Фиксировать внутреннее состояние: энергию, ясность и устойчивость.",
      "3. Сохранять важные инсайты и мысли в личный Архив.",
      "4. Начислять XP за ежедневные активности в общий профиль на сайте.",
      "",
      "Давай начнем. Синхронизируем твой аккаунт."
    ].join("\n"),
    todayTemplate: [
      "Сегодня: {{habitTitle}}",
      "",
      "1. Что нужно сделать",
      "{{whatToDo}}",
      "",
      "2. Если нет сил",
      "{{lowEnergy}}",
      "",
      "3. Зачем",
      "{{why}}",
      "",
      "4. Время",
      "{{time}}",
      "",
      "Прогресс недели: {{weekProgress}}/7."
    ].join("\n"),
    assistantAvatarUrl: "/assets/orken12.jpg",
    webLoginEnabled: true
  });
  const [promoForm, setPromoForm] = useState({
    code: "",
    description: "",
    discountType: "PERCENT" as "PERCENT" | "FIXED_AMOUNT",
    percentOff: "20",
    amountOff: "500",
    currency: "usd",
    maxRedemptions: "",
    expiresAt: ""
  });
  const [message, setMessage] = useState("");

  useEffect(() => {
    const saved = window.sessionStorage.getItem("levelup_admin_session") ?? "";
    if (saved) {
      setAuthenticated(true);
      void refresh();
    }
  }, []);

  async function refresh() {
    setMessage("");
    try {
      const [nextStats, nextAnalyses, nextSettings, nextFlags, nextPrompts, nextPromptDefaults, nextPromoCodes] = await Promise.all([
        adminApi.stats(),
        adminApi.analyses(),
        adminApi.settings(),
        adminApi.flags(),
        adminApi.prompts(),
        adminApi.promptDefaults(),
        adminApi.promoCodes()
      ]);
      setStats(nextStats);
      setAnalyses(nextAnalyses);
      setSettings(nextSettings);
      setFlags(nextFlags);
      setPrompts(nextPrompts);
      setPromptDefaults(nextPromptDefaults);
      setPromoCodes(nextPromoCodes);
      hydrateTextDrafts(nextSettings);
      hydrateLocaleForm(nextSettings);
      hydratePriceForm(nextSettings);
      hydrateHabitPriceForm(nextSettings);
      hydrateHabitAiForm(nextSettings);
      hydrateTelegramPolicyForm(nextSettings);
      hydratePromptForm(nextPrompts, nextPromptDefaults);
    } catch (reason) {
      setAuthenticated(false);
      window.sessionStorage.removeItem("levelup_admin_session");
      setMessage(reason instanceof Error ? reason.message : "Admin API failed");
    }
  }

  function hydrateTextDrafts(nextSettings: AppSetting[]) {
    const locales = readEnabledLocales(nextSettings);
    setTextDrafts(Object.fromEntries(locales.map((locale) => [
      locale,
      JSON.stringify(readTextSetting(nextSettings, locale), null, 2)
    ])));
    if (!locales.includes(activeTextLocale)) setActiveTextLocale(locales[0] ?? "ru");
  }

  function readTextSetting(nextSettings: AppSetting[], locale: string) {
    const setting = nextSettings.find((item) => item.key === contentSettingKey(locale));
    return setting?.value && typeof setting.value === "object" ? setting.value : defaultTextForLocale(locale);
  }

  function defaultTextForLocale(locale: string) {
    return locale === "en" ? defaultSiteText.en : defaultSiteText.ru;
  }

  function readEnabledLocales(nextSettings: AppSetting[]) {
    const enabled = nextSettings.find((item) => item.key === enabledLocalesSettingKey)?.value;
    const locales = Array.isArray(enabled)
      ? enabled.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim().toLowerCase())
      : [];
    return Array.from(new Set(locales.length > 0 ? locales : ["ru", "en"]));
  }

  function hydrateLocaleForm(nextSettings: AppSetting[]) {
    const defaultLocale = nextSettings.find((item) => item.key === defaultLocaleSettingKey)?.value;
    const enabledLocales = readEnabledLocales(nextSettings);
    setLocaleForm({
      enabledLocales: enabledLocales.join(","),
      defaultLocale: typeof defaultLocale === "string" ? defaultLocale : "ru"
    });
  }

  function hydratePriceForm(nextSettings: AppSetting[]) {
    const amount = nextSettings.find((item) => item.key === reportPriceAmountSettingKey)?.value;
    const currency = nextSettings.find((item) => item.key === reportPriceCurrencySettingKey)?.value;
    setPriceForm({
      amount: typeof amount === "number" || typeof amount === "string" ? String(amount) : "300",
      currency: typeof currency === "string" ? currency : "usd"
    });
  }

  function hydrateHabitPriceForm(nextSettings: AppSetting[]) {
    const amount = nextSettings.find((item) => item.key === habitPriceAmountSettingKey)?.value;
    const currency = nextSettings.find((item) => item.key === habitPriceCurrencySettingKey)?.value;
    const trialDays = nextSettings.find((item) => item.key === habitTrialDaysSettingKey)?.value;
    setHabitPriceForm({
      amount: typeof amount === "number" || typeof amount === "string" ? String(amount) : "800",
      currency: typeof currency === "string" ? currency : "usd",
      trialDays: typeof trialDays === "number" || typeof trialDays === "string" ? String(trialDays) : "30"
    });
  }

  function hydrateHabitAiForm(nextSettings: AppSetting[]) {
    const weekSummaryMode = nextSettings.find((item) => item.key === habitWeekSummaryModeSettingKey)?.value;
    const weekSummaryModel = nextSettings.find((item) => item.key === habitWeekSummaryModelSettingKey)?.value;
    const navigatorTemperature = nextSettings.find((item) => item.key === habitNavigatorTemperatureSettingKey)?.value;
    setHabitAiForm({
      weekSummaryMode: weekSummaryMode === "llm" ? "llm" : "rule",
      weekSummaryModel: typeof weekSummaryModel === "string" && weekSummaryModel.trim() ? weekSummaryModel : "gpt-4o-mini",
      navigatorTemperature: typeof navigatorTemperature === "number" || typeof navigatorTemperature === "string" ? String(navigatorTemperature) : "0.45"
    });
  }

  function hydrateTelegramPolicyForm(nextSettings: AppSetting[]) {
    const rateLimitWindowMs = nextSettings.find((item) => item.key === telegramRateLimitWindowMsSettingKey)?.value;
    const rateLimitMax = nextSettings.find((item) => item.key === telegramRateLimitMaxSettingKey)?.value;
    const reminderTemplate = nextSettings.find((item) => item.key === telegramReminderTemplateSettingKey)?.value;
    const welcomeTemplate = nextSettings.find((item) => item.key === telegramWelcomeTemplateSettingKey)?.value;
    const todayTemplate = nextSettings.find((item) => item.key === telegramTodayTemplateSettingKey)?.value;
    const assistantAvatarUrl = nextSettings.find((item) => item.key === habitAssistantAvatarUrlSettingKey)?.value;
    const webLoginEnabled = nextSettings.find((item) => item.key === telegramWebLoginEnabledSettingKey)?.value;
    setTelegramPolicyForm((current) => ({
      rateLimitWindowMs: typeof rateLimitWindowMs === "number" || typeof rateLimitWindowMs === "string" ? String(rateLimitWindowMs) : current.rateLimitWindowMs,
      rateLimitMax: typeof rateLimitMax === "number" || typeof rateLimitMax === "string" ? String(rateLimitMax) : current.rateLimitMax,
      reminderTemplate: typeof reminderTemplate === "string" && reminderTemplate.trim() ? reminderTemplate : current.reminderTemplate,
      welcomeTemplate: typeof welcomeTemplate === "string" && welcomeTemplate.trim() ? welcomeTemplate : current.welcomeTemplate,
      todayTemplate: typeof todayTemplate === "string" && todayTemplate.trim() ? todayTemplate : current.todayTemplate,
      assistantAvatarUrl: typeof assistantAvatarUrl === "string" ? assistantAvatarUrl : current.assistantAvatarUrl,
      webLoginEnabled: typeof webLoginEnabled === "boolean" ? webLoginEnabled : current.webLoginEnabled
    }));
  }

  function toPromptForm(prompt: PromptTemplate | PromptTemplateInput): PromptTemplateInput {
    return {
      key: prompt.key,
      locale: prompt.locale,
      version: prompt.version,
      status: prompt.status,
      title: prompt.title,
      content: prompt.content
    };
  }

  function hydratePromptForm(nextPrompts: PromptTemplate[], nextDefaults: PromptTemplateInput[]) {
    const preferred = nextPrompts.find((item) => item.key === "ikigai.report.free.user" && item.locale === "ru" && item.status === "ACTIVE")
      ?? nextPrompts[0]
      ?? nextDefaults.find((item) => item.key === "ikigai.report.free.user" && item.locale === "ru")
      ?? nextDefaults[0];
    if (preferred) setPromptForm(toPromptForm(preferred));
  }

  async function login() {
    setMessage("");
    try {
      const result = await adminApi.login(password);
      window.sessionStorage.setItem("levelup_admin_session", result.adminSession);
      window.sessionStorage.removeItem("levelup_admin_token");
      setPassword("");
      setAuthenticated(true);
      await refresh();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Login failed");
    }
  }

  function logout() {
    window.sessionStorage.removeItem("levelup_admin_session");
    window.sessionStorage.removeItem("levelup_admin_token");
    setAuthenticated(false);
    setStats(null);
  }

  async function upsertLocaleSettings() {
    await adminApi.upsertSetting(enabledLocalesSettingKey, ["ru", "en"]);
    await adminApi.upsertSetting(defaultLocaleSettingKey, "ru");
    await refresh();
  }

  async function saveLocaleSettings() {
    setMessage("");
    const enabledLocales = localeForm.enabledLocales.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
    const defaultLocale = localeForm.defaultLocale.trim().toLowerCase();
    if (enabledLocales.length === 0 || !enabledLocales.every((locale) => /^[a-z]{2,12}$/.test(locale))) {
      setMessage("Enabled locales must be comma-separated locale codes");
      return;
    }
    if (!enabledLocales.includes(defaultLocale)) {
      setMessage("Default locale must be included in enabled locales");
      return;
    }
    await adminApi.upsertSetting(enabledLocalesSettingKey, enabledLocales);
    await adminApi.upsertSetting(defaultLocaleSettingKey, defaultLocale);
    setMessage("Locale settings saved");
    await refresh();
  }

  async function upsertFeatureFlag() {
    await adminApi.upsertFlag("new_report_pipeline", true, { rollout: 0 });
    await refresh();
  }

  function promptIdentity(prompt: Pick<PromptTemplateInput, "key" | "locale">) {
    return {
      key: prompt.key.trim(),
      locale: prompt.locale.trim().toLowerCase() || "ru"
    };
  }

  function promptVersionsFor(prompt: Pick<PromptTemplateInput, "key" | "locale">) {
    const identity = promptIdentity(prompt);
    const savedVersions = prompts
      .filter((item) => item.key === identity.key && item.locale === identity.locale)
      .map((item) => ({ ...item, source: "saved" as const }));
    const defaultVersions = promptDefaults
      .filter((item) => item.key === identity.key && item.locale === identity.locale)
      .filter((item) => !savedVersions.some((saved) => saved.version === item.version))
      .map((item) => ({ ...item, source: "default" as const }));

    return [...savedVersions, ...defaultVersions].sort((left, right) => right.version - left.version);
  }

  function createNextPromptVersion() {
    const versions = promptVersionsFor(promptForm);
    const nextVersion = Math.max(0, ...versions.map((item) => item.version), Number(promptForm.version) || 0) + 1;
    setPromptForm({
      ...promptForm,
      version: nextVersion,
      status: "DRAFT",
      title: `${promptForm.title.replace(/\s+v\d+$/i, "").trim() || promptForm.key} v${nextVersion}`
    });
    setMessage(adminText.promptNewVersionReady);
  }

  async function upsertPrompt(statusOverride?: PromptTemplateInput["status"]) {
    setMessage("");
    const version = Number(promptForm.version);
    if (!promptForm.key.trim() || !promptForm.title.trim() || !promptForm.content.trim()) {
      setMessage("Prompt key, title and content are required");
      return;
    }
    if (!Number.isInteger(version) || version <= 0) {
      setMessage("Prompt version must be a positive integer");
      return;
    }

    await adminApi.upsertPrompt({
      ...promptForm,
      key: promptForm.key.trim(),
      locale: promptForm.locale.trim().toLowerCase() || "ru",
      version,
      status: statusOverride ?? promptForm.status,
      title: promptForm.title.trim()
    });
    setMessage((statusOverride ?? promptForm.status) === "ACTIVE" ? adminText.publishedPrompt : adminText.savedPrompt);
    await refresh();
  }

  async function seedDefaultPrompts() {
    setMessage("");
    await Promise.all(promptDefaults.map((prompt) => adminApi.upsertPrompt(prompt)));
    setMessage(adminText.savedPrompt);
    await refresh();
  }

  async function saveTexts(locale: string) {
    setMessage("");
    try {
      const parsed = JSON.parse(textDrafts[locale] ?? JSON.stringify(defaultTextForLocale(locale)));
      await adminApi.saveContent(locale, parsed);
      setMessage(adminText.savedTexts);
      await refresh();
    } catch (reason) {
      setMessage(reason instanceof SyntaxError ? adminText.invalidJson : reason instanceof Error ? reason.message : "Failed to save texts");
    }
  }

  async function saveReportPrice() {
    setMessage("");
    const amount = Number(priceForm.amount);
    const currency = priceForm.currency.trim().toLowerCase();
    if (!Number.isInteger(amount) || amount <= 0) {
      setMessage("Amount must be a positive integer in cents");
      return;
    }
    if (!/^[a-z]{3}$/.test(currency)) {
      setMessage("Currency must be a 3-letter ISO code");
      return;
    }

    await adminApi.upsertSetting(reportPriceAmountSettingKey, amount);
    await adminApi.upsertSetting(reportPriceCurrencySettingKey, currency);
    setMessage(adminText.savedPrice);
    await refresh();
  }

  async function saveHabitPrice() {
    setMessage("");
    const amount = Number(habitPriceForm.amount);
    const currency = habitPriceForm.currency.trim().toLowerCase();
    const trialDays = Number(habitPriceForm.trialDays);
    if (!Number.isInteger(amount) || amount <= 0) {
      setMessage("Amount must be a positive integer in cents");
      return;
    }
    if (!/^[a-z]{3}$/.test(currency)) {
      setMessage("Currency must be a 3-letter ISO code");
      return;
    }
    if (!Number.isInteger(trialDays) || trialDays < 0) {
      setMessage("Trial days must be a non-negative integer");
      return;
    }

    await adminApi.upsertSetting(habitPriceAmountSettingKey, amount);
    await adminApi.upsertSetting(habitPriceCurrencySettingKey, currency);
    await adminApi.upsertSetting(habitTrialDaysSettingKey, trialDays);
    setMessage(adminText.savedHabitPrice);
    await refresh();
  }

  async function saveHabitAiSettings() {
    setMessage("");
    const temperature = Number(habitAiForm.navigatorTemperature);
    if (!Number.isFinite(temperature) || temperature < 0 || temperature > 1) {
      setMessage("Navigator temperature must be between 0 and 1");
      return;
    }
    const model = habitAiForm.weekSummaryModel.trim();
    if (!model) {
      setMessage("Week summary model is required");
      return;
    }

    await adminApi.upsertSetting(habitWeekSummaryModeSettingKey, habitAiForm.weekSummaryMode);
    await adminApi.upsertSetting(habitWeekSummaryModelSettingKey, model);
    await adminApi.upsertSetting(habitNavigatorTemperatureSettingKey, temperature);
    setMessage("Habit AI settings saved");
    await refresh();
  }

  async function saveTelegramPolicySettings() {
    setMessage("");
    const rateLimitWindowMs = Number(telegramPolicyForm.rateLimitWindowMs);
    const rateLimitMax = Number(telegramPolicyForm.rateLimitMax);
    if (!Number.isInteger(rateLimitWindowMs) || rateLimitWindowMs < 60000 || rateLimitWindowMs > 86400000) {
      setMessage("Telegram rate limit window must be between 60000 and 86400000 ms");
      return;
    }
    if (!Number.isInteger(rateLimitMax) || rateLimitMax < 1 || rateLimitMax > 500) {
      setMessage("Telegram max messages must be between 1 and 500");
      return;
    }
    if (!telegramPolicyForm.reminderTemplate.trim()) {
      setMessage("Telegram reminder template is required");
      return;
    }
    if (!telegramPolicyForm.welcomeTemplate.trim()) {
      setMessage("Telegram welcome template is required");
      return;
    }
    if (!telegramPolicyForm.todayTemplate.trim()) {
      setMessage("Telegram daily plan template is required");
      return;
    }
    const assistantAvatarUrl = telegramPolicyForm.assistantAvatarUrl.trim();
    if (assistantAvatarUrl && !/^(\/[A-Za-z0-9/_.,?=&%:+#-]+|https?:\/\/\S{1,500})$/.test(assistantAvatarUrl)) {
      setMessage("Assistant avatar must be a public path or http(s) URL");
      return;
    }

    await adminApi.upsertSetting(telegramRateLimitWindowMsSettingKey, rateLimitWindowMs);
    await adminApi.upsertSetting(telegramRateLimitMaxSettingKey, rateLimitMax);
    await adminApi.upsertSetting(telegramReminderTemplateSettingKey, telegramPolicyForm.reminderTemplate);
    await adminApi.upsertSetting(telegramWelcomeTemplateSettingKey, telegramPolicyForm.welcomeTemplate);
    await adminApi.upsertSetting(telegramTodayTemplateSettingKey, telegramPolicyForm.todayTemplate);
    await adminApi.upsertSetting(habitAssistantAvatarUrlSettingKey, assistantAvatarUrl);
    await adminApi.upsertSetting(telegramWebLoginEnabledSettingKey, telegramPolicyForm.webLoginEnabled);
    setMessage("Telegram policy settings saved");
    await refresh();
  }

  async function uploadAssistantAvatar(file: File | null) {
    if (!file) return;
    setMessage("");
    try {
      const result = await adminApi.uploadAssistantAvatar(file);
      setTelegramPolicyForm((current) => ({ ...current, assistantAvatarUrl: result.url }));
      setMessage("Assistant avatar uploaded");
      await refresh();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Failed to upload assistant avatar");
    }
  }

  function resetTexts(locale: string) {
    setTextDrafts((current) => ({
      ...current,
      [locale]: JSON.stringify(defaultTextForLocale(locale), null, 2)
    }));
  }

  async function upsertPromoCode() {
    await adminApi.upsertPromoCode({
      code: promoForm.code,
      description: promoForm.description || null,
      discountType: promoForm.discountType,
      percentOff: promoForm.discountType === "PERCENT" ? Number(promoForm.percentOff) : null,
      amountOff: promoForm.discountType === "FIXED_AMOUNT" ? Number(promoForm.amountOff) : null,
      currency: promoForm.discountType === "FIXED_AMOUNT" ? promoForm.currency : null,
      active: true,
      maxRedemptions: promoForm.maxRedemptions ? Number(promoForm.maxRedemptions) : null,
      startsAt: null,
      expiresAt: promoForm.expiresAt ? new Date(promoForm.expiresAt).toISOString() : null
    });
    setPromoForm((current) => ({ ...current, code: "", description: "" }));
    await refresh();
  }

  async function togglePromoCode(promoCode: PromoCode) {
    await adminApi.setPromoCodeActive(promoCode.id, !promoCode.active);
    await refresh();
  }

  const promptChoices = [
    ...prompts.map((prompt) => ({ label: `${prompt.key}/${prompt.locale}/v${prompt.version} ${prompt.status}`, value: `${prompt.key}|${prompt.locale}|${prompt.version}|saved`, prompt })),
    ...promptDefaults
      .filter((prompt) => !prompts.some((item) => item.key === prompt.key && item.locale === prompt.locale && item.version === prompt.version))
      .map((prompt) => ({ label: `${prompt.key}/${prompt.locale}/v${prompt.version} default`, value: `${prompt.key}|${prompt.locale}|${prompt.version}|default`, prompt }))
  ];
  const promptVersionHistory = promptVersionsFor(promptForm);
  const reportPricePreview = formatAdminPriceLabel(priceForm.amount, priceForm.currency);
  const habitPricePreview = formatAdminPriceLabel(habitPriceForm.amount, habitPriceForm.currency);
  const habitTrialDaysNumber = Number(habitPriceForm.trialDays);
  const habitTrialPreview = Number.isInteger(habitTrialDaysNumber) && habitTrialDaysNumber > 0
    ? `${habitTrialDaysNumber} days trial`
    : adminText.habitTrialDisabled;

  return (
    <main className="page stack">
      <section className="stack">
        <div>
          <div className="eyebrow">{adminText.eyebrow}</div>
          <h1>{adminText.title}</h1>
        </div>
        {!authenticated ? (
          <div className="grid grid-2">
            <input className="input" data-testid="admin-password-input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={adminText.passwordPlaceholder} />
            <button className="button" data-testid="admin-login-button" onClick={login}>{adminText.login}</button>
          </div>
        ) : (
          <div className="row">
            <p className="muted" style={{ margin: 0 }}>{adminText.activeSession}</p>
            <button className="button secondary" style={{ width: "auto" }} onClick={logout}>{adminText.logout}</button>
          </div>
        )}
        {message && <div className="card" style={{ borderColor: "var(--danger)" }}>{message}</div>}
      </section>

      {authenticated && (
        <>
          {stats && (
            <section className="grid grid-3" data-testid="admin-stats">
              <Metric label={adminText.stats[0]} value={stats.analysesTotal} />
              <Metric label={adminText.stats[1]} value={stats.paymentsSucceeded} />
              <Metric label={adminText.stats[2]} value={stats.revenueSucceeded} />
              <Metric label={adminText.stats[3]} value={stats.eventsLast24h} />
              <Metric label={adminText.stats[4]} value={stats.failedAnalyses} />
              <Metric label={adminText.stats[5]} value={stats.analysesByStatus.map((item) => `${item.status}:${item.count}`).join(" ")} />
              <Metric label="Habit programs" value={`${stats.habitProgramsActive}/${stats.habitProgramsTotal}`} />
              <Metric label="Habit XP total" value={stats.habitXpTotal} />
              <Metric label="Habit checkins" value={stats.habitCheckinsTotal} />
              <Metric label="Habit insights" value={stats.habitInsightsTotal} />
            </section>
          )}

          <section className="grid grid-3">
            <button className="button secondary" onClick={upsertLocaleSettings}>{adminText.seedLocales}</button>
            <button className="button secondary" onClick={upsertFeatureFlag}>{adminText.seedFlag}</button>
            <button className="button secondary" onClick={seedDefaultPrompts}>{adminText.seedPrompt}</button>
          </section>

          <section className="card stack">
            <div>
              <h2>Localization settings</h2>
              <p className="muted">Controls which locales are enabled and which locale is used by default. Translation JSON is edited below in Texts and translations.</p>
            </div>
            <div className="grid grid-3">
              <label className="stack">
                <span className="eyebrow">Enabled locales</span>
                <input className="input" value={localeForm.enabledLocales} onChange={(event) => setLocaleForm({ ...localeForm, enabledLocales: event.target.value })} placeholder="ru,en" />
              </label>
              <label className="stack">
                <span className="eyebrow">Default locale</span>
                <input className="input" value={localeForm.defaultLocale} onChange={(event) => setLocaleForm({ ...localeForm, defaultLocale: event.target.value.toLowerCase() })} placeholder="ru" />
              </label>
              <button className="button" onClick={saveLocaleSettings}>Save locale settings</button>
            </div>
          </section>

          <section className="card stack">
            <div>
              <h2>{adminText.priceTitle}</h2>
              <p className="muted">{adminText.priceCopy}</p>
            </div>
            <div className="grid grid-3">
              <input className="input" value={priceForm.amount} onChange={(event) => setPriceForm({ ...priceForm, amount: event.target.value })} placeholder={adminText.priceAmount} inputMode="numeric" />
              <input className="input" value={priceForm.currency} onChange={(event) => setPriceForm({ ...priceForm, currency: event.target.value.toLowerCase() })} placeholder={adminText.priceCurrency} />
              <button className="button" onClick={saveReportPrice}>{adminText.savePrice}</button>
            </div>
            <div className="prompt-help">
              <strong>{adminText.habitPricePreview}: {reportPricePreview}</strong>
              <span>{adminText.priceCopy}</span>
            </div>
          </section>

          <section className="card stack">
            <div>
              <h2>{adminText.habitPriceTitle}</h2>
              <p className="muted">{adminText.habitPriceCopy}</p>
            </div>
            <div className="grid grid-3">
              <label className="stack">
                <span className="eyebrow">{adminText.habitPriceAmount}</span>
                <input className="input" value={habitPriceForm.amount} onChange={(event) => setHabitPriceForm({ ...habitPriceForm, amount: event.target.value })} placeholder={adminText.priceAmount} inputMode="numeric" />
              </label>
              <label className="stack">
                <span className="eyebrow">{adminText.habitPriceCurrency}</span>
                <input className="input" value={habitPriceForm.currency} onChange={(event) => setHabitPriceForm({ ...habitPriceForm, currency: event.target.value.toLowerCase() })} placeholder={adminText.priceCurrency} />
              </label>
              <label className="stack">
                <span className="eyebrow">{adminText.habitTrialDays}</span>
                <input className="input" value={habitPriceForm.trialDays} onChange={(event) => setHabitPriceForm({ ...habitPriceForm, trialDays: event.target.value })} placeholder={adminText.habitTrialDays} inputMode="numeric" />
              </label>
            </div>
            <div className="prompt-help">
              <strong>{adminText.habitPricePreview}: {habitPricePreview} / month · {habitTrialPreview}</strong>
              <span>{adminText.habitPriceTargets}</span>
            </div>
            <div className="grid grid-3">
              <button className="button" onClick={saveHabitPrice}>{adminText.saveHabitPrice}</button>
            </div>
          </section>

          <section className="card stack">
            <div>
              <h2>Habit AI settings</h2>
              <p className="muted">Switch week summaries between deterministic rules and LLM generation. LLM mode falls back to rules if the provider is unavailable.</p>
            </div>
            <div className="grid grid-3">
              <label className="stack">
                <span className="eyebrow">Week summary mode</span>
                <select className="input" value={habitAiForm.weekSummaryMode} onChange={(event) => setHabitAiForm({ ...habitAiForm, weekSummaryMode: event.target.value as "rule" | "llm" })}>
                  <option value="rule">Rule based</option>
                  <option value="llm">LLM based</option>
                </select>
              </label>
              <label className="stack">
                <span className="eyebrow">Week summary model</span>
                <input className="input" value={habitAiForm.weekSummaryModel} onChange={(event) => setHabitAiForm({ ...habitAiForm, weekSummaryModel: event.target.value })} placeholder="gpt-4o-mini" />
              </label>
              <label className="stack">
                <span className="eyebrow">ORKEN temperature</span>
                <input className="input" value={habitAiForm.navigatorTemperature} onChange={(event) => setHabitAiForm({ ...habitAiForm, navigatorTemperature: event.target.value })} placeholder="0.45" inputMode="decimal" />
              </label>
              <button className="button" onClick={saveHabitAiSettings}>Save Habit AI settings</button>
            </div>
          </section>

          <section className="card stack">
            <div>
              <h2>Telegram policy</h2>
              <p className="muted">Controls bot rate limits, reminder copy, and short-lived Telegram-to-web login links. Bot token and provider secrets stay only in backend environment variables.</p>
            </div>
            <div className="grid grid-3">
              <label className="stack">
                <span className="eyebrow">Rate window, ms</span>
                <input className="input" value={telegramPolicyForm.rateLimitWindowMs} onChange={(event) => setTelegramPolicyForm({ ...telegramPolicyForm, rateLimitWindowMs: event.target.value })} inputMode="numeric" />
              </label>
              <label className="stack">
                <span className="eyebrow">Max messages/window</span>
                <input className="input" value={telegramPolicyForm.rateLimitMax} onChange={(event) => setTelegramPolicyForm({ ...telegramPolicyForm, rateLimitMax: event.target.value })} inputMode="numeric" />
              </label>
              <label className="stack">
                <span className="eyebrow">Web login links</span>
                <select className="input" value={telegramPolicyForm.webLoginEnabled ? "true" : "false"} onChange={(event) => setTelegramPolicyForm({ ...telegramPolicyForm, webLoginEnabled: event.target.value === "true" })}>
                  <option value="true">Enabled</option>
                  <option value="false">Disabled</option>
                </select>
              </label>
            </div>
            <textarea
              className="input text-editor"
              value={telegramPolicyForm.reminderTemplate}
              onChange={(event) => setTelegramPolicyForm({ ...telegramPolicyForm, reminderTemplate: event.target.value })}
              spellCheck={false}
            />
            <p className="muted">Placeholders: {"{{habitTitle}}"}, {"{{taskText}}"}, {"{{metricText}}"}</p>
            <div className="grid grid-2">
              <label className="stack">
                <span className="eyebrow">Welcome template</span>
                <textarea
                  className="input text-editor compact"
                  value={telegramPolicyForm.welcomeTemplate}
                  onChange={(event) => setTelegramPolicyForm({ ...telegramPolicyForm, welcomeTemplate: event.target.value })}
                  spellCheck={false}
                />
              </label>
              <label className="stack">
                <span className="eyebrow">Daily plan template</span>
                <textarea
                  className="input text-editor compact"
                  value={telegramPolicyForm.todayTemplate}
                  onChange={(event) => setTelegramPolicyForm({ ...telegramPolicyForm, todayTemplate: event.target.value })}
                  spellCheck={false}
                />
              </label>
            </div>
            <p className="muted">Daily placeholders: {"{{habitTitle}}"}, {"{{whatToDo}}"}, {"{{lowEnergy}}"}, {"{{why}}"}, {"{{time}}"}, {"{{weekProgress}}"}</p>
            <div className="admin-avatar-control">
              {telegramPolicyForm.assistantAvatarUrl.trim() && (
                <img src={telegramPolicyForm.assistantAvatarUrl.trim()} alt="Assistant avatar preview" />
              )}
              <label className="stack">
                <span className="eyebrow">Assistant avatar URL</span>
                <input
                  className="input"
                  value={telegramPolicyForm.assistantAvatarUrl}
                  onChange={(event) => setTelegramPolicyForm({ ...telegramPolicyForm, assistantAvatarUrl: event.target.value })}
                  placeholder="/assets/orken12.jpg"
                />
              </label>
              <label className="button secondary admin-upload-button">
                Upload avatar
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void uploadAssistantAvatar(event.target.files?.[0] ?? null)} />
              </label>
            </div>
            <button className="button" onClick={saveTelegramPolicySettings}>Save Telegram policy</button>
          </section>

          <section className="card stack">
            <div>
              <h2>{adminText.promptTitle}</h2>
              <p className="muted">{adminText.promptCopy}</p>
            </div>
            <div className="prompt-output-note">
              <strong>{adminText.promptOutputTitle}</strong>
              <span>{adminText.promptOutputCopy}</span>
            </div>
            <select
              className="input"
              value=""
              onChange={(event) => {
                const selected = promptChoices.find((item) => item.value === event.target.value);
                if (selected) setPromptForm(toPromptForm(selected.prompt));
              }}
            >
              <option value="">{adminText.promptSelect}</option>
              {promptChoices.map((item) => (
                <option value={item.value} key={item.value}>{item.label}</option>
              ))}
            </select>
            <div className="prompt-version-panel">
              <div>
                <strong>{adminText.promptVersioningTitle}</strong>
                <span>{adminText.promptVersioningCopy}</span>
              </div>
              <div className="prompt-version-list">
                {promptVersionHistory.length === 0 ? (
                  <span className="muted">{adminText.promptNoVersions}</span>
                ) : promptVersionHistory.map((item) => (
                  <button
                    className={`button secondary ${item.status === "ACTIVE" ? "active-control" : ""}`}
                    key={`${item.key}-${item.locale}-${item.version}-${item.source}`}
                    onClick={() => setPromptForm(toPromptForm(item))}
                    style={{ width: "auto" }}
                  >
                    v{item.version} {item.status} - {item.source}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-3">
              <input className="input" data-testid="admin-prompt-key" value={promptForm.key} onChange={(event) => setPromptForm({ ...promptForm, key: event.target.value })} placeholder={adminText.promptKey} />
              <input className="input" value={promptForm.locale} onChange={(event) => setPromptForm({ ...promptForm, locale: event.target.value.toLowerCase() })} placeholder={adminText.promptLocale} />
              <input className="input" value={promptForm.version} onChange={(event) => setPromptForm({ ...promptForm, version: Number(event.target.value) || 1 })} placeholder={adminText.promptVersion} inputMode="numeric" />
              <select className="input" value={promptForm.status} onChange={(event) => setPromptForm({ ...promptForm, status: event.target.value as PromptTemplateInput["status"] })}>
                <option value="DRAFT">DRAFT</option>
                <option value="ACTIVE">ACTIVE</option>
                <option value="ARCHIVED">ARCHIVED</option>
              </select>
              <input className="input" value={promptForm.title} onChange={(event) => setPromptForm({ ...promptForm, title: event.target.value })} placeholder={adminText.promptTitleField} />
            </div>
            <textarea
              className="input text-editor prompt-editor"
              data-testid="admin-prompt-content"
              value={promptForm.content}
              onChange={(event) => setPromptForm({ ...promptForm, content: event.target.value })}
              spellCheck={false}
            />
            <div className="prompt-help">
              <strong>{adminText.promptPlaceholdersTitle}</strong>
              <span>{adminText.promptPlaceholders}</span>
            </div>
            <div className="grid grid-3">
              <button className="button" data-testid="admin-save-prompt" onClick={() => upsertPrompt()}>{adminText.savePrompt}</button>
              <button className="button secondary" onClick={() => upsertPrompt("ACTIVE")}>{adminText.publishPrompt}</button>
              <button className="button secondary" onClick={createNextPromptVersion}>{adminText.newPromptVersion}</button>
              <button className="button secondary" onClick={seedDefaultPrompts}>{adminText.seedPrompt}</button>
            </div>
          </section>

          <section className="card stack">
            <div>
              <h2>{adminText.textTitle}</h2>
              <p className="muted">{adminText.textCopy}</p>
            </div>
            <div className="row" style={{ justifyContent: "flex-start" }}>
              {Object.keys(textDrafts).map((locale) => (
                <button
                  className={`button secondary ${activeTextLocale === locale ? "active-control" : ""}`}
                  key={locale}
                  onClick={() => setActiveTextLocale(locale)}
                  style={{ width: "auto" }}
                >
                  {locale.toUpperCase()}
                </button>
              ))}
            </div>
            <textarea
              className="input text-editor"
              value={textDrafts[activeTextLocale] ?? ""}
              onChange={(event) => setTextDrafts((current) => ({ ...current, [activeTextLocale]: event.target.value }))}
              spellCheck={false}
            />
            <div className="grid grid-2">
              <button className="button" onClick={() => saveTexts(activeTextLocale)}>{adminText.saveTexts}</button>
              <button className="button secondary" onClick={() => resetTexts(activeTextLocale)}>{adminText.resetTexts}</button>
            </div>
          </section>

          <section className="card stack">
            <h2>{adminText.promoTitle}</h2>
            <div className="grid grid-3">
              <input className="input" value={promoForm.code} onChange={(event) => setPromoForm({ ...promoForm, code: event.target.value })} placeholder="Code" />
              <input className="input" value={promoForm.description} onChange={(event) => setPromoForm({ ...promoForm, description: event.target.value })} placeholder="Description" />
              <select className="input" value={promoForm.discountType} onChange={(event) => setPromoForm({ ...promoForm, discountType: event.target.value as "PERCENT" | "FIXED_AMOUNT" })}>
                <option value="PERCENT">Percent</option>
                <option value="FIXED_AMOUNT">Fixed amount</option>
              </select>
              {promoForm.discountType === "PERCENT" ? (
                <input className="input" value={promoForm.percentOff} onChange={(event) => setPromoForm({ ...promoForm, percentOff: event.target.value })} placeholder="Percent off" />
              ) : (
                <input className="input" value={promoForm.amountOff} onChange={(event) => setPromoForm({ ...promoForm, amountOff: event.target.value })} placeholder="Amount off, cents" />
              )}
              <input className="input" value={promoForm.currency} onChange={(event) => setPromoForm({ ...promoForm, currency: event.target.value })} placeholder="Currency" />
              <input className="input" value={promoForm.maxRedemptions} onChange={(event) => setPromoForm({ ...promoForm, maxRedemptions: event.target.value })} placeholder="Max redemptions" />
              <input className="input" type="datetime-local" value={promoForm.expiresAt} onChange={(event) => setPromoForm({ ...promoForm, expiresAt: event.target.value })} />
              <button className="button" onClick={upsertPromoCode}>Save promo</button>
            </div>
            <div className="stack">
              {promoCodes.length === 0 ? <p className="muted">No promo codes</p> : promoCodes.map((promoCode) => (
                <div className="row" key={promoCode.id}>
                  <span>
                    <strong>{promoCode.code}</strong>{" "}
                    {promoCode.discountType === "PERCENT" ? `${promoCode.percentOff}%` : `${promoCode.amountOff} ${promoCode.currency}`}
                    {" "}used {promoCode.redemptions}{promoCode.maxRedemptions ? `/${promoCode.maxRedemptions}` : ""}
                  </span>
                  <button className="button secondary" onClick={() => togglePromoCode(promoCode)}>
                    {promoCode.active ? "Deactivate" : "Activate"}
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section className="grid grid-2">
            <List title={adminText.lists[0]} items={settings.map((item) => `${item.key}: ${JSON.stringify(item.value).slice(0, 180)}`)} />
            <List title={adminText.lists[1]} items={flags.map((item) => `${item.key}: ${item.enabled}`)} />
            <List title={adminText.lists[2]} items={prompts.map((item) => `${item.key}/${item.locale}/v${item.version}: ${item.status}`)} />
            <List title={adminText.lists[3]} items={analyses.map((item) => JSON.stringify(item).slice(0, 220))} />
          </section>
        </>
      )}
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card">
      <div className="eyebrow">{label}</div>
      <h2>{value}</h2>
    </div>
  );
}

function formatAdminPriceLabel(amountValue: string, currencyValue: string) {
  const amount = Number(amountValue);
  const currency = currencyValue.trim().toUpperCase();
  if (!Number.isInteger(amount) || amount <= 0 || !/^[A-Z]{3}$/.test(currency)) return "Invalid price";
  const majorAmount = amount / 100;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: Number.isInteger(majorAmount) ? 0 : 2
    }).format(majorAmount);
  } catch {
    return `${amount} ${currency.toLowerCase()}`;
  }
}

function List({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="card stack">
      <h2>{title}</h2>
      {items.length === 0 ? <p className="muted">No data</p> : items.map((item) => <p className="muted" key={item}>{item}</p>)}
    </div>
  );
}
