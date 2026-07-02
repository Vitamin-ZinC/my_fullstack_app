"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import {
  Archive,
  Bot,
  CheckCircle2,
  Compass,
  Gauge,
  LayoutDashboard,
  Save,
  Sparkles
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { HabitEnrollmentSummary, HabitProgramSummary } from "@levelup/contracts";
import { api } from "@/lib/api";

type Tab = "dashboard" | "journey" | "archive" | "navigator";
type ChatMessage = { role: "user" | "assistant"; text: string };
type HabitStartFocus = "energy" | "focus" | "career" | "rhythm";

const navItems: Array<{ id: Tab; label: string; icon: LucideIcon }> = [
  { id: "dashboard", label: "Дашборд", icon: LayoutDashboard },
  { id: "journey", label: "Мой путь", icon: Compass },
  { id: "archive", label: "Архив", icon: Archive },
  { id: "navigator", label: "Навигатор", icon: Bot }
];

const startFocusOptions: Array<{ id: HabitStartFocus; label: string; copy: string }> = [
  { id: "rhythm", label: "Мягкий ритм", copy: "начать спокойно, без ощущения долга" },
  { id: "energy", label: "Больше энергии", copy: "сначала восстановить ресурс" },
  { id: "focus", label: "Больше фокуса", copy: "выбирать один главный шаг дня" },
  { id: "career", label: "Карьерный вектор", copy: "проверять направление маленькими действиями" }
];

