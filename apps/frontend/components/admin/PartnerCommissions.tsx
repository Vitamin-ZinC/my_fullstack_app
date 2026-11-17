"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle, RefreshCw, Save } from "lucide-react";
import type { PartnerCommissionTarget, PartnerCommissionTerm, PartnerCoreAdminSnapshot } from "@levelup/contracts";
import { adminApi } from "@/lib/api";
import { useUiLocale } from "@/lib/locale";
import { CommissionSummary } from "@/components/PartnerCommissionTerms";
import styles from "./PartnerCommissions.module.css";

function errorCopy(error: unknown, en: boolean) {
  let code = "";
  try { code = JSON.parse(error instanceof Error ? error.message : "").code ?? ""; } catch { /* Network errors have no JSON body. */ }
  if (["scope_missing", "service_scope_missing", "service_project_scope_missing", "commission_service_not_configured"].includes(code)) {
    return en ? "The backend key needs sessions:write and commissions:write for ORKEN. Contact the administrator."
      : "Ключу backend нужны права sessions:write и commissions:write для ORKEN. Обратитесь к администратору.";
  }
  if (code === "idempotency_conflict") return en ? "This operation conflicts with an earlier request. Refresh the terms before saving again." : "Операция конфликтует с предыдущим запросом. Обновите условия перед новым сохранением.";
  if (code === "commission_model_not_percent") return en ? "This program does not use percentage commissions." : "В этой программе не используется процентная комиссия.";
  return en ? "Could not load or save the terms. Retry the request." : "Не удалось загрузить или сохранить условия. Повторите запрос.";
}

function programName(snapshot: PartnerCoreAdminSnapshot, id: string) {
  const program = snapshot.programs.find(item => item.id === id);
  return String(program?.name ?? program?.service ?? id);
}

function CommissionEditor({ target, title, onSaved }: { target: PartnerCommissionTarget; title: string; onSaved: () => Promise<void> }) {
  const en = useUiLocale() === "en";
  const [term, setTerm] = useState<PartnerCommissionTerm | null>(null);
  const [mode, setMode] = useState("inherit");
  const [percent, setPercent] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reload, setReload] = useState(0);
  const attempt = useRef<{ signature: string; key: string } | null>(null);
  const isProgram = !target.partnerAccountId;
  const isLink = Boolean(target.referralLinkId);
  const { programId, partnerAccountId, referralLinkId } = target;

  useEffect(() => {
    let active = true;
    setTerm(null); setBusy(true); setError(""); setNotice("");
    adminApi.partnerCommissionTerms({ programId, partnerAccountId, referralLinkId }).then(result => {
      if (!active) return;
      const next = result.commissionTerms;
      setTerm(next);
      const override = isProgram ? next.standardRateBps : isLink ? next.referralLinkRateBps : next.partnerRateBps;
      setMode(override === null ? "inherit" : override === 1500 ? "1500" : override === 3000 ? "3000" : "custom");
      setPercent(override === null ? "" : String(override / 100));
    }).catch(next => { if (active) setError(errorCopy(next, en)); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [programId, partnerAccountId, referralLinkId, isProgram, isLink, reload, en]);

  const bps = isProgram || mode === "custom" ? Math.round(Number(percent) * 100) : mode === "inherit" ? null : Number(mode);
  const validRate = bps === null ? !isProgram : percent.trim() !== "" || (!isProgram && mode !== "custom");
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!term || busy || !validRate || !reason.trim() || (bps !== null && (!Number.isInteger(bps) || bps < 0 || bps > 10000))) return;
    const change = { programId, ...(partnerAccountId ? { partnerAccountId } : {}), ...(referralLinkId ? { referralLinkId } : {}), commissionRateBps: bps, reason: reason.trim() };
    const signature = JSON.stringify(change);
    if (attempt.current?.signature !== signature) attempt.current = { signature, key: crypto.randomUUID() };
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await adminApi.updatePartnerCommissionTerms({ ...change, idempotencyKey: attempt.current.key });
      setTerm(result.commissionTerms);
      attempt.current = null;
      setReason("");
      setNotice(en ? "Terms saved in Partner Core." : "Условия сохранены в Partner Core.");
      try { await onSaved(); } catch { setNotice(en ? "Terms saved. Refresh the list to update related rates." : "Условия сохранены. Обновите список для связанных ставок."); }
    } catch (next) { setError(errorCopy(next, en)); }
    finally { setBusy(false); }
  }

  return <form className={styles.editor} onSubmit={save} data-testid="commission-editor">
    <div className={styles.heading}><h4>{title}</h4><button className="button secondary compact" type="button" title={en ? "Refresh terms" : "Обновить условия"} disabled={busy} onClick={() => { attempt.current = null; setReload(v => v + 1); }}><RefreshCw size={15} /></button></div>
    {term && <CommissionSummary term={term} />}
    {busy && !term && <p role="status">{en ? "Loading terms..." : "Загружаем условия..."}</p>}
    {term && <>
      {isProgram ? <label className="admin-field"><span>{en ? "Program standard, %" : "Стандарт программы, %"}</span><input className="input" type="number" min="0" max="100" step="0.01" required disabled={busy} value={percent} onChange={e => setPercent(e.target.value)} /></label>
        : <label className="admin-field"><span>{en ? "Commission terms" : "Условия комиссии"}</span><select className="input" disabled={busy} value={mode} onChange={e => setMode(e.target.value)}>
          <option value="inherit">{isLink ? (en ? "Inherit partner terms" : "Наследовать условия партнёра") : (en ? "Program standard" : "Стандарт программы")}</option>
          {isLink && <option value="1500">{en ? "Individual: 15%" : "Индивидуальные: 15%"}</option>}
          <option value="3000">{en ? "Ambassador: 30%" : "Амбассадор: 30%"}</option>
          {(mode === "custom" || (!isLink && mode === "1500")) && <option value={mode}>{en ? "Individual rate" : "Индивидуальная ставка"}: {percent}%</option>}
        </select></label>}
      {!isProgram && <p className={styles.note}>{en ? "Program standard: " : "Стандарт программы: "}{term.standardRateBps / 100}%{!isLink && (en ? ". Resetting partner terms does not reset individual link rates." : ". Сброс условий партнёра не сбрасывает индивидуальные ставки ссылок.")}</p>}
      <label className="admin-field"><span>{en ? "Reason for change" : "Причина изменения"}</span><input className="input" value={reason} maxLength={1000} required disabled={busy} onChange={e => setReason(e.target.value)} /></label>
      <button className="button compact" type="submit" disabled={busy || !reason.trim() || !validRate}>{busy ? <LoaderCircle size={16} className={styles.spin} /> : <Save size={16} />}{en ? "Save" : "Сохранить"}</button>
    </>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    {notice && <p className={styles.notice} role="status">{notice}</p>}
  </form>;
}

