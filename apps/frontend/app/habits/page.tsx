"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  Archive,
  Bot,
  CalendarPlus,
  CheckCircle2,
  ChevronDown,
  Circle,
  Compass,
  RotateCcw,
  Save,
  Sparkles,
  Trophy,
  User
} from "lucide-react";
import type { HabitConfigResponse, HabitEnrollmentSummary, HabitProgramResponse, HabitProgramSummary, TelegramStatusResponse } from "@levelup/contracts";
import { api, getStoredLocale, restoreSessionFromUrl, type TextLocale } from "@/lib/api";
import { useSiteText } from "@/lib/useSiteText";

type Tab = "dashboard" | "journey" | "habits" | "navigator" | "archive" | "guide" | "settings";
type DetailTab = "essence" | "practice" | "why";
type ArchiveFilter = "all" | "insights" | "rewards" | "weeks";
type HabitStartFocus = "energy" | "focus" | "career" | "rhythm";
type OnboardingStep = "choice" | "questions" | "activating";
type OnboardingZone = "passion" | "mission" | "profession" | "vocation";
type TelegramFrequency = "off" | "daily" | "weekdays" | "weekly";
type ChatMessage = { role: "user" | "assistant"; text: string };
type NavItem = { id: Tab; icon: string } | { id: Tab; penguin: true };

const logoSrc = "/assets/levelup-logo.jpg";

const navItems: NavItem[] = [
  { id: "dashboard", icon: "⬡" },
  { id: "journey", icon: "🧭" },
  { id: "habits", icon: "✦" },
  { id: "navigator", penguin: true },
  { id: "archive", icon: "📚" },
  { id: "guide", icon: "📖" },
  { id: "settings", icon: "⚙" }
];

const mobileNavItems: NavItem[] = [
  { id: "dashboard", icon: "⬡" },
  { id: "journey", icon: "🧭" },
  { id: "navigator", penguin: true },
  { id: "archive", icon: "📚" }
];

const cycleVisuals = [
  { icon: "🌱", color: "#00d4ff" },
  { icon: "🚀", color: "#a855f7" },
  { icon: "🌿", color: "#10b981" },
  { icon: "🌟", color: "#f59e0b" }
] as const;

const zoneIds = ["passion", "mission", "profession", "vocation", "resource", "clarity", "stability", "ikigai"] as const;
const onboardingZones: OnboardingZone[] = ["passion", "mission", "profession", "vocation"];
const todayIso = () => new Date().toISOString().slice(0, 10);

export default function HabitsPage() {
  return (
    <Suspense fallback={<HabitsLoading />}>
      <HabitsContent />
    </Suspense>
  );
}

function PenguinIcon({ size = 24, className = "" }: { size?: number; className?: string }) {
  return (
    <img
      src={logoSrc}
      alt="Пингви"
      width={size}
      height={size}
      className={className}
      style={{ objectFit: "contain", display: "inline-block", borderRadius: "50%" }}
    />
  );
}

function PenguinHeadIcon({ size = 24 }: { size?: number }) {
  return (
    <span className="habits-penguin-head" style={{ width: size, height: size }}>
      <img
        src={logoSrc}
        alt="Пингви"
        width={Math.round(size * 1.55)}
        height={Math.round(size * 1.55)}
      />
    </span>
  );
}

function NavIcon({ item, size }: { item: NavItem; size: number }) {
  if ("penguin" in item) return <PenguinHeadIcon size={size + 5} />;
  return <span className="habits-nav-symbol" style={{ width: size + 5, height: size + 5 }}>{item.icon}</span>;
}

function HabitsLoading() {
  return (
    <main className="habits-app habits-single">
      <section className="habits-panel">
        <div className="eyebrow">ORKEN.LIFE</div>
        <h1>Загружаем кабинет привычек...</h1>
      </section>
    </main>
  );
}

