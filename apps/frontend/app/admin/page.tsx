"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  BadgeDollarSign,
  Bot,
  BrainCircuit,
  FileText,
  Handshake,
  LayoutDashboard,
  LogOut,
  RefreshCw,
  Settings,
  Users,
  type LucideIcon
} from "lucide-react";
import type {
  AdminStats,
  AdminUserSummary,
  AppSetting,
  FeatureFlag,
  PartnerAffiliateProgramSummary,
  PartnerCoreAdminSnapshot,
  PartnerOfferStatus,
  PartnerOfferSummary,
  PartnerRedemptionSummary,
  PromoCode,
  PromptTemplate,
  PromptTemplateInput
} from "@levelup/contracts";
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

export type AdminSection = "overview" | "users" | "commercial" | "ai" | "content" | "integrations" | "partners" | "system";
type PartnerAdminView = "overview" | "partners" | "program" | "offers" | "operations";

type AdminSectionDefinition = {
  id: AdminSection;
  href: string;
  label: string;
  title: string;
  description: string;
  icon: LucideIcon;
};

export const adminSections: AdminSectionDefinition[] = [
  { id: "overview", href: "/admin", label: "Обзор", title: "Обзор продукта", description: "Ключевые показатели диагностики и Навигатора привычек.", icon: LayoutDashboard },
  { id: "users", href: "/admin/users", label: "Пользователи", title: "Пользователи", description: "Активность, диагностики, привычки, Telegram и подаренные дни.", icon: Users },
  { id: "commercial", href: "/admin/commercial", label: "Коммерция", title: "Цены и промокоды", description: "Стоимость отчёта, подписка, trial и промокоды.", icon: BadgeDollarSign },
  { id: "ai", href: "/admin/ai", label: "AI и промпты", title: "AI и промпты", description: "Режим генерации, модели и версионируемые системные промпты.", icon: BrainCircuit },
  { id: "content", href: "/admin/content", label: "Контент", title: "Контент и локализация", description: "Доступные языки и тексты пользовательского интерфейса.", icon: FileText },
  { id: "integrations", href: "/admin/integrations", label: "Интеграции", title: "Интеграции", description: "Telegram, шаблоны сообщений и системные ограничения.", icon: Bot },
  { id: "partners", href: "/admin/partners", label: "Партнёры", title: "Партнёрская программа", description: "Условия программы, партнёры, предложения и начисления Orken.", icon: Handshake },
  { id: "system", href: "/admin/system", label: "Система", title: "Система", description: "Feature flags, технические настройки и последние операции.", icon: Settings }
];

const emptyPromptForm: PromptTemplateInput = {
  key: "ikigai.report.free.user",
  locale: "ru",
  version: 1,
  status: "ACTIVE",
  title: "",
  content: ""
};

const emptyPartnerProgramForm = {
  id: "",
  partnerCoreProgramId: "",
  name: "Партнёрская программа Orken",
  referralDestination: "https://orken.life/?ref=ORKEN-LIFE",
  customerBonusType: "FREE_DAYS",
  customerBonusValue: "14",
  customerBonusEntitlement: "",
  commissionModel: "PERCENT",
  commissionRateBps: "1000",
  fixedPayoutCents: "",
  commissionWindowType: "LIFETIME",
  commissionWindowMonths: "",
  lockDays: "365",
  status: "PAUSED",
  termsVersion: "v1"
};

const emptyPartnerOfferForm = {
  id: "",
  programConfigId: "",
  partnerId: "",
  partnerCorePlacementId: "",
  kind: "manual_deal",
  surface: "rewards_tab",
  title: "",
  description: "",
  imageUrl: "",
  redemptionCurrency: "orken_points",
  redemptionAmount: "500",
  userBenefit: "",
  partnerPayoutCents: "0",
  capPerMonth: "",
  status: "DRAFT",
  entitlementType: "manual",
  entitlementValue: ""
};

const emptyPartnerCoreSnapshot: PartnerCoreAdminSnapshot = {
  configured: false,
  project: null,
  programs: [],
  referralLinks: [],
  placements: [],
  partners: [],
  redemptions: [],
  walletOperations: [],
  ledgerEntries: [],
  reviewTasks: []
};

const adminUserPageSize = 8;

const cleanTelegramPolicyDefaults = {
  reminderTemplate: [
    "ORKEN на связи. Сегодняшний мягкий шаг:",
    "{{habitTitle}}",
    "{{taskText}}",
    "{{metricText}}",
    "",
    "Кнопки ниже помогут отметить шаг, сохранить состояние или открыть кабинет."
  ].join("\n"),
  welcomeTemplate: [
    "Привет! Я твой личный AI-помощник ORKEN от Навигатора привычек ORKEN.LIFE.",
    "",
    "Я помогаю оставаться в фокусе, отслеживать прогресс и прокачивать дисциплину прямо в мессенджере. Вот что я умею делать:",
    "",
    "1. Подтягивать текущую привычку на сегодня из личного кабинета.",
    "2. Фиксировать внутреннее состояние: энергию, ясность и устойчивость.",
    "3. Сохранять важные инсайты и мысли в личный архив.",
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
  ].join("\n")
};

function cleanTemplateValue(value: unknown, fallback: string) {
  if (typeof value !== "string" || !value.trim()) return fallback;
  return value.includes("Р") || value.includes("В·") || value.includes("вЂ") ? fallback : value;
}

export default function AdminPage() {
  return <AdminConsole section="overview" />;
}

