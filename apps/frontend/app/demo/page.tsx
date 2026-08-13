"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowLeft,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock3,
  CreditCard,
  LayoutDashboard,
  LogOut,
  MessageSquareText,
  Settings,
  Send,
  Sparkles,
  BellRing,
  Bot,
  Target,
  TrendingUp,
  UserRound,
  UsersRound
} from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import type { DemoCoachClient, DemoMetricPoint, DemoSessionResponse, DemoWorkspaceResponse } from "@levelup/contracts";
import { demoApi } from "@/lib/api";
import styles from "./demo.module.css";

type Role = "coach" | "client";
type CoachView = "overview" | "clients" | "schedule" | "plan";
type ClientView = "overview" | "habits" | "progress" | "coach" | "archive" | "settings";
type ClientDetailView = "state" | "insights" | "feedback" | "assignments";

const dateFormatter = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short" });
const dateTimeFormatter = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

export default function DemoPage() {
  const [session, setSession] = useState<DemoSessionResponse | null>(null);
  const [workspace, setWorkspace] = useState<DemoWorkspaceResponse | null>(null);
  const [code, setCode] = useState("");
  const [role, setRole] = useState<Role>("coach");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    void restore();
  }, []);

  async function restore() {
    setLoading(true);
    try {
      const current = await demoApi.session();
      const data = await demoApi.workspace();
      setSession(current);
      setWorkspace(data);
    } catch {
      setSession(null);
      setWorkspace(null);
    } finally {
      setLoading(false);
    }
  }

  async function activate(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const current = await demoApi.access(code);
      const data = await demoApi.workspace();
      setSession(current);
      setWorkspace(data);
      setCode("");
    } catch {
      setError("Код недействителен, исчерпан или истёк.");
    } finally {
      setSubmitting(false);
    }
  }

  async function logout() {
    await demoApi.logout().catch(() => undefined);
    setSession(null);
    setWorkspace(null);
  }

  function demoAction(message = "Действие доступно в рабочем кабинете. В демо-режиме данные не изменяются.") {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 3200);
  }

  if (loading) return <DemoLoading />;
  if (!session || !workspace) {
    return <DemoAccessForm code={code} setCode={setCode} error={error} submitting={submitting} onSubmit={activate} />;
  }

  return (
    <main className={styles.shell}>
      <header className={styles.topbar}>
        <Link href="/" className={styles.brand}><span>O</span><strong>ORKEN.LIFE</strong></Link>
        <div className={styles.roleSwitch} aria-label="Роль в демо-кабинете">
          <button className={role === "coach" ? styles.active : ""} onClick={() => setRole("coach")}><UsersRound size={17} />Коуч</button>
          <button className={role === "client" ? styles.active : ""} onClick={() => setRole("client")}><UserRound size={17} />Клиент</button>
        </div>
        <div className={styles.topActions}>
          <span className={styles.demoBadge}>Демо</span>
          <button className={styles.iconButton} onClick={logout} title="Выйти из демо"><LogOut size={18} /></button>
        </div>
      </header>

      <div className={styles.demoNotice}>
        <Sparkles size={16} />
        <span>Это безопасная демонстрация на вымышленных данных. Изменения и платежи не сохраняются.</span>
        <small>Доступ до {dateTimeFormatter.format(new Date(session.expiresAt))}</small>
      </div>

      {role === "coach"
        ? <CoachDemo data={workspace} onAction={demoAction} />
        : <ClientDemo data={workspace} onAction={demoAction} />}

      {notice && <div className={styles.toast} role="status">{notice}</div>}
    </main>
  );
}

function DemoLoading() {
  return <main className={styles.accessPage}><div className={styles.loadingMark}>O</div><p>Открываем демо-кабинет...</p></main>;
}

