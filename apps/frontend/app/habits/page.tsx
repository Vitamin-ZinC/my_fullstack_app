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
  PauseCircle,
  RotateCcw,
  Save,
  Sparkles,
  Trophy,
  User
} from "lucide-react";
import type { HabitConfigResponse, HabitEnrollmentSummary, HabitProgramResponse, HabitProgramSummary } from "@levelup/contracts";
import { api, getStoredLocale, restoreSessionFromUrl, type TextLocale } from "@/lib/api";
import { useSiteText } from "@/lib/useSiteText";

type Tab = "dashboard" | "journey" | "habits" | "navigator" | "archive" | "guide" | "settings";
type DetailTab = "essence" | "practice" | "why";
type ArchiveFilter = "all" | "insights" | "rewards" | "weeks";
type HabitStartFocus = "energy" | "focus" | "career" | "rhythm";
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

const cycleVisuals = [
  { icon: "🌱", color: "#00d4ff" },
  { icon: "🚀", color: "#a855f7" },
  { icon: "🌿", color: "#10b981" },
  { icon: "🌟", color: "#f59e0b" }
] as const;

const zoneIds = ["passion", "mission", "profession", "vocation", "resource", "clarity", "stability", "ikigai"] as const;
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
  const [program, setProgram] = useState<HabitProgramSummary | null>(null);
  const [config, setConfig] = useState<HabitConfigResponse | null>(null);
  const [latestReport, setLatestReport] = useState<{ analysisId: string; profession?: string | null; summary?: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [savedMessage, setSavedMessage] = useState("");
  const [savedAt, setSavedAt] = useState<Date | null>(null);

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

  const activeHabit = program?.activeEnrollment ?? program?.enrollments[0] ?? null;
  const latestMetric = program?.metrics[0];
  const doneToday = Boolean(activeHabit?.checkins.some((checkin) => checkin.date === todayIso() && checkin.completed));
  const focusOptions = useMemo(() => ([
    { id: "rhythm" as const, label: t.focusOptions.rhythm[0], copy: t.focusOptions.rhythm[1] },
    { id: "energy" as const, label: t.focusOptions.energy[0], copy: t.focusOptions.energy[1] },
    { id: "focus" as const, label: t.focusOptions.focus[0], copy: t.focusOptions.focus[1] },
    { id: "career" as const, label: t.focusOptions.career[0], copy: t.focusOptions.career[1] }
  ]), [t]);
  const zoneOptions = useMemo(() => zoneIds.map((id) => ({ id, label: t.zones[id] })), [t]);
  const microSteps = useMemo(() => [
    activeHabit?.practice ?? "Выбери один маленький шаг на 10 минут и остановись на нем.",
    activeHabit ? `Облегченный вариант: 5 минут на тему «${activeHabit.title}», без идеального результата.` : "Облегченный вариант: 5 минут внимания к состоянию.",
    "Запиши одну фразу: что сейчас даст больше ресурса, ясности или движения вперед?"
  ], [activeHabit]);
  const microStepText = microSteps[microStepIndex % microSteps.length];
  const navigatorContext = useMemo(() => ({
    mode: tab === "dashboard" ? "state" : tab === "journey" ? "path" : "chat",
    cycle: program ? `Цикл ${program.currentCycle}` : undefined,
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

  async function startFromLatestReport() {
    if (!latestReport) return;
    setBusy(true);
    setError("");
    try {
      const result = await api.activateHabitsFromReport(latestReport.analysisId);
      applyProgramResponse(result);
      setLatestReport(null);
      markSaved(program ? t.messages.programUpdated : t.messages.programSaved);
    } catch (reason) {
      setError(readableError(reason, t.errors.activate));
    } finally {
      setBusy(false);
    }
  }

  async function startManualProgram(focus: HabitStartFocus = startFocus) {
    setBusy(true);
    setError("");
    try {
      const result = await api.startHabitProgramWithProfile({
        focus,
        name: startName.trim() || undefined,
        weakZone: startZone,
        reminderTime
      });
      applyProgramResponse(result);
      setLatestReport(null);
      markSaved(t.messages.programSaved);
    } catch (reason) {
      setError(readableError(reason, t.errors.start));
    } finally {
      setBusy(false);
    }
  }

  async function saveMetric() {
    if (!program) return;
    setBusy(true);
    try {
      const result = await api.saveHabitMetric({ programId: program.id, energy, clarity, stability });
      applyProgramResponse(result);
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
      markSaved(completed ? t.messages.checkinSaved : t.messages.checkinRemoved);
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

  function softenTodayStep() {
    const softNote = `Облегченный шаг: ${microSteps[1]}`;
    setNote(softNote);
    markSaved(t.dashboard.softStepSaved);
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
        <section className="habits-panel habits-empty">
          <div className="habits-brand inline">
            <img src="/assets/levelup-logo.jpg" alt="" />
            <div>
              <div className="habits-brand-title">ORKEN.LIFE</div>
              <div className="habits-brand-sub">{t.emptyTitle}</div>
            </div>
          </div>
          <h1>{t.emptyTitle}</h1>
          <p>{t.emptyCopy}</p>
          {config && <div className="habits-mini-reward"><Sparkles size={15} /><span>{config.trialDays} дней trial · затем {config.priceLabel} в месяц</span></div>}
          {error && <p className="auth-error">{error}</p>}
          {latestReport ? (
            <div className="habits-current">
              <div className="habit-week">{t.latestReport}</div>
              <h2>{latestReport.profession || "ORKEN.LIFE"}</h2>
              <p>{latestReport.summary || t.emptyCopy}</p>
              <button className="button" type="button" disabled={busy} onClick={startFromLatestReport}>
                <Sparkles size={17} />
                {t.createFromReport}
              </button>
              <button className="button secondary" type="button" disabled={busy} onClick={() => startManualProgram("rhythm")}>
                {t.startWithoutReport}
              </button>
            </div>
          ) : (
            <div className="habits-current">
              <div className="habits-form-row">
                <input className="input" value={startName} onChange={(event) => setStartName(event.target.value)} placeholder={t.settings.name} />
                <select className="input" value={startZone} onChange={(event) => setStartZone(event.target.value)}>
                  {zoneOptions.map((option) => <option value={option.id} key={option.id}>{option.label}</option>)}
                </select>
              </div>
              <div className="habits-onboarding-options" role="list" aria-label="Фокус старта">
                {focusOptions.map((option) => (
                  <button className={startFocus === option.id ? "active" : ""} key={option.id} type="button" onClick={() => setStartFocus(option.id)}>
                    <strong>{option.label}</strong>
                    <span>{option.copy}</span>
                  </button>
                ))}
              </div>
              <button className="button" type="button" disabled={busy} onClick={() => startManualProgram()}>
                <Sparkles size={17} />
                {t.startHabits}
              </button>
              <Link className="button secondary" href="/login">{t.account}</Link>
            </div>
          )}
        </section>
      </main>
    );
  }

  const sidebarName = settingsName || readProfileString(program.profile, "name") || program.title;
  const sidebarZone = zoneOptions.find((option) => option.id === (program.weakZone || settingsZone))?.label || program.weakZone || settingsZone;
  const trialDaysLeft = program.settings.trialDaysLeft ?? config?.trialDays ?? 0;

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
              <button key={item.id} className={tab === item.id ? "active" : ""} type="button" onClick={() => setTab(item.id)}>
                <NavIcon item={item} size={17} />
                {t.nav[item.id]}
              </button>
            );
          })}
        </nav>
        <div className="habits-sidebar-profile">
          <div className="habits-sidebar-avatar">{settingsAvatar || "P"}</div>
          <div>
            <strong>{sidebarName}</strong>
            <span>{t.dashboard.sidebarZone}: {sidebarZone}</span>
          </div>
        </div>
        <Link className="btn-back habits-account-link" href="/account">{t.account}</Link>
      </aside>

      <nav className="habits-bottom-nav" aria-label="Навигация привычек">
        {navItems.map((item) => {
          return (
            <button key={item.id} className={tab === item.id ? "active" : ""} type="button" onClick={() => setTab(item.id)}>
              <NavIcon item={item} size={17} />
              <span>{t.nav[item.id]}</span>
            </button>
          );
        })}
      </nav>

      <section className="habits-main">
        <header className="habits-topbar">
          <div>
            <div className="eyebrow">{t.dashboard.eyebrow}</div>
            <h1>{program.title}</h1>
            <p>{program.topRole || program.archetype || t.dashboard.topbarCopy}</p>
          </div>
          <div className="habits-topbar-actions">
            <div className="habits-top-pill online"><PenguinHeadIcon size={20} />{t.dashboard.pingviOnline}</div>
            <div className="habits-top-pill"><span className="habits-pill-icon">⏳</span>{trialDaysLeft}/{config?.trialDays ?? trialDaysLeft} {t.dashboard.trialDays}</div>
            <div className="habits-top-pill accent"><span className="habits-pill-icon">🔥</span>{program.stats.streakDays} {t.stats.streak}</div>
            <button className="button habits-cta" type="button" disabled={busy} onClick={() => saveCheckin(activeHabit, !doneToday)}>
              {doneToday ? <RotateCcw size={17} /> : <CheckCircle2 size={17} />}
              {doneToday ? t.journey.undoToday : t.journey.markToday}
            </button>
          </div>
        </header>

        {savedMessage && <p className="auth-message">{savedMessage}</p>}
        {savedAt && <p className="habits-save-state">{t.saved} {formatTime(savedAt)}</p>}
        {error && <p className="auth-error">{error}</p>}

        {tab === "dashboard" && (
          <DashboardTab
            t={t}
            program={program}
            config={config}
            activeHabit={activeHabit}
            latestMetric={latestMetric}
            doneToday={doneToday}
            energy={energy}
            clarity={clarity}
            stability={stability}
            note={note}
            insight={insight}
            microStepText={microStepText}
            busy={busy}
            canPersonalize={Boolean(latestReport && program.source !== "analysis-report")}
            setEnergy={setEnergy}
            setClarity={setClarity}
            setStability={setStability}
            setNote={setNote}
            setInsight={setInsight}
            saveMetric={saveMetric}
            saveCheckin={saveCheckin}
            saveInsight={saveInsight}
            softenTodayStep={softenTodayStep}
            rotateTodayStep={() => setMicroStepIndex((value) => value + 1)}
            personalizeFromReport={startFromLatestReport}
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
            busy={busy}
            saveCheckin={saveCheckin}
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
            saveCheckin={saveCheckin}
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
            busy={busy}
            setName={setSettingsName}
            setZone={setSettingsZone}
            setAvatar={setSettingsAvatar}
            setReminderEnabled={setReminderEnabled}
            setReminderTime={setReminderTime}
            saveSettings={saveSettings}
          />
        )}
      </section>
    </main>
  );
}

