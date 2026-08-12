"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  BarChart3,
  BadgeDollarSign,
  GraduationCap,
  Bot,
  BrainCircuit,
  FileText,
  Handshake,
  LayoutDashboard,
  Download,
  LogOut,
  RefreshCw,
  Settings,
  Users,
  type LucideIcon
} from "lucide-react";
import type {
  AdminBusinessReport,
  AdminCoachPartnershipLead,
  AdminCoachPlatformSnapshot,
  AdminReportBreakdown,
  AdminStats,
  AdminUserSummary,
  AdminTelegramCommunityChat,
  AppSetting,
  CoachPublicContent,
  FeatureFlag,
  PartnerAffiliateProgramSummary,
  PartnerCoreAdminSnapshot,
  PartnerOfferStatus,
  PartnerOfferSummary,
  PartnerRedemptionSummary,
  CoachPartnershipLeadStatus,
  PromoCode,
  PromptTemplate,
  PromptTemplateInput,
  TelegramCommunityAdminSnapshot
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
  telegramCommunityMorningTemplateSettingKey,
  telegramCommunityMiddayTemplateSettingKey,
  telegramCommunityEveningTemplateSettingKey,
  telegramCommunityWelcomeTemplateSettingKey,
  telegramCommunityTemperatureSettingKey,
  telegramWelcomeTemplateSettingKey,
  telegramWebLoginEnabledSettingKey
} from "@/lib/api";
import { defaultSiteText } from "@/lib/messages";

export type AdminSection = "overview" | "reports" | "users" | "commercial" | "ai" | "content" | "integrations" | "coaches" | "partners" | "system";
type PartnerAdminView = "overview" | "applications" | "partners" | "program" | "offers" | "operations";

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
  { id: "reports", href: "/admin/reports", label: "Отчёты", title: "Отчёты и аналитика", description: "Пользователи, подписки, платежи, коучи и партнёрская воронка.", icon: BarChart3 },
  { id: "users", href: "/admin/users", label: "Пользователи", title: "Пользователи", description: "Активность, диагностики, привычки, Telegram и подаренные дни.", icon: Users },
  { id: "commercial", href: "/admin/commercial", label: "Коммерция", title: "Цены и промокоды", description: "Стоимость отчёта, подписка, trial и промокоды.", icon: BadgeDollarSign },
  { id: "ai", href: "/admin/ai", label: "AI и промпты", title: "AI и промпты", description: "Режим генерации, модели и версионируемые системные промпты.", icon: BrainCircuit },
  { id: "content", href: "/admin/content", label: "Контент", title: "Контент и локализация", description: "Доступные языки и тексты пользовательского интерфейса.", icon: FileText },
  { id: "integrations", href: "/admin/integrations", label: "Интеграции", title: "Интеграции", description: "Telegram, шаблоны сообщений и системные ограничения.", icon: Bot },
  { id: "coaches", href: "/admin/coaches", label: "Коучи", title: "Коучи и сопровождение", description: "Профили, пакеты клиентов, услуги, сайты, заказы и награды.", icon: GraduationCap },
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

const telegramCommunityDefaults = {
  morningTemplate: [
    "Доброе утро. Выберите одну главную задачу дня.",
    "Напишите: /focus что именно вы завершите сегодня.",
    "Один конкретный результат полезнее длинного списка намерений."
  ].join("\n"),
  middayTemplate: [
    "Дневная сверка ORKEN.",
    "Какой самый маленький шаг приблизит вас к утреннему фокусу за следующие 20 минут?",
    "Можно ответить прямо на это сообщение."
  ].join("\n"),
  eveningTemplate: [
    "Вечерняя сверка.",
    "Отметьте результат кнопкой ниже. Частичное выполнение тоже считается движением, если вы честно фиксируете следующий шаг."
  ].join("\n"),
  welcomeTemplate: [
    "Я — ORKEN для комьюнити. Помогаю группе формулировать фокус, отмечать результат и поддерживать рабочий ритм без публичного давления.",
    "Администратор может включить расписание командой /activate. Участие добровольное: /join — войти, /leave — выйти."
  ].join("\n")
};