function DemoAccessForm({ code, setCode, error, submitting, onSubmit }: {
  code: string;
  setCode: (value: string) => void;
  error: string;
  submitting: boolean;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <main className={styles.accessPage}>
      <Link href="/" className={styles.backLink}><ArrowLeft size={17} />На главную</Link>
      <section className={styles.accessPanel}>
        <div className={styles.accessMark}>O</div>
        <span className={styles.eyebrow}>ORKEN.LIFE DEMO</span>
        <h1>Кабинеты коуча и клиента</h1>
        <p>Введите код, который выдал представитель ORKEN. Внутри можно переключаться между ролями и показывать основные сценарии продукта.</p>
        <form onSubmit={onSubmit} className={styles.accessForm}>
          <label htmlFor="demo-code">Код доступа</label>
          <input id="demo-code" value={code} onChange={(event) => setCode(event.target.value)} placeholder="ORKEN-DEMO-XXXX-XXXX-XXXX-XXXX" autoComplete="one-time-code" autoCapitalize="characters" required />
          {error && <div className={styles.formError}><CircleAlert size={17} />{error}</div>}
          <button type="submit" disabled={submitting || code.trim().length < 8}>{submitting ? "Проверяем..." : "Открыть демо"}<ChevronRight size={18} /></button>
        </form>
        <small>Код не создаёт реальный аккаунт и не даёт доступ к данным пользователей.</small>
      </section>
    </main>
  );
}

function CoachDemo({ data, onAction }: { data: DemoWorkspaceResponse; onAction: (message?: string) => void }) {
  const [view, setView] = useState<CoachView>("overview");
  const [selectedClientId, setSelectedClientId] = useState(data.coach.selectedClient.client.id);
  const [detailView, setDetailView] = useState<ClientDetailView>("state");
  const selectedClient = useMemo(
    () => data.coach.clients.find((client) => client.id === selectedClientId) ?? data.coach.clients[0],
    [data.coach.clients, selectedClientId]
  );

  const nav = [
    { id: "overview" as const, label: "Обзор", icon: LayoutDashboard },
    { id: "clients" as const, label: "Клиенты", icon: UsersRound },
    { id: "schedule" as const, label: "Расписание", icon: CalendarDays },
    { id: "plan" as const, label: "Пакет", icon: CreditCard }
  ];

  return (
    <div className={styles.appLayout}>
      <aside className={styles.sidebar}>
        <div className={styles.profileBlock}><div className={styles.avatar}>АМ</div><div><strong>{data.coach.profile.name}</strong><span>{data.coach.profile.specialty}</span></div></div>
        <nav>{nav.map(({ id, label, icon: Icon }) => <button key={id} className={view === id ? styles.active : ""} onClick={() => setView(id)}><Icon size={18} />{label}</button>)}</nav>
        <div className={styles.sidePlan}><span>Пакет</span><strong>{data.coach.plan.name}</strong><small>{data.coach.plan.usedClients} из {data.coach.plan.includedClients} мест занято</small><div><i style={{ width: `${data.coach.plan.usedClients / data.coach.plan.includedClients * 100}%` }} /></div></div>
      </aside>

      <section className={styles.workspace}>
        {view === "overview" && <CoachOverview data={data} onOpenClients={() => setView("clients")} />}
        {view === "clients" && <CoachClients data={data} selectedClient={selectedClient} setSelectedClientId={setSelectedClientId} detailView={detailView} setDetailView={setDetailView} onAction={onAction} />}
        {view === "schedule" && <CoachSchedule data={data} onAction={onAction} />}
        {view === "plan" && <CoachPlan data={data} onAction={onAction} />}
      </section>
    </div>
  );
}

