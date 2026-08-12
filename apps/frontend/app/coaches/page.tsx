"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, BriefcaseBusiness, Check, MapPin, Search, SlidersHorizontal, UserRound, Users } from "lucide-react";
import type { CoachCatalogResponse } from "@levelup/contracts";
import { coachCatalogApi } from "@/lib/api";
import styles from "./catalog.module.css";

export default function CoachesPage() {
  const [data, setData] = useState<CoachCatalogResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [city, setCity] = useState("");
  const [specialization, setSpecialization] = useState("");

  useEffect(() => {
    coachCatalogApi.list({ accepting: true }).then(setData).catch((reason) => setError(reason instanceof Error ? reason.message : "Не удалось загрузить каталог")).finally(() => setLoading(false));
  }, []);

  const coaches = useMemo(() => (data?.coaches ?? []).filter((coach) => {
    const haystack = `${coach.displayName} ${coach.headline ?? ""} ${coach.bio ?? ""} ${coach.specializations.join(" ")}`.toLowerCase();
    return (!query || haystack.includes(query.toLowerCase())) && (!city || coach.city === city) && (!specialization || coach.specializations.includes(specialization));
  }), [data, query, city, specialization]);

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/">ORKEN.LIFE</Link>
        <nav><Link href="/habits">Кабинет</Link><Link href="/for-coaches">Для коучей</Link></nav>
      </header>
      <section className={styles.intro}>
        <div className={styles.eyebrow}><Users size={16} /> Каталог специалистов</div>
        <h1>Выберите коуча для личного сопровождения</h1>
        <p>Сравните специализацию, формат работы и стоимость. Навигатор привычек можно использовать и без коуча.</p>
      </section>
      <section className={styles.filters} aria-label="Фильтры каталога">
        <label className={styles.search}><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Имя, тема или специализация" /></label>
        <label><MapPin size={18} /><select value={city} onChange={(event) => setCity(event.target.value)}><option value="">Все города</option>{data?.filters.cities.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label><SlidersHorizontal size={18} /><select value={specialization} onChange={(event) => setSpecialization(event.target.value)}><option value="">Все специализации</option>{data?.filters.specializations.map((item) => <option key={item}>{item}</option>)}</select></label>
      </section>
      {loading && <div className={styles.state}>Загружаем проверенных коучей...</div>}
      {error && <div className={styles.error}>{error}</div>}
      {!loading && !error && coaches.length === 0 && <div className={styles.state}>По выбранным фильтрам пока нет доступных коучей.</div>}
      <section className={styles.grid}>
        {coaches.map((coach) => (
          <article className={styles.card} key={coach.id}>
            <div className={styles.avatar}>{coach.avatarUrl ? <img src={coach.avatarUrl} alt="" /> : <UserRound size={30} />}</div>
            <div className={styles.cardMain}>
              <div className={styles.cardTitle}><div><h2>{coach.displayName}</h2><p>{coach.headline || "Коуч ORKEN.LIFE"}</p></div>{coach.featured && <span><Check size={14} /> Рекомендуем</span>}</div>
              <div className={styles.meta}>{coach.city && <span><MapPin size={15} />{coach.city}</span>}<span><BriefcaseBusiness size={15} />{coach.services.length} {serviceWord(coach.services.length)}</span></div>
              <div className={styles.tags}>{coach.specializations.slice(0, 4).map((item) => <span key={item}>{item}</span>)}</div>
              {coach.services[0] && <p className={styles.price}>от {money(coach.services[0].amount, coach.services[0].currency)}</p>}
              <Link className={styles.primary} href={`/coaches/${encodeURIComponent(coach.slug)}`}>Посмотреть профиль <ArrowRight size={18} /></Link>
            </div>
          </article>
        ))}
      </section>
      <section className={styles.withoutCoach}><div><h2>Продолжить самостоятельно</h2><p>Ежедневные отметки, привычки и AI-навигатор доступны без выбора специалиста.</p></div><Link href="/habits">Открыть Навигатор <ArrowRight size={18} /></Link></section>
    </main>
  );
}

function money(amount: number, currency: string) {
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency: currency.toUpperCase(), maximumFractionDigits: 0 }).format(amount / 100);
}

function serviceWord(count: number) {
  return count === 1 ? "услуга" : count > 1 && count < 5 ? "услуги" : "услуг";
}
