"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronLeft, ChevronRight, Eye, RotateCcw, Search, UserRound, X } from "lucide-react";
import type { AdminCoachPlatformSnapshot, CoachProfileSummary, CoachServiceOfferSummary } from "@levelup/contracts";
import { adminApi } from "@/lib/api";
import { getFormatLocale, uiText, useUiLocale } from "@/lib/locale";
import styles from "./CoachModeration.module.css";

type Selection = { kind: "profile" | "offer"; id: string };
type Decision = "APPROVED" | "DRAFT" | "REJECTED" | "SUSPENDED" | "PAUSED";

export function moderationStatus(status: string, note?: string | null) {
  if (status === "DRAFT" && note) return uiText("На доработке");
  return ({ DRAFT: uiText("Черновик"), PENDING_REVIEW: uiText("На модерации"), APPROVED: uiText("Одобрено"),
    REJECTED: uiText("Отклонено"), SUSPENDED: uiText("Приостановлено"), PAUSED: uiText("Приостановлено") } as Record<string, string>)[status] || status;
}

function formatPrice(offer: CoachServiceOfferSummary) {
  if (offer.paymentModel === "INCLUDED") return uiText("Включено в программу");
  const price = new Intl.NumberFormat(getFormatLocale(), { style: "currency", currency: offer.currency }).format(offer.amount / 100);
  return offer.type === "ONGOING_SUPPORT" ? uiText("{v0} / мес", { v0: price }) : price;
}

function serviceType(offer: CoachServiceOfferSummary) {
  return offer.type === "CONSULTATION" ? uiText("Разовая консультация") : uiText("Ежемесячное ведение");
}

export default function CoachModeration({ mode, snapshot, refresh, setMessage, profileExtras }: {
  mode: "profiles" | "offers";
  snapshot: AdminCoachPlatformSnapshot;
  refresh: () => Promise<void>;
  setMessage: (value: string) => void;
  profileExtras: (profile: CoachProfileSummary) => ReactNode;
}) {
  useUiLocale();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [page, setPage] = useState(0);
  const [selection, setSelection] = useState<Selection | null>(null);
  const pageSize = 20;
  const query = search.trim().toLocaleLowerCase();
  const rows = mode === "profiles" ? snapshot.profiles : snapshot.offers;
  const filtered = rows.filter(row => {
    const profile = "displayName" in row ? row : snapshot.profiles.find(item => item.id === row.coachProfileId);
    const text = "displayName" in row ? [row.displayName, row.headline, row.city, ...row.specializations] : [row.title, profile?.displayName, row.coachName];
    return (status === "ALL" || row.status === status) && (!query || text.join(" ").toLocaleLowerCase().includes(query));
  });
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visiblePage = Math.min(page, pageCount - 1);
  const statuses = ["DRAFT", "PENDING_REVIEW", "APPROVED", "REJECTED", mode === "profiles" ? "SUSPENDED" : "PAUSED"];
  const selectedProfile = selection?.kind === "profile" ? snapshot.profiles.find(item => item.id === selection.id) : undefined;
  const selectedOffer = selection?.kind === "offer" ? snapshot.offers.find(item => item.id === selection.id) : undefined;

  return <>
    <div className={styles.filters}>
      <label className={styles.search}><Search size={17} aria-hidden="true"/><input className="input" aria-label={uiText("Поиск профилей и услуг")} placeholder={uiText("Имя, специализация или услуга")} value={search} onChange={event => { setSearch(event.target.value); setPage(0); }}/></label>
      <label>{uiText("Статус")}<select className="input" aria-label={uiText("Статус")} value={status} onChange={event => { setStatus(event.target.value); setPage(0); }}>
        <option value="ALL">{uiText("Все статусы")}</option>{statuses.map(value => <option key={value} value={value}>{moderationStatus(value)}</option>)}
      </select></label>
      <span className={styles.count}>{uiText("Найдено: {v0}", { v0: filtered.length })}</span>
    </div>
    <div className="admin-table-wrap"><table className="admin-data-table"><thead><tr>
      <th>{mode === "profiles" ? uiText("Коуч") : uiText("Услуга")}</th><th>{mode === "profiles" ? uiText("Специализации") : uiText("Коуч")}</th>
      <th>{uiText("Статус")}</th><th>{mode === "profiles" ? uiText("Заказы") : uiText("Цена и формат")}</th><th>{uiText("Проверка")}</th>
    </tr></thead><tbody>{filtered.slice(visiblePage * pageSize, (visiblePage + 1) * pageSize).map(row => <tr key={row.id}>
      <td>{"displayName" in row ? <div className={styles.identity}><span className={styles.avatar}>{row.avatarUrl ? <img src={row.avatarUrl} alt=""/> : <UserRound size={22}/>}</span><div><strong>{row.displayName}</strong><small>{row.headline || row.city || uiText("Город не указан")}</small></div></div> : <><strong>{row.title}</strong><small>{serviceType(row)}</small></>}</td>
      <td>{"displayName" in row ? row.specializations.join(", ") || uiText("Не указано") : row.coachName || snapshot.profiles.find(profile => profile.id === row.coachProfileId)?.displayName || uiText("Не указано")}</td>
      <td><span className="admin-status-pill">{moderationStatus(row.status, row.moderationNote)}</span></td>
      <td>{"displayName" in row ? row.acceptingOrders ? uiText("Принимает") : uiText("Закрыты") : <><strong>{formatPrice(row)}</strong><small>{row.paymentModel === "CLIENT_PAID" ? uiText("Клиент платит через ORKEN") : uiText("Включено в программу коуча")}</small></>}</td>
      <td><button type="button" className="button secondary compact" onClick={() => setSelection({ kind: mode === "profiles" ? "profile" : "offer", id: row.id })}><Eye size={16}/>{uiText("Проверить")}</button></td>
    </tr>)}{!filtered.length && <tr><td colSpan={5}>{uiText("По выбранным фильтрам ничего не найдено")}</td></tr>}</tbody></table></div>
    <div className={styles.pager}><span>{visiblePage + 1} / {pageCount}</span><button type="button" className="button secondary compact" aria-label={uiText("Назад")} disabled={visiblePage === 0} onClick={() => setPage(visiblePage - 1)}><ChevronLeft size={16}/></button><button type="button" className="button secondary compact" aria-label={uiText("Далее")} disabled={visiblePage + 1 >= pageCount} onClick={() => setPage(visiblePage + 1)}><ChevronRight size={16}/></button></div>
    {selection && (selectedProfile || selectedOffer) && <ReviewDialog key={`${selection.kind}:${selection.id}`} profile={selectedProfile} offer={selectedOffer}
      owner={selectedOffer ? snapshot.profiles.find(profile => profile.id === selectedOffer.coachProfileId) : undefined}
      ownerName={selectedOffer?.coachName} offers={selectedProfile ? snapshot.offers.filter(offer => offer.coachProfileId === selectedProfile.id) : []}
      selectOffer={id => setSelection({ kind: "offer", id })} close={() => setSelection(null)} refresh={refresh} setMessage={setMessage}
      extras={selectedProfile ? profileExtras(selectedProfile) : null}/>}
  </>;
}

