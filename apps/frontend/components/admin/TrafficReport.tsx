"use client";

import { useEffect, useRef, useState } from "react";
import { Download, RefreshCw, Info } from "lucide-react";
import type { AdminTrafficReport } from "@levelup/contracts";
import { adminApi } from "@/lib/api";
import { uiText, getFormatLocale, useUiLocale } from "@/lib/locale";
import styles from "./TrafficReport.module.css";

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return `"${(/^[=+@\-\t\r\n]/.test(text) ? "'" : "") + text.replaceAll('"', '""')}"`;
}

function download(report: AdminTrafficReport) {
  const rows: unknown[][] = [["section", "date/source/page", "medium", "campaign", "visitors", "visits", "pageViews", "registrations", "paidReports", "diagnostics"]];
  rows.push(["totals", report.range.from, "", "", report.totals.visitors, report.totals.visits, report.totals.pageViews, report.conversions.registrationVisits, report.conversions.paidReportVisits, report.conversions.diagnosticVisits]);
  for (const row of report.daily) rows.push(["daily", row.date, "", "", row.visitors, row.visits, row.pageViews]);
  for (const row of report.sources) rows.push(["source", row.source, row.medium, row.campaign, "", row.visits, "", row.registrations, row.paidReports]);
  for (const row of report.pages) rows.push(["page", row.page, "", "", row.visitors, "", row.pageViews]);
  for (const row of report.devices) rows.push(["device", row.device, "", "", "", row.visits]);
  rows.push(["all_business", report.range.from, "", "", "", "", "", report.business.registrations, report.business.paidReports, report.business.diagnostics]);
  const url = URL.createObjectURL(new Blob(["\uFEFF", rows.map(row => row.map(csvCell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = `orken-traffic-${report.range.days}d.csv`; anchor.click(); URL.revokeObjectURL(url);
}

function Metric({ title, value, help }: { title: string; value: number; help: string }) {
  return <div className={styles.metric}><span>{title}<Info size={14} aria-label={help}><title>{help}</title></Info></span><strong>{value.toLocaleString(getFormatLocale())}</strong></div>;
}

export default function TrafficReport() {
  useUiLocale();
  const [days, setDays] = useState(30);
  const [report, setReport] = useState<AdminTrafficReport | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const generation = useRef(0);
  async function refresh(period: number) {
    const current = ++generation.current;
    setLoading(true); setError("");
    try { const result = await adminApi.trafficReport(period); if (current === generation.current) setReport(result); }
    catch (reason) { if (current === generation.current) setError(reason instanceof Error ? reason.message : uiText("Не удалось загрузить статистику")); }
    finally { if (current === generation.current) setLoading(false); }
  }
  useEffect(() => { void refresh(days); return () => { generation.current++; }; }, [days]);
  async function setEnabled(enabled: boolean) {
    setSaving(true); setError("");
    try { await adminApi.upsertSetting("traffic_analytics_enabled", enabled); await refresh(days); }
    catch (reason) { setError(reason instanceof Error ? reason.message : uiText("Не удалось сохранить настройку")); }
    finally { setSaving(false); }
  }
  const max = Math.max(1, ...(report?.daily.flatMap(row => [row.pageViews, row.visits, row.visitors]) ?? []));
  const lines = [
    { key: "pageViews" as const, label: uiText("Просмотры"), color: "#51d5df" },
    { key: "visits" as const, label: uiText("Визиты"), color: "#a6dd76" },
    { key: "visitors" as const, label: uiText("Посетители"), color: "#f1be65" }
  ];
  const date = (value: string) => new Intl.DateTimeFormat(getFormatLocale(), { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(value));
  const rate = (count: number) => report?.totals.visits ? `${Math.round(count / report.totals.visits * 1000) / 10}%` : "0%";
  return <div className={styles.root} aria-busy={loading}>
    <div className={styles.toolbar}>
      <div className={styles.periods} role="group" aria-label={uiText("Период статистики")}>{[7, 30, 90, 180].map(period => <button key={period} aria-pressed={days === period} onClick={() => setDays(period)}>{uiText("{v0} дней", { v0: period })}</button>)}</div>
      <div className={styles.tools}><button title={uiText("Обновить")} aria-label={uiText("Обновить")} disabled={loading} onClick={() => void refresh(days)}><RefreshCw size={18} /></button><button title={uiText("Скачать CSV")} aria-label={uiText("Скачать CSV")} disabled={!report || loading} onClick={() => report && download(report)}><Download size={18} /></button></div>
    </div>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {loading && <p role="status">{uiText("Загрузка статистики…")}</p>}
    {report && <>
      <div className={styles.status}><span>{date(report.range.from)} – {date(report.range.to)} · UTC</span><label><input type="checkbox" checked={report.enabled} disabled={saving || loading} onChange={event => void setEnabled(event.target.checked)} />{uiText("Сбор аналитики")}</label></div>
      {!report.enabled && <p className={styles.notice}>{uiText("Сбор отключён администратором. Сохранённая статистика доступна для просмотра.")}</p>}
      <p className={styles.note}>{uiText("Только браузеры с согласием. Один посетитель — один браузер, визит завершается после 30 минут без просмотров. Данные хранятся 180 дней.")}</p>
      {!report.observedSince ? <p className={styles.empty}>{uiText("Посещений пока нет. Статистика начнёт собираться после публикации и согласия посетителей; прошлые посещения не восстанавливаются.")}</p> : <p className={styles.note}>{uiText("Доступные данные с {v0}", { v0: date(report.observedSince) })}</p>}
      <div className={styles.metrics}>
        <Metric title={uiText("Посетители")} value={report.totals.visitors} help={uiText("Уникальные браузеры, а не люди. Разные устройства считаются отдельно.")} />
        <Metric title={uiText("Визиты")} value={report.totals.visits} help={uiText("Визиты, начавшиеся в выбранный период. Повторный визит после 30 минут считается новым.")} />
        <Metric title={uiText("Просмотры")} value={report.totals.pageViews} help={uiText("Просмотры разрешённых типов страниц за период, без административных и демонстрационных кабинетов.")} />
      </div>
      <section className={styles.section}>
        <h2>{uiText("Динамика посещений")}</h2>
        <div className={styles.legend}>{lines.map(line => <span key={line.key}><i style={{ background: line.color }} />{line.label}</span>)}</div>
        <div className={styles.chart}><svg viewBox="0 0 900 210" role="img" aria-label={uiText("Посещения по дням")}>
          {[0, .5, 1].map(fraction => <g key={fraction}><line x1="42" x2="890" y1={180 - 150 * fraction} y2={180 - 150 * fraction} stroke="#35434c" /><text x="0" y={185 - 150 * fraction} fill="#b4c1cb" fontSize="12">{Math.round(max * fraction)}</text></g>)}
          {lines.map(line => <polyline key={line.key} fill="none" stroke={line.color} strokeWidth="2.5" points={report.daily.map((row, index) => `${42 + (index / Math.max(1, report.daily.length - 1)) * 848},${180 - (row[line.key] / max) * 150}`).join(" ")} />)}
          <text x="42" y="205" fill="#b4c1cb" fontSize="12">{date(report.range.from)}</text><text x="890" y="205" textAnchor="end" fill="#b4c1cb" fontSize="12">{date(report.range.to)}</text>
        </svg></div>
        <details><summary>{uiText("Данные по дням")}</summary><div className={styles.scroll}><table><thead><tr><th>{uiText("Дата")}</th>{lines.map(line => <th key={line.key}>{line.label}</th>)}</tr></thead><tbody>{report.daily.map(row => <tr key={row.date}><td>{date(row.date)}</td>{lines.map(line => <td key={line.key}>{row[line.key]}</td>)}</tr>)}</tbody></table></div></details>
      </section>
      <section className={styles.section}>
        <h2>{uiText("Конверсии визитов")}</h2><p className={styles.note}>{uiText("Доля визитов с действием, не строгая последовательность шагов. Регистрации и оплаты подтверждаются backend. Оплаты здесь — только отчёты, без подписок и услуг коучей; промокоды на 100% не считаются оплатой.")}</p>
        <div className={styles.conversions}>{[
          [uiText("Начали диагностику"), report.conversions.diagnosticVisits], [uiText("Зарегистрировались"), report.conversions.registrationVisits], [uiText("Оплатили отчёт"), report.conversions.paidReportVisits]
        ].map(([label, count]) => <div key={label}><span>{label}</span><strong>{count}</strong><small>{rate(Number(count))} {uiText("визитов")}</small></div>)}</div>
      </section>
      <section className={styles.section}><h2>{uiText("Источники и кампании")}</h2><p className={styles.note}>{uiText("Первый источник визита. Только безопасные UTM-метки; неизвестные внешние сайты объединены в external. До 20 сочетаний с наибольшим числом визитов.")}</p>
        <div className={styles.scroll}><table><thead><tr><th>{uiText("Источник")}</th><th>UTM medium</th><th>{uiText("Кампания")}</th><th>{uiText("Визиты")}</th><th>{uiText("С регистрацией")}</th><th>{uiText("С оплатой отчёта")}</th></tr></thead><tbody>{report.sources.map((row, index) => <tr key={index}><td>{row.source}</td><td>{row.medium}</td><td>{row.campaign ?? "–"}</td><td>{row.visits}</td><td>{row.registrations}</td><td>{row.paidReports}</td></tr>)}</tbody></table>{report.sources.length === 0 && <p className={styles.empty}>{uiText("Нет данных за период")}</p>}</div>
      </section>
      <div className={styles.columns}>
        <section className={styles.section}><h2>{uiText("Популярные страницы")}</h2><div className={styles.scroll}><table><thead><tr><th>{uiText("Тип страницы")}</th><th>{uiText("Просмотры")}</th><th>{uiText("Посетители")}</th></tr></thead><tbody>{report.pages.map(row => <tr key={row.page}><td>{row.page}</td><td>{row.pageViews}</td><td>{row.visitors}</td></tr>)}</tbody></table></div></section>
        <section className={styles.section}><h2>{uiText("Устройства")}</h2><div className={styles.scroll}><table><thead><tr><th>{uiText("Тип")}</th><th>{uiText("Визиты")}</th></tr></thead><tbody>{report.devices.map(row => <tr key={row.device}><td>{row.device === "mobile" ? uiText("Телефон") : row.device === "tablet" ? uiText("Планшет") : uiText("Компьютер")}</td><td>{row.visits}</td></tr>)}</tbody></table></div></section>
      </div>
      <section className={styles.section}><h2>{uiText("Все бизнес-события за период")}</h2><p className={styles.note}>{uiText("Все пользователи, в том числе без согласия на веб-аналитику. Эти значения нельзя делить на число посетителей выше. Подробности подписок и платежей — в разделе «Отчёты».")}</p><div className={styles.metrics}>
        <Metric title={uiText("Регистрации")} value={report.business.registrations} help={uiText("Новые аккаунты пользователей по дате создания, без гостевых сессий и аккаунтов Partner Core.")} />
        <Metric title={uiText("Диагностики")} value={report.business.diagnostics} help={uiText("Все диагностики, созданные за выбранный период.")} />
        <Metric title={uiText("Оплаченные отчёты")} value={report.business.paidReports} help={uiText("Подтверждённые оплаты отчётов с положительной суммой за период. Это не выручка и не число подписок.")} />
      </div></section>
    </>}
  </div>;
}