export function AdminConsole({ section }: { section: AdminSection }) {
  const adminText = defaultSiteText.ru.admin;
  const [password, setPassword] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [analyses, setAnalyses] = useState<unknown[]>([]);
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [settings, setSettings] = useState<AppSetting[]>([]);
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [prompts, setPrompts] = useState<PromptTemplate[]>([]);
  const [promptDefaults, setPromptDefaults] = useState<PromptTemplateInput[]>([]);
  const [promptForm, setPromptForm] = useState<PromptTemplateInput>(emptyPromptForm);
  const [promoCodes, setPromoCodes] = useState<PromoCode[]>([]);
  const [partnerPrograms, setPartnerPrograms] = useState<PartnerAffiliateProgramSummary[]>([]);
  const [partnerOffers, setPartnerOffers] = useState<PartnerOfferSummary[]>([]);
  const [partnerRedemptions, setPartnerRedemptions] = useState<PartnerRedemptionSummary[]>([]);
  const [partnerCoreSnapshot, setPartnerCoreSnapshot] = useState<PartnerCoreAdminSnapshot>(emptyPartnerCoreSnapshot);
  const [partnerProgramForm, setPartnerProgramForm] = useState(emptyPartnerProgramForm);
  const [partnerOfferForm, setPartnerOfferForm] = useState(emptyPartnerOfferForm);
  const [partnerAdminView, setPartnerAdminView] = useState<PartnerAdminView>("overview");
  const [referralChannelByProgram, setReferralChannelByProgram] = useState<Record<string, string>>({});
  const [userQuery, setUserQuery] = useState("");
  const [userPage, setUserPage] = useState(0);
  const [userHasNextPage, setUserHasNextPage] = useState(false);
  const [giftDaysByProgram, setGiftDaysByProgram] = useState<Record<string, string>>({});
  const [giftNoteByProgram, setGiftNoteByProgram] = useState<Record<string, string>>({});
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
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setTelegramPolicyForm((current) => {
      const hasBrokenText = [current.reminderTemplate, current.welcomeTemplate, current.todayTemplate].some((value) => value.includes("Р") || value.includes("В·"));
      if (!hasBrokenText) return current;
      return {
        ...current,
        ...cleanTelegramPolicyDefaults
      };
    });
  }, []);

  useEffect(() => {
    const saved = window.sessionStorage.getItem("levelup_admin_session") ?? "";
    if (saved) {
      setAuthenticated(true);
      void refresh();
    }
  }, [section]);

  async function refresh() {
    setMessage("");
    setLoading(true);
    try {
      if (section === "overview") {
        const [nextStats, nextAnalyses] = await Promise.all([adminApi.stats(), adminApi.analyses()]);
        setStats(nextStats);
        setAnalyses(nextAnalyses);
      }

      if (section === "users") {
        await loadUsers(userPage);
      }

      if (section === "commercial") {
        const [nextSettings, nextPromoCodes] = await Promise.all([adminApi.settings(), adminApi.promoCodes()]);
        setSettings(nextSettings);
        setPromoCodes(nextPromoCodes);
        hydratePriceForm(nextSettings);
        hydrateHabitPriceForm(nextSettings);
      }

      if (section === "ai") {
        const [nextSettings, nextPrompts, nextPromptDefaults] = await Promise.all([
          adminApi.settings(),
          adminApi.prompts(),
          adminApi.promptDefaults()
        ]);
        setSettings(nextSettings);
        setPrompts(nextPrompts);
        setPromptDefaults(nextPromptDefaults);
        hydrateHabitAiForm(nextSettings);
        hydratePromptForm(nextPrompts, nextPromptDefaults);
      }

      if (section === "content") {
        const nextSettings = await adminApi.settings();
        setSettings(nextSettings);
        hydrateLocaleForm(nextSettings);
        hydrateTextDrafts(nextSettings);
      }

      if (section === "integrations") {
        const nextSettings = await adminApi.settings();
        setSettings(nextSettings);
        hydrateTelegramPolicyForm(nextSettings);
      }

      if (section === "partners") {
        const [nextPartnerPrograms, nextPartnerOffers, nextPartnerRedemptions, nextPartnerCoreSnapshot] = await Promise.all([
          adminApi.partnerPrograms(),
          adminApi.partnerOffers(),
          adminApi.partnerRedemptions(),
          adminApi.partnerCore().catch((reason) => ({
            ...emptyPartnerCoreSnapshot,
            configured: true,
            error: reason instanceof Error ? reason.message : "Partner Core недоступен"
          }))
        ]);
        setPartnerPrograms(nextPartnerPrograms);
        setPartnerOffers(nextPartnerOffers);
        setPartnerRedemptions(nextPartnerRedemptions);
        setPartnerCoreSnapshot(nextPartnerCoreSnapshot);
      }

      if (section === "system") {
        const [nextSettings, nextFlags, nextPrompts, nextAnalyses] = await Promise.all([
          adminApi.settings(),
          adminApi.flags(),
          adminApi.prompts(),
          adminApi.analyses()
        ]);
        setSettings(nextSettings);
        setFlags(nextFlags);
        setPrompts(nextPrompts);
        setAnalyses(nextAnalyses);
      }
    } catch (reason) {
      setAuthenticated(false);
      window.sessionStorage.removeItem("levelup_admin_session");
      setMessage(reason instanceof Error ? reason.message : "Admin API failed");
    } finally {
      setLoading(false);
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
      reminderTemplate: cleanTemplateValue(reminderTemplate, cleanTelegramPolicyDefaults.reminderTemplate),
      welcomeTemplate: cleanTemplateValue(welcomeTemplate, cleanTelegramPolicyDefaults.welcomeTemplate),
      todayTemplate: cleanTemplateValue(todayTemplate, cleanTelegramPolicyDefaults.todayTemplate),
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

  function selectPartnerProgram(program: PartnerAffiliateProgramSummary) {
    setPartnerProgramForm({
      id: program.id,
      partnerCoreProgramId: program.partnerCoreProgramId ?? "",
      name: program.name,
      referralDestination: program.referralDestination,
      customerBonusType: program.customerBonusType,
      customerBonusValue: program.customerBonusValue === null || program.customerBonusValue === undefined ? "" : String(program.customerBonusValue),
      customerBonusEntitlement: program.customerBonusEntitlement ?? "",
      commissionModel: program.commissionModel,
      commissionRateBps: program.commissionRateBps === null || program.commissionRateBps === undefined ? "" : String(program.commissionRateBps),
      fixedPayoutCents: moneyInputFromCents(program.fixedPayoutCents),
      commissionWindowType: program.commissionWindowType,
      commissionWindowMonths: program.commissionWindowMonths === null || program.commissionWindowMonths === undefined ? "" : String(program.commissionWindowMonths),
      lockDays: String(program.lockDays),
      status: program.status,
      termsVersion: program.termsVersion
    });
  }

  async function savePartnerProgram() {
    setMessage("");
    try {
      await adminApi.upsertPartnerProgram({
        id: partnerProgramForm.id || undefined,
        partnerCoreProgramId: partnerProgramForm.partnerCoreProgramId.trim() || null,
        name: partnerProgramForm.name.trim(),
        referralDestination: partnerProgramForm.referralDestination.trim(),
        customerBonusType: partnerProgramForm.customerBonusType as any,
        customerBonusValue: partnerProgramForm.customerBonusValue ? Number(partnerProgramForm.customerBonusValue) : null,
        customerBonusEntitlement: partnerProgramForm.customerBonusEntitlement.trim() || null,
        commissionModel: partnerProgramForm.commissionModel as any,
        commissionRateBps: partnerProgramForm.commissionModel === "FIXED"
          ? null
          : partnerProgramForm.commissionRateBps ? Number(partnerProgramForm.commissionRateBps) : null,
        fixedPayoutCents: partnerProgramForm.commissionModel === "PERCENT"
          ? null
          : moneyInputToCents(partnerProgramForm.fixedPayoutCents || "0"),
        commissionWindowType: partnerProgramForm.commissionWindowType as any,
        commissionWindowMonths: partnerProgramForm.commissionWindowMonths ? Number(partnerProgramForm.commissionWindowMonths) : null,
        lockDays: Number(partnerProgramForm.lockDays),
        status: partnerProgramForm.status as any,
        termsVersion: partnerProgramForm.termsVersion.trim() || "v1"
      });
      setMessage("Partner program saved");
      setPartnerProgramForm(emptyPartnerProgramForm);
      await refresh();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Failed to save partner program");
    }
  }

  async function createReferralLink(programId: string) {
    setMessage("");
    const channel = (referralChannelByProgram[programId] ?? "default").trim();
    if (/^(?:https?:\/\/|www\.)/i.test(channel) || /^[a-z0-9.-]+\.[a-z]{2,}(?:\/|$)/i.test(channel)) {
      setMessage("Укажите короткое название источника, например Instagram. URL профиля вставлять не нужно.");
      return;
    }
    try {
      await adminApi.createPartnerReferralLink(programId, channel || "default");
      setMessage("Referral link requested from Partner Core");
      await refresh();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Failed to create referral link");
    }
  }

  function selectPartnerOffer(offer: PartnerOfferSummary) {
    setPartnerOfferForm({
      id: offer.id,
      programConfigId: offer.programConfigId ?? "",
      partnerId: offer.partnerId ?? "",
      partnerCorePlacementId: offer.partnerCorePlacementId ?? "",
      kind: offer.kind ?? "manual_deal",
      surface: offer.surface ?? "rewards_tab",
      title: offer.title,
      description: offer.description,
      imageUrl: offer.imageUrl ?? "",
      redemptionCurrency: offer.redemptionCost.currency,
      redemptionAmount: String(offer.redemptionCost.amount),
      userBenefit: offer.userBenefit,
      partnerPayoutCents: moneyInputFromCents(offer.partnerPayoutCents),
      capPerMonth: offer.capPerMonth === null || offer.capPerMonth === undefined ? "" : String(offer.capPerMonth),
      status: offer.status,
      entitlementType: offer.entitlementType,
      entitlementValue: offer.entitlementValue ?? ""
    });
  }

  async function savePartnerOffer() {
    setMessage("");
    try {
      await adminApi.upsertPartnerOffer({
        id: partnerOfferForm.id || undefined,
        programConfigId: partnerOfferForm.programConfigId || null,
        partnerId: partnerOfferForm.partnerId.trim() || null,
        partnerCorePlacementId: partnerOfferForm.partnerCorePlacementId.trim() || null,
        kind: partnerOfferForm.kind,
        surface: partnerOfferForm.surface,
        title: partnerOfferForm.title.trim(),
        description: partnerOfferForm.description.trim(),
        imageUrl: partnerOfferForm.imageUrl.trim() || null,
        redemptionCurrency: partnerOfferForm.redemptionCurrency.trim() || "orken_points",
        redemptionAmount: Number(partnerOfferForm.redemptionAmount),
        userBenefit: partnerOfferForm.userBenefit.trim(),
        partnerPayoutCents: moneyInputToCents(partnerOfferForm.partnerPayoutCents || "0"),
        capPerMonth: partnerOfferForm.capPerMonth ? Number(partnerOfferForm.capPerMonth) : null,
        status: partnerOfferForm.status as PartnerOfferStatus,
        entitlementType: partnerOfferForm.entitlementType.trim() || "manual",
        entitlementValue: partnerOfferForm.entitlementValue.trim() || null
      });
      setMessage("Partner offer saved");
      setPartnerOfferForm(emptyPartnerOfferForm);
      await refresh();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Failed to save partner offer");
    }
  }

  async function setPartnerOfferStatus(id: string, status: PartnerOfferStatus) {
    setMessage("");
    try {
      await adminApi.setPartnerOfferStatus(id, status);
      setMessage(`Partner offer status: ${status}`);
      await refresh();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Failed to update partner offer");
    }
  }

  async function syncPartnerOffers() {
    setMessage("");
    try {
      const result = await adminApi.syncPartnerOffers();
      setMessage(`Partner Core sync complete: ${result.count} placements`);
      await refresh();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Partner Core sync failed");
    }
  }

  async function setPartnerAccess(partnerId: string, status: "approved" | "suspended") {
    setMessage("");
    try {
      await adminApi.setPartnerCorePartnerStatus(partnerId, status);
      setPartnerCoreSnapshot(await adminApi.partnerCore());
      setMessage(status === "approved" ? "Доступ партнёра восстановлен" : "Доступ партнёра приостановлен");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Не удалось изменить доступ партнёра");
    }
  }

  async function loadUsers(page = 0, query = userQuery) {
    setMessage("");
    try {
      const result = await adminApi.users({
        q: query,
        limit: adminUserPageSize + 1,
        offset: page * adminUserPageSize
      });
      setUsers(result.slice(0, adminUserPageSize));
      setUserHasNextPage(result.length > adminUserPageSize);
      setUserPage(page);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Failed to load users");
    }
  }

  async function giftProgramDays(user: AdminUserSummary, programId: string) {
    setMessage("");
    const days = Number(giftDaysByProgram[programId] ?? "");
    if (!Number.isInteger(days) || days <= 0 || days > 3650) {
      setMessage("Gift days must be a whole number from 1 to 3650");
      return;
    }
    try {
      const result = await adminApi.giftUserDays(user.id, {
        programId,
        days,
        note: giftNoteByProgram[programId]?.trim() || undefined
      });
      setMessage(`Gifted ${result.days} days to ${user.email}. New trial ends: ${result.trialEndsAt ?? "not set"}`);
      setGiftDaysByProgram((current) => ({ ...current, [programId]: "" }));
      setGiftNoteByProgram((current) => ({ ...current, [programId]: "" }));
      await loadUsers();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Failed to gift days");
    }
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
  const partnerLedgerRevenueCents = partnerCoreSnapshot.ledgerEntries.reduce((total, entry) => total + adminRecordNumber(entry, "amount_cents", "amountCents"), 0);
  const partnerConversions = partnerCoreSnapshot.partners.reduce((total, partner) => total + Number(partner.conversions_count ?? 0), 0);
  const activeSection = adminSections.find((item) => item.id === section) ?? adminSections[0];

  if (!authenticated) {
    return (
      <main className="admin-login-page">
        <section className="admin-login-panel stack">
          <div className="admin-login-brand">ORKEN.LIFE <span>ADMIN</span></div>
          <div>
            <div className="eyebrow">Защищённый раздел</div>
            <h1>Вход в админ-панель</h1>
            <p className="muted">Управление продуктом, пользователями и интеграциями Orken.</p>
          </div>
          <input
            className="input"
            data-testid="admin-password-input"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void login();
            }}
            placeholder={adminText.passwordPlaceholder}
            autoComplete="current-password"
          />
          <button className="button" data-testid="admin-login-button" onClick={login} disabled={loading}>
            {loading ? "Проверяем…" : adminText.login}
          </button>
          {message && <div className="admin-notice error">{message}</div>}
        </section>
      </main>
    );
  }

  return (
    <main className="admin-console-shell">
      <aside className="admin-console-sidebar">
        <Link className="admin-console-brand" href="/admin">
          <span className="admin-console-brand-mark">O</span>
          <span>ORKEN.LIFE <small>ADMIN</small></span>
        </Link>
        <nav className="admin-console-nav" aria-label="Разделы админ-панели">
          {adminSections.map((item) => {
            const Icon = item.icon;
            return (
              <Link className={item.id === section ? "active" : ""} href={item.href} key={item.id} aria-current={item.id === section ? "page" : undefined}>
                <Icon size={18} aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="admin-console-sidebar-footer">
          <span className="admin-session-dot">Сессия активна</span>
          <button className="admin-sidebar-action" onClick={logout}>
            <LogOut size={17} aria-hidden="true" />
            <span>{adminText.logout}</span>
          </button>
        </div>
      </aside>

      <section className="admin-console-workspace">
        <header className="admin-console-header">
          <div>
            <div className="eyebrow">Управление Orken</div>
            <h1>{activeSection.title}</h1>
            <p>{activeSection.description}</p>
          </div>
          <button className="admin-icon-button" onClick={() => void refresh()} aria-label="Обновить данные" title="Обновить данные" disabled={loading}>
            <RefreshCw size={19} className={loading ? "spinning" : ""} aria-hidden="true" />
          </button>
        </header>

        {message && <div className="admin-notice error">{message}</div>}
        {loading && <div className="admin-loading-line" aria-label="Загрузка" />}
          {section === "overview" && stats && (
            <section className="grid grid-3" data-testid="admin-stats">
              <Metric label="Диагностики" value={stats.analysesTotal} />
              <Metric label="Оплаченные отчёты" value={stats.paymentsSucceeded} />
              <Metric label="Выручка, центы" value={stats.revenueSucceeded} />
              <Metric label="События за 24 часа" value={stats.eventsLast24h} />
              <Metric label="Ошибки анализа" value={stats.failedAnalyses} />
              <Metric label="В обработке" value={stats.analysesByStatus.find((item) => item.status === "PROCESSING")?.count ?? 0} />
              <Metric label="Программы привычек" value={`${stats.habitProgramsActive}/${stats.habitProgramsTotal}`} />
              <Metric label="Всего XP" value={stats.habitXpTotal} />
              <Metric label="Отметки привычек" value={stats.habitCheckinsTotal} />
              <Metric label="Сохранённые инсайты" value={stats.habitInsightsTotal} />
            </section>
          )}

          {section === "overview" && (
            <section className="admin-overview-links" aria-label="Разделы управления">
              {adminSections.filter((item) => item.id !== "overview").map((item) => {
                const Icon = item.icon;
                return (
                  <Link className="admin-overview-link" href={item.href} key={item.id}>
                    <Icon size={20} aria-hidden="true" />
                    <span><strong>{item.label}</strong><small>{item.description}</small></span>
                  </Link>
                );
              })}
            </section>
          )}

          {section === "users" && <section id="admin-users" className="card stack admin-section-card">
            <div>
              <h2>Список пользователей</h2>
              <p className="muted">Поиск по имени, email или ID. В карточке видны диагностики, активность в Навигаторе и доступные программы.</p>
            </div>
            <div className="grid grid-3">
              <input
                className="input"
                value={userQuery}
                onChange={(event) => setUserQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void loadUsers();
                }}
                placeholder="Имя, email или ID пользователя"
              />
              <button className="button secondary" onClick={() => void loadUsers(0)}>Найти</button>
              <button className="button secondary" onClick={() => {
                setUserQuery("");
                void loadUsers(0, "");
              }}>Сбросить</button>
            </div>
            <div className="admin-users-list">
              {users.length === 0 ? (
                <p className="muted">Пользователи не найдены</p>
              ) : users.map((user) => (
                <details className="admin-user-card" key={user.id}>
                  <summary className="admin-user-head admin-user-summary">
                    <div>
                      <h3>{user.name || user.email}</h3>
                      <p className="muted">{user.email} · {user.status} · {user.role} · {user.locale}</p>
                      <p className="muted">Создан {formatAdminDate(user.createdAt)} · Последний вход {user.lastLoginAt ? formatAdminDate(user.lastLoginAt) : "не было"}</p>
                    </div>
                    <code>{user.id}</code>
                  </summary>
                  <div className="admin-user-details">
                  <div className="admin-user-metrics">
                    <AdminMiniMetric label="Диагностики" value={`${user.stats.analysesDone}/${user.stats.analysesTotal}`} />
                    <AdminMiniMetric label="Платежи" value={`${user.stats.paymentsSucceeded} · ${user.stats.revenueSucceeded}`} />
                    <AdminMiniMetric label="Программы" value={`${user.stats.habitProgramsActive}/${user.stats.habitProgramsTotal}`} />
                    <AdminMiniMetric label="XP" value={user.stats.habitXp} />
                    <AdminMiniMetric label="Отметки" value={user.stats.habitCheckins} />
                    <AdminMiniMetric label="Инсайты" value={user.stats.habitInsights} />
                    <AdminMiniMetric label="Telegram" value={user.stats.telegramAccounts} />
                    <AdminMiniMetric label="Активность" value={user.stats.lastEventAt ? formatAdminDate(user.stats.lastEventAt) : "нет"} />
                  </div>
                  <div className="admin-program-list">
                    {user.habitPrograms.length === 0 ? (
                      <p className="muted">Программ привычек пока нет</p>
                    ) : user.habitPrograms.map((program) => (
                      <div className="admin-program-row" key={program.id}>
                        <div>
                          <strong>{program.title}</strong>
                          <span>
                            {program.status} · {program.subscriptionStatus} · цикл {program.currentCycle}, неделя {program.currentWeek}
                          </span>
                          <span>
                            Trial: {program.trialDaysLeft ?? 0} дн. · до {program.trialEndsAt ? formatAdminDate(program.trialEndsAt) : "не задано"} · XP {program.xp}
                          </span>
                        </div>
                        <div className="admin-gift-form">
                          <input
                            className="input"
                            value={giftDaysByProgram[program.id] ?? ""}
                            onChange={(event) => setGiftDaysByProgram((current) => ({ ...current, [program.id]: event.target.value }))}
                            placeholder="Дни"
                            inputMode="numeric"
                          />
                          <input
                            className="input"
                            value={giftNoteByProgram[program.id] ?? ""}
                            onChange={(event) => setGiftNoteByProgram((current) => ({ ...current, [program.id]: event.target.value }))}
                            placeholder="Комментарий"
                          />
                          <button className="button secondary" onClick={() => giftProgramDays(user, program.id)}>Подарить дни</button>
                        </div>
                      </div>
                    ))}
                  </div>
                  {(user.recentEvents.length > 0 || user.recentAnalyses.length > 0) && (
                    <div className="admin-user-activity">
                      <div>
                        <strong>Последние события</strong>
                        {user.recentEvents.length === 0 ? <span className="muted">нет</span> : user.recentEvents.slice(0, 5).map((event) => (
                          <span key={event.id}>{formatAdminDate(event.createdAt)} · {event.name}</span>
                        ))}
                      </div>
                      <div>
                        <strong>Последние диагностики</strong>
                        {user.recentAnalyses.length === 0 ? <span className="muted">нет</span> : user.recentAnalyses.map((analysis) => (
                          <span key={analysis.id}>{formatAdminDate(analysis.createdAt)} · {analysis.status}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  </div>
                </details>
              ))}
            </div>
            <div className="admin-pagination" aria-label="Навигация по пользователям">
              <button className="button secondary" disabled={userPage === 0} onClick={() => void loadUsers(userPage - 1)}>Назад</button>
              <span>Страница {userPage + 1}</span>
              <button className="button secondary" disabled={!userHasNextPage} onClick={() => void loadUsers(userPage + 1)}>Далее</button>
            </div>
          </section>}

          {section === "content" && <section id="admin-locales" className="card stack admin-section-card">
            <div>
              <h2>Языки интерфейса</h2>
              <p className="muted">Выберите доступные языки и язык по умолчанию. Словари редактируются в блоке ниже.</p>
            </div>
            <div className="grid grid-3">
              <label className="stack">
                <span className="eyebrow">Доступные языки</span>
                <input className="input" value={localeForm.enabledLocales} onChange={(event) => setLocaleForm({ ...localeForm, enabledLocales: event.target.value })} placeholder="ru,en" />
              </label>
              <label className="stack">
                <span className="eyebrow">Язык по умолчанию</span>
                <input className="input" value={localeForm.defaultLocale} onChange={(event) => setLocaleForm({ ...localeForm, defaultLocale: event.target.value.toLowerCase() })} placeholder="ru" />
              </label>
              <button className="button" onClick={saveLocaleSettings}>Сохранить языки</button>
              <button className="button secondary" onClick={upsertLocaleSettings}>{adminText.seedLocales}</button>
            </div>
          </section>}

          {section === "commercial" && <section id="admin-pricing" className="card stack admin-section-card">
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
          </section>}

          {section === "commercial" && <section className="card stack admin-section-card">
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
          </section>}

          {section === "ai" && <section id="admin-habits-ai" className="card stack admin-section-card">
            <div>
              <h2>AI Навигатора привычек</h2>
              <p className="muted">Выберите правила или LLM для итогов недели. При недоступности провайдера система автоматически использует безопасный rule-based fallback.</p>
            </div>
            <div className="grid grid-3">
              <label className="stack">
                <span className="eyebrow">Итоги недели</span>
                <select className="input" value={habitAiForm.weekSummaryMode} onChange={(event) => setHabitAiForm({ ...habitAiForm, weekSummaryMode: event.target.value as "rule" | "llm" })}>
                  <option value="rule">По правилам</option>
                  <option value="llm">Через LLM</option>
                </select>
              </label>
              <label className="stack">
                <span className="eyebrow">Модель итогов недели</span>
                <input className="input" value={habitAiForm.weekSummaryModel} onChange={(event) => setHabitAiForm({ ...habitAiForm, weekSummaryModel: event.target.value })} placeholder="gpt-4o-mini" />
              </label>
              <label className="stack">
                <span className="eyebrow">Температура ORKEN</span>
                <input className="input" value={habitAiForm.navigatorTemperature} onChange={(event) => setHabitAiForm({ ...habitAiForm, navigatorTemperature: event.target.value })} placeholder="0.45" inputMode="decimal" />
              </label>
              <button className="button" onClick={saveHabitAiSettings}>Сохранить AI-настройки</button>
            </div>
          </section>}

          {section === "integrations" && <section id="admin-telegram" className="card stack admin-section-card">
            <div>
              <h2>Telegram-бот</h2>
              <p className="muted">Лимиты, тексты напоминаний и короткоживущие ссылки входа из Telegram. Токен бота и ключи провайдеров хранятся только на backend.</p>
            </div>
            <div className="grid grid-3">
              <label className="stack">
                <span className="eyebrow">Окно лимита, мс</span>
                <input className="input" value={telegramPolicyForm.rateLimitWindowMs} onChange={(event) => setTelegramPolicyForm({ ...telegramPolicyForm, rateLimitWindowMs: event.target.value })} inputMode="numeric" />
              </label>
              <label className="stack">
                <span className="eyebrow">Сообщений в одном окне</span>
                <input className="input" value={telegramPolicyForm.rateLimitMax} onChange={(event) => setTelegramPolicyForm({ ...telegramPolicyForm, rateLimitMax: event.target.value })} inputMode="numeric" />
              </label>
              <label className="stack">
                <span className="eyebrow">Ссылки входа в кабинет</span>
                <select className="input" value={telegramPolicyForm.webLoginEnabled ? "true" : "false"} onChange={(event) => setTelegramPolicyForm({ ...telegramPolicyForm, webLoginEnabled: event.target.value === "true" })}>
                  <option value="true">Включены</option>
                  <option value="false">Отключены</option>
                </select>
              </label>
            </div>
            <textarea
              className="input text-editor"
              value={telegramPolicyForm.reminderTemplate}
              onChange={(event) => setTelegramPolicyForm({ ...telegramPolicyForm, reminderTemplate: event.target.value })}
              spellCheck={false}
            />
            <p className="muted">Переменные: {"{{habitTitle}}"}, {"{{taskText}}"}, {"{{metricText}}"}</p>
            <div className="grid grid-2">
              <label className="stack">
                <span className="eyebrow">Приветственное сообщение</span>
                <textarea
                  className="input text-editor compact"
                  value={telegramPolicyForm.welcomeTemplate}
                  onChange={(event) => setTelegramPolicyForm({ ...telegramPolicyForm, welcomeTemplate: event.target.value })}
                  spellCheck={false}
                />
              </label>
              <label className="stack">
                <span className="eyebrow">Сообщение с планом на день</span>
                <textarea
                  className="input text-editor compact"
                  value={telegramPolicyForm.todayTemplate}
                  onChange={(event) => setTelegramPolicyForm({ ...telegramPolicyForm, todayTemplate: event.target.value })}
                  spellCheck={false}
                />
              </label>
            </div>
            <p className="muted">Переменные плана: {"{{habitTitle}}"}, {"{{whatToDo}}"}, {"{{lowEnergy}}"}, {"{{why}}"}, {"{{time}}"}, {"{{weekProgress}}"}</p>
            <div className="admin-avatar-control">
              {telegramPolicyForm.assistantAvatarUrl.trim() && (
                <img src={telegramPolicyForm.assistantAvatarUrl.trim()} alt="Предпросмотр аватара ассистента" />
              )}
              <label className="stack">
                <span className="eyebrow">URL аватара ассистента</span>
                <input
                  className="input"
                  value={telegramPolicyForm.assistantAvatarUrl}
                  onChange={(event) => setTelegramPolicyForm({ ...telegramPolicyForm, assistantAvatarUrl: event.target.value })}
                  placeholder="/assets/orken12.jpg"
                />
              </label>
              <label className="button secondary admin-upload-button">
                Загрузить аватар
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void uploadAssistantAvatar(event.target.files?.[0] ?? null)} />
              </label>
            </div>
            <button className="button" onClick={saveTelegramPolicySettings}>Сохранить настройки Telegram</button>
          </section>}

          {section === "ai" && <section id="admin-prompts" className="card stack admin-section-card">
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
                <option value="DRAFT">Черновик</option>
                <option value="ACTIVE">Активный</option>
                <option value="ARCHIVED">В архиве</option>
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
          </section>}

          {section === "content" && <section id="admin-texts" className="card stack admin-section-card">
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
          </section>}

          {section === "commercial" && <section id="admin-promos" className="card stack admin-section-card">
            <h2>{adminText.promoTitle}</h2>
            <div className="grid grid-3">
              <input className="input" value={promoForm.code} onChange={(event) => setPromoForm({ ...promoForm, code: event.target.value })} placeholder="Промокод" />
              <input className="input" value={promoForm.description} onChange={(event) => setPromoForm({ ...promoForm, description: event.target.value })} placeholder="Описание" />
              <select className="input" value={promoForm.discountType} onChange={(event) => setPromoForm({ ...promoForm, discountType: event.target.value as "PERCENT" | "FIXED_AMOUNT" })}>
                <option value="PERCENT">Процент</option>
                <option value="FIXED_AMOUNT">Фиксированная сумма</option>
              </select>
              {promoForm.discountType === "PERCENT" ? (
                <input className="input" value={promoForm.percentOff} onChange={(event) => setPromoForm({ ...promoForm, percentOff: event.target.value })} placeholder="Размер скидки, %" />
              ) : (
                <input className="input" value={promoForm.amountOff} onChange={(event) => setPromoForm({ ...promoForm, amountOff: event.target.value })} placeholder="Размер скидки, центы" />
              )}
              <input className="input" value={promoForm.currency} onChange={(event) => setPromoForm({ ...promoForm, currency: event.target.value })} placeholder="Валюта" />
              <input className="input" value={promoForm.maxRedemptions} onChange={(event) => setPromoForm({ ...promoForm, maxRedemptions: event.target.value })} placeholder="Лимит применений" />
              <input className="input" type="datetime-local" value={promoForm.expiresAt} onChange={(event) => setPromoForm({ ...promoForm, expiresAt: event.target.value })} />
              <button className="button" onClick={upsertPromoCode}>Сохранить промокод</button>
            </div>
            <div className="stack">
              {promoCodes.length === 0 ? <p className="muted">Промокоды не созданы</p> : promoCodes.map((promoCode) => (
                <div className="row" key={promoCode.id}>
                  <span>
                    <strong>{promoCode.code}</strong>{" "}
                    {promoCode.discountType === "PERCENT" ? `${promoCode.percentOff}%` : `${promoCode.amountOff} ${promoCode.currency}`}
                    {" "}использован {promoCode.redemptions}{promoCode.maxRedemptions ? `/${promoCode.maxRedemptions}` : ""} раз
                  </span>
                  <button className="button secondary" onClick={() => togglePromoCode(promoCode)}>
                    {promoCode.active ? "Отключить" : "Включить"}
                  </button>
                </div>
              ))}
            </div>
          </section>}

          {section === "partners" && <section id="admin-partners" className="card stack admin-section-card">
            <div className="row admin-partner-toolbar">
              <div>
                <h2>Партнёрская программа Orken</h2>
                <p className="muted">Настройте условия программы, управляйте партнёрами и проверяйте предложения. Данные общей партнёрской системы синхронизируются автоматически.</p>
              </div>
              <div className="row admin-partner-toolbar-actions">
                <Link className="button secondary" href="/partners" target="_blank">Открыть кабинет партнёра</Link>
                <button className="button secondary" onClick={syncPartnerOffers}>Синхронизировать</button>
              </div>
            </div>

            {partnerCoreSnapshot.error && <div className="admin-partner-warning">Partner Core недоступен: {partnerCoreSnapshot.error}</div>}
            {!partnerCoreSnapshot.configured && <div className="admin-partner-warning">Partner Core не настроен на backend Orken. Локальные формы доступны, синхронизация отключена.</div>}
            {partnerCoreSnapshot.configured && !partnerCoreSnapshot.error && (
              <div className="admin-core-connected">
                <span>Синхронизация подключена</span>
                <small>Проект: {adminRecordText(partnerCoreSnapshot.project ?? {}, "name") || "Orken"} · обновление данных активно</small>
              </div>
            )}

            <nav className="admin-partner-tabs" aria-label="Управление партнёрской программой">
              {([
                ["overview", "Обзор"],
                ["partners", "Партнёры"],
                ["program", "Условия программы"],
                ["offers", "Предложения"],
                ["operations", "Операции"]
              ] as Array<[PartnerAdminView, string]>).map(([id, label]) => (
                <button className={partnerAdminView === id ? "active" : ""} key={id} onClick={() => setPartnerAdminView(id)} type="button">{label}</button>
              ))}
            </nav>

            {partnerAdminView === "overview" && <>
              <div className="grid grid-3">
                <AdminMiniMetric label="Партнёры" value={partnerCoreSnapshot.partners.length} />
                <AdminMiniMetric label="Конверсии" value={partnerConversions} />
                <AdminMiniMetric label="Начисления" value={formatPartnerMoney(partnerLedgerRevenueCents)} />
                <AdminMiniMetric label="Программы" value={partnerCoreSnapshot.programs.length} />
                <AdminMiniMetric label="Предложения" value={partnerCoreSnapshot.placements.length} />
                <AdminMiniMetric label="На проверке" value={partnerCoreSnapshot.reviewTasks.filter((task) => adminRecordText(task, "status") === "open").length} />
              </div>
              <div className="admin-partner-next">
                <div>
                  <span className="eyebrow">Быстрый старт</span>
                  <h3>Настройте программу по шагам</h3>
                  <p className="muted">Основные действия разнесены по разделам. Технические ID скрыты в расширенных настройках.</p>
                </div>
                <div className="admin-partner-next-list">
                  <button onClick={() => setPartnerAdminView("program")} type="button"><strong>1. Условия</strong><span>Бонус пользователю и комиссия партнёру</span></button>
                  <button onClick={() => setPartnerAdminView("partners")} type="button"><strong>2. Партнёры</strong><span>Доступ и текущие результаты</span></button>
                  <button onClick={() => setPartnerAdminView("offers")} type="button"><strong>3. Предложения</strong><span>Создание и отправка на проверку</span></button>
                </div>
              </div>
            </>}

            {partnerAdminView === "partners" && <div className="stack admin-partner-view">
              <div>
                <h3>Партнёры проекта</h3>
                <p className="muted">Здесь отображаются только партнёры Orken. Приостановка не затрагивает их работу в других проектах студии.</p>
              </div>
              <div className="admin-program-list">
                {partnerCoreSnapshot.partners.length === 0 ? <p className="muted">Партнеры еще не зарегистрированы</p> : partnerCoreSnapshot.partners.map((partner) => {
                  const suspended = partner.project_status === "suspended";
                  return (
                    <div className="admin-program-row" key={partner.id}>
                      <div>
                        <strong>{partner.display_name ?? partner.legal_name ?? partner.email ?? partner.id}</strong>
                        <span>{partner.email ?? "Email не указан"} · {partner.account_type ?? "partner"}</span>
                        <span>Статус: {partnerAdminStatusLabel(partner.project_status)} · ссылок {Number(partner.referral_links_count ?? 0)} · конверсий {Number(partner.conversions_count ?? 0)}</span>
                        <span>Начислено: {formatPartnerMoney(Number(partner.payable_cents ?? 0))}</span>
                      </div>
                      <button className={`button ${suspended ? "" : "secondary"}`} onClick={() => void setPartnerAccess(partner.id, suspended ? "approved" : "suspended")}>
                        {suspended ? "Восстановить доступ" : "Приостановить"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>}

            <div className="admin-partner-workspace">
              {partnerAdminView === "program" && <div className="stack admin-partner-view">
                <div className="admin-partner-view-heading">
                  <h3>Условия партнёрской программы</h3>
                  <p className="muted">Определите, что получит новый пользователь и как рассчитывается вознаграждение партнёра.</p>
                </div>
                <div className="grid grid-2 admin-partner-form-grid">
                  <label className="admin-field"><span>Название программы</span><input className="input" value={partnerProgramForm.name} onChange={(event) => setPartnerProgramForm({ ...partnerProgramForm, name: event.target.value })} /></label>
                  <label className="admin-field"><span>Статус</span><select className="input" value={partnerProgramForm.status} onChange={(event) => setPartnerProgramForm({ ...partnerProgramForm, status: event.target.value })}><option value="PAUSED">Приостановлена</option><option value="ACTIVE">Активна</option></select></label>
                  <label className="admin-field admin-field-wide"><span>Куда ведёт партнёрская ссылка</span><input className="input" value={partnerProgramForm.referralDestination} onChange={(event) => setPartnerProgramForm({ ...partnerProgramForm, referralDestination: event.target.value })} /></label>
                  <label className="admin-field"><span>Бонус новому пользователю</span><select className="input" value={partnerProgramForm.customerBonusType} onChange={(event) => setPartnerProgramForm({ ...partnerProgramForm, customerBonusType: event.target.value })}><option value="NONE">Без бонуса</option><option value="FREE_DAYS">Бесплатные дни</option><option value="DISCOUNT">Скидка</option><option value="CREDITS">Баллы</option><option value="CUSTOM_ENTITLEMENT">Особое право доступа</option></select></label>
                  <label className="admin-field"><span>Размер бонуса</span><input className="input" value={partnerProgramForm.customerBonusValue} onChange={(event) => setPartnerProgramForm({ ...partnerProgramForm, customerBonusValue: event.target.value })} inputMode="numeric" /></label>
                  <label className="admin-field"><span>Как платим партнёру</span><select className="input" value={partnerProgramForm.commissionModel} onChange={(event) => setPartnerProgramForm({ ...partnerProgramForm, commissionModel: event.target.value })}><option value="PERCENT">Процент от выручки</option><option value="FIXED">Фиксированная выплата</option><option value="HYBRID">Процент и фиксированная выплата</option></select></label>
                  {partnerProgramForm.commissionModel !== "FIXED" && <label className="admin-field"><span>Комиссия с оплат Orken, %</span><input className="input" value={partnerProgramForm.commissionRateBps ? String(Number(partnerProgramForm.commissionRateBps) / 100) : ""} onChange={(event) => {
                    const percent = Number(event.target.value.replace(",", "."));
                    setPartnerProgramForm({ ...partnerProgramForm, commissionRateBps: event.target.value && Number.isFinite(percent) ? String(Math.round(percent * 100)) : "" });
                  }} inputMode="decimal" /><small>Начисляется с платежей пользователей, пришедших по реферальной ссылке.</small></label>}
                  {partnerProgramForm.commissionModel !== "PERCENT" && <label className="admin-field"><span>Фиксированная комиссия за конверсию, €</span><input className="input" value={partnerProgramForm.fixedPayoutCents} onChange={(event) => setPartnerProgramForm({ ...partnerProgramForm, fixedPayoutCents: event.target.value })} inputMode="decimal" placeholder="Например: 5 или 5,50" /></label>}
                  <label className="admin-field"><span>Как долго начислять комиссию</span><select className="input" value={partnerProgramForm.commissionWindowType} onChange={(event) => setPartnerProgramForm({ ...partnerProgramForm, commissionWindowType: event.target.value })}><option value="FIRST_PAYMENT">Только за первый платёж</option><option value="MONTHS">Несколько месяцев</option><option value="LIFETIME">За все будущие платежи</option></select></label>
                  {partnerProgramForm.commissionWindowType === "MONTHS" && <label className="admin-field"><span>Период, месяцев</span><input className="input" value={partnerProgramForm.commissionWindowMonths} onChange={(event) => setPartnerProgramForm({ ...partnerProgramForm, commissionWindowMonths: event.target.value })} inputMode="numeric" /></label>}
                </div>
                <details className="admin-advanced-panel">
                  <summary>Расширенные настройки</summary>
                  <p>Эти поля нужны для интеграции и нестандартных условий. Не меняйте их без необходимости.</p>
                  <div className="grid grid-2">
                    <label className="admin-field"><span>ID программы в Partner Core</span><input className="input" value={partnerProgramForm.partnerCoreProgramId} onChange={(event) => setPartnerProgramForm({ ...partnerProgramForm, partnerCoreProgramId: event.target.value })} /></label>
                    <label className="admin-field"><span>Код особого доступа</span><input className="input" value={partnerProgramForm.customerBonusEntitlement} onChange={(event) => setPartnerProgramForm({ ...partnerProgramForm, customerBonusEntitlement: event.target.value })} /></label>
                    <label className="admin-field"><span>Срок удержания, дней</span><input className="input" value={partnerProgramForm.lockDays} onChange={(event) => setPartnerProgramForm({ ...partnerProgramForm, lockDays: event.target.value })} inputMode="numeric" /></label>
                    <label className="admin-field"><span>Версия условий</span><input className="input" value={partnerProgramForm.termsVersion} onChange={(event) => setPartnerProgramForm({ ...partnerProgramForm, termsVersion: event.target.value })} /></label>
                  </div>
                </details>
                <div className="admin-partner-actions"><button className="button" onClick={savePartnerProgram}>Сохранить условия</button><button className="button secondary" onClick={() => setPartnerProgramForm(emptyPartnerProgramForm)}>Сбросить форму</button></div>
              </div>}

              {partnerAdminView === "offers" && <div className="stack admin-partner-view">
                <div className="admin-partner-view-heading"><h3>Предложение для пользователей Orken</h3><p className="muted">Создайте понятную карточку, задайте стоимость в баллах и отправьте её на проверку.</p></div>
                <div className="admin-partner-explainer">
                  <strong>Два независимых расчёта</strong>
                  <span>Процент программы, например 10%, начисляется партнёру с оплат Orken по его реферальной ссылке. Выплата ниже — отдельная фиксированная сумма за одну активацию партнёрской услуги за XP. Если дополнительная выплата не предусмотрена, оставьте 0 €.</span>
                </div>
                <div className="grid grid-2 admin-partner-form-grid">
                  <label className="admin-field"><span>Партнёрская программа</span><select className="input" value={partnerOfferForm.programConfigId} onChange={(event) => setPartnerOfferForm({ ...partnerOfferForm, programConfigId: event.target.value })}><option value="">Выберите программу</option>{partnerPrograms.map((program) => <option value={program.id} key={program.id}>{program.name}</option>)}</select></label>
                  <label className="admin-field"><span>Тип предложения</span><select className="input" value={partnerOfferForm.kind} onChange={(event) => setPartnerOfferForm({ ...partnerOfferForm, kind: event.target.value })}><option value="manual_deal">Другое предложение</option><option value="reward_trial">Пробный доступ</option><option value="portfolio_credit">Бонус или сертификат</option><option value="qualified_lead">Заявка на консультацию</option><option value="paid_service">Платная услуга</option></select></label>
                  <label className="admin-field admin-field-wide"><span>Название</span><input className="input" value={partnerOfferForm.title} onChange={(event) => setPartnerOfferForm({ ...partnerOfferForm, title: event.target.value })} placeholder="Например: стратегическая сессия" /></label>
                  <label className="admin-field"><span>Стоимость для пользователя, XP</span><input className="input" value={partnerOfferForm.redemptionAmount} onChange={(event) => setPartnerOfferForm({ ...partnerOfferForm, redemptionAmount: event.target.value })} inputMode="numeric" /><small>Звание не требуется: достаточно накопить эту сумму. XP списываются при активации.</small></label>
                  <label className="admin-field"><span>Лимит активаций в месяц</span><input className="input" value={partnerOfferForm.capPerMonth} onChange={(event) => setPartnerOfferForm({ ...partnerOfferForm, capPerMonth: event.target.value })} inputMode="numeric" /></label>
                  <label className="admin-field admin-field-wide"><span>Короткое описание</span><textarea className="input text-editor compact" value={partnerOfferForm.description} onChange={(event) => setPartnerOfferForm({ ...partnerOfferForm, description: event.target.value })} placeholder="Что получит пользователь и как это работает" /></label>
                  <label className="admin-field admin-field-wide"><span>Польза для пользователя</span><textarea className="input text-editor compact" value={partnerOfferForm.userBenefit} onChange={(event) => setPartnerOfferForm({ ...partnerOfferForm, userBenefit: event.target.value })} placeholder="Конкретный результат или выгода" /></label>
                  <label className="admin-field"><span>Выплата партнёру за одну активацию, €</span><input className="input" value={partnerOfferForm.partnerPayoutCents} onChange={(event) => setPartnerOfferForm({ ...partnerOfferForm, partnerPayoutCents: event.target.value })} inputMode="decimal" placeholder="0" /><small>Не связана с процентом от выручки. Укажите 0, если отдельной выплаты за услугу нет.</small></label>
                  <label className="admin-field"><span>Что выдать после активации</span><input className="input" value={partnerOfferForm.entitlementValue} onChange={(event) => setPartnerOfferForm({ ...partnerOfferForm, entitlementValue: event.target.value })} placeholder="Купон, ссылка или инструкция" /></label>
                </div>
                <details className="admin-advanced-panel">
                  <summary>Расширенные настройки</summary>
                  <p>Связи с Partner Core и способ технической выдачи.</p>
                  <div className="grid grid-2">
                    <label className="admin-field"><span>ID партнёра в Partner Core</span><input className="input" value={partnerOfferForm.partnerId} onChange={(event) => setPartnerOfferForm({ ...partnerOfferForm, partnerId: event.target.value })} /></label>
                    <label className="admin-field"><span>ID размещения в Partner Core</span><input className="input" value={partnerOfferForm.partnerCorePlacementId} onChange={(event) => setPartnerOfferForm({ ...partnerOfferForm, partnerCorePlacementId: event.target.value })} /></label>
                    <label className="admin-field"><span>URL изображения</span><input className="input" value={partnerOfferForm.imageUrl} onChange={(event) => setPartnerOfferForm({ ...partnerOfferForm, imageUrl: event.target.value })} /></label>
                    <label className="admin-field"><span>Тип выдаваемого доступа</span><input className="input" value={partnerOfferForm.entitlementType} onChange={(event) => setPartnerOfferForm({ ...partnerOfferForm, entitlementType: event.target.value })} /></label>
                    <label className="admin-field"><span>Поверхность размещения</span><select className="input" value={partnerOfferForm.surface} onChange={(event) => setPartnerOfferForm({ ...partnerOfferForm, surface: event.target.value })}><option value="rewards_tab">Раздел наград</option><option value="milestone_modal">Окно достижения</option><option value="home_module">Главный экран</option><option value="admin_recommendation">Рекомендация команды</option></select></label>
                  </div>
                </details>
                <div className="admin-partner-actions"><button className="button" onClick={savePartnerOffer}>Сохранить предложение</button><button className="button secondary" onClick={() => setPartnerOfferForm(emptyPartnerOfferForm)}>Сбросить форму</button></div>
              </div>}
            </div>

            {partnerAdminView === "program" && <div className="admin-program-list admin-partner-view">
              <div><h3>Сохранённые программы</h3><p className="muted">Выберите программу, чтобы изменить её условия или создать отдельную ссылку.</p></div>
              {partnerPrograms.length === 0 ? <p className="muted">Локальные партнёрские программы не созданы</p> : partnerPrograms.map((program) => (
                <div className="admin-program-row" key={program.id}>
                  <div>
                    <strong>{program.name} · {partnerAdminStatusLabel(program.status)}</strong>
                    <span>Бонус пользователю: {partnerBonusLabel(program.customerBonusType, program.customerBonusValue)} · партнёру: {partnerCommissionLabel(program)}</span>
                    <span>Связь с общей системой: {program.partnerCoreProgramId ? "настроена" : "не настроена"} · версия условий: {program.termsVersion}</span>
                    {program.referralLinks.map((link) => <span key={link.id}>{link.channel}: {link.url ?? link.referralCode ?? link.status}</span>)}
                  </div>
                  <div className="admin-gift-form">
                    <input className="input" value={referralChannelByProgram[program.id] ?? "default"} onChange={(event) => setReferralChannelByProgram({ ...referralChannelByProgram, [program.id]: event.target.value })} placeholder="Например: Instagram (без URL)" maxLength={60} />
                    <button className="button secondary" onClick={() => createReferralLink(program.id)}>Создать ссылку</button>
                    <button className="button secondary" onClick={() => selectPartnerProgram(program)}>Изменить</button>
                  </div>
                </div>
              ))}
            </div>}

            {partnerAdminView === "offers" && <div className="admin-program-list admin-partner-view">
              <div><h3>Созданные предложения</h3><p className="muted">Черновик можно изменить, затем отправить на модерацию.</p></div>
              {partnerOffers.length === 0 ? <p className="muted">Синхронизированных офферов пока нет</p> : partnerOffers.map((offer) => (
                <div className="admin-program-row" key={offer.id}>
                  <div>
                    <strong>{offer.title} · {partnerAdminStatusLabel(offer.status)}</strong>
                    <span>Синхронизация: {offer.partnerCorePlacementId ? partnerAdminStatusLabel(offer.partnerCoreStatus) : "ещё не отправлено"}</span>
                    <span>{offer.redemptionCost.amount} XP · выплата за активацию {formatPartnerMoney(offer.partnerPayoutCents)} · активаций {offer.redemptionsCount ?? 0}</span>
                    <span>{offer.userBenefit}</span>
                  </div>
                  <div className="row" style={{ justifyContent: "flex-end" }}>
                    <button className="button secondary" onClick={() => selectPartnerOffer(offer)}>Изменить</button>
                    <button className="button secondary" onClick={() => setPartnerOfferStatus(offer.id, "PENDING_REVIEW")}>На модерацию</button>
                    <button className="button secondary" onClick={() => setPartnerOfferStatus(offer.id, "PAUSED")}>Приостановить</button>
                    <button className="button secondary" onClick={() => setPartnerOfferStatus(offer.id, "DRAFT")}>В черновик</button>
                  </div>
                </div>
              ))}
            </div>}

            {partnerAdminView === "operations" && <>
            <div className="admin-program-list admin-partner-view">
              <div><h3>Активации предложений</h3><p className="muted">Пользователи, которые обменяли XP на партнёрское предложение.</p></div>
              {partnerRedemptions.length === 0 ? <p className="muted">Активаций пока нет</p> : partnerRedemptions.map((item) => (
                <div className="admin-program-row" key={item.id}>
                  <div>
                    <strong>{item.offerTitle ?? item.offerId} · {partnerAdminStatusLabel(item.status)}</strong>
                    <span>{item.userEmail ?? item.userId ?? item.sessionId ?? "Пользователь без аккаунта"} · {item.costAmount} {item.costCurrency}</span>
                    <span>Связь с общей системой: {item.partnerCoreRedemptionId ? "настроена" : "не настроена"} · {formatAdminDate(item.createdAt)}</span>
                    {item.deliveryError && <span>{item.deliveryError}</span>}
                  </div>
                </div>
              ))}
            </div>

            <div className="admin-program-list">
              <div><h3>Выручка и начисления</h3><p className="muted">Финансовые операции, полученные из Partner Core.</p></div>
              {partnerCoreSnapshot.ledgerEntries.length === 0 ? <p className="muted">Начислений пока нет</p> : partnerCoreSnapshot.ledgerEntries.slice(0, 30).map((entry, index) => (
                <div className="admin-program-row" key={adminRecordText(entry, "id") || index}>
                  <div>
                    <strong>{adminRecordText(entry, "account") || "Начисление"} · {partnerAdminStatusLabel(adminRecordText(entry, "status"))}</strong>
                    <span>{adminRecordText(entry, "counterparty") || "Orken"} · {adminRecordText(entry, "source") || "event"}</span>
                    <span>{adminRecordText(entry, "amount_text", "amountText") || formatPartnerMoney(adminRecordNumber(entry, "amount_cents", "amountCents"))}</span>
                  </div>
                </div>
              ))}
            </div>
            </>}
          </section>}

          {section === "system" && <section id="admin-system" className="grid grid-2 admin-system-grid">
            <div className="admin-system-actions">
              <div>
                <strong>Служебные действия</strong>
                <span>Создание отсутствующих настроек выполняется идемпотентно.</span>
              </div>
              <button className="button secondary" onClick={upsertFeatureFlag}>{adminText.seedFlag}</button>
            </div>
            <List title={adminText.lists[0]} items={settings.map((item) => `${item.key}: ${JSON.stringify(item.value).slice(0, 180)}`)} />
            <List title={adminText.lists[1]} items={flags.map((item) => `${item.key}: ${item.enabled}`)} />
            <List title={adminText.lists[2]} items={prompts.map((item) => `${item.key}/${item.locale}/v${item.version}: ${item.status}`)} />
            <List title={adminText.lists[3]} items={analyses.map((item) => JSON.stringify(item).slice(0, 220))} />
          </section>}
      </section>
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

function AdminMiniMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="admin-mini-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function formatAdminDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
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

function adminRecordText(record: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function adminRecordNumber(record: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = Number(record[key]);
    if (Number.isFinite(value)) return value;
  }
  return 0;
}

function partnerAdminStatusLabel(status?: string | null) {
  const labels: Record<string, string> = {
    ACTIVE: "Активна",
    APPROVED: "Одобрено",
    PUBLISHED: "Опубликовано",
    PAUSED: "Приостановлено",
    SUSPENDED: "Доступ приостановлен",
    DRAFT: "Черновик",
    PENDING_REVIEW: "На проверке",
    REJECTED: "Нужны изменения",
    FULFILLED: "Выполнено",
    PARTNER_FAILED: "Ошибка партнёра",
    REFUNDED: "Возвращено"
  };
  const normalized = String(status ?? "").toUpperCase();
  return labels[normalized] ?? status ?? "Не указан";
}

function partnerBonusLabel(type: string, value?: number | null) {
  const labels: Record<string, string> = {
    NONE: "без бонуса",
    FREE_DAYS: `${value ?? 0} бесплатных дней`,
    DISCOUNT: `скидка ${value ?? 0}%`,
    CREDITS: `${value ?? 0} баллов`,
    CUSTOM_ENTITLEMENT: "особый доступ"
  };
  return labels[type] ?? type;
}

function partnerCommissionLabel(program: PartnerAffiliateProgramSummary) {
  if (program.commissionModel === "PERCENT") return `${Number(program.commissionRateBps ?? 0) / 100}% от выручки`;
  if (program.commissionModel === "FIXED") return `${formatPartnerMoney(program.fixedPayoutCents ?? 0)} за конверсию`;
  return `${Number(program.commissionRateBps ?? 0) / 100}% + ${formatPartnerMoney(program.fixedPayoutCents ?? 0)}`;
}

function formatPartnerMoney(cents: number) {
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency: "EUR" }).format(cents / 100);
}

function moneyInputFromCents(value?: number | null) {
  const cents = Number(value ?? 0);
  if (!Number.isFinite(cents)) return "0";
  const amount = cents / 100;
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2).replace(".", ",");
}

function moneyInputToCents(value: string) {
  const amount = Number(value.trim().replace(",", "."));
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("Укажите сумму в евро, например 25 или 25,50");
  }
  return Math.round(amount * 100);
}

function List({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="card stack admin-list-card">
      <div className="row">
        <h2>{title}</h2>
        <span className="admin-list-count">{items.length}</span>
      </div>
      <div className="admin-compact-list">
        {items.length === 0 ? <p className="muted">Нет данных</p> : items.map((item) => {
          const [label, value] = splitAdminListItem(item);
          return (
            <details className="admin-list-row" key={item}>
              <summary>
                <strong>{label}</strong>
                <span>{value}</span>
              </summary>
              <pre>{item}</pre>
            </details>
          );
        })}
      </div>
    </div>
  );
}

function splitAdminListItem(item: string) {
  const index = item.indexOf(":");
  if (index <= 0) return [item.slice(0, 80), item.slice(80)] as const;
  return [item.slice(0, index), item.slice(index + 1).trim()] as const;
}
