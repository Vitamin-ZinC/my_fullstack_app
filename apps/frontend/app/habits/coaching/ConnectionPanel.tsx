"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LogIn, Send, UserPlus, X } from "lucide-react";
import type { CoachCatalogResponse, CoachConnectionRequestSummary, HabitCoachingHubResponse } from "@levelup/contracts";
import { coachCatalogApi } from "@/lib/api";
import { uiText } from "@/lib/locale";
import styles from "../client-tools.module.css";

export default function ConnectionPanel({ slug, inviteToken, requests, relationships, loginRequired, onChanged }: {
  slug: string;
  inviteToken?: string;
  requests: CoachConnectionRequestSummary[];
  relationships: HabitCoachingHubResponse["relationships"];
  loginRequired: boolean;
  onChanged: () => Promise<unknown>;
}) {
  const [coach, setCoach] = useState<CoachCatalogResponse["coaches"][number] | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setCoach(null); setError(""); setMessage("");
    if (!slug) return;
    let cancelled = false;
    coachCatalogApi.get(slug).then(result => { if (!cancelled) setCoach(result.coach); }).catch(reason => { if (!cancelled) setError(reason instanceof Error ? reason.message : uiText("Коуч не найден")); });
    return () => { cancelled = true; };
  }, [slug]);
  const current = requests.find(item => item.coachSlug === slug);
  const connected = relationships.some(item => item.coach.slug === slug);
  const visibleRequests = requests.filter(item => item.status !== "CANCELLED" && !(item.status === "ACCEPTED" && relationships.some(relationship => relationship.relationshipId === item.relationshipId && relationship.status === "ACTIVE")));
  const returnQuery = new URLSearchParams();
  if (slug) returnQuery.set("coach", slug);
  if (inviteToken) returnQuery.set("coach_invite", inviteToken);
  const returnPath = `/habits/coaching${returnQuery.size ? `?${returnQuery}` : ""}`;
  const next = encodeURIComponent(returnPath);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!coach || busy) return;
    setBusy(true); setError("");
    try { await coachCatalogApi.requestConnection(coach.id, message.trim()); await onChanged(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : uiText("Не удалось отправить заявку")); }
    finally { setBusy(false); }
  }

  return <div className={styles.stack}>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {loginRequired ? <section className={`${styles.panel} ${styles.stack}`}>
      <h2>{coach?.displayName || uiText("Подключение к коучу")}</h2>
      <p>{uiText("Войдите в аккаунт клиента или создайте его, чтобы отправить заявку коучу.")}</p>
      <div className={styles.actions}><Link className={styles.button} href={`/login?next=${next}`}><LogIn size={17}/>{uiText("Войти")}</Link><Link className={`${styles.button} ${styles.secondary}`} href={`/login?mode=register&next=${next}`}><UserPlus size={17}/>{uiText("Создать аккаунт")}</Link></div>
    </section> : <>
      {slug && coach && !connected && current?.status !== "PENDING" && <form className={`${styles.panel} ${styles.stack}`} onSubmit={submit}>
        <h2>{uiText("Подключиться к коучу")}: {coach.displayName}</h2>
        <label>{uiText("Что хотите обсудить с коучем? (необязательно)")}<textarea className={`${styles.input} ${styles.requestMessage}`} rows={3} maxLength={1000} value={message} onChange={event => setMessage(event.target.value)}/></label>
        <p>{uiText("Заявка без списания денег. Доступ к данным открывается только по вашему отдельному согласию после подтверждения коуча.")}</p>
        <button className={styles.button} disabled={busy || !coach.acceptingOrders} type="submit"><Send size={17}/>{busy ? uiText("Отправляем...") : !coach.acceptingOrders ? uiText("Запись временно закрыта") : uiText("Отправить заявку")}</button>
      </form>}
      {visibleRequests.length > 0 && <section className={styles.stack}>
        <h2>{uiText("Мои заявки коучам")}</h2>
        {visibleRequests.map(item => <div className={styles.task} key={item.id}>
          <div className={styles.taskTop}><Link href={`/coaches/${encodeURIComponent(item.coachSlug)}`}>{item.coachName}</Link><span className={styles.badge}>{requestStatus(item.status)}</span></div>
          {item.decisionNote && <p>{item.decisionNote}</p>}
          {item.status === "ACCEPTED" && <p>{uiText("Коуч подтвердил заявку. Согласия на данные доступны в карточке коуча ниже.")}</p>}
          {item.status === "PENDING" && <button type="button" className={`${styles.button} ${styles.secondary}`} disabled={busy} onClick={async () => {
            setBusy(true); setError("");
            try { await coachCatalogApi.cancelConnectionRequest(item.id); await onChanged(); }
            catch (reason) { setError(reason instanceof Error ? reason.message : uiText("Не удалось отменить заявку")); }
            finally { setBusy(false); }
          }}><X size={16}/>{uiText("Отменить заявку")}</button>}
        </div>)}
      </section>}
    </>}
  </div>;
}

function requestStatus(status: CoachConnectionRequestSummary["status"]) {
  return { PENDING: uiText("Ожидает ответа коуча"), ACCEPTED: uiText("Подтверждена"), DECLINED: uiText("Отклонена"), CANCELLED: uiText("Отменена") }[status];
}
