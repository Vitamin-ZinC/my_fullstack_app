"use client";
import { uiText, getFormatLocale, useUiLocale } from "@/lib/locale";


import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CalendarDays, Search } from "lucide-react";
import { api, ApiRequestError } from "@/lib/api";
import styles from "@/app/habits/client-tools.module.css";

type ArchiveResult = Awaited<ReturnType<typeof api.searchHabitArchive>>;
type ArchiveType = "all" | "insights" | "metrics";
type ArchiveAuthor = "all" | "user" | "coach" | "system";

export function HabitArchiveSearch() {
  useUiLocale();
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [minEnergy, setMinEnergy] = useState("");
  const [type, setType] = useState<ArchiveType>("all");
  const [author, setAuthor] = useState<ArchiveAuthor>("all");
  const [result, setResult] = useState<ArchiveResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [needsSignIn, setNeedsSignIn] = useState(false);

  const requestId = useRef(0);

  async function search() {
    const id = ++requestId.current;
    setLoading(true);
    setError("");
    setNeedsSignIn(false);
    try {
      const next = await api.searchHabitArchive({
        q: query || undefined,
        from: from || undefined,
        to: to || undefined,
        minEnergy: minEnergy ? Number(minEnergy) : undefined,
        type,
        author
      });
      if (id === requestId.current) setResult(next);
    } catch (reason) {
      if (id === requestId.current) {
        const unauthorized = reason instanceof ApiRequestError && reason.status === 401;
        setNeedsSignIn(unauthorized);
        setError(unauthorized ? uiText("Войдите для поиска по всем записям. История программы доступна ниже.") : reason instanceof Error ? reason.message : uiText("Не удалось загрузить архив"));
      }
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }

  useEffect(() => { void search(); return () => { requestId.current += 1; }; }, []);

  return <div className={styles.stack} data-testid="habit-archive-search">
    <h2>{uiText("Поиск в архиве")}</h2>
    <form onSubmit={event => { event.preventDefault(); void search(); }}>
      <div className={styles.filters}>
        <label><Search size={16} /><input className={styles.input} value={query} onChange={(event) => setQuery(event.target.value)} aria-label={uiText("Ключевое слово")} maxLength={200} placeholder={uiText("Ключевое слово")} /></label>
        <input className={styles.input} aria-label={uiText("Дата от")} type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        <input className={styles.input} aria-label={uiText("Дата до")} type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        <select className={styles.select} aria-label={uiText("Тип записи")} value={type} onChange={(event) => setType(event.target.value as ArchiveType)}>
          <option value="all">{uiText("Все записи")}</option><option value="insights">{uiText("Инсайты и дневник")}</option><option value="metrics">{uiText("Состояние")}</option>
        </select>
        <select className={styles.select} aria-label={uiText("Автор")} value={author} onChange={(event) => setAuthor(event.target.value as ArchiveAuthor)} disabled={type === "metrics"}>
          <option value="all">{uiText("Любой автор")}</option><option value="user">{uiText("Мои записи")}</option><option value="coach">{uiText("Коуч")}</option><option value="system">ORKEN</option>
        </select>
        <select className={styles.select} aria-label={uiText("Минимальная энергия")} value={minEnergy} onChange={(event) => setMinEnergy(event.target.value)} disabled={type === "insights"}>
          <option value="">{uiText("Любая энергия")}</option>{[1,2,3,4,5,6,7,8,9,10].map((value) => <option key={value} value={value}>{uiText("От ")}{value}</option>)}
        </select>
      </div>
      <button className={styles.button} type="submit" disabled={loading}><Search size={16} />{loading ? uiText("Ищем...") : uiText("Найти")}</button>
    </form>

    {error && <p className={styles.error}>{error}</p>}
    {needsSignIn && <Link href="/login" className={`${styles.button} ${styles.secondary}`}>{uiText("Войти")}</Link>}
    <div className={styles.archiveList} aria-live="polite">
      {result?.insights.map((item) => <article className={styles.archiveRow} key={item.id}><p>{item.text}</p><span>{authorLabel(item.source)} · {item.habitTitle || uiText("Инсайт")} · {formatDate(item.createdAt)}</span></article>)}
      {result?.metrics.map((item) => <article className={styles.archiveRow} key={item.date}><p>{uiText("Энергия ")}{item.energy}{uiText("/10 · Ясность ")}{item.clarity}{uiText("/10 · Устойчивость ")}{item.stability}/10</p><span><CalendarDays size={13} /> {formatDate(item.date)}</span></article>)}
      {!loading && result && result.insights.length + result.metrics.length === 0 && <div className={styles.empty}>{uiText("По выбранным фильтрам записей нет.")}</div>}
      {loading && <div className={styles.empty}>{uiText("Загружаем архив...")}</div>}
    </div>
  </div>;
}

function authorLabel(source: string) {
  if (source === "user") return uiText("Вы");
  if (source.startsWith("coach")) return uiText("Коуч");
  return "ORKEN";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(getFormatLocale(), { dateStyle: "medium" }).format(new Date(value));
}