function CoachOverview({ data, onOpenClients }: { data: DemoWorkspaceResponse; onOpenClients: () => void }) {
  const stats = [
    { label: "Активные клиенты", value: data.coach.stats.activeClients, icon: UsersRound, tone: "cyan" },
    { label: "Отметились сегодня", value: data.coach.stats.completedToday, icon: CheckCircle2, tone: "green" },
    { label: "Требуют внимания", value: data.coach.stats.needsAttention, icon: CircleAlert, tone: "pink" },
    { label: "Начисления за месяц", value: `$${data.coach.stats.monthlyRevenue}`, icon: TrendingUp, tone: "violet" }
  ];
  return <>
    <PageHeading eyebrow="Кабинет коуча" title={`Добрый день, ${data.coach.profile.name.split(" ")[0]}`} text="Состояние клиентов, ближайшие сессии и сигналы, которым стоит уделить внимание." />
    <div className={styles.statGrid}>{stats.map(({ label, value, icon: Icon, tone }) => <article className={styles.statCard} key={label} data-tone={tone}><Icon size={20} /><strong>{value}</strong><span>{label}</span></article>)}</div>
    <div className={styles.dashboardGrid}>
      <section className={styles.panel}>
        <div className={styles.panelTitle}><div><span className={styles.eyebrow}>Сегодня</span><h2>Клиенты</h2></div><button className={styles.textButton} onClick={onOpenClients}>Все клиенты<ChevronRight size={16} /></button></div>
        <ClientTable clients={data.coach.clients.slice(0, 4)} onSelect={onOpenClients} />
      </section>
      <section className={styles.panel}>
        <div className={styles.panelTitle}><div><span className={styles.eyebrow}>Расписание</span><h2>Ближайшие встречи</h2></div></div>
        <div className={styles.meetingList}>{data.coach.schedule.upcoming.map((meeting) => <div className={styles.meeting} key={meeting.id}><CalendarDays size={18} /><div><strong>{meeting.clientName}</strong><span>{dateTimeFormatter.format(new Date(meeting.startsAt))}</span></div><small>{meeting.durationMinutes} мин</small></div>)}</div>
      </section>
    </div>
  </>;
}

function CoachClients({ data, selectedClient, setSelectedClientId, detailView, setDetailView, onAction }: {
  data: DemoWorkspaceResponse;
  selectedClient: DemoCoachClient;
  setSelectedClientId: (id: string) => void;
  detailView: ClientDetailView;
  setDetailView: (view: ClientDetailView) => void;
  onAction: (message?: string) => void;
}) {
  return <>
    <PageHeading eyebrow="Клиенты" title="Прогресс подопечных" text="Открывайте состояние, записи, задания и обратную связь в одной карточке клиента." action={<button className={styles.primaryButton} onClick={() => onAction()}><UsersRound size={17} />Пригласить клиента</button>} />
    <div className={styles.clientWorkspace}>
      <section className={styles.clientList}>
        {data.coach.clients.map((client) => <button key={client.id} className={client.id === selectedClient.id ? styles.active : ""} onClick={() => setSelectedClientId(client.id)}><span className={styles.clientAvatar}>{client.initials}</span><span><strong>{client.name}</strong><small>{client.program}</small></span><StatusDot status={client.status} /></button>)}
      </section>
      <section className={styles.clientDetail}>
        <div className={styles.clientHeader}><div><span className={styles.eyebrow}>Карточка клиента</span><h2>{selectedClient.name}</h2><p>{selectedClient.program} · средний ресурс {selectedClient.weeklyAverage}/10</p></div><span className={styles.statusPill} data-status={selectedClient.status}>{statusLabel(selectedClient.status)}</span></div>
        <div className={styles.detailTabs}>{([['state','Состояние'],['insights','Инсайты'],['feedback','Фидбэк'],['assignments','Задания']] as const).map(([id, label]) => <button key={id} className={detailView === id ? styles.active : ""} onClick={() => setDetailView(id)}>{label}</button>)}</div>
        {detailView === "state" && <div className={styles.detailContent}><MetricChart metrics={data.coach.selectedClient.metrics} /><div className={styles.habitList}>{data.coach.selectedClient.habits.map((habit) => <HabitRow key={habit.id} {...habit} />)}</div></div>}
        {detailView === "insights" && <div className={styles.feed}>{data.coach.selectedClient.insights.map((item) => <article key={item.id}><BookOpen size={18} /><div><span>{dateFormatter.format(new Date(item.date))} · энергия {item.energy}/10</span><p>{item.text}</p></div></article>)}</div>}
        {detailView === "feedback" && <div className={styles.detailContent}><div className={styles.feed}>{data.coach.selectedClient.feedback.map((item) => <article key={item.id}><MessageSquareText size={18} /><div><span>{dateFormatter.format(new Date(item.date))} · прочитано</span><p>{item.text}</p></div></article>)}</div><div className={styles.composer}><textarea aria-label="Текст обратной связи" placeholder="Напишите рекомендацию клиенту" /><button onClick={() => onAction()}><Send size={17} />Отправить</button></div></div>}
        {detailView === "assignments" && <div className={styles.detailContent}><div className={styles.taskList}>{data.coach.selectedClient.assignments.map((task) => <div key={task.id}><CheckCircle2 size={19} data-complete={task.completed} /><span><strong>{task.title}</strong><small>До {dateFormatter.format(new Date(task.dueAt))}</small></span></div>)}</div><button className={styles.secondaryButton} onClick={() => onAction()}><Target size={17} />Назначить задание</button></div>}
      </section>
    </div>
  </>;
}