export default function HabitsPage() {
  return (
    <Suspense fallback={<HabitsLoading />}>
      <HabitsContent />
    </Suspense>
  );
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
  const [tab, setTab] = useState<Tab>("dashboard");
  const [program, setProgram] = useState<HabitProgramSummary | null>(null);
  const [latestReport, setLatestReport] = useState<{ analysisId: string; profession?: string | null; summary?: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [startFocus, setStartFocus] = useState<HabitStartFocus>("rhythm");
  const [energy, setEnergy] = useState(6);
  const [clarity, setClarity] = useState(6);
  const [stability, setStability] = useState(6);
  const [note, setNote] = useState("");
  const [insight, setInsight] = useState("");
  const [savedMessage, setSavedMessage] = useState("");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [microStepIndex, setMicroStepIndex] = useState(0);
  const [chatInput, setChatInput] = useState("");
  const [threadId, setThreadId] = useState<string | undefined>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        if (analysisId) {
          const result = await api.activateHabitsFromReport(analysisId);
          if (!cancelled) setProgram(result.program);
          return;
        }
        const result = await api.habitsMe();
        if (!cancelled) {
          setProgram(result.program);
          setLatestReport(result.latestReport);
          void api.trackEvent(entryPoint === "account" ? "habits_opened_from_account" : "habits_opened", {
            hasProgram: Boolean(result.program),
            hasLatestReport: Boolean(result.latestReport),
            entryPoint
          }).catch(() => undefined);
        }
      } catch (reason) {
        if (!cancelled) setError(readableError(reason, "Не удалось открыть привычки"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [analysisId, entryPoint]);

  const activeHabit = program?.activeEnrollment ?? program?.enrollments[0] ?? null;
  const latestMetric = program?.metrics[0];
  const microSteps = useMemo(() => [
    activeHabit?.practice ?? "Выбери один маленький шаг на 10 минут и остановись на нем.",
    activeHabit ? `Облегченный вариант: 5 минут на тему «${activeHabit.title}», без идеального результата.` : "Облегченный вариант: 5 минут внимания к состоянию.",
    "Запиши одну фразу: что сейчас даст больше ресурса, ясности или движения вперед?"
  ], [activeHabit]);
  const microStepText = microSteps[microStepIndex % microSteps.length];
  const navigatorContext = useMemo(() => ({
    mode: tab === "dashboard" ? "state" : tab === "journey" ? "path" : "chat",
    cycle: program ? "Цикл 1" : undefined,
    week: program?.stats.currentWeek,
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

  async function startFromLatestReport() {
    if (!latestReport) return;
    setBusy(true);
    setError("");
    try {
      const result = await api.activateHabitsFromReport(latestReport.analysisId);
      setProgram(result.program);
      setLatestReport(null);
      markSaved(program ? "Программа обновлена по отчету без сброса прогресса" : "Программа сохранена в кабинете");
    } catch (reason) {
      setError(readableError(reason, "Не удалось активировать привычки"));
    } finally {
      setBusy(false);
    }
  }

  async function startManualProgram(focus: HabitStartFocus = startFocus) {
    setBusy(true);
    setError("");
    try {
      const result = await api.startHabitProgram(focus);
      setProgram(result.program);
      setLatestReport(null);
      markSaved("Базовая программа привычек сохранена в кабинете");
    } catch (reason) {
      setError(readableError(reason, "Не удалось запустить привычки"));
    } finally {
      setBusy(false);
    }
  }

  async function saveMetric() {
    if (!program) return;
    setBusy(true);
    setSavedMessage("");
    try {
      const result = await api.saveHabitMetric({ programId: program.id, energy, clarity, stability });
      setProgram(result.program);
      markSaved("Метрика дня сохранена");
    } catch (reason) {
      setError(readableError(reason, "Не удалось сохранить метрики"));
    } finally {
      setBusy(false);
    }
  }

  async function completeHabit(noteOverride?: string) {
    if (!program || !activeHabit) return;
    setBusy(true);
    setSavedMessage("");
    try {
      const result = await api.saveHabitCheckin({
        programId: program.id,
        enrollmentId: activeHabit.id,
        completed: true,
        note: noteOverride ?? (note.trim() || undefined),
        energy,
        clarity,
        stability
      });
      setProgram(result.program);
      setNote("");
      markSaved("Шаг отмечен, награда добавлена");
    } catch (reason) {
      setError(readableError(reason, "Не удалось отметить привычку"));
    } finally {
      setBusy(false);
    }
  }

  async function saveInsight() {
    if (!program || !insight.trim()) return;
    setBusy(true);
    setSavedMessage("");
    try {
      const result = await api.saveHabitInsight({
        programId: program.id,
        enrollmentId: activeHabit?.id,
        text: insight.trim()
      });
      setProgram(result.program);
      setInsight("");
      markSaved("Инсайт сохранен в архив");
    } catch (reason) {
      setError(readableError(reason, "Не удалось сохранить инсайт"));
    } finally {
      setBusy(false);
    }
  }

  function softenTodayStep() {
    const softNote = `Облегченный шаг: ${microSteps[1]}`;
    setNote(softNote);
    markSaved("Выбран облегченный вариант. Его можно отметить как шаг дня.");
  }

  function rotateTodayStep() {
    setMicroStepIndex((value) => value + 1);
    setSavedMessage("");
  }

  function markSaved(message: string) {
    setSavedMessage(message);
    setSavedAt(new Date());
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
              <div className="habits-brand-sub">Кабинет привычек</div>
            </div>
          </div>
          <h1>Привычки теперь сохраняются в кабинете</h1>
          <p>
            Повторно проходить диагностику не нужно: можно запустить базовую программу сразу или собрать
            персональную версию из последнего сохраненного отчета.
          </p>
          {error && <p className="auth-error">{error}</p>}
          {latestReport ? (
            <div className="habits-current">
              <div className="habit-week">Последний отчет</div>
              <h2>{latestReport.profession || "Диагностика ORKEN.LIFE"}</h2>
              <p>{latestReport.summary || "По этому отчету можно собрать программу привычек."}</p>
              <button className="button" type="button" disabled={busy} onClick={startFromLatestReport}>
                <Sparkles size={17} />
                Создать программу из отчета
              </button>
              <button className="button secondary" type="button" disabled={busy} onClick={() => startManualProgram("rhythm")}>
                Начать без диагностики
              </button>
            </div>
          ) : (
            <div className="habits-current">
              <h2>Можно начать без отчета</h2>
              <p>Запустите базовый путь привычек сейчас. Если позже появится диагностический отчет, навигатор сможет опираться и на него.</p>
              <div className="habits-onboarding-options" role="list" aria-label="Фокус старта">
                {startFocusOptions.map((option) => (
                  <button
                    className={startFocus === option.id ? "active" : ""}
                    key={option.id}
                    type="button"
                    onClick={() => setStartFocus(option.id)}
                  >
                    <strong>{option.label}</strong>
                    <span>{option.copy}</span>
                  </button>
                ))}
              </div>
              <button className="button" type="button" disabled={busy} onClick={() => startManualProgram()}>
                <Sparkles size={17} />
                Начать привычки
              </button>
              <Link className="button secondary" href="/login">Войти в кабинет</Link>
            </div>
          )}
          <Link className="btn-back habits-standalone-link" href="/habits-standalone.html">Открыть старый HTML-трекер</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="habits-app" data-testid="habits-app">
      <aside className="habits-sidebar">
        <Link className="habits-brand" href="/">
          <img src="/assets/levelup-logo.jpg" alt="" />
          <div>
            <div className="habits-brand-title">ORKEN.LIFE</div>
            <div className="habits-brand-sub">Кабинет привычек</div>
          </div>
        </Link>
        <nav className="habits-nav">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.id} className={tab === item.id ? "active" : ""} type="button" onClick={() => setTab(item.id)}>
                <Icon size={17} />
                {item.label}
              </button>
            );
          })}
        </nav>
        <Link className="btn-back habits-account-link" href="/account">Кабинет</Link>
      </aside>
      <nav className="habits-bottom-nav" aria-label="Навигация привычек">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <button key={item.id} className={tab === item.id ? "active" : ""} type="button" onClick={() => setTab(item.id)}>
              <Icon size={17} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <section className="habits-main">
        <header className="habits-topbar">
          <div>
            <div className="eyebrow">Сохраненная программа</div>
            <h1>{program.title}</h1>
            <p>{program.topRole || program.archetype || "Персональный путь по диагностике"}</p>
          </div>
          <button className="button habits-cta" type="button" disabled={busy} onClick={() => completeHabit()}>
            <CheckCircle2 size={17} />
            Отметить шаг
          </button>
        </header>

        {savedMessage && <p className="auth-message">{savedMessage}</p>}
        {savedAt && <p className="habits-save-state">Сохранено {formatTime(savedAt)}</p>}
        {error && <p className="auth-error">{error}</p>}

        {tab === "dashboard" && (
          <DashboardTab
            program={program}
            activeHabit={activeHabit}
            latestMetric={latestMetric}
            energy={energy}
            clarity={clarity}
            stability={stability}
            note={note}
            insight={insight}
            savedAt={savedAt}
            microStepText={microStepText}
            canPersonalize={Boolean(latestReport && program.source !== "analysis-report")}
            busy={busy}
            setEnergy={setEnergy}
            setClarity={setClarity}
            setStability={setStability}
            setNote={setNote}
            setInsight={setInsight}
            saveMetric={saveMetric}
            completeHabit={completeHabit}
            saveInsight={saveInsight}
            softenTodayStep={softenTodayStep}
            rotateTodayStep={rotateTodayStep}
            personalizeFromReport={startFromLatestReport}
          />
        )}
        {tab === "journey" && <JourneyTab program={program} />}
        {tab === "archive" && <ArchiveTab program={program} />}
        {tab === "navigator" && (
          <NavigatorTab
            messages={messages}
            input={chatInput}
            setInput={setChatInput}
            askNavigator={askNavigator}
          />
        )}
      </section>
    </main>
  );
}

