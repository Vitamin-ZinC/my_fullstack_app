"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Bot, CheckCircle2, CreditCard, ExternalLink, History, LogOut, Send, Sparkles } from "lucide-react";
import type { HabitConfigResponse, HabitProgramSummary, MeReportSummary, MeResponse, TelegramStatusResponse } from "@levelup/contracts";
import { api } from "@/lib/api";
import { openTelegramConnectUrl } from "@/lib/telegram";

type ChatMessage = { role: "user" | "assistant"; text: string };
type TelegramFrequency = "off" | "daily" | "weekdays" | "weekly";

export default function AccountPage() {
  const router = useRouter();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [reports, setReports] = useState<MeReportSummary[]>([]);
  const [program, setProgram] = useState<HabitProgramSummary | null>(null);
  const [config, setConfig] = useState<HabitConfigResponse | null>(null);
  const [telegramStatus, setTelegramStatus] = useState<TelegramStatusResponse | null>(null);
  const [telegramConnectUrl, setTelegramConnectUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [telegramBusy, setTelegramBusy] = useState(false);
  const [error, setError] = useState("");
  const [savedMessage, setSavedMessage] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [threadId, setThreadId] = useState<string | undefined>();
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.me(), api.myReports(), api.habitsMe()])
      .then(async ([nextMe, nextReports, habits]) => {
        if (cancelled) return;
        setMe(nextMe);
        setReports(nextReports);
        setProgram(habits.program);
        setConfig(habits.config);
        if (habits.program) {
          api.telegramStatus(habits.program.id)
            .then((status) => {
              if (!cancelled) setTelegramStatus(status);
            })
            .catch(() => undefined);
        }
        void api.trackEvent("account_hub_opened", {
          hasHabitProgram: Boolean(habits.program),
          reportCount: nextMe.reportCount
        }).catch(() => undefined);
      })
      .catch(() => setError("Войдите или создайте аккаунт, чтобы открыть кабинет. Повторно проходить диагностику для этого не нужно."))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
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
      setConfig(result.config);
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

  async function askOrken(prompt?: string) {
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
      setMessages([...nextMessages, { role: "assistant", text: reason instanceof Error ? reason.message : "ORKEN временно недоступен" }]);
    } finally {
      setBusy(false);
    }
  }

  async function connectTelegram() {
    if (!program) {
      setSavedMessage("Сначала запусти привычки, чтобы ORKEN понял, чей это путь.");
      return;
    }
    setTelegramBusy(true);
    setSavedMessage("");
    try {
      const result = await api.createTelegramLinkToken(program.id);
      setTelegramConnectUrl(result.connectUrl);
      setSavedMessage("Ссылка готова. Если Telegram не открылся автоматически, нажми «Открыть бота вручную».");
      openTelegramConnectUrl(result.connectUrl);
    } catch (reason) {
      setSavedMessage(reason instanceof Error ? reason.message : "Не удалось открыть Telegram");
    } finally {
      setTelegramBusy(false);
    }
  }

  async function saveTelegramPreferences(payload?: { telegramEnabled?: boolean; motivationFrequency?: TelegramFrequency }) {
    if (!program) return;
    setTelegramBusy(true);
    setSavedMessage("");
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Moscow";
      const result = await api.updateTelegramPreferences({
        programId: program.id,
        telegramEnabled: payload?.telegramEnabled ?? telegramStatus?.preferences?.telegramEnabled ?? true,
        motivationFrequency: payload?.motivationFrequency ?? normalizeTelegramFrequency(telegramStatus?.preferences?.motivationFrequency),
        reminderTime: program.settings.reminderTime || "09:00",
        timezone
      });
      setTelegramStatus((previous) => ({
        configured: previous?.configured ?? true,
        linked: previous?.linked ?? false,
        account: previous?.account,
        preferences: result.preferences
      }));
      setSavedMessage("Telegram-настройки сохранены");
    } catch (reason) {
      setSavedMessage(reason instanceof Error ? reason.message : "Не удалось сохранить Telegram");
    } finally {
      setTelegramBusy(false);
    }
  }

  async function startSubscriptionCheckout() {
    if (!program) {
      await startHabits();
      return;
    }
    setBusy(true);
    setSavedMessage("");
    try {
      const result = await api.startHabitSubscriptionCheckout(program.id);
      if ("url" in result && result.url) {
        window.location.href = result.url;
        return;
      }
      if ("program" in result) {
        setProgram(result.program);
        setConfig(result.config);
      }
      setSavedMessage("Подписка обновлена");
    } catch (reason) {
      setSavedMessage(reason instanceof Error ? reason.message : "Не удалось открыть Stripe Checkout");
    } finally {
      setBusy(false);
    }
  }

  async function pauseSubscription() {
    if (!program) return;
    setBusy(true);
    setSavedMessage("");
    try {
      const result = await api.pauseHabitSubscription(program.id);
      setProgram(result.program);
      setSavedMessage("Подписка поставлена на паузу");
    } catch (reason) {
      setSavedMessage(reason instanceof Error ? reason.message : "Не удалось поставить подписку на паузу");
    } finally {
      setBusy(false);
    }
  }

  async function cancelSubscription() {
    if (!program) return;
    setBusy(true);
    setSavedMessage("");
    try {
      const result = await api.cancelHabitSubscription(program.id);
      setProgram(result.program);
      setSavedMessage("Отмена подписки запланирована");
    } catch (reason) {
      setSavedMessage(reason instanceof Error ? reason.message : "Не удалось отменить подписку");
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
  const orkenPrompts = ["Что ты уже знаешь обо мне?", "Какая привычка важнее сегодня?", "Где я буксую?", "Какой следующий шаг?"];
  const telegramLinked = Boolean(telegramStatus?.linked);
  const telegramConfigured = telegramStatus?.configured !== false;
  const telegramEnabled = telegramStatus?.preferences?.telegramEnabled ?? false;
  const telegramFrequency = normalizeTelegramFrequency(telegramStatus?.preferences?.motivationFrequency);
  const subscriptionStatus = program?.settings.subscriptionStatus ?? "Нет программы";

  return (
    <article className="account-page stack" data-testid="account-page">
      <section className="account-hero card cyan-border">
        <div>
          <div className="eyebrow">Личный кабинет</div>
          <h1 className="ub account-title">{me.user.name || me.user.email}</h1>
          <p className="muted account-copy">{me.user.email}</p>
        </div>
        <button className="btn-back" type="button" onClick={logout}>
          <LogOut size={15} />
          Выйти
        </button>
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

      {savedMessage && <p className="auth-message">{savedMessage}</p>}

      <AccountAccordion title="Управление подпиской" icon={<CreditCard size={18} />} defaultOpen>
        <div className="account-subscription-grid">
          <AccountFact label="Тариф" value={config?.priceLabel ? `${config.priceLabel} / мес` : "—"} />
          <AccountFact label="Trial" value={config?.trialDays ? `${config.trialDays} дней` : "Trial отключен"} />
          <AccountFact label="Статус" value={subscriptionStatus} />
        </div>
        <p className="muted account-copy">
          Цена, trial и статус приходят с backend. Обновление платежных данных сейчас выполняется через защищенный Stripe Checkout; карта не вводится и не хранится в ORKEN.LIFE.
        </p>
        <div className="account-action-stack horizontal">
          <button className="button" type="button" disabled={busy} onClick={startSubscriptionCheckout}>
            <CreditCard size={17} />
            Открыть Stripe Checkout
          </button>
          <button className="button secondary" type="button" disabled={busy || program?.settings.subscriptionStatus !== "ACTIVE"} onClick={pauseSubscription}>
            Пауза
          </button>
          <button className="btn-back danger" type="button" disabled={busy || !program} onClick={cancelSubscription}>
            Отменить подписку
          </button>
        </div>
      </AccountAccordion>

      <AccountAccordion title="Спросить ORKEN" icon={<Bot size={18} />}>
        <div className="account-orken-head">
          <OrkenAvatar />
          <div>
            <strong>ORKEN онлайн</strong>
            <p className="muted">Отвечает с учетом отчетов, привычек, метрик, сохраненных инсайтов и текущего шага.</p>
          </div>
        </div>
        <div className="habits-tabs">
          {orkenPrompts.map((prompt) => (
            <button className="btn-back" type="button" key={prompt} onClick={() => askOrken(prompt)}>{prompt}</button>
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
            placeholder="Спросить ORKEN"
            onChange={(event) => setChatInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") askOrken();
            }}
          />
          <button className="button habits-cta" type="button" disabled={busy} onClick={() => askOrken()}>
            <Send size={17} />
            Спросить
          </button>
        </div>
      </AccountAccordion>

      <AccountAccordion title="Подключение Telegram-бота" icon={<Bot size={18} />}>
        <p className="muted account-copy">ORKEN может напоминать о шаге дня, принимать отметки и отвечать с учетом привычек, метрик и инсайтов.</p>
        <div className="account-telegram-status">
          {!telegramConfigured
            ? "Бот не настроен на сервере."
            : telegramLinked
              ? `Подключен${telegramStatus?.account?.username ? `: @${telegramStatus.account.username}` : ""}`
              : "Еще не подключен. Нажми кнопку и открой бота."}
        </div>
        <div className="account-action-stack horizontal">
          <button className="button secondary" type="button" disabled={telegramBusy || !telegramConfigured} onClick={connectTelegram}>
            <Bot size={17} />
            {telegramLinked ? "Открыть Telegram" : "Подключить Telegram"}
          </button>
          {telegramConnectUrl && (
            <a className="button secondary" href={telegramConnectUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={17} />
              Открыть бота вручную
            </a>
          )}
          <label className="habits-toggle account-toggle">
            <input
              type="checkbox"
              checked={telegramEnabled}
              disabled={!telegramLinked || telegramBusy}
              onChange={(event) => saveTelegramPreferences({ telegramEnabled: event.target.checked })}
            />
            <span>Включить Telegram-напоминания</span>
          </label>
        </div>
        <label className="habits-field">
          <span>Частота мотивации</span>
          <select
            className="input"
            value={telegramFrequency}
            disabled={!telegramLinked || telegramBusy}
            onChange={(event) => saveTelegramPreferences({ motivationFrequency: event.target.value as TelegramFrequency })}
          >
            <option value="daily">Каждый день</option>
            <option value="weekdays">По будням</option>
            <option value="weekly">Раз в неделю</option>
            <option value="off">Не присылать</option>
          </select>
        </label>
        <button className="button" type="button" disabled={!telegramLinked || telegramBusy} onClick={() => saveTelegramPreferences()}>
          Сохранить Telegram
        </button>
      </AccountAccordion>

      <AccountAccordion title="История диагностик" icon={<History size={18} />}>
        {reports.length === 0 ? (
          <div className="account-empty-panel">
            <p className="muted">Здесь появятся все ваши отчёты после прохождения диагностики. Привычки уже доступны отдельно, без обязательного теста.</p>
            <Link className="button secondary account-inline-link" href="/habits?from=account">Перейти в привычки</Link>
          </div>
        ) : (
          reports.map((report) => (
            <article className="report-history-card" key={report.id}>
              <div>
                <div className="report-date">{formatDate(report.completedAt || report.createdAt)}</div>
                <h3>{report.profession || "Диагностика ORKEN.LIFE"}</h3>
                <p>{report.summary || "Отчёт формируется или ожидает завершения анализа."}</p>
              </div>
              <div className="report-history-actions">
                <Link className="button secondary" href={`/report/${report.id}/free`}>Бесплатный</Link>
                {report.fullReportAvailable ? (
                  <Link className="button" href={`/report/${report.id}/full`}>Открыть PRO</Link>
                ) : (
                  <Link className="button" href={`/pay/${report.id}`}>Открыть PRO</Link>
                )}
              </div>
            </article>
          ))
        )}
      </AccountAccordion>

      <section className="card green-border account-navigator">
        <div>
          <h2 className="ub">Навигатор привычек</h2>
          <p className="muted">Отдельное приложение для ежедневных шагов, состояния, XP и архива инсайтов. Можно начать без повторной диагностики.</p>
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
    </article>
  );
}

function AccountAccordion(props: { title: string; icon: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  return (
    <details className="account-accordion card" open={props.defaultOpen}>
      <summary>
        <span>{props.icon}</span>
        <strong>{props.title}</strong>
      </summary>
      <div className="account-accordion-body">{props.children}</div>
    </details>
  );
}

function AccountFact({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="account-fact">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function OrkenAvatar() {
  return (
    <span className="account-orken-avatar" aria-hidden="true">
      <img src="/assets/orken12.jpg" alt="" />
      <i />
    </span>
  );
}

function normalizeTelegramFrequency(value?: string | null): TelegramFrequency {
  return value === "off" || value === "daily" || value === "weekdays" || value === "weekly" ? value : "daily";
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(new Date(value));
}
