"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, CalendarDays, Search } from "lucide-react";
import { api } from "@/lib/api";
import styles from "../client-tools.module.css";

type ArchiveResult = Awaited<ReturnType<typeof api.searchHabitArchive>>;
type ArchiveType = "all" | "insights" | "metrics";
type ArchiveAuthor = "all" | "user" | "coach" | "system";

export default function HabitArchivePage() {
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [minEnergy, setMinEnergy] = useState("");
  const [type, setType] = useState<ArchiveType>("all");
  const [author, setAuthor] = useState<ArchiveAuthor>("all");
  const [result, setResult] = useState<ArchiveResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function search() {
    setLoading(true);
    setError("");
    try {
      setResult(await api.searchHabitArchive({
        q: query || undefined,
        from: from || undefined,
        to: to || undefined,
        minEnergy: minEnergy ? Number(minEnergy) : undefined,
        type,
        author
      }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось загрузить архив");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void search(); }, []);

  return <main className={styles.page}>
    <header className={styles.header}>
      <Link className={styles.brand} href="/">ORKEN.LIFE</Link>
      <Link href="/habits"><ArrowLeft size={17} /> Кабинет привычек</Link>
    </header>
    <section className={styles.intro}>
      <span className={styles.badge}><Search size={14} /> История и архив</span>
      <h1>Мои записи</h1>
      <p>Поиск по дневнику, инсайтам и прошлым отметкам состояния.</p>
    </section>

    <section className={`${styles.panel} ${styles.stack}`}>
      <div className={styles.filters}>
        <label><Search size={16} /><input className={styles.input} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ключевое слово" /></label>
        <input className={styles.input} aria-label="Дата от" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        <input className={styles.input} aria-label="Дата до" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        <select className={styles.select} aria-label="Тип записи" value={type} onChange={(event) => setType(event.target.value as ArchiveType)}>
          <option value="all">Все записи</option><option value="insights">Инсайты и дневник</option><option value="metrics">Состояние</option>
        </select>
        <select className={styles.select} aria-label="Автор" value={author} onChange={(event) => setAuthor(event.target.value as ArchiveAuthor)} disabled={type === "metrics"}>
          <option value="all">Любой автор</option><option value="user">Мои записи</option><option value="coach">Коуч</option><option value="system">ORKEN</option>
        </select>
        <select className={styles.select} aria-label="Минимальная энергия" value={minEnergy} onChange={(event) => setMinEnergy(event.target.value)} disabled={type === "insights"}>
          <option value="">Любая энергия</option>{[1,2,3,4,5,6,7,8,9,10].map((value) => <option key={value} value={value}>От {value}</option>)}
        </select>
      </div>
      <button className={styles.button} onClick={search} disabled={loading}><Search size={16} />{loading ? "Ищем..." : "Найти"}</button>
    </section>

    {error && <p className={styles.error}>{error}</p>}
    <section className={`${styles.panel} ${styles.archiveList}`} style={{ marginTop: 18 }}>
      {result?.insights.map((item) => <article className={styles.archiveRow} key={item.id}><p>{item.text}</p><span>{authorLabel(item.source)} · {item.habitTitle || "Инсайт"} · {formatDate(item.createdAt)}</span></article>)}
      {result?.metrics.map((item) => <article className={styles.archiveRow} key={item.date}><p>Энергия {item.energy}/10 · Ясность {item.clarity}/10 · Устойчивость {item.stability}/10</p><span><CalendarDays size={13} /> {formatDate(item.date)}</span></article>)}
      {!loading && result && result.insights.length + result.metrics.length === 0 && <div className={styles.empty}>По выбранным фильтрам записей нет.</div>}
      {loading && <div className={styles.empty}>Загружаем архив...</div>}
    </section>
  </main>;
}

function authorLabel(source: string) {
  if (source === "user") return "Вы";
  if (source.startsWith("coach")) return "Коуч";
  return "ORKEN";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium" }).format(new Date(value));
}