function DashboardTab(props: {
  program: HabitProgramSummary;
  activeHabit: HabitEnrollmentSummary | null;
  latestMetric?: { energy: number; clarity: number; stability: number };
  energy: number;
  clarity: number;
  stability: number;
  note: string;
  insight: string;
  savedAt: Date | null;
  microStepText: string;
  canPersonalize: boolean;
  busy: boolean;
  setEnergy: (value: number) => void;
  setClarity: (value: number) => void;
  setStability: (value: number) => void;
  setNote: (value: string) => void;
  setInsight: (value: string) => void;
  saveMetric: () => void;
  completeHabit: (noteOverride?: string) => void;
  saveInsight: () => void;
  softenTodayStep: () => void;
  rotateTodayStep: () => void;
  personalizeFromReport: () => void;
}) {
  return (
    <div className="habits-grid">
      <section className="habits-panel">
        <h2>Сегодняшний фокус</h2>
        <div className="habits-first-step">
          <div>
            <div className="habit-week">Первый шаг сегодня</div>
            <p>{props.microStepText}</p>
            {props.savedAt && <small>Последнее сохранение: {formatTime(props.savedAt)}</small>}
          </div>
          <div className="habits-action-row">
            <button className="button habits-cta" type="button" disabled={props.busy} onClick={() => props.completeHabit()}>
              Сделал
            </button>
            <button className="button secondary habits-cta" type="button" disabled={props.busy} onClick={props.softenTodayStep}>
              Слишком много
            </button>
            <button className="btn-back" type="button" onClick={props.rotateTodayStep}>
              Заменить
            </button>
          </div>
        </div>
        {props.activeHabit && (
          <div className="habits-current">
            <div className="habit-week">Неделя {props.activeHabit.week}</div>
            <h3>{props.activeHabit.title}</h3>
            <p>{props.activeHabit.essence}</p>
            <div className="habit-detail"><strong>Практика</strong>{props.activeHabit.practice}</div>
            <div className="habit-detail"><strong>Зачем</strong>{props.activeHabit.why}</div>
          </div>
        )}
        <textarea
          className="input habits-note"
          placeholder="Короткая заметка к сегодняшнему шагу"
          value={props.note}
          onChange={(event) => props.setNote(event.target.value)}
        />
        <button className="button" type="button" disabled={props.busy} onClick={() => props.completeHabit()}>
          <CheckCircle2 size={17} />
          Сохранить мягкий шаг
        </button>
        {props.canPersonalize && (
          <button className="button secondary" type="button" disabled={props.busy} onClick={props.personalizeFromReport}>
            <Sparkles size={17} />
            Обновить по отчету без сброса
          </button>
        )}
      </section>

      <section className="habits-panel">
        <h2>Метрика дня</h2>
        <p className="habits-muted">Это не обязанность, а быстрый снимок состояния.</p>
        <MetricSlider icon={Gauge} label="Энергия" value={props.energy} onChange={props.setEnergy} />
        <MetricSlider icon={Compass} label="Ясность" value={props.clarity} onChange={props.setClarity} />
        <MetricSlider icon={Sparkles} label="Устойчивость" value={props.stability} onChange={props.setStability} />
        {props.latestMetric && (
          <div className="habits-mini-reward">
            Последняя запись: энергия {props.latestMetric.energy}/10, ясность {props.latestMetric.clarity}/10
          </div>
        )}
        <button className="button secondary" type="button" disabled={props.busy} onClick={props.saveMetric}>
          <Save size={17} />
          Сохранить состояние
        </button>
      </section>

      <section className="habits-panel habits-wide">
        <h2>Видимый прогресс</h2>
        <div className="habits-stats">
          <Stat label="XP" value={props.program.stats.xp} />
          <Stat label="Неделя" value={props.program.stats.currentWeek} />
          <Stat label="Дней в пути" value={props.program.stats.daysInProgram} />
          <Stat label="Шагов" value={props.program.stats.checkinsDone} />
          <Stat label="Инсайтов" value={props.program.stats.insightsCount} />
          <Stat label="Мягкий стрик" value={props.program.stats.streakDays} />
        </div>
        <div className="habits-reward-list">
          {props.program.rewards.slice(0, 3).map((reward) => (
            <div className="habits-mini-reward" key={reward.id}>
              <Sparkles size={15} />
              <span>{reward.label}</span>
              <strong>+{reward.xp} XP</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="habits-panel habits-wide">
        <h2>Инсайт в архив</h2>
        <textarea
          className="input habits-note"
          placeholder="Что стало понятнее после практики?"
          value={props.insight}
          onChange={(event) => props.setInsight(event.target.value)}
        />
        <button className="button secondary" type="button" disabled={props.busy || !props.insight.trim()} onClick={props.saveInsight}>
          <Archive size={17} />
          Сохранить инсайт
        </button>
      </section>
    </div>
  );
}

function JourneyTab({ program }: { program: HabitProgramSummary }) {
  return (
    <section className="habits-panel">
      <h2>Мой путь</h2>
      <p className="habits-muted">{program.careerAction || "Программа переводит выводы диагностики в маленькие действия без повторного прохождения теста."}</p>
      <div className="habits-road">
        {program.enrollments.map((habit) => (
          <article className={`habits-cycle ${habit.sortOrder === program.stats.currentWeek ? "active" : ""}`} key={habit.id}>
            <span>Неделя {habit.week}</span>
            <h3>{habit.title}</h3>
            <p>{habit.focus}</p>
            <small>{habit.checkinsDone > 0 ? `${habit.checkinsDone} отметок` : "Можно начать в любой день"}</small>
          </article>
        ))}
      </div>
    </section>
  );
}

function ArchiveTab({ program }: { program: HabitProgramSummary }) {
  return (
    <section className="habits-panel">
      <h2>Архив инсайтов</h2>
      <p className="habits-muted">Все инсайты сохраняются отдельными записями и не перетирают друг друга.</p>
      <div className="habits-archive">
        {program.insights.length === 0 ? (
          <div className="habits-current">Пока нет сохраненных инсайтов.</div>
        ) : (
          program.insights.map((item) => (
            <article className="habits-card" key={item.id}>
              <div className="habit-week">{formatDate(item.createdAt)}{item.habitTitle ? ` · ${item.habitTitle}` : ""}</div>
              <p>{item.text}</p>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function NavigatorTab(props: {
  messages: ChatMessage[];
  input: string;
  setInput: (value: string) => void;
  askNavigator: (prompt?: string) => void;
}) {
  const prompts = ["Что сделать сегодня?", "Помоги с привычкой", "Разбери мой фокус", "Как не давить на себя?"];
  return (
    <section className="habits-panel habits-chat">
      <h2>AI Навигатор</h2>
      <div className="habits-tabs">
        {prompts.map((prompt) => (
          <button className="btn-back" type="button" key={prompt} onClick={() => props.askNavigator(prompt)}>{prompt}</button>
        ))}
      </div>
      <div className="habits-chat-log">
        {props.messages.length === 0 ? (
          <div className="habits-bubble ai">Пингви видит текущую привычку, метрики и архив инсайтов. Можно спросить коротко и без контекста.</div>
        ) : (
          props.messages.map((message, index) => (
            <div className={`habits-bubble ${message.role === "assistant" ? "ai" : "user"}`} key={`${message.role}-${index}`}>
              {message.text}
            </div>
          ))
        )}
      </div>
      <div className="habits-chat-form">
        <input
          className="input"
          value={props.input}
          placeholder="Написать Пингви"
          onChange={(event) => props.setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") props.askNavigator();
          }}
        />
        <button className="button habits-cta" type="button" onClick={() => props.askNavigator()}>
          <Bot size={17} />
          Спросить
        </button>
      </div>
    </section>
  );
}

function MetricSlider(props: {
  icon: LucideIcon;
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const Icon = props.icon;
  return (
    <label className="habits-slider">
      <span><Icon size={16} />{props.label}</span>
      <input
        type="range"
        min={0}
        max={10}
        value={props.value}
        onChange={(event) => props.onChange(Number(event.target.value))}
      />
      <strong>{props.value}/10</strong>
    </label>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="habits-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(new Date(value));
}

function formatTime(value: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(value);
}

function readableError(reason: unknown, fallback: string) {
  if (!(reason instanceof Error)) return fallback;
  if (reason.message === "Failed to fetch" || reason.message.includes("fetch")) {
    return "Сервер кабинета временно недоступен. Проверьте, что backend запущен.";
  }
  return reason.message || fallback;
}