function CoachSchedule({ data, onAction }: { data: DemoWorkspaceResponse; onAction: (message?: string) => void }) {
  return <>
    <PageHeading eyebrow="Расписание" title="Встречи и доступность" text={`Часовой пояс: ${data.coach.schedule.timezone}`} action={<button className={styles.primaryButton} onClick={() => onAction()}><CalendarDays size={17} />Добавить встречу</button>} />
    <div className={styles.dashboardGrid}>
      <section className={styles.panel}><div className={styles.panelTitle}><h2>Ближайшие встречи</h2></div><div className={styles.meetingList}>{data.coach.schedule.upcoming.map((meeting) => <div className={styles.meeting} key={meeting.id}><Clock3 size={18} /><div><strong>{meeting.clientName}</strong><span>{meeting.type} · {dateTimeFormatter.format(new Date(meeting.startsAt))}</span></div><small>{meeting.durationMinutes} мин</small></div>)}</div></section>
      <section className={styles.panel}><div className={styles.panelTitle}><h2>Рабочие часы</h2><button className={styles.textButton} onClick={() => onAction()}>Изменить</button></div><div className={styles.availability}>{data.coach.schedule.availability.map((rule) => <div key={rule.weekday}><span>{rule.weekday}</span><strong>{rule.hours}</strong></div>)}</div></section>
    </div>
  </>;
}

function CoachPlan({ data, onAction }: { data: DemoWorkspaceResponse; onAction: (message?: string) => void }) {
  const usage = Math.round(data.coach.plan.usedClients / data.coach.plan.includedClients * 100);
  return <>
    <PageHeading eyebrow="Пакет и места" title={data.coach.plan.name} text={`Следующее продление ${dateFormatter.format(new Date(data.coach.plan.renewsAt))}`} />
    <section className={styles.usagePanel}><div><strong>{data.coach.plan.usedClients}</strong><span>из {data.coach.plan.includedClients} мест занято</span></div><div className={styles.progress}><i style={{ width: `${usage}%` }} /></div><small>{data.coach.plan.includedClients - data.coach.plan.usedClients} мест доступно для новых клиентов</small></section>
    <div className={styles.planGrid}>{data.coach.plan.options.map((plan) => <article className={styles.planCard} key={plan.name} data-current={plan.name === data.coach.plan.name}><span>{plan.includedClients ? `До ${plan.includedClients} клиентов` : "Индивидуально"}</span><h2>{plan.name}</h2><strong>{plan.monthlyAmount ? `$${plan.monthlyAmount}/мес` : "По запросу"}</strong><p>Прогресс клиентов, привычки, задания, фидбэк и расписание.</p><button onClick={() => onAction()}>{plan.name === data.coach.plan.name ? "Текущий пакет" : "Выбрать"}</button></article>)}</div>
  </>;
}

