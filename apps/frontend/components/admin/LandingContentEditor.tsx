"use client";
import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { validateSiteContent, type FooterSection } from "@levelup/contracts";
import { defaultSiteText, mergeSiteText, type SiteText } from "@/lib/messages";
import { resolveFooterSections } from "@/lib/landingFooter";
import { uiText } from "@/lib/locale";
import { LandingFaq } from "@/components/landing/LandingFaq";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { api } from "@/lib/api";

type Props = { locale: string; draft: string; previous: unknown; onChange: (value: SiteText) => void; onPublish: () => Promise<void>; onDiscard: () => void };
const move = <T,>(items: readonly T[], index: number, delta: number) => { const next = [...items]; [next[index], next[index + delta]] = [next[index + delta], next[index]]; return next; };

export function LandingContentEditor(props: Props) {
  const [view, setView] = useState("faq");
  const [publishing, setPublishing] = useState(false);
  const [prices, setPrices] = useState<{ reportPrice: string; habitPrice: string; trialDays: number } | null>(null);
  useEffect(() => {
    let active = true;
    Promise.all([api.getPaymentConfig(), api.habitConfig()]).then(([report, habit]) => {
      if (active && typeof report.priceLabel === "string" && typeof habit.priceLabel === "string") setPrices({ reportPrice: report.priceLabel, habitPrice: habit.priceLabel, trialDays: habit.trialDays });
    }).catch(() => undefined);
    return () => { active = false; };
  }, [props.locale]);
  const value = useMemo(() => { try { return mergeSiteText(defaultSiteText[props.locale === "en" ? "en" : "ru"], JSON.parse(props.draft)); } catch { return null; } }, [props.draft, props.locale]);
  if (!value) return <p role="alert">{uiText("Исправьте JSON в расширенном редакторе.")}</p>;
  const landing = value.landing.v2;
  const faq = landing.faq;
  const footer = landing.footer;
  const groups = resolveFooterSections(footer);
  if (!Array.isArray(faq.items) || faq.items.some(item => !item || typeof item.question !== "string" || typeof item.answer !== "string") || groups.some(group => !group || !Array.isArray(group.links) || group.links.some(link => !link || typeof link.label !== "string" || typeof link.href !== "string"))) return <p role="alert">{uiText("Исправьте JSON в расширенном редакторе.")}</p>;
  const update = (next: Partial<typeof landing>) => props.onChange({ ...value, landing: { ...value.landing, v2: { ...landing, ...next } } });
  const updateFooter = (next: Partial<typeof footer>) => update({ footer: { ...footer, ...next } });
  const changeGroup = (index: number, next: Partial<FooterSection>) => updateFooter({ sections: groups.map((group, i) => i === index ? { ...group, ...next } : group) });
  const issue = validateSiteContent(value);
  const arrows = (index: number, length: number, onMove: (delta: number) => void, remove: () => void) => <div className="content-item-actions">
    <button type="button" title={uiText("Выше")} aria-label={uiText("Выше")} disabled={index === 0} onClick={() => onMove(-1)}><ArrowUp size={17} /></button>
    <button type="button" title={uiText("Ниже")} aria-label={uiText("Ниже")} disabled={index === length - 1} onClick={() => onMove(1)}><ArrowDown size={17} /></button>
    <button type="button" title={uiText("Удалить")} aria-label={uiText("Удалить")} onClick={remove}><Trash2 size={17} /></button>
  </div>;
  return <div className="content-editor" data-testid="landing-content-editor">
    <div className="content-editor-tabs" role="tablist" aria-label={uiText("Редактор лендинга")}>
      {[["faq", "Вопросы и ответы"], ["footer", "Подвал и ссылки"], ["contacts", "Контакты и реквизиты"], ["preview", "Предпросмотр"]].map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={view === id} onClick={() => setView(id)}>{uiText(label)}</button>)}
    </div>
    {view === "faq" && <div className="stack" role="tabpanel">
      <label><input type="checkbox" checked={faq.enabled} onChange={e => update({ faq: { ...faq, enabled: e.target.checked } })} /> {uiText("Показывать FAQ")}</label>
      <label>{uiText("Заголовок FAQ")}<input className="input" value={faq.title} maxLength={160} onChange={e => update({ faq: { ...faq, title: e.target.value } })} /></label>
      {faq.items.map((item, index) => <fieldset className="content-editor-item" key={item.id}>
        <legend>{uiText("Вопрос")} {index + 1}</legend>
        {arrows(index, faq.items.length, delta => update({ faq: { ...faq, items: move(faq.items, index, delta) } }), () => update({ faq: { ...faq, items: faq.items.filter((_, i) => i !== index) } }))}
        <label>{uiText("Вопрос")}<input className="input" value={item.question} maxLength={500} onChange={e => update({ faq: { ...faq, items: faq.items.map((row, i) => i === index ? { ...row, question: e.target.value } : row) } })} /></label>
        <label>{uiText("Ответ")}<textarea aria-label={uiText("Ответ")} className="input" rows={5} value={item.answer} maxLength={10000} onChange={e => update({ faq: { ...faq, items: faq.items.map((row, i) => i === index ? { ...row, answer: e.target.value } : row) } })} /></label>
      </fieldset>)}
      <button className="button secondary" type="button" disabled={faq.items.length >= 30} onClick={() => update({ faq: { ...faq, items: [...faq.items, { id: crypto.randomUUID(), question: uiText("Новый вопрос"), answer: "" }] } })}><Plus size={17} />{uiText("Добавить вопрос")}</button>
      <p className="muted">{uiText("Цены и пробный период: {reportPrice}, {habitPrice}, {trial}. Эти значения подставляются из backend.")}</p>
    </div>}
    {view === "footer" && <div className="stack" role="tabpanel">
      {groups.map((group, index) => <fieldset className="content-editor-item" key={group.id}>
        <legend>{uiText("Раздел подвала")} {index + 1}</legend>
        {arrows(index, groups.length, delta => updateFooter({ sections: move(groups, index, delta) }), () => updateFooter({ sections: groups.filter((_, i) => i !== index) }))}
        <label><input type="checkbox" checked={group.enabled} onChange={e => changeGroup(index, { enabled: e.target.checked })} /> {uiText("Показывать раздел")}</label>
        <label>{uiText("Название раздела")}<input className="input" value={group.title} maxLength={160} onChange={e => changeGroup(index, { title: e.target.value })} /></label>
        {group.links.map((link, linkIndex) => <div className="content-editor-link" key={link.id}>
          <label>{uiText("Подпись ссылки")}<input className="input" value={link.label} maxLength={200} onChange={e => changeGroup(index, { links: group.links.map((row, i) => i === linkIndex ? { ...row, label: e.target.value } : row) })} /></label>
          <label>URL<input className="input" value={link.href} maxLength={500} onChange={e => changeGroup(index, { links: group.links.map((row, i) => i === linkIndex ? { ...row, href: e.target.value } : row) })} /></label>
          <label>{uiText("Иконка")}<select className="input" value={link.icon} onChange={e => changeGroup(index, { links: group.links.map((row, i) => i === linkIndex ? { ...row, icon: e.target.value as typeof link.icon } : row) })}>{["none", "mail", "instagram", "music", "telegram"].map(icon => <option key={icon}>{icon}</option>)}</select></label>
          <label><input type="checkbox" checked={link.enabled} onChange={e => changeGroup(index, { links: group.links.map((row, i) => i === linkIndex ? { ...row, enabled: e.target.checked } : row) })} /> {uiText("Видна")}</label>
          {arrows(linkIndex, group.links.length, delta => changeGroup(index, { links: move(group.links, linkIndex, delta) }), () => changeGroup(index, { links: group.links.filter((_, i) => i !== linkIndex) }))}
        </div>)}
        <button className="button secondary" type="button" disabled={group.links.length >= 20} onClick={() => changeGroup(index, { links: [...group.links, { id: crypto.randomUUID(), label: uiText("Новая ссылка"), href: "/", icon: "none", enabled: true }] })}><Plus size={17} />{uiText("Добавить ссылку")}</button>
      </fieldset>)}
      <button className="button secondary" type="button" disabled={groups.length >= 12} onClick={() => updateFooter({ sections: [...groups, { id: crypto.randomUUID(), title: uiText("Новый раздел"), enabled: true, links: [] }] })}><Plus size={17} />{uiText("Добавить раздел")}</button>
    </div>}
    {view === "contacts" && <div className="stack" role="tabpanel">
      <label>{uiText("Email поддержки")}<input className="input" type="email" value={footer.supportEmail} onChange={e => {
        updateFooter({ supportEmail: e.target.value, sections: groups.map(group => group.id === "contacts" ? { ...group, links: group.links.map(link => link.id === "email" ? { ...link, href: `mailto:${e.target.value}`, label: e.target.value } : link) } : group) });
      }} /></label>
      <label>{uiText("Юридические реквизиты в подвале")}<textarea aria-label={uiText("Юридические реквизиты в подвале")} className="input" rows={5} maxLength={1500} value={footer.legalDetails} onChange={e => updateFooter({ legalDetails: e.target.value })} /></label>
      <p className="muted">{uiText("Реквизиты должны совпадать с Офертой и Политикой. Изменение подвала не изменяет юридические документы.")}</p>
    </div>}
    {view === "preview" && <div className="content-editor-preview" role="tabpanel">
      {!issue && faq.enabled && <LandingFaq eyebrow={faq.eyebrow} title={faq.title} items={faq.items.map(item => ({ ...item, answer: prices ? item.answer.replaceAll("{reportPrice}", prices.reportPrice).replaceAll("{habitPrice}", prices.habitPrice).replaceAll("{trial}", prices.trialDays > 0 ? faq.trial.replaceAll("{days}", String(prices.trialDays)) : faq.noTrial) : item.answer }))} />}
      {!issue && <LandingFooter text={footer} preview />}
    </div>}
    {issue && <p role="alert">{uiText(issue)}</p>}
    <div className="row content-publish-actions">
      <button className="button" type="button" disabled={publishing || Boolean(issue)} onClick={async () => { setPublishing(true); try { await props.onPublish(); } finally { setPublishing(false); } }}>{uiText("Опубликовать изменения")}</button>
      <button className="button secondary" type="button" disabled={publishing} onClick={props.onDiscard}>{uiText("Отменить изменения")}</button>
      <button className="button secondary" type="button" disabled={!props.previous || publishing} onClick={() => props.onChange(mergeSiteText(defaultSiteText[props.locale === "en" ? "en" : "ru"], props.previous))}>{uiText("Загрузить предыдущую версию")}</button>
    </div>
  </div>;
}