function DashboardTab(props: {
  t: ReturnType<typeof useSiteText>["habits"]["app"];
  program: HabitProgramSummary;
  config: HabitConfigResponse | null;
  activeHabit: HabitEnrollmentSummary | null;
  latestMetric?: { energy: number; clarity: number; stability: number };
  doneToday: boolean;
  energy: number;
  clarity: number;
  stability: number;
  note: string;
  insight: string;
  microStepText: string;
  busy: boolean;
  canPersonalize: boolean;
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
  personalizeFromReport: () => void;
  openNavigator: () => void;
}) {
  const wellness = props.program.stats.wellnessScore ?? Math.round(((props.energy + props.clarity + props.stability) / 3) * 10);
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
            <h2>{props.t.dashboard.pathTitle}</h2>
            <p>{props.t.dashboard.pathCopy}</p>
          </div>
          <button className="button secondary habits-cta" type="button" onClick={props.openNavigator}>
            <PenguinHeadIcon size={18} />
            {props.t.dashboard.askPingvi}
          </button>
        </div>

        <div className="habits-status-strip">
          <div className="habits-status-card">
            <span><span className="habits-inline-icon">{rankIcon}</span>{props.t.dashboard.currentRank}</span>
            <strong>{props.program.stats.rank.title}</strong>
            <small>{props.program.stats.xp} XP · {props.t.dashboard.nextRank}: {nextRank}</small>
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

      <section className="habits-panel">
        <h2>{props.t.dashboard.todayFocus}</h2>
        <div className="habits-first-step">
          <div>
            <div className="habit-week">{props.t.dashboard.firstStep}</div>
            <p>{props.microStepText}</p>
          </div>
          <div className="habits-action-row">
            <button className="button habits-cta" type="button" disabled={props.busy} onClick={() => props.saveCheckin(props.activeHabit, !props.doneToday)}>
              {props.doneToday ? props.t.journey.undoToday : props.t.dashboard.done}
            </button>
            <button className="button secondary habits-cta" type="button" disabled={props.busy} onClick={props.softenTodayStep}>
              {props.t.dashboard.tooMuch}
            </button>
            <button className="btn-back" type="button" onClick={props.rotateTodayStep}>
              {props.t.dashboard.replace}
            </button>
          </div>
          <p className="habits-action-help">{props.t.dashboard.softStepHelp}</p>
        </div>
        {props.activeHabit && <HabitDetailsCard habit={props.activeHabit} t={props.t} />}
        {props.activeHabit && (
          <div className="habits-week-card habits-compact-week">
            <div className="row">
              <strong>{props.t.journey.weekCalendar}</strong>
              <span>{props.activeHabit.checkinsDone}/7</span>
            </div>
            <WeekDots habit={props.activeHabit} />
            <div className="progress-bg"><div className="progress-fill" style={{ width: `${weekProgress}%` }} /></div>
          </div>
        )}
        <textarea className="input habits-note" placeholder={props.t.dashboard.notePlaceholder} value={props.note} onChange={(event) => props.setNote(event.target.value)} />
        <button className="button" type="button" disabled={props.busy} onClick={() => props.saveCheckin()}>
          <CheckCircle2 size={17} />
          {props.t.dashboard.saveStep}
        </button>
        <p className="habits-action-help">{props.t.dashboard.saveStepHelp}</p>
        {props.canPersonalize && (
          <button className="button secondary" type="button" disabled={props.busy} onClick={props.personalizeFromReport}>
            <Sparkles size={17} />
            {props.t.dashboard.personalize}
          </button>
        )}
      </section>

      <section className="habits-panel">
        <h2>{props.t.dashboard.metricTitle}</h2>
        <p className="habits-muted">{props.t.dashboard.metricCopy}</p>
        <div className="habits-wellness-row">
          <div className="habits-progress-ring" style={{ "--progress": `${wellness}%` } as CSSProperties}>
            <strong>{wellness}</strong>
            <span>{props.t.stats.wellness}</span>
          </div>
          <div className="habits-rank-card">
            <span>{props.program.stats.rank.title}</span>
            <strong>{props.program.stats.xp} XP</strong>
            <div className="progress-bg"><div className="progress-fill" style={{ width: `${props.program.stats.rank.progress}%` }} /></div>
          </div>
        </div>
        <MetricSlider
          icon="⚡"
          color="#00d4ff"
          label={props.t.metrics.energy}
          value={props.energy}
          hint={metricValueHint(props.energy, props.t.dashboard.metricValueHints)}
          onChange={props.setEnergy}
        />
        <MetricSlider
          icon="🧠"
          color="#a855f7"
          label={props.t.metrics.clarity}
          value={props.clarity}
          hint={metricValueHint(props.clarity, props.t.dashboard.metricValueHints)}
          onChange={props.setClarity}
        />
        <MetricSlider
          icon="🌳"
          color="#10b981"
          label={props.t.metrics.stability}
          value={props.stability}
          hint={metricValueHint(props.stability, props.t.dashboard.metricValueHints)}
          onChange={props.setStability}
        />
        <details className="habits-explainer">
          <summary>{props.t.dashboard.metricScaleTitle}</summary>
          <ul>
            {props.t.dashboard.metricScale.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </details>
        {props.latestMetric && (
          <div className="habits-mini-reward">
            {props.t.metrics.energy} {props.latestMetric.energy}/10 · {props.t.metrics.clarity} {props.latestMetric.clarity}/10
          </div>
        )}
        <button className="button secondary" type="button" disabled={props.busy} onClick={props.saveMetric}>
          <Save size={17} />
          {props.t.dashboard.saveMetric}
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
        <h2>{props.t.dashboard.progressTitle}</h2>
        <div className="habits-stats">
          <Stat label={props.t.stats.xp} value={props.program.stats.xp} />
          <Stat label={props.t.stats.cycle} value={props.program.stats.currentCycle} />
          <Stat label={props.t.stats.week} value={props.program.stats.currentWeek} />
          <Stat label={props.t.stats.days} value={props.program.stats.daysInProgram} />
          <Stat label={props.t.stats.checkins} value={props.program.stats.checkinsDone} />
          <Stat label={props.t.stats.streak} value={props.program.stats.streakDays} />
        </div>
        {props.config && (
          <div className="habits-mini-reward">
            <Sparkles size={15} />
            <span>{props.program.settings.trialDaysLeft ?? props.config.trialDays} дней trial · {props.config.priceLabel}/мес</span>
          </div>
        )}
        <div className="habits-reward-list">
          {props.program.rewards.slice(0, 3).map((reward) => (
            <div className="habits-mini-reward" key={reward.id}>
              <Sparkles size={15} />
              <span>{reward.label}</span>
              <strong>+{reward.xp} XP</strong>
            </div>
          ))}
        </div>
        <div className="habits-xp-explainer">
          <div>
            <h3>{props.t.dashboard.xpTitle}</h3>
            <p>{props.t.dashboard.xpCopy}</p>
          </div>
          <ul>
            {props.t.dashboard.xpRules.map((rule) => <li key={rule}>{rule}</li>)}
          </ul>
        </div>
      </section>

      <section className="habits-panel habits-wide">
        <h2>{props.t.dashboard.insightTitle}</h2>
        <textarea className="input habits-note" placeholder={props.t.dashboard.insightPlaceholder} value={props.insight} onChange={(event) => props.setInsight(event.target.value)} />
        <div className="habits-action-row">
          <button className="button secondary" type="button" disabled={props.busy || !props.insight.trim()} onClick={props.saveInsight}>
            <Archive size={17} />
            {props.t.dashboard.saveInsight}
          </button>
          <button className="btn-back" type="button" onClick={props.openNavigator}>
            <Bot size={16} />
            {props.t.dashboard.askPingvi}
          </button>
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
  busy: boolean;
  saveCheckin: (habit?: HabitEnrollmentSummary | null, completed?: boolean) => void;
  advanceWeek: (force?: boolean) => void;
  freezeWeek: () => void;
}) {
  const activeHabit = props.activeHabit;
  const canAdvance = (activeHabit?.checkinsDone ?? 0) >= 7;
  return (
    <div className="habits-grid">
      <section className="habits-panel">
        <h2>{props.t.journey.title}</h2>
        <p className="habits-muted">{props.program.careerAction || props.t.journey.copy}</p>
        {activeHabit && (
          <div className="habits-current">
            <div className="habit-week">Цикл {activeHabit.cycle} · Неделя {activeHabit.week}</div>
            <h3>{activeHabit.title}</h3>
            <p>{activeHabit.focus}</p>
            <div className="habits-tabs">
              {(["essence", "practice", "why"] as DetailTab[]).map((tab) => (
                <button className={`btn-back ${props.detailTab === tab ? "active-control" : ""}`} type="button" key={tab} onClick={() => props.setDetailTab(tab)}>
                  {props.t.journey[tab]}
                </button>
              ))}
            </div>
            <div className="habit-detail">{activeHabit[props.detailTab]}</div>
          </div>
        )}
        {activeHabit && (
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
        )}
      </section>

      <section className="habits-panel">
        <h2>{props.t.journey.title}</h2>
        <div className="habits-action-stack">
          <button className="button" type="button" disabled={props.busy || !canAdvance} onClick={() => props.advanceWeek(false)}>
            <CheckCircle2 size={17} />
            {props.t.journey.advance}
          </button>
          <button className="button secondary" type="button" disabled={props.busy} onClick={() => props.advanceWeek(true)}>
            <Sparkles size={17} />
            {props.t.journey.softAdvance}
          </button>
          <button className="button secondary" type="button" disabled={props.busy || props.program.settings.weeklyFreezes <= 0} onClick={props.freezeWeek}>
            <PauseCircle size={17} />
            {props.program.settings.weeklyFreezes > 0 ? `${props.t.journey.freeze} (${props.program.settings.weeklyFreezes})` : props.t.journey.noFreezes}
          </button>
          {activeHabit && (
            <a className="button secondary" href={buildCalendarUrl(props.program, activeHabit)} target="_blank" rel="noreferrer">
              <CalendarPlus size={17} />
              {props.t.journey.calendar}
            </a>
          )}
        </div>
      </section>

      <section className="habits-panel habits-wide">
        <div className="habits-road">
          {props.program.enrollments.map((habit) => (
            <article className={`habits-cycle ${habit.sortOrder === props.program.currentSortOrder ? "active" : ""}`} key={habit.id}>
              <span>Цикл {habit.cycle} · {habit.week}</span>
              <h3>{habit.title}</h3>
              <p>{habit.focus}</p>
              <small>{habit.checkinsDone > 0 ? `${habit.checkinsDone} отметок` : "Можно начать в любой день"}</small>
            </article>
          ))}
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
  saveCheckin: (habit?: HabitEnrollmentSummary | null, completed?: boolean) => void;
}) {
  const habits = props.selectedCycle === "all"
    ? props.program.enrollments
    : props.program.enrollments.filter((habit) => habit.cycle === props.selectedCycle);
  return (
    <section className="habits-panel">
      <h2>{props.t.habitsScreen.title}</h2>
      <p className="habits-muted">{props.t.habitsScreen.copy}</p>
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
              <div className="habit-week">Цикл {habit.cycle} · Неделя {habit.week}</div>
              <h3>{habit.title}</h3>
              <p>{habit.focus}</p>
              {expanded && <HabitDetailsCard habit={habit} t={props.t} />}
              <div className="habits-action-row">
                <button className="btn-back" type="button" onClick={() => props.setExpandedHabitId(expanded ? null : habit.id)}>
                  <ChevronDown size={15} />
                  {expanded ? props.t.habitsScreen.collapse : props.t.habitsScreen.expand}
                </button>
                <button className="btn-back" type="button" onClick={() => props.saveCheckin(habit, true)}>
                  <CheckCircle2 size={15} />
                  {props.t.habitsScreen.quickMark}
                </button>
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
      <h2>{props.t.navigator.title}</h2>
      <p className="habits-muted">{props.t.navigator.copy}</p>
      <div className="habits-tabs">
        {props.t.navigator.prompts.map((prompt) => (
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
  return (
    <div className="habits-grid">
      <section className="habits-panel habits-wide">
        <h2>{props.t.archive.title}</h2>
        <p className="habits-muted">{props.t.archive.copy}</p>
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
                <p>{item.text}</p>
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
          <h2>{props.t.archive.hall}</h2>
          <div className="habits-rank-ladder">
            {["Начало пути", "Практик Икигай", "Исследователь вектора", "Архитектор привычек", "Проводник Икигай", "Мастер Икигай"].map((rank, index) => (
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
  return (
    <div className="habits-grid">
      <section className="habits-panel">
        <h2>{t.guide.title}</h2>
        <p className="habits-muted">{t.guide.copy}</p>
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
          {program.cycles.map((cycle) => (
            <div className="habits-current" key={cycle.id}>
              <div className="habit-week">{cycle.label}</div>
              <h3>{cycle.title}</h3>
              <p>{cycle.goal}</p>
              <small>{cycle.areas.join(" · ")}</small>
            </div>
          ))}
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
  busy: boolean;
  setName: (value: string) => void;
  setZone: (value: string) => void;
  setAvatar: (value: string) => void;
  setReminderEnabled: (value: boolean) => void;
  setReminderTime: (value: string) => void;
  saveSettings: () => void;
}) {
  return (
    <div className="habits-grid">
      <section className="habits-panel">
        <h2>{props.t.settings.title}</h2>
        <p className="habits-muted">{props.t.settings.copy}</p>
        <label className="habits-field">
          <span><User size={15} />{props.t.settings.name}</span>
          <input className="input" value={props.name} onChange={(event) => props.setName(event.target.value)} />
        </label>
        <label className="habits-field">
          <span>{props.t.settings.avatar}</span>
          <input className="input" value={props.avatar} onChange={(event) => props.setAvatar(event.target.value)} maxLength={8} />
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

function MetricSlider(props: { icon: string; color: string; label: string; value: number; hint: string; onChange: (value: number) => void }) {
  const progress = Math.max(0, Math.min(100, props.value * 10));
  return (
    <label className="habits-slider" style={{ "--metric-color": props.color, "--metric-progress": `${progress}%` } as CSSProperties}>
      <span><span className="habits-inline-icon">{props.icon}</span>{props.label}</span>
      <em>{metricStatus(props.value)}</em>
      <strong>{props.value}/10</strong>
      <input type="range" min={0} max={10} value={props.value} onChange={(event) => props.onChange(Number(event.target.value))} />
      <small>{props.hint}</small>
    </label>
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

function buildCalendarUrl(program: HabitProgramSummary, habit: HabitEnrollmentSummary) {
  const date = new Date();
  const [hour, minute] = program.settings.reminderTime.split(":").map(Number);
  date.setHours(hour || 9, minute || 0, 0, 0);
  const end = new Date(date.getTime() + 15 * 60000);
  const fmt = (value: Date) => value.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `ORKEN.LIFE: ${habit.title}`,
    details: habit.practice,
    dates: `${fmt(date)}/${fmt(end)}`
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
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
    return "Сервер кабинета временно недоступен. Проверьте, что backend запущен.";
  }
  return reason.message || fallback;
}