const emptyTelegramCommunitySnapshot: TelegramCommunityAdminSnapshot = {
  configured: false,
  username: null,
  chats: []
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
  const [businessReport, setBusinessReport] = useState<AdminBusinessReport | null>(null);
  const [reportDays, setReportDays] = useState("30");
  const [analyses, setAnalyses] = useState<unknown[]>([]);
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [settings, setSettings] = useState<AppSetting[]>([]);
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [prompts, setPrompts] = useState<PromptTemplate[]>([]);
  const [promptDefaults, setPromptDefaults] = useState<PromptTemplateInput[]>([]);
  const [promptForm, setPromptForm] = useState<PromptTemplateInput>(emptyPromptForm);
  const [promoCodes, setPromoCodes] = useState<PromoCode[]>([]);
  const [partnerPrograms, setPartnerPrograms] = useState<PartnerAffiliateProgramSummary[]>([]);
  const [coachApplications, setCoachApplications] = useState<AdminCoachPartnershipLead[]>([]);
  const [coachPlatform, setCoachPlatform] = useState<AdminCoachPlatformSnapshot | null>(null);
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
  const [telegramCommunity, setTelegramCommunity] = useState<TelegramCommunityAdminSnapshot>(emptyTelegramCommunitySnapshot);
  const [telegramCommunityForm, setTelegramCommunityForm] = useState({
    ...telegramCommunityDefaults,
    temperature: "0.55"
  });
  const [communityAnnouncements, setCommunityAnnouncements] = useState<Record<string, string>>({});
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

      if (section === "reports") {
        const [nextReport, nextPartnerCoreSnapshot] = await Promise.all([
          adminApi.businessReport(Number(reportDays)),
          adminApi.partnerCore().catch((reason) => ({
            ...emptyPartnerCoreSnapshot,
            configured: true,
            error: reason instanceof Error ? reason.message : "Partner Core недоступен"
          }))
        ]);
        setBusinessReport(nextReport);
        setPartnerCoreSnapshot(nextPartnerCoreSnapshot);
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
        const [nextSettings, nextCommunity] = await Promise.all([
          adminApi.settings(),
          adminApi.telegramCommunity()
        ]);
        setSettings(nextSettings);
        setTelegramCommunity(nextCommunity);
        hydrateTelegramPolicyForm(nextSettings);
        hydrateTelegramCommunityForm(nextSettings);
      }

      if (section === "partners") {
        const [nextPartnerPrograms, nextPartnerOffers, nextPartnerRedemptions, nextPartnerCoreSnapshot, nextCoachApplications] = await Promise.all([
          adminApi.partnerPrograms(),
          adminApi.partnerOffers(),
          adminApi.partnerRedemptions(),
          adminApi.partnerCore().catch((reason) => ({
            ...emptyPartnerCoreSnapshot,
            configured: true,
            error: reason instanceof Error ? reason.message : "Partner Core недоступен"
          })),
          adminApi.coachApplications()
        ]);
        setPartnerPrograms(nextPartnerPrograms);
        setPartnerOffers(nextPartnerOffers);
        setPartnerRedemptions(nextPartnerRedemptions);
        setPartnerCoreSnapshot(nextPartnerCoreSnapshot);
        setCoachApplications(nextCoachApplications);
      }

      if (section === "coaches") {
        setCoachPlatform(await adminApi.coachPlatform());
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

  function hydrateTelegramCommunityForm(nextSettings: AppSetting[]) {
    const read = (key: string, fallback: string) => cleanTemplateValue(
      nextSettings.find((item) => item.key === key)?.value,
      fallback
    );
    const temperature = nextSettings.find((item) => item.key === telegramCommunityTemperatureSettingKey)?.value;
    setTelegramCommunityForm({
      morningTemplate: read(telegramCommunityMorningTemplateSettingKey, telegramCommunityDefaults.morningTemplate),
      middayTemplate: read(telegramCommunityMiddayTemplateSettingKey, telegramCommunityDefaults.middayTemplate),
      eveningTemplate: read(telegramCommunityEveningTemplateSettingKey, telegramCommunityDefaults.eveningTemplate),
      welcomeTemplate: read(telegramCommunityWelcomeTemplateSettingKey, telegramCommunityDefaults.welcomeTemplate),
      temperature: typeof temperature === "number" || typeof temperature === "string" ? String(temperature) : "0.55"
    });
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

  async function saveTelegramCommunitySettings() {
    setMessage("");
    const temperature = Number(telegramCommunityForm.temperature);
    if (!Number.isFinite(temperature) || temperature < 0 || temperature > 1) {
      setMessage("Температура community-бота должна быть от 0 до 1");
      return;
    }
    const templates = [
      telegramCommunityForm.welcomeTemplate,
      telegramCommunityForm.morningTemplate,
      telegramCommunityForm.middayTemplate,
      telegramCommunityForm.eveningTemplate
    ];
    if (templates.some((template) => !template.trim())) {
      setMessage("Все шаблоны community-бота обязательны");
      return;
    }
    await Promise.all([
      adminApi.upsertSetting(telegramCommunityWelcomeTemplateSettingKey, telegramCommunityForm.welcomeTemplate),
      adminApi.upsertSetting(telegramCommunityMorningTemplateSettingKey, telegramCommunityForm.morningTemplate),
      adminApi.upsertSetting(telegramCommunityMiddayTemplateSettingKey, telegramCommunityForm.middayTemplate),
      adminApi.upsertSetting(telegramCommunityEveningTemplateSettingKey, telegramCommunityForm.eveningTemplate),
      adminApi.upsertSetting(telegramCommunityTemperatureSettingKey, temperature)
    ]);
    setMessage("Настройки community-бота сохранены");
    await refresh();
  }

  function editTelegramCommunityChat(id: string, patch: Partial<AdminTelegramCommunityChat>) {
    setTelegramCommunity((current) => ({
      ...current,
      chats: current.chats.map((chat) => chat.id === id ? { ...chat, ...patch } : chat)
    }));
  }

  async function saveTelegramCommunityChat(chat: AdminTelegramCommunityChat) {
    setMessage("");
    await adminApi.updateTelegramCommunityChat(chat.id, {
      status: chat.status,
      timezone: chat.timezone,
      schedulesEnabled: chat.schedulesEnabled,
      aiRepliesEnabled: chat.aiRepliesEnabled,
      smartPingEnabled: chat.smartPingEnabled,
      morningTime: chat.morningTime,
      middayTime: chat.middayTime,
      eveningTime: chat.eveningTime,
      quietHoursStart: chat.quietHoursStart,
      quietHoursEnd: chat.quietHoursEnd
    });
    setMessage(`Настройки группы «${chat.title || chat.telegramChatId}» сохранены`);
    await refresh();
  }

  async function sendTelegramCommunityAnnouncement(chat: AdminTelegramCommunityChat) {
    const text = communityAnnouncements[chat.id]?.trim() ?? "";
    if (!text) {
      setMessage("Введите текст объявления");
      return;
    }
    await adminApi.sendTelegramCommunityAnnouncement(chat.id, text);
    setCommunityAnnouncements((current) => ({ ...current, [chat.id]: "" }));
    setMessage(`Сообщение отправлено в «${chat.title || chat.telegramChatId}»`);
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

  async function setCoachApplicationStatus(id: string, status: CoachPartnershipLeadStatus) {
    setLoading(true);
    setMessage("");
    try {
      const updated = await adminApi.setCoachApplicationStatus(id, status);
      setCoachApplications((items) => items.map((item) => item.id === id ? updated : item));
      setMessage("Статус заявки обновлён");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Не удалось обновить заявку");
    } finally {
      setLoading(false);
    }
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

          {section === "reports" && businessReport && <>
            <section className="admin-report-toolbar">
              <div>
                <strong>Период отчёта</strong>
                <span>{formatReportDateRange(businessReport.range.from, businessReport.range.to)}</span>
              </div>
              <label>
                <span className="sr-only">Период</span>
                <select className="input" value={reportDays} onChange={(event) => setReportDays(event.target.value)}>
                  <option value="7">7 дней</option>
                  <option value="30">30 дней</option>
                  <option value="90">90 дней</option>
                  <option value="365">12 месяцев</option>
                </select>
              </label>
              <button className="button secondary" onClick={() => void refresh()} disabled={loading}>Применить</button>
              <button className="button secondary" onClick={() => downloadAdminBusinessReport(businessReport, partnerCoreSnapshot)}>
                <Download size={17} aria-hidden="true" /> CSV
              </button>
            </section>

            <section className="admin-report-kpis" data-testid="admin-report-kpis">
              <AdminMiniMetric label="Всего пользователей" value={businessReport.users.total} />
              <AdminMiniMetric label="Новые за период" value={businessReport.users.newInPeriod} />
              <AdminMiniMetric label="Активные за период" value={businessReport.users.activeInPeriod} />
              <AdminMiniMetric label="Платные подписки" value={businessReport.subscriptions.paidCurrent} />
              <AdminMiniMetric label="Расчётный MRR" value={formatReportMoney(businessReport.subscriptions.estimatedMrr)} />
              <AdminMiniMetric label="Выручка отчётов" value={formatReportMoneyList(businessReport.payments.revenue)} />
              <AdminMiniMetric label="Новые заявки коучей" value={businessReport.coaches.applicationsInPeriod} />
              <AdminMiniMetric label="Партнёры Orken" value={partnerCoreSnapshot.partners.length} />
            </section>

            <section className="admin-report-grid">
              <div className="admin-report-panel">
                <div className="admin-report-panel-heading">
                  <div><span className="eyebrow">Воронка</span><h2>Пользователи и диагностики</h2></div>
                  <strong>{percentOf(businessReport.diagnostics.completedInPeriod, businessReport.diagnostics.createdInPeriod)}%</strong>
                </div>
                <p className="muted">Доля завершённых диагностик среди созданных за выбранный период.</p>
                <div className="admin-report-inline-metrics">
                  <AdminMiniMetric label="Создано диагностик" value={businessReport.diagnostics.createdInPeriod} />
                  <AdminMiniMetric label="Завершено" value={businessReport.diagnostics.completedInPeriod} />
                  <AdminMiniMetric label="Ошибки" value={businessReport.diagnostics.failedInPeriod} />
                </div>
                <AdminReportBreakdownList items={businessReport.diagnostics.byStatus} total={businessReport.diagnostics.createdInPeriod} />
              </div>

              <div className="admin-report-panel">
                <div className="admin-report-panel-heading">
                  <div><span className="eyebrow">Навигатор привычек</span><h2>Подписки и типы доступа</h2></div>
                  <strong>{businessReport.subscriptions.totalPrograms}</strong>
                </div>
                <div className="admin-report-inline-metrics">
                  <AdminMiniMetric label="Новые программы" value={businessReport.subscriptions.createdInPeriod} />
                  <AdminMiniMetric label="Trial начат" value={businessReport.subscriptions.trialStartedInPeriod} />
                  <AdminMiniMetric label="Trial → paid" value={`${businessReport.subscriptions.cohortTrialToPaidPercent}%`} />
                  <AdminMiniMetric label="Истекают за 7 дней" value={businessReport.subscriptions.trialsEndingWithin7Days} />
                </div>
                <div className="admin-report-breakdown-columns">
                  <div><h3>По статусу</h3><AdminReportBreakdownList items={businessReport.subscriptions.byStatus} total={businessReport.subscriptions.totalPrograms} /></div>
                  <div><h3>По источнику доступа</h3><AdminReportBreakdownList items={businessReport.subscriptions.byAccessType} total={businessReport.subscriptions.totalPrograms} /></div>
                </div>
                <p className="admin-report-note">MRR и ARR расчётные: активные Stripe-подписки умножаются на текущую цену Навигатора. Фактические invoice-платежи подписки пока не сохраняются отдельным ledger в Orken.</p>
              </div>

              <div className="admin-report-panel">
                <div className="admin-report-panel-heading">
                  <div><span className="eyebrow">Коммерция</span><h2>Платежи за диагностику</h2></div>
                  <strong>{formatReportMoneyList(businessReport.payments.revenue)}</strong>
                </div>
                <div className="admin-report-inline-metrics">
                  <AdminMiniMetric label="Создано платежей" value={businessReport.payments.createdInPeriod} />
                  <AdminMiniMetric label="Успешно" value={businessReport.payments.succeededInPeriod} />
                  <AdminMiniMetric label="С промокодом" value={businessReport.payments.promoUsesInPeriod} />
                  <AdminMiniMetric label="Скидки" value={formatReportMoneyList(businessReport.payments.discounts)} />
                </div>
                <AdminReportBreakdownList items={businessReport.payments.byStatus} total={businessReport.payments.createdInPeriod} />
              </div>

              <div className="admin-report-panel">
                <div className="admin-report-panel-heading">
                  <div><span className="eyebrow">B2B</span><h2>Коучи и партнёры</h2></div>
                  <strong>{businessReport.coaches.applicationsTotal}</strong>
                </div>
                <div className="admin-report-inline-metrics">
                  <AdminMiniMetric label="Заявки за период" value={businessReport.coaches.applicationsInPeriod} />
                  <AdminMiniMetric label="Атрибуции за период" value={businessReport.partners.attributionsInPeriod} />
                  <AdminMiniMetric label="Партнёрские события" value={businessReport.partners.eventsInPeriod} />
                  <AdminMiniMetric label="Активации офферов" value={businessReport.partners.redemptionsInPeriod} />
                </div>
                <div className="admin-report-breakdown-columns">
                  <div><h3>Статусы заявок</h3><AdminReportBreakdownList items={businessReport.coaches.byStatus} total={businessReport.coaches.applicationsTotal} /></div>
                  <div><h3>Интересы коучей</h3><AdminReportBreakdownList items={businessReport.coaches.byInterest} total={businessReport.coaches.byInterest.reduce((sum, item) => sum + item.count, 0)} /></div>
                </div>
                {partnerCoreSnapshot.error ? <p className="admin-report-note error">Partner Core недоступен: {partnerCoreSnapshot.error}</p> : (
                  <p className="admin-report-note">Partner Core: партнёров {partnerCoreSnapshot.partners.length}, конверсий {partnerConversions}, начислений {formatPartnerMoney(partnerLedgerRevenueCents)}.</p>
                )}
              </div>
            </section>

            <section className="admin-report-table-panel">
              <div className="admin-report-panel-heading">
                <div><span className="eyebrow">Текущий срез</span><h2>Подписки и доступы пользователей</h2></div>
                <span>{businessReport.subscriptions.rows.length} строк</span>
              </div>
              <div className="admin-report-table-scroll">
                <table className="admin-report-table">
                  <thead><tr><th>Пользователь</th><th>Продукт</th><th>Тип доступа</th><th>Статус</th><th>Срок</th><th>Обновлено</th></tr></thead>
                  <tbody>{businessReport.subscriptions.rows.map((row) => (
                    <tr key={row.id}>
                      <td><strong>{row.userEmail ?? "Без аккаунта"}</strong><small>{row.userId ?? row.id}</small></td>
                      <td>Навигатор, помесячно<small>{row.source}</small></td>
                      <td>{reportLabel(row.accessType)}</td>
                      <td>{reportLabel(row.status)}{row.cancelAtPeriodEnd && <small>Отмена в конце периода</small>}</td>
                      <td>{formatOptionalReportDate(row.currentPeriodEnd ?? row.trialEndsAt)}</td>
                      <td>{formatAdminDate(row.updatedAt)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </section>

            <section className="admin-report-table-panel">
              <div className="admin-report-panel-heading">
                <div><span className="eyebrow">За выбранный период</span><h2>Платежи</h2></div>
                <span>{businessReport.payments.recent.length} строк</span>
              </div>
              <div className="admin-report-table-scroll">
                <table className="admin-report-table">
                  <thead><tr><th>Дата</th><th>Пользователь</th><th>Продукт</th><th>Статус</th><th>Сумма</th><th>Промокод</th></tr></thead>
                  <tbody>{businessReport.payments.recent.length === 0 ? <tr><td colSpan={6}>Платежей за период нет</td></tr> : businessReport.payments.recent.map((payment) => (
                    <tr key={payment.id}>
                      <td>{formatAdminDate(payment.paidAt ?? payment.createdAt)}</td>
                      <td>{payment.userEmail ?? "Без аккаунта"}</td>
                      <td>Платный отчёт</td>
                      <td>{reportLabel(payment.status)}</td>
                      <td>{formatReportMoney({ amount: payment.amount, currency: payment.currency })}{payment.discountAmount > 0 && <small>Скидка {formatReportMoney({ amount: payment.discountAmount, currency: payment.currency })}</small>}</td>
                      <td>{payment.promoCode ?? "—"}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </section>
          </>}

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

          {section === "integrations" && <section id="admin-telegram-community" className="card stack admin-section-card">
            <div className="admin-section-heading-row">
              <div>
                <h2>ORKEN Community Bot</h2>
                <p className="muted">Отдельный бот для групп. Он не читает личные отчёты, привычки, метрики и переписку основного ORKEN.</p>
              </div>
              <span className={`status ${telegramCommunity.configured ? "done" : "pending"}`}>
                {telegramCommunity.configured ? `Подключён${telegramCommunity.username ? ` · @${telegramCommunity.username}` : ""}` : "Ожидает токен"}
              </span>
            </div>
            {!telegramCommunity.configured && (
              <div className="prompt-output-note">
                <strong>Код готов, отправка выключена</strong>
                <span>После получения токена backend-администратор добавит три server-side переменные и зарегистрирует webhook. Секреты не вводятся в эту форму и не попадают во frontend.</span>
              </div>
            )}
            <div className="grid grid-2">
              <label className="stack">
                <span className="eyebrow">Приветствие в группе</span>
                <textarea className="input text-editor compact" value={telegramCommunityForm.welcomeTemplate} onChange={(event) => setTelegramCommunityForm({ ...telegramCommunityForm, welcomeTemplate: event.target.value })} />
              </label>
              <label className="stack">
                <span className="eyebrow">Утренний фокус</span>
                <textarea className="input text-editor compact" value={telegramCommunityForm.morningTemplate} onChange={(event) => setTelegramCommunityForm({ ...telegramCommunityForm, morningTemplate: event.target.value })} />
              </label>
              <label className="stack">
                <span className="eyebrow">Дневная сверка</span>
                <textarea className="input text-editor compact" value={telegramCommunityForm.middayTemplate} onChange={(event) => setTelegramCommunityForm({ ...telegramCommunityForm, middayTemplate: event.target.value })} />
              </label>
              <label className="stack">
                <span className="eyebrow">Вечерний чек-ин</span>
                <textarea className="input text-editor compact" value={telegramCommunityForm.eveningTemplate} onChange={(event) => setTelegramCommunityForm({ ...telegramCommunityForm, eveningTemplate: event.target.value })} />
              </label>
            </div>
            <label className="stack admin-compact-field">
              <span className="eyebrow">Температура AI</span>
              <input className="input" value={telegramCommunityForm.temperature} onChange={(event) => setTelegramCommunityForm({ ...telegramCommunityForm, temperature: event.target.value })} inputMode="decimal" />
            </label>
            <p className="muted">Системный prompt управляется в разделе «AI и промпты» под ключом <code>telegram.community.system</code>.</p>
            <button className="button" onClick={saveTelegramCommunitySettings}>Сохранить шаблоны community-бота</button>

            <div className="admin-community-list">
              <div>
                <h3>Зарегистрированные группы</h3>
                <p className="muted">Новая группа появляется после добавления бота. Расписание включается командой <code>/activate</code> или здесь.</p>
              </div>
              {telegramCommunity.chats.length === 0 && (
                <div className="admin-empty-state">Пока нет групп. После подключения токена добавьте нового бота в тестовую группу.</div>
              )}
              {telegramCommunity.chats.map((chat) => (
                <div className="admin-community-chat" key={chat.id}>
                  <div className="admin-section-heading-row">
                    <div>
                      <h3>{chat.title || `Telegram ${chat.telegramChatId}`}</h3>
                      <p className="muted">{chat.type} · {chat.memberCount} участников · {chat.commitmentCount} фокусов · {chat.postCount} публикаций</p>
                    </div>
                    <span className={`status ${chat.status === "ACTIVE" ? "done" : "pending"}`}>{chat.status}</span>
                  </div>
                  <div className="grid grid-3">
                    <label className="stack">
                      <span className="eyebrow">Статус</span>
                      <select className="input" value={chat.status} onChange={(event) => editTelegramCommunityChat(chat.id, { status: event.target.value as AdminTelegramCommunityChat["status"] })}>
                        <option value="PENDING">Ожидает активации</option>
                        <option value="ACTIVE">Активна</option>
                        <option value="PAUSED">На паузе</option>
                        <option value="LEFT">Бот удалён</option>
                      </select>
                    </label>
                    <label className="stack">
                      <span className="eyebrow">Часовой пояс</span>
                      <input className="input" value={chat.timezone} onChange={(event) => editTelegramCommunityChat(chat.id, { timezone: event.target.value })} />
                    </label>
                    <label className="stack">
                      <span className="eyebrow">Расписание</span>
                      <select className="input" value={chat.schedulesEnabled ? "true" : "false"} onChange={(event) => editTelegramCommunityChat(chat.id, { schedulesEnabled: event.target.value === "true" })}>
                        <option value="false">Выключено</option>
                        <option value="true">Включено</option>
                      </select>
                    </label>
                    <label className="stack">
                      <span className="eyebrow">AI-ответы</span>
                      <select className="input" value={chat.aiRepliesEnabled ? "true" : "false"} onChange={(event) => editTelegramCommunityChat(chat.id, { aiRepliesEnabled: event.target.value === "true" })}>
                        <option value="true">На упоминание/reply</option>
                        <option value="false">Выключены</option>
                      </select>
                    </label>
                    <label className="stack">
                      <span className="eyebrow">Smart Ping</span>
                      <select className="input" value={chat.smartPingEnabled ? "true" : "false"} onChange={(event) => editTelegramCommunityChat(chat.id, { smartPingEnabled: event.target.value === "true" })}>
                        <option value="false">Выключен</option>
                        <option value="true">Только участники с согласием</option>
                      </select>
                    </label>
                  </div>
                  <div className="grid grid-3">
                    <label className="stack"><span className="eyebrow">Утро</span><input className="input" type="time" value={chat.morningTime} onChange={(event) => editTelegramCommunityChat(chat.id, { morningTime: event.target.value })} /></label>
                    <label className="stack"><span className="eyebrow">День</span><input className="input" type="time" value={chat.middayTime} onChange={(event) => editTelegramCommunityChat(chat.id, { middayTime: event.target.value })} /></label>
                    <label className="stack"><span className="eyebrow">Вечер</span><input className="input" type="time" value={chat.eveningTime} onChange={(event) => editTelegramCommunityChat(chat.id, { eveningTime: event.target.value })} /></label>
                    <label className="stack"><span className="eyebrow">Тишина с</span><input className="input" type="time" value={chat.quietHoursStart} onChange={(event) => editTelegramCommunityChat(chat.id, { quietHoursStart: event.target.value })} /></label>
                    <label className="stack"><span className="eyebrow">Тишина до</span><input className="input" type="time" value={chat.quietHoursEnd} onChange={(event) => editTelegramCommunityChat(chat.id, { quietHoursEnd: event.target.value })} /></label>
                  </div>
                  <div className="admin-community-actions">
                    <button className="button" onClick={() => saveTelegramCommunityChat(chat)}>Сохранить группу</button>
                    <input className="input" value={communityAnnouncements[chat.id] ?? ""} onChange={(event) => setCommunityAnnouncements((current) => ({ ...current, [chat.id]: event.target.value }))} placeholder="Разовое объявление без AI" />
                    <button className="button secondary" disabled={!telegramCommunity.configured} onClick={() => sendTelegramCommunityAnnouncement(chat)}>Отправить</button>
                  </div>
                </div>
              ))}
            </div>
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
                <Link className="button secondary" href="/coaches" target="_blank">Открыть страницу для коучей</Link>
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
                ["applications", "Заявки коучей"],
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
                <AdminMiniMetric label="Новые заявки" value={coachApplications.filter((item) => item.status === "NEW").length} />
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
                  <button onClick={() => setPartnerAdminView("applications")} type="button"><strong>2. Заявки коучей</strong><span>Новые кандидаты с публичной страницы</span></button>
                  <button onClick={() => setPartnerAdminView("partners")} type="button"><strong>3. Партнёры</strong><span>Доступ и текущие результаты</span></button>
                  <button onClick={() => setPartnerAdminView("offers")} type="button"><strong>4. Предложения</strong><span>Создание и отправка на проверку</span></button>
                </div>
              </div>
            </>}

            {partnerAdminView === "applications" && <div className="stack admin-partner-view">
              <div>
                <h3>Заявки коучей</h3>
                <p className="muted">Лиды с закрытой страницы `/coaches`. Одобрение заявки не создаёт партнёра автоматически: аккаунт оформляется в Partner Core после согласования.</p>
              </div>
              <div className="admin-program-list">
                {coachApplications.length === 0 ? <p className="muted">Заявок пока нет</p> : coachApplications.map((application) => (
                  <div className="admin-program-row" key={application.id}>
                    <div>
                      <strong>{application.fullName} · {coachApplicationStatusLabel(application.status)}</strong>
                      <span>{application.email}{application.telegram ? ` · ${application.telegram}` : ""}{application.city ? ` · ${application.city}` : ""}</span>
                      <span>Формат: {coachPracticeFormatLabel(application.practiceFormat)} · опыт {application.experienceYears ?? "—"} · клиентов {application.activeClients ?? "—"}</span>
                      <span>Интересы: {application.interests.map(coachInterestLabel).join(", ")}</span>
                      {application.message && <span>Комментарий: {application.message}</span>}
                      <span>Материал: {application.materialOpenedAt ? `открыт ${formatAdminDate(application.materialOpenedAt)}` : "не открыт"} · письмо {coachDeliveryStatusLabel(application.applicantEmailStatus)} · {formatAdminDate(application.createdAt)}</span>
                    </div>
                    <label className="admin-field admin-compact-field"><span>Статус</span><select className="input" value={application.status} onChange={(event) => void setCoachApplicationStatus(application.id, event.target.value as CoachPartnershipLeadStatus)} disabled={loading}><option value="NEW">Новая</option><option value="CONTACTED">Связались</option><option value="APPROVED">Одобрена</option><option value="REJECTED">Отклонена</option></select></label>
                  </div>
                ))}
              </div>
            </div>}

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

          {section === "coaches" && coachPlatform && <AdminCoachesPanel snapshot={coachPlatform} refresh={refresh} setMessage={setMessage} />}

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

function coachApplicationStatusLabel(status: CoachPartnershipLeadStatus) {
  return ({ NEW: "Новая", CONTACTED: "Связались", APPROVED: "Одобрена", REJECTED: "Отклонена" } as const)[status];
}

function coachPracticeFormatLabel(format: string) {
  return ({ individual: "Индивидуальная работа", groups: "Группы", corporate: "Корпоративный", education: "Обучение", mixed: "Смешанный" } as Record<string, string>)[format] ?? format;
}

function coachInterestLabel(interest: string) {
  return ({ wholesale: "Пакеты", referral: "Рекомендации", marketplace: "Витрина", white_label: "White Label", personal: "Личное сопровождение" } as Record<string, string>)[interest] ?? interest;
}

function coachDeliveryStatusLabel(status: string) {
  if (status === "SENT") return "отправлено";
  if (status === "FAILED") return "ошибка отправки";
  return "ожидает отправки";
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

function reportLabel(value: string) {
  const labels: Record<string, string> = {
    PAID_SUBSCRIPTION: "Платная подписка",
    STANDARD_TRIAL: "Обычный trial",
    GIFTED_DAYS: "Подаренные дни",
    PARTNER_BONUS: "Партнёрский бонус",
    FREE_ACCESS: "Бесплатный доступ",
    ACTIVE: "Активна",
    TRIAL: "Trial",
    EXPIRED_TRIAL: "Trial истёк",
    PAUSED: "Приостановлена",
    CANCEL_AT_PERIOD_END: "Отмена в конце периода",
    CANCELED: "Отменена",
    SUCCEEDED: "Успешно",
    FAILED: "Ошибка",
    PENDING: "Ожидает",
    REFUNDED: "Возврат",
    DONE: "Готово",
    PROCESSING: "Обрабатывается",
    QUEUED: "В очереди",
    NEW: "Новая",
    CONTACTED: "Связались",
    APPROVED: "Одобрена",
    REJECTED: "Отклонена",
    wholesale: "Пакеты",
    referral: "Реферальная программа",
    marketplace: "Витрина",
    white_label: "White Label",
    personal: "Личное сопровождение",
    individual: "Индивидуальная работа",
    groups: "Группы",
    corporate: "Корпоративный формат",
    education: "Обучение",
    mixed: "Смешанный формат",
    SIGNUP: "Регистрации",
    PAYMENT: "Платежи",
    REDEMPTION: "Активации",
    REFUND: "Возвраты",
    CUSTOMER_BONUS: "Бонусы"
  };
  return labels[value] ?? value;
}

function formatReportMoney(total: { amount: number; currency: string }) {
  try {
    return new Intl.NumberFormat("ru-RU", {
      style: "currency",
      currency: total.currency.toUpperCase(),
      maximumFractionDigits: 2
    }).format(total.amount / 100);
  } catch {
    return `${(total.amount / 100).toFixed(2)} ${total.currency.toUpperCase()}`;
  }
}

function formatReportMoneyList(totals: Array<{ amount: number; currency: string }>) {
  return totals.length ? totals.map(formatReportMoney).join(" · ") : "—";
}

function percentOf(value: number, total: number) {
  return total > 0 ? Math.round((value / total) * 1000) / 10 : 0;
}

function formatReportDateRange(from: string, to: string) {
  const formatter = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short", year: "numeric" });
  return `${formatter.format(new Date(from))} — ${formatter.format(new Date(to))}`;
}

function formatOptionalReportDate(value?: string | null) {
  return value ? formatAdminDate(value) : "Без ограничения";
}

function AdminReportBreakdownList({ items, total }: { items: AdminReportBreakdown[]; total: number }) {
  if (items.length === 0) return <p className="muted">Данных за период нет</p>;
  return (
    <div className="admin-report-breakdown">
      {items.map((item) => {
        const percent = percentOf(item.count, total);
        return (
          <div className="admin-report-breakdown-row" key={item.key}>
            <div><span>{reportLabel(item.key)}</span><strong>{item.count} · {percent}%</strong></div>
            <div className="admin-report-breakdown-track"><span style={{ width: `${percent}%` }} /></div>
          </div>
        );
      })}
    </div>
  );
}

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadAdminBusinessReport(report: AdminBusinessReport, partnerCore: PartnerCoreAdminSnapshot) {
  const rows: unknown[][] = [
    ["ORKEN.LIFE — управленческий отчёт"],
    ["Период", report.range.from, report.range.to],
    ["Сформирован", report.generatedAt],
    [],
    ["Сводка", "Значение"],
    ["Всего пользователей", report.users.total],
    ["Новые пользователи", report.users.newInPeriod],
    ["Активные пользователи", report.users.activeInPeriod],
    ["Диагностики", report.diagnostics.createdInPeriod],
    ["Успешные платежи", report.payments.succeededInPeriod],
    ["Выручка отчётов", formatReportMoneyList(report.payments.revenue)],
    ["Платные подписки", report.subscriptions.paidCurrent],
    ["Расчётный MRR", formatReportMoney(report.subscriptions.estimatedMrr)],
    ["Расчётный ARR", formatReportMoney(report.subscriptions.estimatedArr)],
    ["Заявки коучей", report.coaches.applicationsTotal],
    ["Партнёры Orken", partnerCore.partners.length],
    [],
    ["Подписки", "Email", "План", "Тип доступа", "Статус", "Trial до", "Оплаченный период до", "Обновлено"],
    ...report.subscriptions.rows.map((row) => [
      row.id,
      row.userEmail,
      "Навигатор привычек — помесячно",
      reportLabel(row.accessType),
      reportLabel(row.status),
      row.trialEndsAt,
      row.currentPeriodEnd,
      row.updatedAt
    ]),
    [],
    ["Платежи", "Email", "Продукт", "Статус", "Сумма", "Валюта", "Скидка", "Промокод", "Дата"],
    ...report.payments.recent.map((payment) => [
      payment.id,
      payment.userEmail,
      "Платный диагностический отчёт",
      reportLabel(payment.status),
      payment.amount,
      payment.currency,
      payment.discountAmount,
      payment.promoCode,
      payment.paidAt ?? payment.createdAt
    ]),
    [],
    ["Коучи — статусы", "Количество"],
    ...report.coaches.byStatus.map((item) => [reportLabel(item.key), item.count]),
    [],
    ["Партнёры", "Email", "Тип", "Статус", "Ссылки", "Конверсии", "Начислено, центы"],
    ...partnerCore.partners.map((partner) => [
      partner.id,
      partner.email,
      partner.account_type,
      partner.project_status,
      partner.referral_links_count,
      partner.conversions_count,
      partner.payable_cents
    ])
  ];
  const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(";")).join("\r\n")}`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `orken-report-${report.generatedAt.slice(0, 10)}.csv`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
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

const coachPublicContentFields: Array<{ key: keyof CoachPublicContent; label: string; multiline?: boolean }> = [
  { key: "heroEyebrow", label: "Надпись над главным заголовком" },
  { key: "heroTitle", label: "Главный заголовок" },
  { key: "heroLead", label: "Описание в первом экране", multiline: true },
  { key: "heroPrimaryCta", label: "Основная кнопка" },
  { key: "heroSecondaryCta", label: "Вторая кнопка" },
  { key: "pricingEyebrow", label: "Надпись над тарифами" },
  { key: "pricingTitle", label: "Заголовок тарифов" },
  { key: "pricingLead", label: "Пояснение тарифов", multiline: true },
  { key: "applicationEyebrow", label: "Надпись над заявкой" },
  { key: "applicationTitle", label: "Заголовок заявки" },
  { key: "applicationLead", label: "Пояснение заявки", multiline: true },
  { key: "applicationSubmitLabel", label: "Кнопка отправки заявки" }
];

function AdminCoachesPanel({ snapshot, refresh, setMessage }: { snapshot: AdminCoachPlatformSnapshot; refresh: () => Promise<void>; setMessage: (value: string) => void }) {
  const [view, setView] = useState<"profiles" | "plans" | "subscriptions" | "offers" | "sites" | "orders" | "rewards" | "content" | "settings">("profiles");
  const [drafts, setDrafts] = useState<Record<string, { amount: string; support?: string; coachShare?: string; platformShare?: string }>>({});
  const [overridePlan, setOverridePlan] = useState<Record<string, string>>({});
  const [overrideAmount, setOverrideAmount] = useState<Record<string, string>>({});
  const [cancelHours, setCancelHours] = useState(String(snapshot.cancellationPolicy.hoursBeforeStart));
  const [refundPercent, setRefundPercent] = useState(String(snapshot.cancellationPolicy.refundPercent));
  const [publicContent, setPublicContent] = useState<CoachPublicContent>(snapshot.publicContent);
  const [page, setPage] = useState(0);
  const pageSize = 20;
  useEffect(() => setPage(0), [view]);
  const profileRows = snapshot.profiles.slice(page * pageSize, (page + 1) * pageSize);
  const subscriptionRows = snapshot.subscriptions.slice(page * pageSize, (page + 1) * pageSize);
  const orderRows = snapshot.orders.slice(page * pageSize, (page + 1) * pageSize);
  async function action(run: () => Promise<unknown>, success: string) {
    try { await run(); setMessage(success); await refresh(); } catch (reason) { setMessage(reason instanceof Error ? reason.message : "Операция не выполнена"); }
  }
  return <section className="card stack admin-section-card">
    <div className="admin-partner-subnav">
      {([['profiles','Профили'],['plans','Пакеты'],['subscriptions','Подписки'],['offers','Услуги'],['sites','Сайты'],['orders','Заказы'],['rewards','Награды'],['content','Публичная страница'],['settings','Правила']] as const).map(([id,label])=><button key={id} className={view===id?"active":""} onClick={()=>setView(id)}>{label}</button>)}
    </div>
    {view==="profiles"&&<><div className="admin-table-wrap"><table className="admin-data-table"><thead><tr><th>Коуч</th><th>Статус</th><th>Заказы</th><th>Адрес</th><th>Действия и цена</th></tr></thead><tbody>{profileRows.map(profile=>{const planId=overridePlan[profile.id]||snapshot.plans[0]?.id||"";const amount=overrideAmount[profile.id]||"";return <tr key={profile.id}><td><strong>{profile.displayName}</strong><small>{profile.city||"Город не указан"}</small></td><td><span className="admin-status-pill">{profile.status}</span></td><td>{profile.acceptingOrders?"Принимает":"Закрыты"}</td><td>/coaches/{profile.slug}</td><td><div className="row wrap"><button className="button compact" disabled={profile.status==="APPROVED"} onClick={()=>action(()=>adminApi.setCoachProfileStatus(profile.id,{status:"APPROVED"}),"Профиль одобрен")}>Одобрить</button><button className="button secondary compact" onClick={()=>action(()=>adminApi.setCoachProfileStatus(profile.id,{status:"SUSPENDED"}),"Профиль приостановлен")}>Приостановить</button></div><details className="admin-inline-details"><summary>Индивидуальная цена пакета</summary><select className="input" value={planId} onChange={e=>setOverridePlan(v=>({...v,[profile.id]:e.target.value}))}>{snapshot.plans.map(plan=><option value={plan.id} key={plan.id}>{plan.name}</option>)}</select><input className="input" type="number" min="0" step="0.01" placeholder="Цена, $" value={amount} onChange={e=>setOverrideAmount(v=>({...v,[profile.id]:e.target.value}))}/><button className="button compact" disabled={!planId||Number(amount)<=0} onClick={()=>action(()=>adminApi.setCoachPlanOverride(profile.id,planId,{amount:Math.round(Number(amount)*100),currency:"usd",active:true}),"Индивидуальная цена сохранена")}>Сохранить цену</button></details></td></tr>})}</tbody></table></div><AdminPager page={page} total={snapshot.profiles.length} pageSize={pageSize} setPage={setPage}/></>}
    {view==="plans"&&<div className="admin-card-grid">{snapshot.plans.map(plan=>{const draft=drafts[plan.id]?.amount??String(plan.amount/100);return <article className="admin-subcard" key={plan.id}><span className="admin-status-pill">{plan.includedClients??"Custom"} мест</span><h3>{plan.name}</h3><p>{plan.description}</p><label>Цена, $<input className="input" type="number" min="0" step="0.01" value={draft} onChange={e=>setDrafts(v=>({...v,[plan.id]:{...v[plan.id],amount:e.target.value}}))}/></label><div className="row wrap"><button className="button compact" onClick={()=>action(()=>adminApi.createCoachPlanPrice(plan.id,{amount:Math.round(Number(draft)*100),currency:plan.currency,migrationMode:"NEW_ONLY"}),"Цена для новых продаж сохранена")}>Только новые</button><button className="button secondary compact" onClick={()=>action(()=>adminApi.createCoachPlanPrice(plan.id,{amount:Math.round(Number(draft)*100),currency:plan.currency,migrationMode:"NEXT_RENEWAL"}),"Цена обновится при продлении")}>Со следующего продления</button></div></article>})}</div>}
    {view==="subscriptions"&&<><div className="admin-table-wrap"><table className="admin-data-table"><thead><tr><th>Коуч</th><th>Пакет</th><th>Статус</th><th>Лимит</th><th>Сумма</th><th>Следующее продление</th></tr></thead><tbody>{subscriptionRows.map(row=><tr key={row.id}><td><strong>{row.coach}</strong></td><td>{row.plan}</td><td><span className="admin-status-pill">{row.status}</span></td><td>{row.clientLimit ?? "Индивидуально"}</td><td>{formatAdminMoney(row.amount,row.currency)}</td><td>{row.currentPeriodEnd ? new Intl.DateTimeFormat("ru-RU",{dateStyle:"medium"}).format(new Date(row.currentPeriodEnd)) : "—"}</td></tr>)}</tbody></table></div><AdminPager page={page} total={snapshot.subscriptions.length} pageSize={pageSize} setPage={setPage}/></>}
    {view==="offers"&&<div className="admin-card-grid">{snapshot.offers.map(offer=>{const d=drafts[offer.id]??{amount:String(offer.amount/100),coachShare:offer.coachShareBps==null?"":String(offer.coachShareBps/100),platformShare:offer.platformShareBps==null?"":String(offer.platformShareBps/100)};const splitValid=Number(d.coachShare)>=0&&Number(d.platformShare)>=0&&Number(d.coachShare)+Number(d.platformShare)===100;return <article className="admin-subcard" key={offer.id}><span className="admin-status-pill">{offer.status}</span><h3>{offer.title}</h3><p>{offer.description}</p><div className="grid grid-2"><label>Доля коуча, %<input className="input" type="number" min="0" max="100" step="0.01" value={d.coachShare} onChange={e=>setDrafts(v=>({...v,[offer.id]:{...d,coachShare:e.target.value}}))}/></label><label>Доля платформы, %<input className="input" type="number" min="0" max="100" step="0.01" value={d.platformShare} onChange={e=>setDrafts(v=>({...v,[offer.id]:{...d,platformShare:e.target.value}}))}/></label></div>{!splitValid&&<p>Сумма долей должна быть ровно 100%.</p>}<button className="button compact" disabled={!splitValid} onClick={()=>action(()=>adminApi.setCoachOfferStatus(offer.id,{status:"APPROVED",coachShareBps:Math.round(Number(d.coachShare)*100),platformShareBps:Math.round(Number(d.platformShare)*100)}),"Услуга опубликована")}>Настроить и одобрить</button></article>})}</div>}
    {view==="sites"&&<div className="admin-card-grid">{snapshot.sitePlans.map(plan=>{const d=drafts[plan.id]??{amount:String(plan.setupAmount/100),support:String(plan.monthlySupportAmount/100)};return <article className="admin-subcard" key={plan.id}><h3>{plan.name}</h3><label>Подключение, $<input className="input" type="number" min="0" step="0.01" value={d.amount} onChange={e=>setDrafts(v=>({...v,[plan.id]:{...d,amount:e.target.value}}))}/></label><label>Поддержка в месяц, $<input className="input" type="number" min="0" step="0.01" value={d.support} onChange={e=>setDrafts(v=>({...v,[plan.id]:{...d,support:e.target.value}}))}/></label><button className="button compact" onClick={()=>action(()=>adminApi.updateCoachSitePlan(plan.id,{setupAmount:Math.round(Number(d.amount)*100),monthlySupportAmount:Math.round(Number(d.support)*100),currency:plan.currency,active:plan.active}),"Цена сайта сохранена")}>Сохранить</button></article>})}</div>}
    {view==="orders"&&<><div className="admin-table-wrap"><table className="admin-data-table"><thead><tr><th>Коуч</th><th>Клиент</th><th>Услуга</th><th>Статус</th><th>Сумма</th></tr></thead><tbody>{orderRows.map(row=><tr key={row.id}><td>{row.coach}</td><td>{row.client}</td><td>{row.service}</td><td>{row.status}</td><td>{formatAdminMoney(row.amount,row.currency)}</td></tr>)}</tbody></table></div><AdminPager page={page} total={snapshot.orders.length} pageSize={pageSize} setPage={setPage}/></>}
    {view==="rewards"&&<div className="admin-card-grid">{snapshot.rewardsPendingReview.map(reward=><article className="admin-subcard" key={reward.id}><h3>{reward.title}</h3><p>{reward.description}</p><strong>{reward.pointsCost} ORKEN Points</strong><div className="row wrap"><button className="button compact" onClick={()=>action(()=>adminApi.setCoachRewardStatus(reward.id,{status:"APPROVED"}),"Награда одобрена")}>Одобрить</button><button className="button secondary compact" onClick={()=>action(()=>adminApi.setCoachRewardStatus(reward.id,{status:"REJECTED"}),"Награда отклонена")}>Отклонить</button></div></article>)}</div>}
    {view==="content"&&<div className="admin-card-grid"><article className="admin-subcard admin-content-editor"><h3>Публичная страница /for-coaches</h3><p>Тексты применяются после сохранения. Цены и описания пакетов меняются во вкладках «Пакеты» и «Сайты».</p>{coachPublicContentFields.map(field=><label key={field.key}>{field.label}{field.multiline?<textarea className="input" rows={4} value={publicContent[field.key]} onChange={e=>setPublicContent(value=>({...value,[field.key]:e.target.value}))}/>:<input className="input" value={publicContent[field.key]} onChange={e=>setPublicContent(value=>({...value,[field.key]:e.target.value}))}/>}</label>)}<button className="button compact" onClick={()=>action(()=>adminApi.upsertSetting("coach_public_content_ru",publicContent),"Публичные тексты сохранены")}>Сохранить тексты</button></article></div>}
    {view==="settings"&&<div className="admin-card-grid"><article className="admin-subcard"><h3>Отмена консультации</h3><p>Правило применяется одинаково ко всем забронированным консультациям.</p><label>Не позднее чем за, часов<input className="input" type="number" min="0" max="720" value={cancelHours} onChange={e=>setCancelHours(e.target.value)}/></label><label>Размер возврата, %<input className="input" type="number" min="0" max="100" value={refundPercent} onChange={e=>setRefundPercent(e.target.value)}/></label><button className="button compact" onClick={()=>action(async()=>{await adminApi.upsertSetting("coach_consultation_cancel_hours",Number(cancelHours));await adminApi.upsertSetting("coach_consultation_refund_percent",Number(refundPercent))},"Правила отмены сохранены")}>Сохранить правила</button></article></div>}
  </section>;
}

function AdminPager({ page, total, pageSize, setPage }: { page: number; total: number; pageSize: number; setPage: (value: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return <div className="admin-pagination"><button className="button secondary compact" disabled={page <= 0} onClick={() => setPage(Math.max(0, page - 1))}>Назад</button><span>Страница {page + 1} из {pages}</span><button className="button secondary compact" disabled={page >= pages - 1} onClick={() => setPage(Math.min(pages - 1, page + 1))}>Далее</button></div>;
}

function formatAdminMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency: currency.toUpperCase(), maximumFractionDigits: 0 }).format(amount / 100);
}
