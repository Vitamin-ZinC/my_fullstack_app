"use client";

import { useState } from "react";
import { Check, Inbox, X } from "lucide-react";
import type { CoachWorkspaceResponse } from "@levelup/contracts";
import { coachApi } from "@/lib/api";
import { uiText } from "@/lib/locale";
import styles from "@/app/coach/coach.module.css";

export default function ConnectionRequests({ workspace, refresh, setNotice, setError }: {
  workspace: CoachWorkspaceResponse; refresh: () => void; setNotice: (text: string) => void; setError: (text: string) => void;
}) {
  const [busy, setBusy] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [funding, setFunding] = useState<Record<string, "COACH_PAID" | "SELF_FUNDED">>({});
  const requests = (workspace.connectionRequests ?? []).filter(item => item.status === "PENDING");
  const canSponsor = Boolean(workspace.subscription && (workspace.subscription.availableSlots ?? 0) > 0);
  if (!requests.length) return null;

  async function decide(id: string, decision: "accept" | "decline") {
    if (busy) return;
    setBusy(id); setError("");
    try {
      await coachApi.decideConnectionRequest(id, { decision, funding: funding[id] ?? (canSponsor ? "COACH_PAID" : "SELF_FUNDED"), note: notes[id]?.trim() || undefined });
      setNotice(decision === "accept" ? uiText("Заявка подтверждена. Клиенту осталось разрешить доступ к данным.") : uiText("Ответ отправлен клиенту"));
      refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : uiText("Не удалось обработать заявку")); }
    finally { setBusy(""); }
  }

  return <section className={`${styles.panel} ${styles.stack}`} aria-label={uiText("Заявки из каталога")}>
    <h2><Inbox size={20}/> {uiText("Заявки из каталога")} · {requests.length}</h2>
    {requests.map(item => <div className={styles.requestRow} key={item.id}>
      <div><strong>{item.client?.name || item.client?.email}</strong>{item.client?.name && <p>{item.client.email}</p>}{item.message && <p>{item.message}</p>}</div>
      <label>{uiText("Кто оплачивает Навигатор")}<select className={styles.select} aria-label={uiText("Оплата доступа для {v0}", { v0: item.client?.name || item.client?.email || "" })} value={funding[item.id] ?? (canSponsor ? "COACH_PAID" : "SELF_FUNDED")} onChange={event => setFunding(value => ({ ...value, [item.id]: event.target.value as "COACH_PAID" | "SELF_FUNDED" }))}>
        <option value="COACH_PAID" disabled={!canSponsor}>{uiText("Коуч, из пакета мест")}</option><option value="SELF_FUNDED">{uiText("Клиент, по обычному тарифу ORKEN")}</option>
      </select></label>
      <label>{uiText("Ответ клиенту (для отказа обязателен)")}<textarea className={styles.control} rows={2} maxLength={1000} value={notes[item.id] ?? ""} onChange={event => setNotes(value => ({ ...value, [item.id]: event.target.value }))}/></label>
      <div className={styles.actions}><button type="button" className={styles.button} disabled={Boolean(busy)} onClick={() => void decide(item.id, "accept")}><Check size={16}/>{uiText("Подтвердить подключение")}</button><button type="button" className={`${styles.button} ${styles.secondary}`} disabled={Boolean(busy) || !notes[item.id]?.trim()} onClick={() => void decide(item.id, "decline")}><X size={16}/>{uiText("Отклонить заявку")}</button></div>
    </div>)}
  </section>;
}