export function AdminPartnerCommissions({ snapshot, partnerAccountId, onSaved }: { snapshot: PartnerCoreAdminSnapshot; partnerAccountId: string; onSaved: () => Promise<void> }) {
  const en = useUiLocale() === "en";
  const [open, setOpen] = useState(false);
  const [selectedProgram, setSelectedProgram] = useState("");
  const [selectedLink, setSelectedLink] = useState("");
  const programs = snapshot.commissionTerms?.programs ?? [];
  const programId = programs.some(p => p.programId === selectedProgram) ? selectedProgram : programs[0]?.programId;
  const links = snapshot.commissionTerms?.referralLinks.filter(t => t.partnerAccountId === partnerAccountId && t.programId === programId) ?? [];
  const target = programId ? { programId, partnerAccountId, ...(selectedLink && links.some(l => l.referralLinkId === selectedLink) ? { referralLinkId: selectedLink } : {}) } : null;
  return <details className={styles.manager} onToggle={e => setOpen(e.currentTarget.open)}>
    <summary>{en ? "Commission terms" : "Условия комиссии"}</summary>
    {open && <div className={styles.body}>
      {!programId && <p>{en ? "No percentage program terms are available from Partner Core." : "Partner Core не вернул условия процентной программы."}</p>}
      {programs.length > 1 && <label className="admin-field"><span>{en ? "Program" : "Программа"}</span><select className="input" value={programId} onChange={e => { setSelectedProgram(e.target.value); setSelectedLink(""); }}>{programs.map(p => <option key={p.programId} value={p.programId}>{programName(snapshot, p.programId)}</option>)}</select></label>}
      {target && <>
        <label className="admin-field"><span>{en ? "Apply to" : "Для кого"}</span><select className="input" value={target.referralLinkId ?? ""} onChange={e => setSelectedLink(e.target.value)}>
          <option value="">{en ? "Partner" : "Партнёр"}</option>
          {links.map(term => { const link = snapshot.referralLinks.find(row => row.id === term.referralLinkId); return <option key={term.referralLinkId} value={term.referralLinkId}>{en ? "Link: " : "Ссылка: "}{String(link?.channel ?? link?.code ?? term.referralLinkId)}</option>; })}
        </select></label>
        <CommissionEditor key={`${programId}:${target.referralLinkId ?? "partner"}`} target={target} title={programName(snapshot, programId!)} onSaved={onSaved} />
      </>}
    </div>}
  </details>;
}

export function AdminProgramCommissions({ snapshot, onSaved }: { snapshot: PartnerCoreAdminSnapshot; onSaved: () => Promise<void> }) {
  const en = useUiLocale() === "en";
  const programs = snapshot.commissionTerms?.programs ?? [];
  return <div className={styles.standards}>
    {programs.map(term => <ProgramCommission key={term.programId} term={term} title={programName(snapshot, term.programId)} en={en} onSaved={onSaved} />)}
  </div>;
}

function ProgramCommission({ term, title, en, onSaved }: { term: PartnerCommissionTerm; title: string; en: boolean; onSaved: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  return <details className={styles.manager} onToggle={e => setOpen(e.currentTarget.open)}>
    <summary>{en ? "Program standard: " : "Стандарт программы: "}{title} ({term.standardRateBps / 100}%)</summary>
    {open && <div className={styles.body}><CommissionEditor target={{ programId: term.programId }} title={title} onSaved={onSaved} /></div>}
  </details>;
}