function ClientDemo({ data, onAction }: { data: DemoWorkspaceResponse; onAction: (message?: string) => void }) {
  const [view, setView] = useState<ClientView>("overview");
  const nav = [
    { id: "overview" as const, label: "Мой путь", icon: LayoutDashboard },
    { id: "habits" as const, label: "Привычки", icon: Target },
    { id: "progress" as const, label: "Прогресс", icon: Activity },
    { id: "coach" as const, label: "Мой коуч", icon: MessageSquareText },
    { id: "archive" as const, label: "Архив", icon: BookOpen },
    { id: "settings" as const, label: "Настройки", icon: Settings }
  ];
  return <div className={styles.appLayout}>
    <aside className={styles.sidebar}>
      <div className={styles.profileBlock}><div className={styles.avatar}>АС</div><div><strong>{data.client.profile.name}</strong><span>{data.client.profile.level}</span></div></div>
      <nav>{nav.map(({ id, label, icon: Icon }) => <button key={id} className={view === id ? styles.active : ""} onClick={() => setView(id)}><Icon size={18} />{label}</button>)}</nav>
      <div className={styles.sidePlan}><span>Прогресс</span><strong>{data.client.profile.xp} XP</strong><small>Серия {data.client.profile.streak} дней</small><div><i style={{ width: "62%" }} /></div></div>
    </aside>
    <section className={styles.workspace}>
      {view === "overview" && <ClientOverview data={data} onAction={onAction} />}
      {view === "habits" && <ClientHabits data={data} onAction={onAction} />}
      {view === "progress" && <ClientProgress data={data} />}
      {view === "coach" && <ClientCoach data={data} onAction={onAction} />}
      {view === "archive" && <ClientArchive data={data} />}
      {view === "settings" && <ClientSettings data={data} onAction={onAction} />}
    </section>
  </div>;
}

function ClientOverview({ data, onAction }: { data: DemoWorkspaceResponse; onAction: (message?: string) => void }) {
  const latest = data.client.metrics[data.client.metrics.length - 1];
  return <>
    <PageHeading eyebrow="Мой путь" title={`Добрый день, ${data.client.profile.name.split(" ")[0]}`} text="Сегодняшняя отметка, привычки и связь с коучем." />
    <div className={styles.statGrid}><article className={styles.statCard} data-tone="cyan"><Activity size={20} /><strong>{latest.energy}/10</strong><span>Энергия</span></article><article className={styles.statCard} data-tone="violet"><Sparkles size={20} /><strong>{latest.clarity}/10</strong><span>Ясность</span></article><article className={styles.statCard} data-tone="green"><Target size={20} /><strong>{latest.stability}/10</strong><span>Устойчивость</span></article><article className={styles.statCard} data-tone="pink"><TrendingUp size={20} /><strong>{data.client.profile.streak}</strong><span>Дней в серии</span></article></div>
    <div className={styles.dashboardGrid}>
      <section className={styles.panel}><div className={styles.panelTitle}><div><span className={styles.eyebrow}>Сегодня</span><h2>Привычки</h2></div></div><div className={styles.habitList}>{data.client.habits.map((habit) => <button className={styles.habitCheck} key={habit.id} onClick={() => onAction()} data-complete={habit.completedToday}><CheckCircle2 size={20} /><span><strong>{habit.title}</strong><small>{habit.assignedByCoach ? "Назначено коучем" : `Серия ${habit.streak} дня`}</small></span></button>)}</div></section>
      <section className={styles.panel}><div className={styles.panelTitle}><div><span className={styles.eyebrow}>Мой коуч</span><h2>{data.client.coach.name}</h2></div><span className={styles.statusPill} data-status="ACTIVE">Активно</span></div><p className={styles.panelText}>{data.client.coach.program}. Осталось {data.client.coach.daysLeft} дня сопровождения.</p><blockquote>{data.client.feedback[0].text}</blockquote><button className={styles.secondaryButton} onClick={() => onAction()}><MessageSquareText size={17} />Ответить коучу</button></section>
    </div>
  </>;
}

