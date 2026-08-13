"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, Bot, CalendarDays, Check, Clock3, ExternalLink, MapPin, MessageCircle, ShieldCheck, UserRound } from "lucide-react";
import type { CoachCatalogResponse } from "@levelup/contracts";
import { coachCatalogApi } from "@/lib/api";
import styles from "../catalog.module.css";

type PublicCoach = CoachCatalogResponse["coaches"][number] & { rewards?: Array<{ id: string; title: string; description: string; pointsCost: number }>; site?: { slug?: string } | null; siteUrl?: string | null; telegramBotUsername?: string | null };

export default function CoachProfilePage() {
  const { slug } = useParams<{ slug: string }>();
  const [coach, setCoach] = useState<PublicCoach | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [servicesCommerceEnabled, setServicesCommerceEnabled] = useState(false);
  useEffect(() => { coachCatalogApi.get(slug).then((result) => { setCoach(result.coach as PublicCoach); setServicesCommerceEnabled(result.servicesCommerceEnabled); }).catch((reason) => setError(reason instanceof Error ? reason.message : "Коуч не найден")); }, [slug]);

  async function buy(offerId: string) {
    setBusy(offerId); setError("");
    try {
      const result = await coachCatalogApi.checkout(offerId, crypto.randomUUID());
      if (result.url) window.location.assign(result.url);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось открыть оплату"); }
    finally { setBusy(""); }
  }

  if (error && !coach) return <main className={styles.page}><div className={styles.error}>{error}</div><Link href="/coaches">Вернуться в каталог</Link></main>;
  if (!coach) return <main className={styles.page}><div className={styles.state}>Загружаем профиль...</div></main>;
  return (
    <main className={styles.page}>
      <header className={styles.header}><Link className={styles.brand} href="/">ORKEN.LIFE</Link><Link href="/coaches"><ArrowLeft size={17}/> Каталог</Link></header>
      <section className="coach-public-profile">
        <div className="coach-public-photo">{coach.avatarUrl ? <img src={coach.avatarUrl} alt={coach.displayName}/> : <UserRound size={64}/>}</div>
        <div className="coach-public-main">
          <div className={styles.eyebrow}><ShieldCheck size={17}/> Профиль проверен ORKEN</div>
          <h1>{coach.displayName}</h1><p className="coach-public-headline">{coach.headline}</p>
          <div className={styles.meta}>{coach.city && <span><MapPin size={16}/>{coach.city}</span>}<span><MessageCircle size={16}/>{coach.acceptingOrders ? "Принимает новых клиентов" : "Запись временно закрыта"}</span></div>
          <div className={styles.tags}>{coach.specializations.map((item) => <span key={item}>{item}</span>)}</div>
          <p className="coach-public-bio">{coach.bio || "Коуч использует ORKEN для прозрачного сопровождения, обратной связи и наблюдения динамики между сессиями."}</p>
          <div className="coach-public-links">{coach.siteUrl && <a href={coach.siteUrl} target="_blank"><ExternalLink size={17} /> Сайт коуча</a>}{coach.telegramBotUsername && <a href={`https://t.me/${coach.telegramBotUsername}?start=coach_${coach.slug}`} target="_blank"><Bot size={17} /> Открыть в Telegram</a>}</div>
        </div>
      </section>
      <section className="coach-public-services">
        <div><h2>Форматы работы</h2><p>Оплата проходит через ORKEN. Условия и распределение оплаты зафиксированы до покупки.</p></div>
        <div className="coach-public-service-grid">
          {coach.services.map((offer) => <article key={offer.id} className="coach-public-service">
            <div>{offer.type === "CONSULTATION" ? <CalendarDays/> : <MessageCircle/>}<span>{offer.type === "CONSULTATION" ? "Консультация" : "Ведение"}</span></div>
            <h3>{offer.title}</h3><p>{offer.description}</p>
            <ul><li><Check size={15}/> Оплата внутри ORKEN</li>{offer.type === "CONSULTATION" && <li><Clock3 size={15}/> Запись через календарь после оплаты</li>}</ul>
            <strong>{money(offer.amount, offer.currency)}{offer.type === "ONGOING_SUPPORT" && offer.paymentModel === "CLIENT_PAID" ? " / месяц" : ""}</strong>
            <button disabled={!coach.acceptingOrders || !servicesCommerceEnabled || busy === offer.id} onClick={() => buy(offer.id)}>{busy === offer.id ? "Открываем оплату..." : servicesCommerceEnabled ? "Выбрать" : "Скоро доступно"}</button>
          </article>)}
          {coach.services.length === 0 && <div className={styles.state}>Коуч ещё не опубликовал услуги.</div>}
        </div>
      </section>
      {error && <div className={styles.error}>{error}</div>}
      <style jsx>{`
        .coach-public-profile{display:grid;grid-template-columns:320px 1fr;gap:48px;padding:58px 0;border-bottom:1px solid #1c2b3f}.coach-public-photo{aspect-ratio:4/5;background:#0d1b2a;display:grid;place-items:center;border-radius:8px;color:#18d8f1;overflow:hidden}.coach-public-photo img{width:100%;height:100%;object-fit:cover}.coach-public-main h1{font-size:clamp(38px,6vw,68px);margin:16px 0 8px;letter-spacing:0}.coach-public-headline{font-size:22px;color:#c7d4e6}.coach-public-bio{max-width:720px;line-height:1.75;color:#a8b8ce;font-size:17px}.coach-public-links{display:flex;gap:10px;flex-wrap:wrap;margin-top:20px}.coach-public-links a{display:inline-flex;align-items:center;gap:8px;min-height:42px;padding:0 16px;border:1px solid #28506d;border-radius:6px;color:#bfefff;text-decoration:none;font-weight:700}.coach-public-services{padding:42px 0}.coach-public-services>div:first-child p{color:#91a3ba}.coach-public-service-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;margin-top:24px}.coach-public-service{border:1px solid #1f3046;background:#0a1320;border-radius:8px;padding:24px}.coach-public-service>div{display:flex;align-items:center;gap:10px;color:#15d8ee}.coach-public-service h3{font-size:24px;margin:18px 0 8px}.coach-public-service p{color:#98abc2;line-height:1.6}.coach-public-service ul{list-style:none;padding:0;display:grid;gap:8px}.coach-public-service li{display:flex;gap:8px;align-items:center;color:#c5d3e3}.coach-public-service strong{display:block;font-size:24px;margin:22px 0 12px}.coach-public-service button{height:46px;width:100%;border:0;border-radius:6px;background:#0ccce8;color:#001018;font-weight:800}.coach-public-service button:disabled{opacity:.55}@media(max-width:760px){.coach-public-profile{grid-template-columns:1fr;gap:24px}.coach-public-photo{max-height:420px}.coach-public-service-grid{grid-template-columns:1fr}.coach-public-links a{width:100%;justify-content:center}}
      `}</style>
    </main>
  );
}

function money(amount:number,currency:string){return new Intl.NumberFormat("ru-RU",{style:"currency",currency:currency.toUpperCase(),maximumFractionDigits:0}).format(amount/100)}
