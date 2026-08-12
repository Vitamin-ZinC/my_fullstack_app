"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { ArrowLeft, CalendarDays, Check, ClipboardCheck, Gift, MessageCircle, Send, ShieldCheck, UserRound, X } from "lucide-react";
import type { HabitCoachingHubResponse } from "@levelup/contracts";
import { api } from "@/lib/api";
import styles from "../client-tools.module.css";

export default function CoachingPage() {
  return <Suspense fallback={<main className={styles.page}><div className={styles.empty}>Загружаем связь с коучем...</div></main>}><CoachingContent /></Suspense>;
}

function CoachingContent() {
  const search = useSearchParams();
  const inviteToken = search.get("coach_invite") || "";
  const [showInvite, setShowInvite] = useState(Boolean(inviteToken));
  const [data, setData] = useState<HabitCoachingHubResponse | null>(null);
  const [selected, setSelected] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [metricsConsent, setMetricsConsent] = useState(false);
  const [journalConsent, setJournalConsent] = useState(false);
  const [accepting, setAccepting] = useState(false);

  const load = () => api.habitCoaching().then(setData).catch((reason) => setError(reason instanceof Error ? reason.message : "Не удалось загрузить Coaching Hub"));
  useEffect(() => { void load(); }, []);

  const relationship = data?.relationships[selected];
  const coachOrders = (data?.orders ?? []).filter((order) => !relationship || order.coachProfileId === relationship.coach.id);

  async function acceptInvite() {
    if (!inviteToken || !metricsConsent || accepting) return;
    setAccepting(true); setError("");
    try {
      await api.acceptCoachInvite(inviteToken, journalConsent);
      setNotice("Коуч подключён. Доступ к дневнику можно изменить в любой момент.");
      setShowInvite(false);
      window.history.replaceState(null, "", "/habits/coaching");
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось принять приглашение"); }
    finally { setAccepting(false); }
  }

  async function send() {
    if (!relationship || !message.trim()) return;
    await api.sendCoachMessage(relationship.relationshipId, message);
    setMessage("");
    await load();
  }

  async function openBooking(orderId: string) {
    try {
      const result = await api.coachBooking(orderId);
      window.location.assign(result.url);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось открыть календарь"); }
  }

  return <main className={styles.page}>
    <header className={styles.header}><Link className={styles.brand} href="/">ORKEN.LIFE</Link><Link href="/habits"><ArrowLeft size={17} /> Кабинет привычек</Link></header>
    <section className={styles.intro}><span className={styles.badge}><MessageCircle size={14} /> Coaching Hub</span><h1>Мой коуч</h1><p>Обратная связь, задания и привычки, назначенные специалистом. Доступ к дневнику управляется отдельно.</p></section>
    {error && <p className={styles.error}>{error}</p>}{notice && <p className={styles.notice}>{notice}</p>}

    {showInvite && inviteToken && <section className={`${styles.panel} ${styles.consentPanel}`}>
      <ShieldCheck size={30} /><div><h2>Подключить коуча</h2><p>Коуч увидит только данные Навигатора, на которые вы дадите согласие. Диагностика, фото, аудио и отчёты не передаются.</p></div>
      <label><input type="checkbox" checked={metricsConsent} onChange={(event) => setMetricsConsent(event.target.checked)} /> Разрешить доступ к показателям состояния и привычкам</label>
      <label><input type="checkbox" checked={journalConsent} onChange={(event) => setJournalConsent(event.target.checked)} /> Разрешить читать записи дневника и инсайты</label>
      <button className={styles.button} disabled={!metricsConsent || accepting} onClick={acceptInvite}>{accepting ? "Подключаем..." : "Подключить коуча"}</button>
    </section>}

    {data?.relationships.length ? <>
      <div className={styles.tabs}>{data.relationships.map((item, index) => <button key={item.relationshipId} className={selected === index ? styles.active : ""} onClick={() => setSelected(index)}>{item.coach.displayName}</button>)}</div>
      {relationship && <>
        <section className={styles.panel}>
          <div className={styles.coachHead}><span className={styles.avatar}>{relationship.coach.avatarUrl ? <img src={relationship.coach.avatarUrl} alt="" /> : <UserRound />}</span><div><h2>{relationship.coach.displayName}</h2><p>{relationship.coach.headline || "Персональное сопровождение в ORKEN"}</p></div><span className={styles.badge}>{relationshipStatus(relationship.status)}</span></div>
          <div className={styles.programMeta}><span>{relationship.funding === "COACH_PAID" ? "Доступ оплачивает коуч" : "Самостоятельная подписка"}</span><strong>{remainingLabel(relationship.accessEndsAt)}</strong></div>
          {relationship.status === "PENDING" && <p className={styles.notice}>Программа оплачена, но доступ коучу ещё не открыт. Разрешите метрики и привычки, чтобы начать работу. Дневник остаётся отдельным выбором.</p>}
          <div className={styles.actions}><label><input type="checkbox" checked={relationship.metricsConsent} onChange={async (event) => { await api.updateCoachConsent(relationship.relationshipId, event.target.checked, relationship.journalConsent); await load(); }} /> Метрики и привычки</label><label><input type="checkbox" checked={relationship.journalConsent} onChange={async (event) => { await api.updateCoachConsent(relationship.relationshipId, relationship.metricsConsent, event.target.checked); await load(); }} /> Дневник</label></div>
        </section>

        {coachOrders.length > 0 && <section className={`${styles.panel} ${styles.stack}`} style={{ marginTop: 18 }}><h2>Оплаченные услуги</h2>{coachOrders.map((order) => <article className={styles.task} key={order.id}><div className={styles.taskTop}><div><span className={styles.badge}>{order.status}</span><h3>{order.serviceTitle}</h3><p>{money(order.amount, order.currency)}{order.bookingDeadline ? ` · записаться до ${formatDate(order.bookingDeadline)}` : ""}</p></div><CalendarDays /></div>{order.status === "AWAITING_BOOKING" && <button className={styles.button} onClick={() => openBooking(order.id)}>Выбрать время</button>}</article>)}</section>}

        <div className={styles.grid} style={{ marginTop: 18 }}>
          <section className={`${styles.panel} ${styles.stack}`}><h2>Сообщения</h2>{relationship.messages.map((item) => <div className={`${styles.message} ${item.authorRole === "CLIENT" ? styles.mine : ""}`} key={item.id}>{item.text}<small>{formatDate(item.createdAt)}</small></div>)}{relationship.messages.length === 0 && <div className={styles.empty}>Сообщений пока нет.</div>}<div className={styles.actions}><input className={styles.input} value={message} onChange={(event) => setMessage(event.target.value)} placeholder={relationship.status === "ACTIVE" ? "Ответить коучу" : "Сначала подключите программу"} disabled={relationship.status !== "ACTIVE"} /><button className={styles.button} onClick={send} disabled={relationship.status !== "ACTIVE" || !message.trim()}><Send size={16} /></button></div></section>
          <section className={`${styles.panel} ${styles.stack}`}><h2>Задания</h2>{relationship.assignments.map((assignment) => <article className={styles.task} key={assignment.id}><div className={styles.taskTop}><div><h3>{assignment.title}</h3><p>{assignment.details}</p></div>{assignment.status === "COMPLETED" ? <Check /> : <ClipboardCheck />}</div>{assignment.status === "OPEN" && <button className={styles.button} onClick={async () => { await api.completeCoachAssignment(assignment.id); await load(); }}>Отметить выполненным</button>}</article>)}<h2>Привычки от коуча</h2>{relationship.habitAssignments.map((habit) => <article className={styles.task} key={habit.id}><span className={styles.badge}>Назначено коучем</span><h3>{habit.title}</h3><p>{habit.practice}</p>{habit.status === "PROPOSED" && <div className={styles.actions}><button className={styles.button} onClick={async () => { await api.decideCoachHabit(habit.id, "accept"); await load(); }}><Check size={15} /> Принять</button><button className={`${styles.button} ${styles.secondary}`} onClick={async () => { await api.decideCoachHabit(habit.id, "decline"); await load(); }}><X size={15} /> Не сейчас</button></div>}</article>)}</section>
        </div>

        {relationship.rewards.length > 0 && <section className={`${styles.panel} ${styles.stack}`} style={{ marginTop: 18 }}><h2><Gift size={19} /> Награды коуча</h2>{relationship.rewards.map((reward) => <article className={styles.reward} key={reward.id}><div><h3>{reward.title}</h3><p>{reward.description}</p></div><strong>{reward.pointsCost} Points</strong><button className={styles.button} onClick={async () => { try { await api.redeemCoachReward(reward.id, relationship.relationshipId, crypto.randomUUID()); setNotice("Награда получена"); } catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось получить награду"); } }}>Получить</button></article>)}</section>}
      </>}
    </> : !showInvite && <section className={styles.panel}><ShieldCheck /><h2>Коуч пока не подключён</h2><p>Вы можете выбрать специалиста в каталоге или продолжать пользоваться Навигатором самостоятельно.</p><Link className={styles.button} href="/coaches">Открыть каталог коучей</Link></section>}
  </main>;
}

function formatDate(value: string) { return new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
function money(amount: number, currency: string) { return new Intl.NumberFormat("ru-RU", { style: "currency", currency: currency.toUpperCase(), maximumFractionDigits: 0 }).format(amount / 100); }
function relationshipStatus(status: string) { return ({ ACTIVE: "Активная программа", PAUSED: "Доступ приостановлен", PENDING: "Ожидает подключения" } as Record<string, string>)[status] || status; }
function remainingLabel(value?: string | null) { if (!value) return "Без заданной даты окончания"; const days = Math.max(0, Math.ceil((new Date(value).getTime() - Date.now()) / 86_400_000)); return `Осталось ${days} дн.`; }