function ClientHabits({ data, onAction }: { data: DemoWorkspaceResponse; onAction: (message?: string) => void }) {
  const days = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
  return <>
    <PageHeading eyebrow="Навигатор привычек" title="Трекер привычек" text="Сегодняшняя практика, недельные отметки и начисление XP." action={<button className={styles.primaryButton} onClick={() => onAction("В рабочем кабинете эта кнопка сохраняет отметку и начисляет XP один раз за день.")}><CheckCircle2 size={17} />Отметить сегодня</button>} />
    <section className={styles.todayHabit}>
      <div className={styles.todayHabitMain}><span className={styles.eyebrow}>Привычка недели</span><h2>{data.client.habits[0].title}</h2><p>До начала рабочих сообщений выбери одно действие, которое даст дню ясный результат.</p><div className={styles.softStep}><Sparkles size={18} /><div><strong>Если мало сил</strong><span>Запиши приоритет одним предложением. Этого достаточно, чтобы сохранить ритм.</span></div></div></div>
      <div className={styles.todayReward}><strong>+{data.client.dailyCheckin.xpEarned} XP</strong><span>заработано сегодня</span><small>Привычка +10 · состояние +15 · инсайт +15</small></div>
    </section>
    <div className={styles.habitTrackerList}>{data.client.habits.map((habit) => <article key={habit.id} className={styles.trackerCard}><div className={styles.trackerHeading}><div><span>{habit.assignedByCoach ? "Назначено коучем" : "Программа ORKEN"}</span><h3>{habit.title}</h3></div><strong>{habit.completionRate}%</strong></div><div className={styles.weekTrack}>{days.map((day, index) => <div key={day} data-complete={habit.week[index]}><span>{day}</span><i>{habit.week[index] ? <CheckCircle2 size={17} /> : index === 6 ? "Сегодня" : "-"}</i></div>)}</div><footer><span>Серия: {habit.streak} дней</span><button onClick={() => onAction()}>Открыть</button></footer></article>)}</div>
  </>;
}

function ClientProgress({ data }: { data: DemoWorkspaceResponse }) {
  return <><PageHeading eyebrow="Аналитика" title="Мой прогресс" text="Динамика внутреннего состояния и регулярность привычек за последние 14 дней." /><section className={styles.panel}><MetricChart metrics={data.client.metrics} /></section><div className={styles.habitList}>{data.client.habits.map((habit) => <HabitRow key={habit.id} {...habit} />)}</div><section className={styles.correlation}><TrendingUp size={22} /><div><strong>Наблюдение за период</strong><p>В дни с выполненным утренним фокусом средняя ясность была выше. Это связь в данных, а не доказанная причина.</p></div></section></>;
}

function ClientCoach({ data, onAction }: { data: DemoWorkspaceResponse; onAction: (message?: string) => void }) {
  return <><PageHeading eyebrow="Сопровождение" title="Мой коуч" text={`${data.client.coach.name} · ${data.client.coach.specialty}`} action={<button className={styles.primaryButton} onClick={() => onAction()}><Send size={17} />Написать</button>} /><section className={styles.coachHero}><div className={styles.largeAvatar}>АМ</div><div><span className={styles.statusPill} data-status="ACTIVE">Программа активна</span><h2>{data.client.coach.program}</h2><p>Осталось {data.client.coach.daysLeft} дня. Здесь собраны рекомендации и задания, которые коуч видит в вашем прогрессе.</p></div></section><div className={styles.dashboardGrid}><section className={styles.panel}><div className={styles.panelTitle}><h2>Обратная связь</h2></div><div className={styles.feed}>{data.client.feedback.map((item) => <article key={item.id}><MessageSquareText size={18} /><div><span>{dateFormatter.format(new Date(item.date))}</span><p>{item.text}</p></div></article>)}</div></section><section className={styles.panel}><div className={styles.panelTitle}><h2>Задания</h2></div><div className={styles.taskList}>{data.client.assignments.map((task) => <div key={task.id}><CheckCircle2 size={19} data-complete={task.completed} /><span><strong>{task.title}</strong><small>До {dateFormatter.format(new Date(task.dueAt))}</small></span></div>)}</div></section></div></>;
}