function HabitsContent() {
  const searchParams = useSearchParams();
  const analysisId = searchParams.get("analysisId");
  const entryPoint = searchParams.get("from");
  const [locale, setLocale] = useState<TextLocale>("ru");
  const t = useSiteText(locale).habits.app;

  const [tab, setTab] = useState<Tab>("dashboard");
  const [showMobileMore, setShowMobileMore] = useState(false);
  const [program, setProgram] = useState<HabitProgramSummary | null>(null);
  const [config, setConfig] = useState<HabitConfigResponse | null>(null);
  const [latestReport, setLatestReport] = useState<{ analysisId: string; profession?: string | null; summary?: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [savedMessage, setSavedMessage] = useState("");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [dailyFeedback, setDailyFeedback] = useState("");
  const [metricSavedFlash, setMetricSavedFlash] = useState(false);
  const [insightSavedFlash, setInsightSavedFlash] = useState(false);
  const [telegramStatus, setTelegramStatus] = useState<TelegramStatusResponse | null>(null);
  const [telegramBusy, setTelegramBusy] = useState(false);

  const [onboardingStep, setOnboardingStep] = useState<OnboardingStep>("choice");
  const [onboardingQuestionIndex, setOnboardingQuestionIndex] = useState(0);
  const [onboardingAnswers, setOnboardingAnswers] = useState<Partial<Record<OnboardingZone, number>>>({});
  const [activatingFromReport, setActivatingFromReport] = useState(false);

  const [startFocus, setStartFocus] = useState<HabitStartFocus>("rhythm");
  const [startName, setStartName] = useState("");
  const [startZone, setStartZone] = useState<string>("clarity");
  const [energy, setEnergy] = useState(6);
  const [clarity, setClarity] = useState(6);
  const [stability, setStability] = useState(6);
  const [note, setNote] = useState("");
  const [insight, setInsight] = useState("");
  const [microStepIndex, setMicroStepIndex] = useState(0);
  const [detailTab, setDetailTab] = useState<DetailTab>("practice");
  const [selectedCycle, setSelectedCycle] = useState<number | "all">("all");
  const [expandedHabitId, setExpandedHabitId] = useState<string | null>(null);
  const [archiveFilter, setArchiveFilter] = useState<ArchiveFilter>("all");
  const [chatInput, setChatInput] = useState("");
  const [threadId, setThreadId] = useState<string | undefined>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [showCoachmark, setShowCoachmark] = useState(false);

  const [settingsName, setSettingsName] = useState("");
  const [settingsZone, setSettingsZone] = useState<string>("clarity");
  const [settingsAvatar, setSettingsAvatar] = useState("P");
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [reminderTime, setReminderTime] = useState("09:00");

  useEffect(() => {
    setLocale(getStoredLocale());
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        restoreSessionFromUrl();
        const telegramLoginToken = typeof window !== "undefined" ? new URL(window.location.href).searchParams.get("telegramLogin") : null;
        if (telegramLoginToken) {
          await api.verifyTelegramWebLogin(telegramLoginToken);
          const url = new URL(window.location.href);
          url.searchParams.delete("telegramLogin");
          window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
        }
        if (analysisId) {
          const result = await api.activateHabitsFromReport(analysisId);
          if (!cancelled) applyProgramResponse(result);
          return;
        }
        const result = await api.habitsMe();
        if (!cancelled) {
          setProgram(result.program);
          setConfig(result.config);
          setLatestReport(result.latestReport);
          void api.trackEvent(entryPoint === "account" ? "habits_opened_from_account" : "habits_opened", {
            hasProgram: Boolean(result.program),
            hasLatestReport: Boolean(result.latestReport),
            entryPoint
          }).catch(() => undefined);
        }
      } catch (reason) {
        if (!cancelled) setError(readableError(reason, t.errors.open));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [analysisId, entryPoint, t.errors.open]);

  useEffect(() => {
    if (!program) return;
    setSettingsName(readProfileString(program.profile, "name"));
    setSettingsZone(readProfileString(program.profile, "onboardingWeakZone") || program.weakZone || "clarity");
    setSettingsAvatar(readProfileString(program.profile, "avatar") || "P");
    setReminderEnabled(program.settings.reminderEnabled);
    setReminderTime(program.settings.reminderTime || "09:00");
  }, [program]);

  useEffect(() => {
    if (!program || typeof window === "undefined") return;
    const key = `orken_habits_coachmark_v1_${program.id}`;
    setShowCoachmark(window.localStorage.getItem(key) !== "1");
  }, [program?.id]);

  useEffect(() => {
    if (tab !== "dashboard") setShowCoachmark(false);
  }, [tab]);

  useEffect(() => {
    if (!program) {
      setTelegramStatus(null);
      return;
    }
    let cancelled = false;
    api.telegramStatus(program.id)
      .then((status) => {
        if (!cancelled) setTelegramStatus(status);
      })
      .catch(() => {
        if (!cancelled) setTelegramStatus(null);
      });
    return () => {
      cancelled = true;
    };
  }, [program?.id]);

  const activeHabit = program?.activeEnrollment ?? program?.enrollments[0] ?? null;
  const latestMetric = program?.metrics[0];
  const doneToday = Boolean(activeHabit?.checkins.some((checkin) => checkin.date === todayIso() && checkin.completed));
  const zoneOptions = useMemo(() => zoneIds.map((id) => ({ id, label: t.zones[id] })), [t]);
  const microSteps = useMemo(() => [
    activeHabit?.practice ?? "Выбери один маленький шаг на 10 минут и остановись на нем.",
    activeHabit ? `Облегченный вариант: 5 минут на тему «${activeHabit.title}», без идеального результата.` : "Облегченный вариант: 5 минут внимания к состоянию.",
    "Запиши одну фразу: что сейчас даст больше ресурса, ясности или движения вперед?"
  ], [activeHabit]);
  const microStepText = microSteps[microStepIndex % microSteps.length];
  const navigatorContext = useMemo(() => ({
    mode: tab === "dashboard" ? "state" : tab === "journey" ? "path" : "chat",
    cycle: program ? `${t.stats.cycle} ${program.currentCycle}` : undefined,
    week: program?.currentWeek,
    habit: activeHabit?.title,
    weakZone: program?.weakZone ?? undefined,
    topRole: program?.topRole ?? undefined,
    energy,
    clarity,
    stability,
    streakDays: program?.stats.streakDays,
    careerAction: program?.careerAction ?? undefined,
    recentInsight: program?.insights[0]?.text
  }), [activeHabit?.title, clarity, energy, program, stability, tab]);

  function applyProgramResponse(result: HabitProgramResponse) {
    setProgram(result.program);
    setConfig(result.config);
  }

  function markSaved(message: string) {
    setSavedMessage(message);
    setSavedAt(new Date());
    setError("");
  }

  function dismissCoachmark() {
    if (program && typeof window !== "undefined") {
      window.localStorage.setItem(`orken_habits_coachmark_v1_${program.id}`, "1");
    }
    setShowCoachmark(false);
  }

  async function startFromLatestReport() {
    if (!latestReport) return;
    setActivatingFromReport(true);
    setOnboardingStep("activating");
    setBusy(true);
    setError("");
    try {
      const result = await api.activateHabitsFromReport(latestReport.analysisId);
      applyProgramResponse(result);
      setLatestReport(null);
      markSaved(program ? t.messages.programUpdated : t.messages.programSaved);
    } catch (reason) {
      setError(readableError(reason, t.errors.activate));
      setOnboardingStep("choice");
    } finally {
      setBusy(false);
      setActivatingFromReport(false);
    }
  }

  async function startManualProgram(focus: HabitStartFocus = startFocus, weakZone: string = startZone) {
    setActivatingFromReport(false);
    setOnboardingStep("activating");
    setBusy(true);
    setError("");
    try {
      const result = await api.startHabitProgramWithProfile({
        focus,
        name: startName.trim() || undefined,
        weakZone,
        reminderTime
      });
      applyProgramResponse(result);
      setLatestReport(null);
      markSaved(t.messages.programSaved);
    } catch (reason) {
      setError(readableError(reason, t.errors.start));
      setOnboardingStep("questions");
    } finally {
      setBusy(false);
    }
  }

  function answerOnboardingQuestion(score: number) {
    const zone = onboardingZones[onboardingQuestionIndex];
    const nextAnswers = { ...onboardingAnswers, [zone]: score };
    setOnboardingAnswers(nextAnswers);
    if (onboardingQuestionIndex < onboardingZones.length - 1) {
      setOnboardingQuestionIndex((value) => value + 1);
      return;
    }

    const result = calculateOnboardingStart(nextAnswers);
    setStartZone(result.weakZone);
    setStartFocus(result.focus);
    void startManualProgram(result.focus, result.weakZone);
  }

  async function saveMetric() {
    if (!program) return;
    setBusy(true);
    try {
      const result = await api.saveHabitMetric({ programId: program.id, energy, clarity, stability });
      applyProgramResponse(result);
      setMetricSavedFlash(true);
      window.setTimeout(() => setMetricSavedFlash(false), 1800);
      markSaved(t.messages.metricSaved);
    } catch (reason) {
      setError(readableError(reason, t.errors.metric));
    } finally {
      setBusy(false);
    }
  }

  async function saveCheckin(habit: HabitEnrollmentSummary | null = activeHabit, completed = true, noteOverride?: string) {
    if (!program || !habit) return;
    setBusy(true);
    try {
      const result = await api.saveHabitCheckin({
        programId: program.id,
        enrollmentId: habit.id,
        completed,
        note: noteOverride ?? (note.trim() || undefined),
        energy,
        clarity,
        stability
      });
      applyProgramResponse(result);
      setNote("");
      const message = completed ? t.messages.checkinSaved : t.messages.checkinRemoved;
      setDailyFeedback(message);
      markSaved(message);
    } catch (reason) {
      setError(readableError(reason, t.errors.checkin));
    } finally {
      setBusy(false);
    }
  }

  async function saveInsight() {
    if (!program || !insight.trim()) return;
    setBusy(true);
    try {
      const result = await api.saveHabitInsight({
        programId: program.id,
        enrollmentId: activeHabit?.id,
        text: insight.trim()
      });
      applyProgramResponse(result);
      setInsight("");
      setDailyFeedback(t.messages.insightSaved);
      setInsightSavedFlash(true);
      window.setTimeout(() => setInsightSavedFlash(false), 1800);
      markSaved(t.messages.insightSaved);
    } catch (reason) {
      setError(readableError(reason, t.errors.insight));
    } finally {
      setBusy(false);
    }
  }

  async function saveSettings() {
    if (!program) return;
    setBusy(true);
    try {
      const result = await api.updateHabitSettings({
        programId: program.id,
        name: settingsName.trim(),
        weakZone: settingsZone,
        avatar: settingsAvatar.trim() || "P",
        reminderEnabled,
        reminderTime
      });
      applyProgramResponse(result);
      markSaved(t.messages.settingsSaved);
    } catch (reason) {
      setError(readableError(reason, t.errors.settings));
    } finally {
      setBusy(false);
    }
  }

  async function connectTelegram() {
    if (!program) return;
    setTelegramBusy(true);
    setError("");
    try {
      const result = await api.createTelegramLinkToken(program.id);
      if (typeof window !== "undefined") {
        window.open(result.connectUrl, "_blank", "noopener,noreferrer");
      }
      markSaved(t.messages.telegramLinkCreated);
      const status = await api.telegramStatus(program.id);
      setTelegramStatus(status);
    } catch (reason) {
      setError(readableError(reason, t.errors.settings));
    } finally {
      setTelegramBusy(false);
    }
  }

  async function saveTelegramPreferences(payload?: { telegramEnabled?: boolean; motivationFrequency?: TelegramFrequency }) {
    if (!program) return;
    setTelegramBusy(true);
    setError("");
    try {
      const timezone = typeof Intl !== "undefined"
        ? Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Moscow"
        : "Europe/Moscow";
      const result = await api.updateTelegramPreferences({
        programId: program.id,
        telegramEnabled: payload?.telegramEnabled ?? telegramStatus?.preferences?.telegramEnabled ?? true,
        reminderTime,
        timezone,
        motivationFrequency: payload?.motivationFrequency ?? normalizeTelegramFrequency(telegramStatus?.preferences?.motivationFrequency)
      });
      setTelegramStatus((previous) => ({
        configured: previous?.configured ?? true,
        linked: previous?.linked ?? false,
        account: previous?.account,
        preferences: result.preferences
      }));
      markSaved(t.messages.telegramSettingsSaved);
    } catch (reason) {
      setError(readableError(reason, t.errors.settings));
    } finally {
      setTelegramBusy(false);
    }
  }

  async function advanceWeek(force = false) {
    if (!program) return;
    setBusy(true);
    try {
      const result = await api.advanceHabitWeek({ programId: program.id, force });
      applyProgramResponse(result);
      markSaved(t.messages.weekAdvanced);
    } catch (reason) {
      setError(readableError(reason, t.errors.advance));
    } finally {
      setBusy(false);
    }
  }

  async function freezeWeek() {
    if (!program) return;
    setBusy(true);
    try {
      const result = await api.freezeHabitWeek(program.id);
      applyProgramResponse(result);
      markSaved(t.messages.weekFrozen);
    } catch (reason) {
      setError(readableError(reason, t.errors.freeze));
    } finally {
      setBusy(false);
    }
  }

  async function updateTodayTaskVariant(mode: "SOFTEN" | "REPLACE") {
    const task = activeHabit?.todayTask ?? program?.todayTask ?? null;
    if (!program || !task) {
      setMicroStepIndex((value) => value + 1);
      return;
    }
    setBusy(true);
    try {
      const result = await api.updateHabitDailyTaskVariant({ programId: program.id, taskId: task.id, mode });
      applyProgramResponse(result);
      const message = mode === "SOFTEN" ? t.dashboard.softStepSaved : t.messages.taskVariantSaved;
      setDailyFeedback(message);
      markSaved(message);
    } catch (reason) {
      setError(readableError(reason, t.errors.settings));
    } finally {
      setBusy(false);
    }
  }

  function softenTodayStep() {
    const softNote = `Облегченный шаг: ${microSteps[1]}`;
    setNote(softNote);
    void updateTodayTaskVariant("SOFTEN");
  }

  function handleAvatarFile(file: File | null) {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      const value = typeof reader.result === "string" ? reader.result : "";
      if (value) setSettingsAvatar(value);
    };
    reader.readAsDataURL(file);
  }

  async function addCalendarEvent() {
    if (!program || !activeHabit) return;
    const task = activeHabit.todayTask ?? program.todayTask ?? null;
    setBusy(true);
    try {
      const startsAt = buildNextHabitEventStart(program.settings.reminderTime);
      const result = await api.createHabitCalendarEvent({
        programId: program.id,
        enrollmentId: activeHabit.id,
        dailyTaskId: task?.id,
        startsAt: startsAt.toISOString(),
        durationMinutes: 15
      });
      applyProgramResponse(result);
      const message = `${t.messages.calendarAdded} ${formatCalendarDateTime(startsAt)}.`;
      setDailyFeedback(message);
      markSaved(message);
    } catch (reason) {
      setError(readableError(reason, t.errors.settings));
    } finally {
      setBusy(false);
    }
  }

  async function askNavigator(prompt?: string) {
    if (!program) return;
    const text = (prompt ?? chatInput).trim();
    if (!text) return;
    const nextMessages: ChatMessage[] = [...messages, { role: "user", text }];
    setMessages(nextMessages);
    setChatInput("");
    try {
      const result = await api.askHabitNavigator({
        programId: program.id,
        threadId,
        message: text,
        messages,
        context: navigatorContext
      });
      setThreadId(result.threadId);
      setMessages([...nextMessages, { role: "assistant", text: result.reply }]);
    } catch (reason) {
      setMessages([...nextMessages, { role: "assistant", text: reason instanceof Error ? reason.message : "Навигатор временно недоступен" }]);
    }
  }

  if (loading) {
    return <HabitsLoading />;
  }

  if (!program) {
    return (
      <main className="habits-app habits-single" data-testid="habits-app-empty">
        <OnboardingPanel
          t={t}
          config={config}
          latestReport={latestReport}
          busy={busy}
          error={error}
          step={onboardingStep}
          questionIndex={onboardingQuestionIndex}
          answers={onboardingAnswers}
          name={startName}
          setName={setStartName}
          activatingFromReport={activatingFromReport}
          startFromReport={startFromLatestReport}
          startQuestions={() => {
            setOnboardingQuestionIndex(0);
            setOnboardingAnswers({});
            setOnboardingStep("questions");
          }}
          answerQuestion={answerOnboardingQuestion}
        />
      </main>
    );
  }

  const sidebarName = settingsName || readProfileString(program.profile, "name") || program.title;
  const sidebarZone = zoneOptions.find((option) => option.id === (program.weakZone || settingsZone))?.label || program.weakZone || settingsZone;
  const sectionMeta = getHabitsSectionMeta(t, tab);

  return (
    <main className="habits-app" data-testid="habits-app">
      <aside className="habits-sidebar">
        <Link className="habits-brand" href="/">
          <PenguinIcon size={38} />
          <div>
            <div className="habits-brand-title">ORKEN.LIFE</div>
            <div className="habits-brand-sub">Кабинет привычек</div>
          </div>
        </Link>
        <nav className="habits-nav">
          {navItems.map((item) => {
            return (
              <button key={item.id} className={tab === item.id ? "active" : ""} type="button" title={t.habitsUx.tooltips[item.id]} onClick={() => setTab(item.id)}>
                <NavIcon item={item} size={17} />
                {t.nav[item.id]}
              </button>
            );
          })}
        </nav>
        <div className="habits-sidebar-profile">
          <AvatarView value={settingsAvatar} fallback="P" className="habits-sidebar-avatar" />
          <div>
            <strong>{sidebarName}</strong>
            <span>{t.dashboard.sidebarZone}: {sidebarZone}</span>
          </div>
        </div>
        <Link className="btn-back habits-account-link" href="/account">{t.account}</Link>
      </aside>

      <nav className="habits-bottom-nav" aria-label="Навигация привычек">
        {mobileNavItems.map((item) => {
          return (
            <button key={item.id} className={tab === item.id ? "active" : ""} type="button" title={t.habitsUx.tooltips[item.id]} onClick={() => {
              setTab(item.id);
              setShowMobileMore(false);
            }}>
              <NavIcon item={item} size={17} />
              <span>{t.nav[item.id]}</span>
            </button>
          );
        })}
        <button className={showMobileMore ? "active" : ""} type="button" title={t.nav.more} onClick={() => setShowMobileMore((value) => !value)}>
          <ChevronDown size={20} />
          <span>{t.nav.more}</span>
        </button>
        {showMobileMore && (
          <div className="habits-mobile-more-menu">
            {navItems.filter((item) => !mobileNavItems.some((mobileItem) => mobileItem.id === item.id)).map((item) => (
              <button key={item.id} className={tab === item.id ? "active" : ""} type="button" title={t.habitsUx.tooltips[item.id]} onClick={() => {
                setTab(item.id);
                setShowMobileMore(false);
              }}>
                <NavIcon item={item} size={17} />
                <span>{t.nav[item.id]}</span>
              </button>
            ))}
          </div>
        )}
      </nav>

      <section className="habits-main">
        <header className="habits-topbar">
          <div>
            <div className="eyebrow">{sectionMeta.eyebrow}</div>
            <h1>{sectionMeta.title}</h1>
            <p>{sectionMeta.copy}</p>
          </div>
        </header>

        {savedMessage && <p className="auth-message">{savedMessage}</p>}
        {savedAt && <p className="habits-save-state">{t.saved} {formatTime(savedAt)}</p>}
        {error && <p className="auth-error">{error}</p>}
        {showCoachmark && (
          <Coachmark
            t={t}
            onClose={dismissCoachmark}
            onGuide={() => {
              dismissCoachmark();
              setTab("guide");
            }}
          />
        )}

        {tab === "dashboard" && (
          <DashboardTab
            t={t}
            program={program}
            openJourney={() => setTab("journey")}
            openNavigator={() => setTab("navigator")}
          />
        )}
        {tab === "journey" && (
          <JourneyTab
            t={t}
            program={program}
            activeHabit={activeHabit}
            detailTab={detailTab}
            setDetailTab={setDetailTab}
            doneToday={doneToday}
            energy={energy}
            clarity={clarity}
            stability={stability}
            note={note}
            insight={insight}
            busy={busy}
            metricSavedFlash={metricSavedFlash}
            insightSavedFlash={insightSavedFlash}
            setEnergy={setEnergy}
            setClarity={setClarity}
            setStability={setStability}
            setNote={setNote}
            setInsight={setInsight}
            saveMetric={saveMetric}
            saveCheckin={saveCheckin}
            saveInsight={saveInsight}
            softenTodayStep={softenTodayStep}
            rotateTodayStep={() => updateTodayTaskVariant("REPLACE")}
            dailyFeedback={dailyFeedback}
            telegramStatus={telegramStatus}
            telegramBusy={telegramBusy}
            connectTelegram={connectTelegram}
            addCalendarEvent={addCalendarEvent}
            advanceWeek={advanceWeek}
            freezeWeek={freezeWeek}
          />
        )}
        {tab === "habits" && (
          <HabitsCatalogTab
            t={t}
            program={program}
            selectedCycle={selectedCycle}
            setSelectedCycle={setSelectedCycle}
            expandedHabitId={expandedHabitId}
            setExpandedHabitId={setExpandedHabitId}
            openJourney={() => setTab("journey")}
          />
        )}
        {tab === "navigator" && (
          <NavigatorTab
            t={t}
            messages={messages}
            input={chatInput}
            setInput={setChatInput}
            askNavigator={askNavigator}
          />
        )}
        {tab === "archive" && (
          <ArchiveTab
            t={t}
            program={program}
            filter={archiveFilter}
            setFilter={setArchiveFilter}
            markSaved={markSaved}
          />
        )}
        {tab === "guide" && <GuideTab t={t} program={program} />}
        {tab === "settings" && (
          <SettingsTab
            t={t}
            program={program}
            config={config}
            zoneOptions={zoneOptions}
            name={settingsName}
            zone={settingsZone}
            avatar={settingsAvatar}
            reminderEnabled={reminderEnabled}
            reminderTime={reminderTime}
            telegramStatus={telegramStatus}
            telegramBusy={telegramBusy}
            busy={busy}
            setName={setSettingsName}
            setZone={setSettingsZone}
            setAvatar={setSettingsAvatar}
            setAvatarFile={handleAvatarFile}
            setReminderEnabled={setReminderEnabled}
            setReminderTime={setReminderTime}
            saveSettings={saveSettings}
            connectTelegram={connectTelegram}
            saveTelegramPreferences={saveTelegramPreferences}
          />
        )}
      </section>
    </main>
  );
}

function OnboardingPanel(props: {
  t: ReturnType<typeof useSiteText>["habits"]["app"];
  config: HabitConfigResponse | null;
  latestReport: { analysisId: string; profession?: string | null; summary?: string | null } | null;
  busy: boolean;
  error: string;
  step: OnboardingStep;
  questionIndex: number;
  answers: Partial<Record<OnboardingZone, number>>;
  name: string;
  setName: (value: string) => void;
  activatingFromReport: boolean;
  startFromReport: () => void;
  startQuestions: () => void;
  answerQuestion: (score: number) => void;
}) {
  const displayName = props.name.trim() || "Ильяс";
  const trialDays = props.config?.trialDays ?? 30;
  const price = props.config?.priceLabel ?? "$8";
  const focus = props.latestReport?.profession || "Продуктовый стратег";
  const currentQuestion = props.t.onboarding.questions[props.questionIndex];
  const currentZone = onboardingZones[props.questionIndex];
  const currentAnswer = props.answers[currentZone];

  return (
    <section className={`habits-panel habits-empty habits-onboarding-shell ${props.step === "questions" ? "question-mode" : ""}`}>
      {props.step === "activating" ? (
        <div className="habits-onboarding-activating">
          <div className="habits-onboarding-hero-icon">💰</div>
          <h1>{props.activatingFromReport ? props.t.onboarding.activatingFromReport : props.t.onboarding.activatingTitle}</h1>
          <p>{formatTemplate(props.t.onboarding.activatingCopy, { focus, days: trialDays, price })}</p>
          <span>{props.t.onboarding.activatingManualCopy}</span>
          <div className="habits-onboarding-progress-line" />
          {props.error && <p className="auth-error">{props.error}</p>}
        </div>
      ) : props.step === "questions" && currentQuestion ? (
        <div className="habits-onboarding-question">
          <OnboardingSegments total={props.t.onboarding.questions.length} active={props.questionIndex} />
          <div className="habits-onboarding-hero-icon">{currentQuestion[0]}</div>
          <div className="habits-onboarding-zone">{currentQuestion[1]}</div>
          <h1>{currentQuestion[2]}</h1>
          <div className="habits-onboarding-answer-list">
            {props.t.onboarding.options.map((option, index) => {
              const score = index + 1;
              return (
                <button
                  className={currentAnswer === score ? "active" : ""}
                  type="button"
                  key={option}
                  disabled={props.busy}
                  onClick={() => props.answerQuestion(score)}
                >
                  <span>{score}</span>
                  <strong>{option}</strong>
                </button>
              );
            })}
          </div>
          <p className="habits-onboarding-counter">{formatTemplate(props.t.onboarding.questionOf, { name: displayName, current: props.questionIndex + 1, total: props.t.onboarding.questions.length })}</p>
          {props.error && <p className="auth-error">{props.error}</p>}
        </div>
      ) : (
        <div className="habits-onboarding-choice">
          <div className="eyebrow">{props.t.onboarding.eyebrow}</div>
          <h1>{formatTemplate(props.latestReport ? props.t.onboarding.reportTitle : props.t.onboarding.noReportTitle, { name: displayName })}</h1>
          <p>{props.latestReport ? props.t.onboarding.reportCopy : props.t.onboarding.noReportCopy}</p>
          <label className="habits-field compact">
            <span>{props.t.settings.name}</span>
            <input className="input" value={props.name} onChange={(event) => props.setName(event.target.value)} placeholder={displayName} />
          </label>
          <div className="habits-onboarding-choice-grid">
            <button className="habits-onboarding-choice-card" type="button" disabled={props.busy || !props.latestReport} onClick={props.startFromReport}>
              <strong>{props.t.onboarding.useReport}</strong>
              <span>{formatTemplate(props.t.onboarding.useReportCopy, { days: trialDays, price, focus })}</span>
            </button>
            <button className="habits-onboarding-choice-card" type="button" disabled={props.busy} onClick={props.startQuestions}>
              <strong>{props.t.onboarding.shortSurvey}</strong>
              <span>{props.t.onboarding.shortSurveyCopy}</span>
            </button>
          </div>
          {!props.latestReport && <Link className="btn-back habits-onboarding-login" href="/login">{props.t.account}</Link>}
          {props.error && <p className="auth-error">{props.error}</p>}
        </div>
      )}
    </section>
  );
}

function OnboardingSegments({ active, total }: { active: number; total: number }) {
  return (
    <div className="habits-onboarding-segments" aria-label="Прогресс настройки плана">
      {Array.from({ length: total }, (_, index) => (
        <span className={index <= active ? "active" : ""} key={index} />
      ))}
    </div>
  );
}

function getHabitsSectionMeta(t: ReturnType<typeof useSiteText>["habits"]["app"], tab: Tab) {
  const meta: Record<Tab, { eyebrow: string; title: string; copy: string }> = {
    dashboard: {
      eyebrow: t.nav.dashboard,
      title: t.dashboard.overviewTitle,
      copy: t.dashboard.overviewCopy
    },
    journey: {
      eyebrow: t.nav.journey,
      title: t.journey.title,
      copy: t.journey.copy
    },
    habits: {
      eyebrow: t.nav.habits,
      title: t.habitsScreen.title,
      copy: t.habitsScreen.copy
    },
    navigator: {
      eyebrow: t.nav.navigator,
      title: t.navigator.title,
      copy: t.navigator.copy
    },
    archive: {
      eyebrow: t.nav.archive,
      title: t.archive.title,
      copy: t.archive.copy
    },
    guide: {
      eyebrow: t.nav.guide,
      title: t.guide.title,
      copy: t.guide.copy
    },
    settings: {
      eyebrow: t.nav.settings,
      title: t.settings.title,
      copy: t.settings.copy
    }
  };
  return meta[tab];
}

function DashboardTab(props: {
  t: ReturnType<typeof useSiteText>["habits"]["app"];
  program: HabitProgramSummary;
  openJourney: () => void;
  openNavigator: () => void;
}) {
  const wellness = props.program.stats.wellnessScore ?? 0;
  const totalWeeks = props.program.stats.totalWeeks || props.program.cycles.reduce((sum, cycle) => sum + cycle.weeks, 0);
  const routeProgress = totalWeeks
    ? Math.min(100, Math.round(((props.program.stats.currentSortOrder - 1 + props.program.stats.weekProgress / 100) / totalWeeks) * 100))
    : 0;
  const activeCycle = props.program.cycles.find((cycle) => cycle.id === props.program.currentCycle) ?? props.program.cycles[0];
  const activeCycleVisual = cycleVisuals[((activeCycle?.id ?? props.program.currentCycle) - 1) % cycleVisuals.length];
  const activeCycleWeeks = activeCycle?.weeks ?? 12;
  const activeCycleProgress = Math.min(100, Math.round(((props.program.currentWeek - 1 + props.program.stats.weekProgress / 100) / activeCycleWeeks) * 100));
  const weekProgress = Math.min(100, Math.max(0, props.program.stats.weekProgress));
  const nextRank = props.program.stats.rank.nextTitle ?? props.t.dashboard.rankComplete;
  const monthXp = props.program.stats.rank.monthXp ?? 0;
  const monthMaxXp = props.program.stats.rank.monthMaxXp ?? 0;
  const monthPercent = props.program.stats.rank.monthPercent ?? props.program.stats.rank.progress;
  const xpToNextRank = props.program.stats.rank.nextAtXp ? Math.max(0, props.program.stats.rank.nextAtXp - monthXp) : 0;
  const weakZoneId = zoneIds.includes(props.program.weakZone as (typeof zoneIds)[number])
    ? props.program.weakZone as (typeof zoneIds)[number]
    : "ikigai";
  const weakZoneLabel = props.t.zones[weakZoneId];
  const weakZoneIcon = weakZoneId === "passion" ? "💗"
    : weakZoneId === "mission" ? "🌍"
      : weakZoneId === "profession" ? "⭐"
        : weakZoneId === "vocation" ? "💰"
          : weakZoneId === "resource" ? "🌱"
            : weakZoneId === "clarity" ? "🧭"
              : weakZoneId === "stability" ? "🌳"
                : "✦";
  const zoneProgress = Math.min(100, Math.round((props.program.stats.checkinsDone / Math.max(1, props.program.enrollments.length * 7)) * 100));
  const rankIcon = ["🌱", "🔥", "🧭", "⚡", "🌟", "👑"][Math.max(0, Math.min(5, props.program.stats.rank.level - 1))];
  const statTiles: Array<{ label: string; value: string | number; icon: string; color: string }> = [
    { label: props.t.stats.checkins, value: props.program.stats.checkinsDone, icon: "✅", color: "#00d4ff" },
    { label: props.t.stats.insights, value: props.program.stats.insightsCount, icon: "💡", color: "#a855f7" },
    { label: props.t.stats.xp, value: props.program.stats.xp, icon: "⭐", color: "#f59e0b" },
    { label: props.t.dashboard.rankShort, value: props.program.stats.rank.title, icon: rankIcon, color: "#f59e0b" }
  ];
  return (
    <div className="habits-grid">
      <section className="habits-panel habits-wide habits-dashboard-hero">
        <div className="habits-old-stat-grid">
          {statTiles.map((tile) => (
            <div className="habits-old-stat-card" key={tile.label} style={{ "--tile-color": tile.color } as CSSProperties}>
              <div className="habits-old-stat-icon">{tile.icon}</div>
              <strong>{tile.value}</strong>
              <span>{tile.label}</span>
            </div>
          ))}
        </div>

        <div className="habits-dashboard-hero-head">
          <div>
            <div className="eyebrow">{props.t.dashboard.pathEyebrow}</div>
            <h2>{props.t.dashboard.pathTitle}<HelpTip label={props.t.habitsUx.tooltips.dashboard} /></h2>
            <p>{props.t.dashboard.pathCopy}</p>
          </div>
          <div className="habits-action-row">
            <button className="button habits-cta" type="button" title={props.t.habitsUx.tooltips.journey} onClick={props.openJourney}>
              <Compass size={17} />
              {props.t.dashboard.openJourney}
            </button>
            <button className="button secondary habits-cta" type="button" title={props.t.habitsUx.tooltips.navigator} onClick={props.openNavigator}>
              <PenguinHeadIcon size={18} />
              {props.t.dashboard.askPingvi}
            </button>
          </div>
        </div>

        <div className="habits-status-strip">
          <div className="habits-status-card">
            <span><span className="habits-inline-icon">{rankIcon}</span>{props.t.dashboard.currentRank}</span>
            <strong>{props.program.stats.rank.title}</strong>
            <small>{monthXp}/{monthMaxXp} XP месяца · {xpToNextRank > 0 ? `${xpToNextRank} XP до ${nextRank}` : props.t.dashboard.rankComplete}</small>
          </div>
          <div className="habits-status-card">
            <span><span className="habits-inline-icon">🧭</span>{props.t.dashboard.totalRoute}</span>
            <strong>{props.program.stats.currentSortOrder}/{totalWeeks || props.program.stats.currentSortOrder}</strong>
            <small>{routeProgress}%</small>
          </div>
          <div className="habits-status-card">
            <span><span className="habits-inline-icon">✦</span>{props.t.dashboard.weeklyRhythm}</span>
            <strong>{props.program.stats.completedWeekCheckins}/7</strong>
            <small>{weekProgress}%</small>
          </div>
        </div>

        {activeCycle && (
          <div className="habits-current-cycle-card" style={{ "--cycle-color": activeCycleVisual.color } as CSSProperties}>
            <div>
              <div className="habit-week">{props.t.dashboard.currentCycle}</div>
              <h3><span className="habits-current-cycle-icon">{activeCycleVisual.icon}</span>{activeCycle.label} - {activeCycle.title}</h3>
              <p>{activeCycle.goal}</p>
              <div className="habits-tag-row">
                {activeCycle.areas.map((area) => <span key={area} style={{ "--cycle-color": activeCycleVisual.color } as CSSProperties}>{area}</span>)}
              </div>
            </div>
            <div className="habits-cycle-meter" style={{ "--cycle-progress": `${activeCycleProgress}%`, "--cycle-color": activeCycleVisual.color } as CSSProperties}>
              <strong>{activeCycleProgress}%</strong>
              <span>{props.t.dashboard.cycleProgress}</span>
            </div>
          </div>
        )}

        <div className="habits-route-progress">
          <div className="row">
            <strong>{props.t.dashboard.routeProgress}</strong>
            <span>{routeProgress}%</span>
          </div>
          <div className="progress-bg habits-progress-slim"><div className="progress-fill" style={{ width: `${routeProgress}%` }} /></div>
        </div>

        <div className="habits-cycle-map">
          {props.program.cycles.map((cycle) => {
            const isActive = cycle.id === props.program.currentCycle;
            const isDone = cycle.id < props.program.currentCycle;
            const visual = cycleVisuals[(cycle.id - 1) % cycleVisuals.length];
            const progress = isDone ? 100 : isActive ? activeCycleProgress : 0;
            return (
              <article className={`habits-cycle-step ${isActive ? "active" : ""} ${isDone ? "done" : ""}`} key={cycle.id} style={{ "--cycle-color": visual.color } as CSSProperties}>
                <div className="habits-cycle-step-icon">{visual.icon}</div>
                <span>{cycle.label}</span>
                <h3>{cycle.title}</h3>
                <p>{cycle.goal}</p>
                <div className="progress-bg"><div className="progress-fill" style={{ width: `${progress}%`, "--progress-fill": `linear-gradient(90deg, ${visual.color}88, ${visual.color})` } as CSSProperties} /></div>
                {isActive && <small>{props.t.dashboard.weekOfCycle}: {Math.min(props.program.currentWeek, cycle.weeks)}/{cycle.weeks}</small>}
              </article>
            );
          })}
        </div>
      </section>

      <section className="habits-panel habits-metrics-panel">
        <div className="habits-metrics-head">
          <div>
            <h2>{props.t.dashboard.metricTitle}</h2>
            <p className="habits-muted">{props.program.metrics[0] ? `${props.t.dashboard.metricUpdated}: ${formatDate(props.program.metrics[0].date)}` : props.t.dashboard.noMetricYet}</p>
          </div>
          <div className="habits-wellness-score">
            <strong>{wellness}</strong>
            <span>{props.t.stats.wellness}</span>
          </div>
        </div>
        <div className="habits-wellness-row">
          <div className="habits-progress-ring" style={{ "--progress": `${wellness}%` } as CSSProperties}>
            <svg className="habits-progress-ring-svg" viewBox="0 0 120 120" aria-hidden="true" focusable="false">
              <circle className="habits-progress-ring-track" cx="60" cy="60" r="45" pathLength={100} />
              <circle className="habits-progress-ring-value" cx="60" cy="60" r="45" pathLength={100} strokeDasharray={`${wellness} 100`} />
            </svg>
            <strong>{wellness}</strong>
            <span>/100</span>
          </div>
          <div className="habits-rank-card">
            <span>{props.program.stats.rank.title}</span>
            <strong>{monthPercent}%</strong>
            <div className="progress-bg"><div className="progress-fill" style={{ width: `${props.program.stats.rank.progress}%` }} /></div>
          </div>
        </div>
        {props.program.metrics[0] ? (
          <div className="habits-mini-reward">
            {props.t.metrics.energy} {props.program.metrics[0].energy}/10 · {props.t.metrics.clarity} {props.program.metrics[0].clarity}/10 · {props.t.metrics.stability} {props.program.metrics[0].stability}/10
          </div>
        ) : (
          <div className="habits-mini-reward">{props.t.dashboard.noMetricYet}</div>
        )}
        <button className="button secondary" type="button" title={props.t.habitsUx.tooltips.journey} onClick={props.openJourney}>
          <Compass size={17} />
          {props.t.dashboard.openJourney}
        </button>
      </section>

      <section className="habits-panel habits-growth-panel">
        <div className="habit-week">{props.t.dashboard.growthPoint}</div>
        <h2><span>{weakZoneIcon}</span>{weakZoneLabel}</h2>
        <div className="row habits-growth-row">
          <span>{props.t.dashboard.zoneProgress}</span>
          <strong>{zoneProgress}<small>/100</small></strong>
        </div>
        <div className="progress-bg habits-progress-slim">
          <div className="progress-fill" style={{ width: `${zoneProgress}%`, "--progress-fill": "linear-gradient(90deg, #00d4ff88, #00d4ff)" } as CSSProperties} />
        </div>
        <p>{props.program.stats.checkinsDone} {props.t.stats.checkins.toLowerCase()} · {props.t.dashboard.continuePath}</p>
      </section>

      <section className="habits-panel habits-wide">
        <h2>{props.t.archive.filters.rewards}</h2>
        <div className="habits-reward-list">
          {props.program.rewards.slice(0, 5).map((reward) => (
            <div className="habits-mini-reward" key={reward.id}>
              <Sparkles size={15} />
              <span>{reward.label}</span>
              <strong>+{reward.xp} XP</strong>
            </div>
          ))}
          {props.program.rewards.length === 0 && <div className="habits-current">{props.t.archive.empty}</div>}
        </div>
      </section>

    </div>
  );
}

function JourneyTab(props: {
  t: ReturnType<typeof useSiteText>["habits"]["app"];
  program: HabitProgramSummary;
  activeHabit: HabitEnrollmentSummary | null;
  detailTab: DetailTab;
  setDetailTab: (tab: DetailTab) => void;
  doneToday: boolean;
  energy: number;
  clarity: number;
  stability: number;
  note: string;
  insight: string;
  busy: boolean;
  metricSavedFlash: boolean;
  insightSavedFlash: boolean;
  setEnergy: (value: number) => void;
  setClarity: (value: number) => void;
  setStability: (value: number) => void;
  setNote: (value: string) => void;
  setInsight: (value: string) => void;
  saveMetric: () => void;
  saveCheckin: (habit?: HabitEnrollmentSummary | null, completed?: boolean, noteOverride?: string) => void;
  saveInsight: () => void;
  softenTodayStep: () => void;
  rotateTodayStep: () => void;
  dailyFeedback: string;
  telegramStatus: TelegramStatusResponse | null;
  telegramBusy: boolean;
  connectTelegram: () => void;
  addCalendarEvent: () => void;
  advanceWeek: (force?: boolean) => void;
  freezeWeek: () => void;
}) {
  const activeHabit = props.activeHabit;
  const canAdvance = (activeHabit?.checkinsDone ?? 0) >= 7;
  const todayTask = activeHabit?.todayTask ?? props.program.todayTask ?? null;
  const telegramLinked = Boolean(props.telegramStatus?.linked);
  const telegramConfigured = props.telegramStatus?.configured !== false;
  const calendarEvents = props.program.calendarEvents ?? [];
  const scheduledEvent = calendarEvents.find((event) => event.dailyTaskId === todayTask?.id)
    ?? calendarEvents.find((event) => event.enrollmentId === activeHabit?.id && event.status === "SCHEDULED")
    ?? null;
  return (
    <div className="habits-grid">
      <section className="habits-panel habits-wide habits-journey-daily">
        <div className="row">
          <div>
            <div className="habit-week">{props.t.habitsUx.journeySteps.habit}</div>
            <h2>{todayTask?.title ?? activeHabit?.title ?? props.t.journey.title}</h2>
          </div>
          <div className="habits-mini-reward">
            <Trophy size={15} />
            <span>{props.doneToday ? props.t.journey.todayDone : props.t.journey.todayAvailable}</span>
          </div>
        </div>
        <div className="habits-current">
          <strong>{todayTask?.microAction ?? activeHabit?.practice ?? props.t.dashboard.firstStep}</strong>
          <span>{todayTask?.whyToday ?? activeHabit?.why ?? props.t.journey.copy}</span>
        </div>
        {activeHabit && (
          <div className="habits-current habits-journey-card">
            <div className="habit-week">{props.t.stats.cycle} {activeHabit.cycle} · {props.t.stats.week} {activeHabit.week}</div>
            <h3>{activeHabit.title}</h3>
            <div className="habits-tabs">
              {(["essence", "practice", "why"] as DetailTab[]).map((tab) => (
                <button className={`btn-back ${props.detailTab === tab ? "active-control" : ""}`} type="button" key={tab} onClick={() => props.setDetailTab(tab)}>
                  {props.t.journey[tab]}
                </button>
              ))}
            </div>
            <div className="habit-detail">{activeHabit[props.detailTab]}</div>
            <div className="habits-week-card">
              <div className="row">
                <strong>{props.t.journey.weekCalendar}</strong>
                <span>{activeHabit.checkinsDone}/7</span>
              </div>
              <WeekDots habit={activeHabit} />
              <div className="progress-bg"><div className="progress-fill" style={{ width: `${props.program.stats.weekProgress}%` }} /></div>
              {canAdvance && (
                <div className="habits-mini-reward">
                  <Trophy size={15} />
                  <span>{props.t.journey.completeReady}. {props.t.journey.completeCopy}</span>
                </div>
              )}
            </div>
          </div>
        )}
        <textarea className="input habits-note" placeholder={props.t.dashboard.notePlaceholder} value={props.note} onChange={(event) => props.setNote(event.target.value)} />
        <div className="habits-action-row">
          <button className="button habits-cta" type="button" disabled={props.busy || !activeHabit} onClick={() => props.saveCheckin(activeHabit, !props.doneToday)}>
            {props.doneToday ? <RotateCcw size={17} /> : <CheckCircle2 size={17} />}
            {props.doneToday ? props.t.journey.undoToday : props.t.journey.markToday}
          </button>
        </div>
        {props.dailyFeedback && <div className="habits-inline-feedback">{props.dailyFeedback}</div>}
      </section>

      <section className="habits-panel">
        <div className="habit-week">{props.t.habitsUx.journeySteps.state}</div>
        <h2>{props.t.dashboard.metricTitle}<HelpTip label={props.t.habitsUx.tooltips.saveMetric} /></h2>
        <p className="habits-muted">{props.t.dashboard.metricCopy}</p>
        <MetricSlider
          icon="⚡"
          color="#00d4ff"
          label={props.t.metrics.energy}
          value={props.energy}
          hint={metricValueHint(props.energy, props.t.dashboard.metricValueHints)}
          scale={props.t.habitsUx.metricScales.energy}
          numberHints={props.t.habitsUx.metricNumberHints.energy}
          onChange={props.setEnergy}
        />
        <MetricSlider
          icon="🧠"
          color="#a855f7"
          label={props.t.metrics.clarity}
          value={props.clarity}
          hint={metricValueHint(props.clarity, props.t.dashboard.metricValueHints)}
          scale={props.t.habitsUx.metricScales.clarity}
          numberHints={props.t.habitsUx.metricNumberHints.clarity}
          onChange={props.setClarity}
        />
        <MetricSlider
          icon="🌳"
          color="#10b981"
          label={props.t.metrics.stability}
          value={props.stability}
          hint={metricValueHint(props.stability, props.t.dashboard.metricValueHints)}
          scale={props.t.habitsUx.metricScales.stability}
          numberHints={props.t.habitsUx.metricNumberHints.stability}
          onChange={props.setStability}
        />
        <button className="button secondary" type="button" title={props.t.habitsUx.tooltips.saveMetric} disabled={props.busy} onClick={props.saveMetric}>
          <Save size={17} />
          {props.metricSavedFlash ? props.t.saved : props.t.dashboard.saveMetric}
        </button>
      </section>

      <section className="habits-panel">
        <div className="habit-week">{props.t.habitsUx.journeySteps.insight}</div>
        <h2>{props.t.dashboard.insightTitle}<HelpTip label={props.t.habitsUx.tooltips.saveInsight} /></h2>
        <textarea className="input habits-note" placeholder={props.t.dashboard.insightPlaceholder} value={props.insight} onChange={(event) => props.setInsight(event.target.value)} />
        <button className="button secondary" type="button" title={props.t.habitsUx.tooltips.saveInsight} disabled={props.busy || !props.insight.trim()} onClick={props.saveInsight}>
          <Archive size={17} />
          {props.insightSavedFlash ? props.t.saved : props.t.dashboard.saveInsight}
        </button>
      </section>

      <section className="habits-panel">
        <h2>{props.t.settings.telegramTitle}<HelpTip label={props.t.habitsUx.tooltips.telegram} /></h2>
        <div className="habits-current">
          <div className="habit-detail">
            <strong>{props.t.settings.telegramStatus}</strong>
            {!telegramConfigured
              ? props.t.settings.telegramNotConfigured
              : telegramLinked
                ? props.t.settings.telegramLinked
                : props.t.settings.telegramNotLinked}
          </div>
        </div>
        <button className="button secondary" type="button" disabled={props.telegramBusy || !telegramConfigured} onClick={props.connectTelegram}>
          <Bot size={17} />
          {telegramLinked ? props.t.settings.telegramReconnect : props.t.settings.telegramConnect}
        </button>
      </section>

      <section className="habits-panel">
        <h2>{props.t.journey.calendar}<HelpTip label={props.t.habitsUx.tooltips.calendar} /></h2>
        <div className="habits-action-stack">
          {activeHabit && (
            <button className="button secondary" type="button" title={props.t.habitsUx.tooltips.calendar} disabled={props.busy} onClick={props.addCalendarEvent}>
              <CalendarPlus size={17} />
              {props.t.journey.calendar}
            </button>
          )}
          {scheduledEvent && (
            <div className="habits-mini-reward habits-scheduled-event">
              <CalendarPlus size={15} />
              <span>{props.t.messages.calendarScheduled} {formatCalendarDateTime(new Date(scheduledEvent.startsAt))}</span>
            </div>
          )}
        </div>
      </section>

    </div>
  );
}

function HabitsCatalogTab(props: {
  t: ReturnType<typeof useSiteText>["habits"]["app"];
  program: HabitProgramSummary;
  selectedCycle: number | "all";
  setSelectedCycle: (cycle: number | "all") => void;
  expandedHabitId: string | null;
  setExpandedHabitId: (id: string | null) => void;
  openJourney: () => void;
}) {
  const habits = props.selectedCycle === "all"
    ? props.program.enrollments
    : props.program.enrollments.filter((habit) => habit.cycle === props.selectedCycle);
  return (
    <section className="habits-panel">
      <div className="habits-cycle-tabs">
        <button className={`btn-back ${props.selectedCycle === "all" ? "active-control" : ""}`} type="button" onClick={() => props.setSelectedCycle("all")}>{props.t.habitsScreen.allCycles}</button>
        {props.program.cycles.map((cycle) => (
          <button className={`btn-back ${props.selectedCycle === cycle.id ? "active-control" : ""}`} type="button" key={cycle.id} onClick={() => props.setSelectedCycle(cycle.id)}>
            {cycle.label}
          </button>
        ))}
      </div>
      <div className="habits-habit-grid">
        {habits.map((habit) => {
          const expanded = props.expandedHabitId === habit.id;
          return (
            <article className={`habits-card ${habit.sortOrder === props.program.currentSortOrder ? "active" : ""}`} key={habit.id}>
              <div className="habit-week">{props.t.stats.cycle} {habit.cycle} · {props.t.stats.week} {habit.week}</div>
              <h3>{habit.title}</h3>
              <p>{habit.focus}</p>
              {expanded && <HabitDetailsCard habit={habit} t={props.t} />}
              <div className="habits-action-row">
                <button className="btn-back" type="button" onClick={() => props.setExpandedHabitId(expanded ? null : habit.id)}>
                  <ChevronDown size={15} />
                  {expanded ? props.t.habitsScreen.collapse : props.t.habitsScreen.expand}
                </button>
                {habit.sortOrder === props.program.currentSortOrder && (
                  <button className="btn-back" type="button" onClick={props.openJourney}>
                    <Compass size={15} />
                    {props.t.habitsScreen.openCurrent}
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function NavigatorTab(props: {
  t: ReturnType<typeof useSiteText>["habits"]["app"];
  messages: ChatMessage[];
  input: string;
  setInput: (value: string) => void;
  askNavigator: (prompt?: string) => void;
}) {
  return (
    <section className="habits-panel habits-chat">
      <h2>{props.t.habitsUx.navigator.promptTitle}<HelpTip label={props.t.habitsUx.tooltips.navigator} /></h2>
      <div className="habits-tabs">
        {props.t.habitsUx.navigator.prompts.map((prompt) => (
          <button className="btn-back" type="button" key={prompt} onClick={() => props.askNavigator(prompt)}>{prompt}</button>
        ))}
      </div>
      <div className="habits-chat-log">
        {props.messages.length === 0 ? (
          <div className="habits-bubble ai">{props.t.navigator.empty}</div>
        ) : (
          props.messages.map((message, index) => (
            <div className={`habits-bubble ${message.role === "assistant" ? "ai" : "user"}`} key={`${message.role}-${index}`}>
              {message.text}
            </div>
          ))
        )}
      </div>
      <div className="habits-chat-form">
        <input className="input" value={props.input} placeholder={props.t.navigator.input} onChange={(event) => props.setInput(event.target.value)} onKeyDown={(event) => {
          if (event.key === "Enter") props.askNavigator();
        }} />
        <button className="button habits-cta" type="button" onClick={() => props.askNavigator()}>
          <Bot size={17} />
          {props.t.navigator.ask}
        </button>
      </div>
    </section>
  );
}

function ArchiveTab(props: {
  t: ReturnType<typeof useSiteText>["habits"]["app"];
  program: HabitProgramSummary;
  filter: ArchiveFilter;
  setFilter: (filter: ArchiveFilter) => void;
  markSaved: (message: string) => void;
}) {
  const showInsights = props.filter === "all" || props.filter === "insights";
  const showRewards = props.filter === "all" || props.filter === "rewards";
  const showWeeks = props.filter === "all" || props.filter === "weeks";
  const closedWeeks = props.program.enrollments.filter((habit) => habit.status === "COMPLETED");
  const weekSummaries = props.program.weekSummaries ?? [];
  const groupedWeekSummaries = groupWeekSummariesByMonth(weekSummaries);
  return (
    <div className="habits-grid">
      <section className="habits-panel habits-wide">
        <div className="habits-tabs">
          {(Object.keys(props.t.archive.filters) as ArchiveFilter[]).map((filter) => (
            <button className={`btn-back ${props.filter === filter ? "active-control" : ""}`} type="button" key={filter} onClick={() => props.setFilter(filter)}>
              {props.t.archive.filters[filter]}
            </button>
          ))}
        </div>
      </section>
      {showInsights && (
        <section className="habits-panel">
          <h2>{props.t.archive.filters.insights}</h2>
          <div className="habits-archive">
            {props.program.insights.length === 0 ? (
              <div className="habits-current">{props.t.archive.empty}</div>
            ) : props.program.insights.map((item) => (
              <article className="habits-card" key={item.id}>
                <div className="habit-week">{formatDate(item.createdAt)}{item.habitTitle ? ` · ${item.habitTitle}` : ""}</div>
                <p>{clipText(item.text, 300)}</p>
                <button className="btn-back" type="button" onClick={() => copyInsight(item.text, props.markSaved, props.t.archive.copied)}>{props.t.archive.copyInsight}</button>
              </article>
            ))}
          </div>
        </section>
      )}
      {showRewards && (
        <section className="habits-panel">
          <h2>{props.t.archive.filters.rewards}</h2>
          <div className="habits-reward-list">
            {props.program.rewards.map((reward) => (
              <div className="habits-mini-reward" key={reward.id}>
                <Trophy size={15} />
                <span>{reward.label}</span>
                <strong>+{reward.xp}</strong>
              </div>
            ))}
          </div>
        </section>
      )}
      {showWeeks && (
        <section className="habits-panel habits-wide">
          <h2>{props.t.habitsUx.archive.closedWeeksTitle}<HelpTip label={props.t.habitsUx.tooltips.archive} /></h2>
          <div className="habits-closed-weeks">
            {groupedWeekSummaries.length > 0 ? groupedWeekSummaries.map((group) => (
              <div className="habits-week-month-group" key={group.key}>
                <div className="habits-month-heading">
                  <div>
                    <span>{group.label}</span>
                    <strong>{props.program.stats.rank.title}</strong>
                  </div>
                  <em>{group.summaries.length} нед.</em>
                </div>
                {group.summaries.map((summary) => (
                  <article className="habits-card habits-closed-week" key={summary.id}>
                    <div className="habit-week">{props.t.stats.cycle} {summary.cycle} · {props.t.stats.week} {summary.week} · {summary.completionMode}</div>
                    <h3>{summary.habitTitle}</h3>
                    <p>{summary.summary}</p>
                    <div className="habits-current">
                      <strong>{summary.rewardLabel} · +{summary.xpAwarded} XP</strong>
                      <span>{summary.pingviFeedback}</span>
                    </div>
                    <div className="row">
                      <span>{summary.checkinsDone}/7</span>
                      <button className="btn-back" type="button" onClick={() => copyInsight(`${summary.summary}\n\n${summary.pingviFeedback}`, props.markSaved, props.t.habitsUx.archive.weekCopied)}>
                        {props.t.habitsUx.archive.shareWeek}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )) : closedWeeks.length === 0 ? (
              <div className="habits-current">{props.t.habitsUx.archive.closedWeeksEmpty}</div>
            ) : closedWeeks.map((habit) => (
              <article className="habits-card habits-closed-week" key={habit.id}>
                <div className="habit-week">{props.t.stats.cycle} {habit.cycle} · {props.t.stats.week} {habit.week}</div>
                <h3>{habit.title}</h3>
                <p>{habit.focus}</p>
                <div className="row">
                  <span>{habit.checkinsDone}/7</span>
                  <button className="btn-back" type="button" onClick={() => copyWeekSummary(props.program, habit, props.markSaved, props.t.habitsUx.archive.weekCopied)}>
                    {props.t.habitsUx.archive.shareWeek}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
      {showWeeks && (
        <section className="habits-panel habits-wide">
          <h2>{props.t.archive.hall}</h2>
          <div className="habits-rank-ladder">
            {["Новичок пути", "Искатель баланса", "Практик осознанности", "Хранитель энергии", "Мастер равновесия", "Гуру Икигай"].map((rank, index) => (
              <div className={`habits-rank-step ${props.program.stats.rank.level === index + 1 ? "active" : ""}`} key={rank}>
                <span>{index + 1}</span>
                <strong>{rank}</strong>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function GuideTab({ t, program }: { t: ReturnType<typeof useSiteText>["habits"]["app"]; program: HabitProgramSummary }) {
  const rewardRows = [
    ["100%", "Золотой сундук", "+50 XP"],
    ["70-99%", "Серебряный сундук", "+20 XP"],
    ["40-69%", "Бронзовый значок", "+0 XP"],
    ["<40%", "Без бонусной награды", "+0 XP"]
  ];
  const rankRows = [
    ["0-20%", "Новичок пути"],
    ["20-40%", "Искатель баланса"],
    ["40-60%", "Практик осознанности"],
    ["60-80%", "Хранитель энергии"],
    ["80-95%", "Мастер равновесия"],
    ["95-100%", "Гуру Икигай"]
  ];
  return (
    <div className="habits-grid">
      <section className="habits-panel">
        <h2>{t.guide.stepsTitle}</h2>
        <div className="habits-guide-list">
          {t.guide.blocks.map((block, index) => (
            <div className="habit-detail" key={block}>
              <strong>{index + 1}</strong>
              {block}
            </div>
          ))}
        </div>
      </section>
      <section className="habits-panel">
        <h2>{t.guide.cycles}</h2>
        <div className="habits-reward-list">
          <div className="habits-current">
            <div className="habit-week">Дневные действия</div>
            <p>Привычка дня дает +10 XP. Состояние дает +15 XP за три шкалы. Инсайт дает +15 XP.</p>
          </div>
          <div className="habits-current">
            <div className="habit-week">Неделя</div>
            {rewardRows.map(([percent, label, xp]) => (
              <div className="row" key={percent}>
                <span>{percent} · {label}</span>
                <strong>{xp}</strong>
              </div>
            ))}
          </div>
          <div className="habits-current">
            <div className="habit-week">Текущее звание месяца</div>
            <h3>{program.stats.rank.title}</h3>
            <p>{program.stats.rank.monthPercent ?? 0}% от личного максимума месяца · {program.stats.rank.monthXp ?? 0}/{program.stats.rank.monthMaxXp ?? 0} XP</p>
            <div className="progress-bg"><div className="progress-fill" style={{ width: `${program.stats.rank.progress}%` }} /></div>
            {rankRows.map(([range, label]) => (
              <div className="row" key={label}>
                <span>{label}</span>
                <strong>{range}</strong>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="habits-panel habits-wide">
        <h2>{t.guide.quickStartTitle}</h2>
        <div className="habits-guide-steps">
          {t.guide.quickStart.map((step, index) => (
            <div className="habits-guide-step" key={step}>
              <span>{index + 1}</span>
              <strong>{step}</strong>
            </div>
          ))}
        </div>
      </section>
      <section className="habits-panel habits-wide">
        <h2>{t.dashboard.metricScaleTitle}</h2>
        <div className="habits-guide-metric-grid">
          {([
            ["energy", t.metrics.energy, t.habitsUx.metricScales.energy],
            ["clarity", t.metrics.clarity, t.habitsUx.metricScales.clarity],
            ["stability", t.metrics.stability, t.habitsUx.metricScales.stability]
          ] as const).map(([id, label, scale]) => (
            <details className="habits-metric-help" open={id === "energy"} key={id}>
              <summary>{label}</summary>
              <ul>
                {scale.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </details>
          ))}
        </div>
      </section>
      <section className="habits-panel habits-wide">
        <h2>{t.habitsUx.actionHelp.title}</h2>
        <div className="habits-action-help-grid">
          <p><strong>{t.journey.markToday}</strong>{t.habitsUx.actionHelp.advance}</p>
          <p><strong>{t.dashboard.saveMetric}</strong>{t.habitsUx.actionHelp.softAdvance}</p>
          <p><strong>{t.dashboard.saveInsight}</strong>{t.habitsUx.actionHelp.freeze}</p>
          <p><strong>{t.journey.calendar}</strong>{t.habitsUx.actionHelp.calendar}</p>
        </div>
      </section>
    </div>
  );
}

function SettingsTab(props: {
  t: ReturnType<typeof useSiteText>["habits"]["app"];
  program: HabitProgramSummary;
  config: HabitConfigResponse | null;
  zoneOptions: Array<{ id: string; label: string }>;
  name: string;
  zone: string;
  avatar: string;
  reminderEnabled: boolean;
  reminderTime: string;
  telegramStatus: TelegramStatusResponse | null;
  telegramBusy: boolean;
  busy: boolean;
  setName: (value: string) => void;
  setZone: (value: string) => void;
  setAvatar: (value: string) => void;
  setAvatarFile: (file: File | null) => void;
  setReminderEnabled: (value: boolean) => void;
  setReminderTime: (value: string) => void;
  saveSettings: () => void;
  connectTelegram: () => void;
  saveTelegramPreferences: (payload?: { telegramEnabled?: boolean; motivationFrequency?: TelegramFrequency }) => void;
}) {
  const telegramEnabled = props.telegramStatus?.preferences?.telegramEnabled ?? false;
  const telegramFrequency = normalizeTelegramFrequency(props.telegramStatus?.preferences?.motivationFrequency);
  const telegramLinked = Boolean(props.telegramStatus?.linked);
  return (
    <div className="habits-grid">
      <section className="habits-panel">
        <h2>{props.t.settings.profile}</h2>
        <label className="habits-field">
          <span><User size={15} />{props.t.settings.name}</span>
          <input className="input" value={props.name} onChange={(event) => props.setName(event.target.value)} />
        </label>
        <label className="habits-field">
          <span>{props.t.settings.avatar}</span>
          <div className="habits-avatar-editor">
            <AvatarView value={props.avatar} fallback={props.name.slice(0, 1) || "P"} className="habits-settings-avatar" />
            <div>
              <input className="input" value={props.avatar.startsWith("data:image/") ? "" : props.avatar} onChange={(event) => props.setAvatar(event.target.value)} maxLength={500} placeholder="A, 🙂 или https://..." />
              <input className="input" type="file" accept="image/*" onChange={(event) => props.setAvatarFile(event.target.files?.[0] ?? null)} />
            </div>
          </div>
        </label>
        <label className="habits-field">
          <span>{props.t.settings.weakZone}</span>
          <select className="input" value={props.zone} onChange={(event) => props.setZone(event.target.value)}>
            {props.zoneOptions.map((option) => <option value={option.id} key={option.id}>{option.label}</option>)}
          </select>
        </label>
      </section>
      <section className="habits-panel">
        <h2>{props.t.settings.reminders}</h2>
        <label className="habits-toggle">
          <input type="checkbox" checked={props.reminderEnabled} onChange={(event) => props.setReminderEnabled(event.target.checked)} />
          <span>{props.t.settings.reminderEnabled}</span>
        </label>
        <label className="habits-field">
          <span>{props.t.settings.reminderTime}</span>
          <input className="input" type="time" value={props.reminderTime} onChange={(event) => props.setReminderTime(event.target.value)} />
        </label>
      </section>
      <section className="habits-panel">
        <h2>{props.t.settings.telegramTitle}</h2>
        <p className="habits-muted">{props.t.settings.telegramCopy}</p>
        <div className="habits-current">
          <div className="habit-detail">
            <strong>{props.t.settings.telegramStatus}</strong>
            {props.telegramStatus?.configured === false
              ? props.t.settings.telegramNotConfigured
              : telegramLinked
                ? props.t.settings.telegramLinked
                : props.t.settings.telegramNotLinked}
          </div>
          {props.telegramStatus?.account?.username && (
            <div className="habit-detail">
              <strong>@{props.telegramStatus.account.username}</strong>
              {props.telegramStatus.account.status}
            </div>
          )}
        </div>
        <button className="button secondary" type="button" disabled={props.telegramBusy || props.telegramStatus?.configured === false} onClick={props.connectTelegram}>
          <Bot size={17} />
          {telegramLinked ? props.t.settings.telegramReconnect : props.t.settings.telegramConnect}
        </button>
        <label className="habits-toggle">
          <input
            type="checkbox"
            checked={telegramEnabled}
            disabled={!telegramLinked || props.telegramBusy}
            onChange={(event) => props.saveTelegramPreferences({ telegramEnabled: event.target.checked })}
          />
          <span>{props.t.settings.telegramEnabled}</span>
        </label>
        <label className="habits-field">
          <span>{props.t.settings.telegramFrequency}</span>
          <select
            className="input"
            value={telegramFrequency}
            disabled={!telegramLinked || props.telegramBusy}
            onChange={(event) => props.saveTelegramPreferences({ motivationFrequency: event.target.value as TelegramFrequency })}
          >
            <option value="daily">{props.t.settings.telegramDaily}</option>
            <option value="weekdays">{props.t.settings.telegramWeekdays}</option>
            <option value="weekly">{props.t.settings.telegramWeekly}</option>
            <option value="off">{props.t.settings.telegramOff}</option>
          </select>
        </label>
        <button className="button" type="button" disabled={!telegramLinked || props.telegramBusy} onClick={() => props.saveTelegramPreferences()}>
          <Save size={17} />
          {props.t.settings.telegramSave}
        </button>
      </section>
      <section className="habits-panel habits-wide">
        <h2>{props.t.settings.subscription}</h2>
        <div className="habits-stats">
          <Stat label={props.t.settings.trialLeft} value={props.program.settings.trialDaysLeft ?? 0} />
          <Stat label={props.t.settings.price} value={props.config?.priceLabel ?? "—"} />
          <Stat label="Status" value={props.program.settings.subscriptionStatus} />
        </div>
        <button className="button" type="button" disabled={props.busy} onClick={props.saveSettings}>
          <Save size={17} />
          {props.t.settings.save}
        </button>
      </section>
    </div>
  );
}

function HabitDetailsCard({ habit, t }: { habit: HabitEnrollmentSummary; t: ReturnType<typeof useSiteText>["habits"]["app"] }) {
  return (
    <div className="habits-current">
      <div className="habit-detail"><strong>{t.journey.essence}</strong>{habit.essence}</div>
      <div className="habit-detail"><strong>{t.journey.practice}</strong>{habit.practice}</div>
      <div className="habit-detail"><strong>{t.journey.why}</strong>{habit.why}</div>
      {habit.book && <div className="habit-book">{habit.book}</div>}
    </div>
  );
}

function Coachmark(props: {
  t: ReturnType<typeof useSiteText>["habits"]["app"];
  onClose: () => void;
  onGuide: () => void;
}) {
  return (
    <section className="habits-coachmark" aria-label={props.t.habitsUx.coachmark.title}>
      <div>
        <h2>{props.t.habitsUx.coachmark.title}</h2>
        <p>{props.t.habitsUx.coachmark.copy}</p>
      </div>
      <div className="habits-coachmark-steps">
        {props.t.habitsUx.coachmark.steps.map((step) => <span key={step}>{step}</span>)}
      </div>
      <div className="habits-action-row">
        <button className="button habits-cta" type="button" onClick={props.onClose}>{props.t.habitsUx.coachmark.primary}</button>
        <button className="button secondary habits-cta" type="button" onClick={props.onGuide}>{props.t.habitsUx.coachmark.guide}</button>
      </div>
    </section>
  );
}

function HelpTip({ label }: { label: string }) {
  return (
    <span className="habits-help-tip" tabIndex={0} aria-label={label}>
      ?
      <span>{label}</span>
    </span>
  );
}

function AvatarView({ value, fallback, className }: { value: string; fallback: string; className: string }) {
  const avatar = value.trim();
  const isImage = /^data:image\//.test(avatar) || /^https?:\/\//.test(avatar);
  return (
    <div className={className}>
      {isImage ? <img src={avatar} alt="" /> : <span>{avatar || fallback}</span>}
    </div>
  );
}

function WeekDots({ habit }: { habit: HabitEnrollmentSummary }) {
  const completedDates = new Set(habit.checkins.filter((checkin) => checkin.completed).map((checkin) => checkin.date));
  const days = Array.from({ length: 7 }, (_, index) => index + 1);
  return (
    <div className="habits-week-dots">
      {days.map((day) => (
        <span className={day <= Math.min(completedDates.size, 7) ? "done" : ""} key={day}>
          {day <= completedDates.size ? <CheckCircle2 size={14} /> : <Circle size={14} />}
        </span>
      ))}
    </div>
  );
}

function metricStatus(value: number) {
  if (value >= 7) return "🙂 Хорошо";
  if (value >= 5) return "😐 Норма";
  return "🌧 Низко";
}

function normalizeTelegramFrequency(value?: string | null): TelegramFrequency {
  return value === "off" || value === "daily" || value === "weekdays" || value === "weekly" ? value : "daily";
}

function calculateOnboardingStart(answers: Partial<Record<OnboardingZone, number>>): { weakZone: OnboardingZone; focus: HabitStartFocus } {
  const scored = onboardingZones.map((zone) => ({ zone, score: answers[zone] ?? 3 }));
  const weakest = scored.sort((left, right) => left.score - right.score)[0]?.zone ?? "passion";
  const focusByZone: Record<OnboardingZone, HabitStartFocus> = {
    passion: "energy",
    mission: "rhythm",
    profession: "focus",
    vocation: "career"
  };
  return {
    weakZone: weakest,
    focus: focusByZone[weakest]
  };
}

function formatTemplate(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce((result, [key, value]) => result.replaceAll(`{${key}}`, String(value)), template);
}

function clipText(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

function groupWeekSummariesByMonth(summaries: HabitProgramSummary["weekSummaries"]) {
  const groups = new Map<string, { key: string; label: string; summaries: HabitProgramSummary["weekSummaries"] }>();
  for (const summary of summaries) {
    const date = new Date(summary.createdAt);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const label = new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(date);
    const group = groups.get(key) ?? { key, label, summaries: [] };
    group.summaries.push(summary);
    groups.set(key, group);
  }
  return Array.from(groups.values());
}

function MetricSlider(props: { icon: string; color: string; label: string; value: number; hint: string; scale: readonly string[]; numberHints: readonly string[]; onChange: (value: number) => void }) {
  const progress = Math.max(0, Math.min(100, props.value * 10));
  const selectedNumberHint = props.numberHints[props.value] ?? props.hint;
  const helpText = `${selectedNumberHint} ${props.scale.join(" ")}`;
  return (
    <div className="habits-slider" style={{ "--metric-color": props.color, "--metric-progress": `${progress}%` } as CSSProperties}>
      <label htmlFor={`metric-${props.label}`}>
        <span className="habits-inline-icon">{props.icon}</span>
        {props.label}
        <HelpTip label={helpText} />
      </label>
      <em>{metricStatus(props.value)}</em>
      <strong>{props.value}/10</strong>
      <input id={`metric-${props.label}`} type="range" min={0} max={10} value={props.value} onChange={(event) => props.onChange(Number(event.target.value))} />
    </div>
  );
}

function metricValueHint(value: number, hints: readonly string[]) {
  if (value <= 2) return hints[0] ?? "";
  if (value <= 4) return hints[1] ?? "";
  if (value <= 6) return hints[2] ?? "";
  if (value <= 8) return hints[3] ?? "";
  return hints[4] ?? "";
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="habits-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function buildNextHabitEventStart(reminderTime: string) {
  const [hourRaw, minuteRaw] = reminderTime.split(":").map(Number);
  const startsAt = new Date();
  startsAt.setHours(Number.isFinite(hourRaw) ? hourRaw : 9, Number.isFinite(minuteRaw) ? minuteRaw : 0, 0, 0);
  if (startsAt.getTime() < Date.now() - 300000) {
    startsAt.setDate(startsAt.getDate() + 1);
  }
  return startsAt;
}

function formatCalendarDateTime(value: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(value);
}

function buildWeekShareText(program: HabitProgramSummary, habit: HabitEnrollmentSummary) {
  return [
    `ORKEN.LIFE - ${program.title}`,
    `\u0426\u0438\u043a\u043b ${habit.cycle}, \u043d\u0435\u0434\u0435\u043b\u044f ${habit.week}: ${habit.title}`,
    `Фокус: ${habit.focus}`,
    `Отметки: ${habit.checkinsDone}/7`,
    `XP: ${program.stats.xp}`,
    `Ранг: ${program.stats.rank.title}`
  ].join("\n");
}

function copyWeekSummary(program: HabitProgramSummary, habit: HabitEnrollmentSummary, markSaved?: (message: string) => void, message?: string) {
  void navigator.clipboard?.writeText(buildWeekShareText(program, habit)).then(() => {
    if (markSaved && message) markSaved(message);
  }).catch(() => undefined);
}

function copyInsight(text: string, markSaved: (message: string) => void, message: string) {
  void navigator.clipboard?.writeText(text).then(() => markSaved(message)).catch(() => undefined);
}

function readProfileString(profile: Record<string, unknown>, key: string) {
  const value = profile[key];
  return typeof value === "string" ? value : "";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
}

function formatTime(value: Date) {
  return new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit" }).format(value);
}

function readableError(reason: unknown, fallback: string) {
  if (!(reason instanceof Error)) return fallback;
  if (reason.message === "Failed to fetch" || reason.message.includes("fetch")) {
    return "Сервер кабинета временно недоступен. Попробуйте позже.";
  }
  return reason.message || fallback;
}
