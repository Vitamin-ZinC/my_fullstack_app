"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CheckCircle2, Send, Sparkles } from "lucide-react";
import type { HabitProgramSummary, MeReportSummary, MeResponse } from "@levelup/contracts";
import { api } from "@/lib/api";

type ChatMessage = { role: "user" | "assistant"; text: string };

export default function AccountPage() {
  const router = useRouter();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [reports, setReports] = useState<MeReportSummary[]>([]);
  const [program, setProgram] = useState<HabitProgramSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [savedMessage, setSavedMessage] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [threadId, setThreadId] = useState<string | undefined>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  useEffect(() => {
    Promise.all([api.me(), api.myReports(), api.habitsMe()])
      .then(([nextMe, nextReports, habits]) => {
        setMe(nextMe);
        setReports(nextReports);
        setProgram(habits.program);
        void api.trackEvent("account_hub_opened", {
          hasHabitProgram: Boolean(habits.program),
          reportCount: nextMe.reportCount
        }).catch(() => undefined);
      })
      .catch(() => setError("Войдите или создайте аккаунт, чтобы открыть кабинет. Повторно проходить диагностику для этого не нужно."))
      .finally(() => setLoading(false));
  }, []);

  async function logout() {
    await api.logout();
    router.push("/login");
  }

  async function startHabits() {
    setBusy(true);
    setSavedMessage("");
    try {
      const result = await api.startHabitProgram("rhythm");
      setProgram(result.program);
      setSavedMessage("Привычки запущены и сохранены в кабинете");
    } catch (reason) {
      setSavedMessage(reason instanceof Error ? reason.message : "Не удалось запустить привычки");
    } finally {
      setBusy(false);
    }
  }

  async function completeTodayStep() {
    const activeHabit = program?.activeEnrollment ?? program?.enrollments[0] ?? null;
    if (!program || !activeHabit) return;
    setBusy(true);
    setSavedMessage("");
    try {
      const result = await api.saveHabitCheckin({
        programId: program.id,
        enrollmentId: activeHabit.id,
        completed: true,
        note: "Быстрая отметка из кабинета"
      });
      setProgram(result.program);
      setSavedMessage("Шаг дня отмечен");
    } catch (reason) {
      setSavedMessage(reason instanceof Error ? reason.message : "Не удалось отметить шаг");
    } finally {
      setBusy(false);
    }
  }

  async function askPingvi(prompt?: string) {
    const text = (prompt ?? chatInput).trim();
    if (!text) return;
    const activeHabit = program?.activeEnrollment ?? program?.enrollments[0] ?? null;
    const nextMessages: ChatMessage[] = [...messages, { role: "user", text }];
    setMessages(nextMessages);
    setChatInput("");
    setBusy(true);
    try {
      const result = await api.askHabitNavigator({
        programId: program?.id,
        threadId,
        message: text,
        messages,
        context: {
          mode: "chat",
          name: me?.user.name || me?.user.email,
          habit: activeHabit?.title,
          topRole: program?.topRole ?? undefined,
          weakZone: program?.weakZone ?? undefined,
          careerAction: program?.careerAction ?? undefined,
          recentInsight: program?.insights[0]?.text,
          streakDays: program?.stats.streakDays
        }
      });
      setThreadId(result.threadId);
      setMessages([...nextMessages, { role: "assistant", text: result.reply }]);
    } catch (reason) {
      setMessages([...nextMessages, { role: "assistant", text: reason instanceof Error ? reason.message : "Пингви временно недоступен" }]);
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <article className="stack">
        <div className="card">
          <div className="eyebrow">Аккаунт</div>
          <h1 className="ub flow-title">Загружаем кабинет...</h1>
        </div>
      </article>
    );
  }

  if (error || !me) {
    return (
      <article className="stack">
        <div className="card error-card">
          <div className="eyebrow">Аккаунт</div>
          <h1 className="ub flow-title">Войдите, чтобы открыть кабинет</h1>
          <p className="flow-copy">{error || "Сессия не найдена"}</p>
        </div>
        <div className="row">
          <Link className="button" href="/login">Войти</Link>
          <Link className="button secondary" href="/login?mode=register">Создать аккаунт</Link>
        </div>
      </article>
    );
  }

  const activeHabit = program?.activeEnrollment ?? program?.enrollments[0] ?? null;
  const pingviPrompts = ["Что ты уже знаешь обо мне?", "Какая привычка важнее сегодня?", "Где я буксую?", "Какой следующий шаг?"];

  return (
    <article className="account-page stack" data-testid="account-page">
      <section className="account-hero card cyan-border">
        <div>
          <div className="eyebrow">Личный кабинет</div>
          <h1 className="ub account-title">{me.user.name || me.user.email}</h1>
          <p className="muted account-copy">{me.user.email}</p>
        </div>
        <button className="btn-back" type="button" onClick={logout}>Выйти</button>
      </section>

      <section className="account-metrics">
        <div className="account-metric card">
          <span>Отчётов</span>
          <strong>{me.reportCount}</strong>
        </div>
        <div className="account-metric card">
          <span>Последний вход</span>
          <strong>{formatDate(me.user.lastLoginAt)}</strong>
        </div>
      </section>

      <section className="card green-border account-navigator">
        <div>
          <h2 className="ub">Привычки и AI Навигатор</h2>
          <p className="muted">Отдельный раздел кабинета для ежедневных шагов, метрик состояния и архива инсайтов. Можно начать без диагностики, а отчет подключить позже.</p>
          {activeHabit ? (
            <div className="account-daily-step">
              <span>Сегодня</span>
              <strong>{activeHabit.title}</strong>
              <p>{activeHabit.focus}</p>
            </div>
          ) : (
            <div className="account-daily-step">
              <span>Старт без теста</span>
              <strong>Базовый путь привычек</strong>
              <p>Можно начать с мягкого ритма прямо сейчас, а персонализацию добавить позже.</p>
            </div>
          )}
        </div>
        <div className="account-action-stack">
          <Link className="button" href="/habits?from=account">Открыть привычки</Link>
          {program ? (
            <button className="button secondary" type="button" disabled={busy} onClick={completeTodayStep}>
              <CheckCircle2 size={17} />
              Отметить шаг сегодня
            </button>
          ) : (
            <button className="button secondary" type="button" disabled={busy} onClick={startHabits}>
              <Sparkles size={17} />
              Начать без диагностики
            </button>
          )}
        </div>
      </section>

      {savedMessage && <p className="auth-message">{savedMessage}</p>}

      <section className="card cyan-border account-pingvi">
        <div>
          <div className="eyebrow">Пингви</div>
          <h2 className="ub">Спросить про себя</h2>
          <p className="muted">Пингви отвечает с учетом отчетов, привычек, метрик, сохраненных инсайтов и текущего шага.</p>
        </div>
        <div className="habits-tabs">
          {pingviPrompts.map((prompt) => (
            <button className="btn-back" type="button" key={prompt} onClick={() => askPingvi(prompt)}>{prompt}</button>
          ))}
        </div>
        <div className="habits-chat-log account-chat-log">
          {messages.length === 0 ? (
            <div className="habits-bubble ai">
              Можно спросить: что уже видно по моим привычкам, какой шаг выбрать сегодня или как связать отчет с действиями.
            </div>
          ) : (
            messages.map((message, index) => (
              <div className={`habits-bubble ${message.role === "assistant" ? "ai" : "user"}`} key={`${message.role}-${index}`}>
                {message.text}
              </div>
            ))
          )}
        </div>
        <div className="habits-chat-form">
          <input
            className="input"
            value={chatInput}
            placeholder="Спросить Пингви"
            onChange={(event) => setChatInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") askPingvi();
            }}
          />
          <button className="button habits-cta" type="button" disabled={busy} onClick={() => askPingvi()}>
            <Send size={17} />
            Спросить
          </button>
        </div>
      </section>

      <section className="stack">
        <div className="row">
          <h2 className="ub section-title">История диагностик</h2>
          <Link className="btn-back" href="/flow/voice">Новая диагностика</Link>
        </div>

        {reports.length === 0 ? (
          <div className="card">
            <p className="muted">Здесь появятся все ваши отчёты после прохождения диагностики. Привычки уже доступны отдельно, без обязательного теста.</p>
            <Link className="button secondary account-inline-link" href="/habits?from=account">Перейти в привычки</Link>
          </div>
        ) : (
          reports.map((report) => (
            <article className="report-history-card card" key={report.id}>
              <div>
                <div className="report-date">{formatDate(report.completedAt || report.createdAt)}</div>
                <h3>{report.profession || "Диагностика ORKEN.LIFE"}</h3>
                <p>{report.summary || "Отчёт формируется или ожидает завершения анализа."}</p>
              </div>
              <div className="report-history-actions">
                <Link className="button secondary" href={`/report/${report.id}/free`}>Бесплатный</Link>
                {report.fullReportAvailable ? (
                  <Link className="button" href={`/report/${report.id}/full`}>Полный отчёт</Link>
                ) : (
                  <Link className="button" href={`/pay/${report.id}`}>Открыть PRO</Link>
                )}
              </div>
            </article>
          ))
        )}
      </section>
    </article>
  );
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(new Date(value));
}