function ClientArchive({ data }: { data: DemoWorkspaceResponse }) {
  return <><PageHeading eyebrow="История" title="Архив инсайтов" text="Личные записи и наблюдения по состоянию." /><div className={styles.archiveToolbar}><input placeholder="Поиск по записям" /><select aria-label="Период"><option>Последние 30 дней</option><option>Последние 7 дней</option><option>Весь период</option></select></div><div className={styles.feed}>{data.client.insights.map((item) => <article key={item.id}><BookOpen size={18} /><div><span>{dateFormatter.format(new Date(item.date))} · энергия {item.energy}/10</span><p>{item.text}</p></div></article>)}</div></>;
}

function ClientSettings({ data, onAction }: { data: DemoWorkspaceResponse; onAction: (message?: string) => void }) {
  return <>
    <PageHeading eyebrow="Настройки" title="Профиль и напоминания" text="Telegram, частота поддержки и информация о доступе." />
    <div className={styles.settingsGrid}>
      <section className={styles.panel}>
        <div className={styles.integrationTitle}><span><Bot size={22} /></span><div><h2>Telegram-бот ORKEN</h2><p>{data.client.telegram.linked ? "Подключён к этому кабинету." : "Принимает отметки, напоминает о привычке и отвечает с учётом прогресса."}</p></div><span className={styles.statusPill} data-status={data.client.telegram.linked ? "ACTIVE" : "PAUSED"}>{data.client.telegram.linked ? "Подключён" : "Не подключён"}</span></div>
        <div className={styles.telegramFeatures}><span><CheckCircle2 size={16} />Отмечать привычку из Telegram</span><span><CheckCircle2 size={16} />Сохранять состояние и инсайты</span><span><CheckCircle2 size={16} />Получать фидбэк коуча</span><span><CheckCircle2 size={16} />Задавать вопросы ORKEN</span></div>
        <button className={styles.primaryButton} onClick={() => onAction("В рабочем кабинете откроется официальный Telegram-бот с одноразовым токеном привязки.")}><Bot size={17} />Подключить Telegram</button>
      </section>
      <section className={styles.panel}>
        <div className={styles.integrationTitle}><span><BellRing size={22} /></span><div><h2>Напоминания</h2><p>Выберите мягкий ритм мотивации. Настройка синхронизируется с ботом.</p></div></div>
        <label className={styles.toggleRow}><span><strong>Telegram-напоминания</strong><small>Текущая привычка и вечерняя сверка</small></span><input type="checkbox" checked={data.client.telegram.remindersEnabled} onChange={() => onAction()} /></label>
        <label className={styles.settingField}><span>Частота мотивации</span><select defaultValue={data.client.telegram.motivationFrequency} onChange={() => onAction()}><option value="daily">Каждый день</option><option value="weekdays">По будням</option><option value="weekly">Раз в неделю</option><option value="off">Не присылать</option></select></label>
        <button className={styles.secondaryButton} onClick={() => onAction()}>Сохранить настройки</button>
      </section>
      <section className={styles.panel}>
        <div className={styles.panelTitle}><div><span className={styles.eyebrow}>Доступ</span><h2>{data.client.subscription.plan}</h2></div><span className={styles.statusPill} data-status="ACTIVE">Активен</span></div>
        <div className={styles.subscriptionFacts}><div><span>Оплачивает</span><strong>{data.client.subscription.paidBy === "COACH" ? "Коуч" : "Клиент"}</strong></div><div><span>Доступ до</span><strong>{dateFormatter.format(new Date(data.client.subscription.currentPeriodEnd))}</strong></div></div>
        <p className={styles.panelText}>Если коуч завершит оплату пакета, клиент сможет продолжить по обычному тарифу ORKEN.</p>
      </section>
    </div>
  </>;
}