function ReviewDialog({ profile, offer, owner, ownerName, offers, selectOffer, close, refresh, setMessage, extras }: {
  profile?: CoachProfileSummary; offer?: CoachServiceOfferSummary; owner?: CoachProfileSummary; ownerName?: string;
  offers: CoachServiceOfferSummary[]; selectOffer: (id: string) => void; close: () => void;
  refresh: () => Promise<void>; setMessage: (message: string) => void; extras: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [note, setNote] = useState(profile?.moderationNote || offer?.moderationNote || "");
  const [coachShare, setCoachShare] = useState(offer?.coachShareBps == null ? "" : String(offer.coachShareBps / 100));
  const [platformShare, setPlatformShare] = useState(offer?.platformShareBps == null ? "" : String(offer.platformShareBps / 100));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { dialog.current?.showModal(); }, []);
  const paid = offer?.paymentModel === "CLIENT_PAID";
  const coachBps = Math.round(Number(coachShare) * 100);
  const platformBps = Math.round(Number(platformShare) * 100);
  const splitValid = !paid || Boolean(coachShare.trim() && platformShare.trim() && Number.isFinite(coachBps) && Number.isFinite(platformBps) && coachBps >= 0 && platformBps >= 0 && coachBps <= 10000 && platformBps <= 10000 && coachBps + platformBps === 10000);
  const item = profile || offer!;
  const unchangedApproval = item.status === "APPROVED" && (!paid || (coachBps === offer?.coachShareBps && platformBps === offer?.platformShareBps));
  async function decide(status: Decision) {
    if (busy) return;
    if (status !== "APPROVED" && !note.trim()) { setError(uiText("Укажите причину решения для коуча")); return; }
    setBusy(true); setError("");
    try {
      if (profile) await adminApi.setCoachProfileStatus(profile.id, { status, moderationNote: status === "APPROVED" ? null : note.trim() });
      else if (offer) await adminApi.setCoachOfferStatus(offer.id, { status, moderationNote: status === "APPROVED" ? null : note.trim(),
        ...(status === "APPROVED" && paid ? { coachShareBps: coachBps, platformShareBps: platformBps } : {}) });
      const success = status === "APPROVED" ? profile ? uiText("Профиль одобрен") : uiText("Услуга одобрена") : status === "DRAFT" ? uiText("Возвращено на доработку") : status === "REJECTED" ? uiText("Отклонено с комментарием") : uiText("Приостановлено с комментарием");
      await refresh(); setMessage(success); close();
    } catch (reason) { setError(reason instanceof Error ? reason.message : uiText("Операция не выполнена")); }
    finally { setBusy(false); }
  }
  return <dialog ref={dialog} className={styles.dialog} aria-labelledby="coach-review-title" onCancel={event => { event.preventDefault(); if (!busy) close(); }}>
    <header className={styles.dialogHeader}><div><span className={styles.eyebrow}>{uiText("Закрытая проверка")}</span><h2 id="coach-review-title">{profile?.displayName || offer?.title}</h2><span className="admin-status-pill">{moderationStatus(item.status, item.moderationNote)}</span></div><button type="button" className="button secondary compact" aria-label={uiText("Закрыть проверку")} onClick={close} disabled={busy}><X size={20}/></button></header>
    <div className={styles.dialogBody}>
      {profile && <>
        {profile.coverImageUrl && <img className={styles.cover} src={profile.coverImageUrl} alt={uiText("Обложка профиля")}/>}
        <div className={styles.profileHead}><span className={styles.photo}>{profile.avatarUrl ? <img src={profile.avatarUrl} alt={uiText("Фото профиля")}/> : <UserRound size={40}/>}</span><div><h3>{profile.headline || uiText("Короткое описание не заполнено")}</h3><p>{profile.city || uiText("Город не указан")}</p><code>/coaches/{profile.slug}</code></div></div>
        <dl className={styles.facts}><div><dt>{uiText("Специализации")}</dt><dd>{profile.specializations.join(", ") || uiText("Не указано")}</dd></div><div><dt>{uiText("Языки")}</dt><dd>{profile.languages.join(", ") || uiText("Не указано")}</dd></div></dl>
        <section><h3>{uiText("О себе")}</h3><p className={styles.copy}>{profile.bio || uiText("Описание не заполнено")}</p></section>
        <section><h3>{uiText("Услуги коуча")}</h3>{offers.length ? <ul className={styles.offerList}>{offers.map(service => <li key={service.id}><div><strong>{service.title}</strong><small>{formatPrice(service)} · {moderationStatus(service.status, service.moderationNote)}</small></div><button type="button" className="button secondary compact" onClick={() => selectOffer(service.id)}><Eye size={16}/>{uiText("Проверить услугу")}</button></li>)}</ul> : <p>{uiText("Услуги пока не добавлены.")}</p>}</section>
        {extras}
      </>}
      {offer && <><dl className={styles.facts}><div><dt>{uiText("Коуч")}</dt><dd>{owner?.displayName || ownerName || uiText("Не указано")}</dd></div><div><dt>{uiText("Статус профиля")}</dt><dd>{owner ? moderationStatus(owner.status, owner.moderationNote) : uiText("Не указано")}</dd></div><div><dt>{uiText("Формат")}</dt><dd>{serviceType(offer)}</dd></div><div><dt>{uiText("Оплата")}</dt><dd>{offer.paymentModel === "CLIENT_PAID" ? uiText("Клиент платит через ORKEN") : uiText("Включено в программу коуча")}</dd></div><div><dt>{uiText("Цена")}</dt><dd>{formatPrice(offer)}</dd></div></dl><section><h3>{uiText("Что получает клиент")}</h3><p className={styles.copy}>{offer.description}</p></section>
        {paid && owner?.status !== "APPROVED" && <p className={styles.notice}>{uiText("Услуга появится в каталоге только после одобрения профиля коуча.")}</p>}
        {paid && <fieldset className={styles.split} disabled={busy}><legend>{uiText("Распределение оплаты")}</legend><label>{uiText("Доля коуча, %")}<input className="input" type="number" min="0" max="100" step="0.01" value={coachShare} onChange={event => setCoachShare(event.target.value)}/></label><label>{uiText("Доля платформы, %")}<input className="input" type="number" min="0" max="100" step="0.01" value={platformShare} onChange={event => setPlatformShare(event.target.value)}/></label>{!splitValid && <p>{uiText("Сумма долей должна быть ровно 100%.")}</p>}</fieldset>}
      </>}
      <label className={styles.comment}>{uiText("Комментарий коучу")}<textarea className="input" aria-label={uiText("Комментарий коучу")} rows={4} maxLength={1000} value={note} onChange={event => setNote(event.target.value)} disabled={busy}/><small>{uiText("Для возврата, отклонения и приостановки укажите причину и необходимые исправления.")}</small></label>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <div className={styles.actions}><button type="button" className="button compact" disabled={busy || !splitValid || unchangedApproval} onClick={() => decide("APPROVED")}><Check size={16}/>{paid && item.status === "APPROVED" ? uiText("Сохранить доли") : uiText("Одобрить")}</button><button type="button" className="button secondary compact" disabled={busy || !note.trim()} onClick={() => decide("DRAFT")}><RotateCcw size={16}/>{uiText("Вернуть на доработку")}</button><button type="button" className="button secondary compact" disabled={busy || !note.trim() || item.status === "REJECTED"} onClick={() => decide("REJECTED")}><X size={16}/>{uiText("Отклонить")}</button><button type="button" className="button secondary compact" disabled={busy || !note.trim() || ["SUSPENDED", "PAUSED"].includes(item.status)} onClick={() => decide(profile ? "SUSPENDED" : "PAUSED")}>{uiText("Приостановить")}</button></div>
    </div>
  </dialog>;
}