function PageHeading({ eyebrow, title, text, action }: { eyebrow: string; title: string; text: string; action?: React.ReactNode }) {
  return <header className={styles.pageHeading}><div><span className={styles.eyebrow}>{eyebrow}</span><h1>{title}</h1><p>{text}</p></div>{action}</header>;
}

function ClientTable({ clients, onSelect }: { clients: DemoCoachClient[]; onSelect: () => void }) {
  return <div className={styles.clientTable}><div className={styles.tableHeader}><span>Клиент</span><span>Среднее</span><span>Сегодня</span><span>Статус</span></div>{clients.map((client) => <button key={client.id} onClick={onSelect}><span className={styles.clientIdentity}><i>{client.initials}</i><span><strong>{client.name}</strong><small>{client.program}</small></span></span><b>{client.weeklyAverage}</b><span>{client.todayCompleted ? "Заполнено" : "Нет отметки"}</span><StatusDot status={client.status} /></button>)}</div>;
}

function MetricChart({ metrics }: { metrics: DemoMetricPoint[] }) {
  const chartData = metrics.map((point) => ({ ...point, label: dateFormatter.format(new Date(`${point.date}T12:00:00`)) }));
  return <div className={styles.chart}><div className={styles.chartTitle}><div><span className={styles.eyebrow}>14 дней</span><h3>Внутреннее состояние</h3></div></div><ResponsiveContainer width="100%" height={280}><LineChart data={chartData} margin={{ top: 12, right: 12, left: -18, bottom: 0 }}><CartesianGrid stroke="rgba(148,163,184,.12)" vertical={false} /><XAxis dataKey="label" tick={{ fill: "#74839a", fontSize: 11 }} axisLine={false} tickLine={false} interval={2} /><YAxis domain={[0, 10]} ticks={[0, 2, 4, 6, 8, 10]} tick={{ fill: "#74839a", fontSize: 11 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ background: "#0b1624", border: "1px solid rgba(148,163,184,.22)", borderRadius: 6 }} /><Legend /><Line type="monotone" dataKey="energy" name="Энергия" stroke="#00d4ff" strokeWidth={2.5} dot={false} /><Line type="monotone" dataKey="clarity" name="Ясность" stroke="#a66cff" strokeWidth={2.5} dot={false} /><Line type="monotone" dataKey="stability" name="Устойчивость" stroke="#20d49a" strokeWidth={2.5} dot={false} /></LineChart></ResponsiveContainer></div>;
}

function HabitRow({ title, completionRate, streak, assignedByCoach }: { title: string; completionRate: number; streak: number; assignedByCoach: boolean }) {
  return <div className={styles.habitRow}><span className={styles.habitIcon}><Target size={18} /></span><div><strong>{title}</strong><small>{assignedByCoach ? "Назначено коучем" : `Серия ${streak} дня`}</small><div className={styles.progress}><i style={{ width: `${completionRate}%` }} /></div></div><b>{completionRate}%</b></div>;
}

function StatusDot({ status }: { status: DemoCoachClient["status"] }) {
  return <span className={styles.statusDot} data-status={status} title={statusLabel(status)} />;
}

function statusLabel(status: DemoCoachClient["status"]) {
  if (status === "ATTENTION") return "Нужна поддержка";
  if (status === "PAUSED") return "Пауза";
  return "Активно";
}
