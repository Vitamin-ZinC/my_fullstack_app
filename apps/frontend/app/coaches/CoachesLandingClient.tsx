"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Bot,
  Boxes,
  BrainCircuit,
  BriefcaseBusiness,
  Check,
  CircleDollarSign,
  Clock3,
  Globe2,
  Layers3,
  Link2,
  MailCheck,
  ScanFace,
  ShieldCheck,
  Sparkles,
  Store,
  UsersRound
} from "lucide-react";
import type { CoachPartnershipApplicationInput, CoachPartnershipInterest } from "@levelup/contracts";
import { coachPartnershipApi } from "@/lib/api";
import styles from "./coaches.module.css";

const interestOptions: Array<{ id: CoachPartnershipInterest; label: string }> = [
  { id: "wholesale", label: "Подключать ORKEN к своим пакетам" },
  { id: "referral", label: "Получать доход с рекомендаций" },
  { id: "marketplace", label: "Разместить программу в витрине" },
  { id: "white_label", label: "Запустить White Label" },
  { id: "personal", label: "Вести клиентов лично через ORKEN" }
];

const collaborationCards = [
  {
    icon: CircleDollarSign,
    accent: "cyan",
    title: "Экономика для коуча",
    text: "Добавляйте диагностику и трекер в собственные пакеты на партнёрских условиях. Разница между вашим чеком и стоимостью технологии остаётся в экономике практики.",
    points: ["Партнёрская стоимость модулей", "Своя цена клиентского пакета", "Без роста количества сессий"]
  },
  {
    icon: Link2,
    accent: "violet",
    title: "Реферальная программа",
    text: "Получайте доход с оплат пользователей, которые пришли по вашей персональной ссылке. Переходы, регистрации и начисления отражаются в кабинете.",
    points: ["Персональная ссылка", "Прозрачная атрибуция", "Доход с каждого активного клиента"]
  },
  {
    icon: Store,
    accent: "green",
    title: "Витрина коучей",
    text: "Разместите свою программу в ORKEN. Пользователь увидит специализацию, формат работы и доступность сопровождения в понятной карточке.",
    points: ["Профиль и программа", "Модерация качества", "Управление доступными слотами"]
  },
  {
    icon: Layers3,
    accent: "yellow",
    title: "White Label",
    text: "Предложите клиентам технологию под своим брендом: логотип, цвета, домен и коммуникации согласуются под формат практики.",
    points: ["Ваш бренд в интерфейсе", "Свой домен или поддомен", "Единый путь клиента"]
  },
  {
    icon: UsersRound,
    accent: "coral",
    title: "Личное сопровождение",
    text: "Берите клиентов из платформы в персональную работу. Вознаграждение за ваше время и лимит одновременной нагрузки фиксируются до запуска.",
    points: ["Оплата личной работы", "Контролируемая загрузка", "Правила закрепления клиента"]
  }
] as const;

const initialForm = {
  fullName: "",
  email: "",
  telegram: "",
  city: "",
  practiceFormat: "individual" as CoachPartnershipApplicationInput["practiceFormat"],
  experienceYears: "",
  activeClients: "",
  interests: [] as CoachPartnershipInterest[],
  message: "",
  consent: false,
  website: ""
};

function makeIdempotencyKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

export function CoachesLandingClient() {
  const [form, setForm] = useState(initialForm);
  const [idempotencyKey, setIdempotencyKey] = useState(makeIdempotencyKey);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<"sent" | "manual_follow_up" | null>(null);
  const canSubmit = useMemo(() => (
    form.fullName.trim().length >= 2
    && form.email.includes("@")
    && form.interests.length > 0
    && form.consent
    && !submitting
  ), [form, submitting]);

  function toggleInterest(id: CoachPartnershipInterest) {
    setForm((current) => ({
      ...current,
      interests: current.interests.includes(id)
        ? current.interests.filter((item) => item !== id)
        : [...current.interests, id]
    }));
  }

  async function submitApplication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError("");
    try {
      const result = await coachPartnershipApi.apply({
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        telegram: form.telegram.trim() || undefined,
        city: form.city.trim() || undefined,
        practiceFormat: form.practiceFormat,
        experienceYears: form.experienceYears ? Number(form.experienceYears) : undefined,
        activeClients: form.activeClients ? Number(form.activeClients) : undefined,
        interests: form.interests,
        message: form.message.trim() || undefined,
        consent: true,
        idempotencyKey,
        website: form.website
      });
      setSuccess(result.materialDelivery);
      setForm(initialForm);
      setIdempotencyKey(makeIdempotencyKey());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось отправить заявку. Повторите попытку позже.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/coaches" aria-label="ORKEN.LIFE для коучей">
          <span className={styles.brandMark}><BrainCircuit size={20} /></span>
          <span><strong>ORKEN.LIFE</strong><small>Для коучей</small></span>
        </Link>
        <Link className={styles.portalLink} href="/partners">Войти партнёру <ArrowRight size={16} /></Link>
      </header>

      <section className={styles.hero}>
        <img className={styles.heroVisual} src="/assets/ikigai-cones-transparent.png" alt="" aria-hidden="true" />
        <div className={styles.heroInner}>
          <p className={styles.eyebrow}><Sparkles size={17} /> Партнёрская программа ORKEN</p>
          <h1>Технология, которая продолжает вашу работу между сессиями</h1>
          <p className={styles.heroLead}>Добавьте AI-диагностику и трекер состояний в свою практику, показывайте клиенту прогресс и развивайте новые источники дохода.</p>
          <div className={styles.heroActions}>
            <a className={styles.primaryButton} href="#application">Стать партнёром <ArrowRight size={18} /></a>
            <a className={styles.secondaryButton} href="#formats">Условия сотрудничества</a>
          </div>
          <div className={styles.heroProof}>
            <span><BadgeCheck size={18} /> Продукт работает между встречами</span>
            <span><ShieldCheck size={18} /> Условия фиксируются до запуска</span>
          </div>
        </div>
      </section>

      <section className={styles.problemBand}>
        <div className={styles.sectionInner}>
          <div className={styles.sectionHeading}>
            <p className={styles.eyebrow}>Рост практики</p>
            <h2>То, что тормозит масштабирование, не всегда связано с квалификацией</h2>
          </div>
          <div className={styles.problemGrid}>
            <div><Clock3 /><h3>Клиент теряет фокус</h3><p>Между сессиями рекомендации растворяются в повседневности.</p></div>
            <div><BarChart3 /><h3>Прогресс трудно показать</h3><p>Изменения остаются ощущением, а не наблюдаемой динамикой.</p></div>
            <div><BriefcaseBusiness /><h3>Доход упирается во время</h3><p>Каждый новый клиент требует ещё одного свободного часа в календаре.</p></div>
          </div>
        </div>
      </section>

      <section className={styles.productsBand}>
        <div className={styles.sectionInner}>
          <div className={styles.sectionHeading}>
            <p className={styles.eyebrow}>Продуктовый слой</p>
            <h2>Два инструмента поддерживают клиента круглосуточно</h2>
            <p>Вы получаете данные до встречи и сохраняете ритм после неё, не превращая практику в бесконечную переписку.</p>
          </div>
          <div className={styles.productGrid}>
            <article className={styles.productCard}>
              <div className={`${styles.iconBox} ${styles.cyan}`}><ScanFace /></div>
              <div><h3>AI-диагностика Икигай</h3><p>Анализирует голос, лицо и ответы, собирая стартовую карту наблюдений для первой сессии.</p></div>
              <ul><li><Check /> Быстрый вход в контекст</li><li><Check /> Профессиональные направления</li><li><Check /> Точки роста и вопросы коучу</li></ul>
            </article>
            <article className={styles.productCard}>
              <div className={`${styles.iconBox} ${styles.violet}`}><Bot /></div>
              <div><h3>AI-трекер состояний</h3><p>Поддерживает выбранные привычки, фиксирует инсайты и показывает динамику энергии, ясности и устойчивости.</p></div>
              <ul><li><Check /> Микрошаги между сессиями</li><li><Check /> Измеримая динамика</li><li><Check /> Общий контекст с Пингви</li></ul>
            </article>
          </div>
        </div>
      </section>

      <section className={styles.formatsBand} id="formats">
        <div className={styles.sectionInner}>
          <div className={styles.sectionHeading}>
            <p className={styles.eyebrow}>Форматы сотрудничества</p>
            <h2>Выберите модель под текущий масштаб практики</h2>
            <p>Можно начать с одного сценария и подключать остальные по мере роста.</p>
          </div>
          <div className={styles.collaborationGrid}>
            {collaborationCards.map((card) => {
              const Icon = card.icon;
              return <article className={styles.collaborationCard} key={card.title}>
                <div className={`${styles.iconBox} ${styles[card.accent]}`}><Icon /></div>
                <h3>{card.title}</h3>
                <p>{card.text}</p>
                <ul>{card.points.map((point) => <li key={point}><Check /> {point}</li>)}</ul>
              </article>;
            })}
          </div>
        </div>
      </section>

      <section className={styles.whiteLabelBand}>
        <div className={styles.sectionInner}>
          <div className={styles.whiteLabelContent}>
            <div>
              <p className={styles.eyebrow}><Globe2 size={17} /> White Label</p>
              <h2>Ваш бренд остаётся главным для клиента</h2>
              <p>ORKEN работает как технологический слой внутри вашей программы. Клиент проходит единый путь с вашим именем, визуальным стилем и методологией.</p>
            </div>
            <div className={styles.whiteLabelList}>
              <span><Boxes /> Брендированный интерфейс</span>
              <span><Globe2 /> Домен или поддомен</span>
              <span><MailCheck /> Свои коммуникации</span>
              <span><BrainCircuit /> AI-контекст методологии</span>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.stepsBand}>
        <div className={styles.sectionInner}>
          <div className={styles.sectionHeading}>
            <p className={styles.eyebrow}>Подключение</p>
            <h2>От заявки до первого клиента</h2>
          </div>
          <ol className={styles.steps}>
            <li><span>01</span><div><h3>Оставьте заявку</h3><p>Расскажите о формате практики и интересующей модели.</p></div></li>
            <li><span>02</span><div><h3>Получите закрытые условия</h3><p>На e-mail придут экономика, правила витрины и лимиты сопровождения.</p></div></li>
            <li><span>03</span><div><h3>Согласуйте программу</h3><p>Команда проверит профиль и зафиксирует индивидуальные параметры.</p></div></li>
            <li><span>04</span><div><h3>Запустите партнёрский кабинет</h3><p>Ссылки, конверсии, начисления и предложения появятся в одном месте.</p></div></li>
          </ol>
        </div>
      </section>

      <section className={styles.applicationBand} id="application">
        <div className={styles.applicationInner}>
          <div className={styles.applicationCopy}>
            <p className={styles.eyebrow}>Заявка на партнёрство</p>
            <h2>Хочу стать партнёром ORKEN</h2>
            <p>После отправки мы пришлём закрытый материал с точной экономикой, правилами видимости и партнёрским процессом.</p>
            <ul>
              <li><Check /> Никаких публичных обещаний без соглашения</li>
              <li><Check /> Условия под ваш формат и нагрузку</li>
              <li><Check /> Единый аккаунт в партнёрской системе студии</li>
            </ul>
          </div>

          {success ? (
            <div className={styles.successPanel} role="status">
              <MailCheck size={42} />
              <h3>Заявка принята</h3>
              <p>{success === "sent"
                ? "Закрытые условия отправлены на указанный e-mail. Проверьте также папку «Спам»."
                : "Команда получила заявку и отправит закрытые условия вручную после проверки контакта."}</p>
              <button className={styles.secondaryButton} type="button" onClick={() => setSuccess(null)}>Отправить ещё одну заявку</button>
            </div>
          ) : (
            <form className={styles.applicationForm} onSubmit={submitApplication} noValidate>
              <div className={styles.formGrid}>
                <label><span>Имя и фамилия *</span><input value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} autoComplete="name" maxLength={120} required /></label>
                <label><span>E-mail *</span><input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} autoComplete="email" maxLength={320} required /></label>
                <label><span>Telegram</span><input value={form.telegram} onChange={(event) => setForm({ ...form, telegram: event.target.value })} placeholder="@username" maxLength={80} /></label>
                <label><span>Город</span><input value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} autoComplete="address-level2" maxLength={120} /></label>
                <label><span>Формат практики *</span><select value={form.practiceFormat} onChange={(event) => setForm({ ...form, practiceFormat: event.target.value as CoachPartnershipApplicationInput["practiceFormat"] })}><option value="individual">Индивидуальная работа</option><option value="groups">Групповые программы</option><option value="corporate">Корпоративные клиенты</option><option value="education">Обучение и наставничество</option><option value="mixed">Смешанный формат</option></select></label>
                <label><span>Лет практики</span><input type="number" min="0" max="80" value={form.experienceYears} onChange={(event) => setForm({ ...form, experienceYears: event.target.value })} inputMode="numeric" /></label>
                <label className={styles.fullField}><span>Активных клиентов сейчас</span><input type="number" min="0" max="100000" value={form.activeClients} onChange={(event) => setForm({ ...form, activeClients: event.target.value })} inputMode="numeric" /></label>
              </div>
              <fieldset className={styles.interests}>
                <legend>Что вас интересует? *</legend>
                {interestOptions.map((item) => <label key={item.id}><input type="checkbox" checked={form.interests.includes(item.id)} onChange={() => toggleInterest(item.id)} /><span>{item.label}</span></label>)}
              </fieldset>
              <label className={styles.messageField}><span>О практике или задаче</span><textarea value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} rows={4} maxLength={2000} placeholder="Например: веду карьерные группы и хочу добавить диагностику до старта программы" /></label>
              <label className={styles.honeypot} aria-hidden="true"><span>Ваш сайт</span><input value={form.website} onChange={(event) => setForm({ ...form, website: event.target.value })} tabIndex={-1} autoComplete="off" /></label>
              <label className={styles.consent}><input type="checkbox" checked={form.consent} onChange={(event) => setForm({ ...form, consent: event.target.checked })} /><span>Я согласен(на) на обработку данных для рассмотрения заявки согласно <Link href="/privacy" target="_blank">Политике конфиденциальности</Link>.</span></label>
              {error && <p className={styles.formError} role="alert">{error}</p>}
              <button className={styles.submitButton} type="submit" disabled={!canSubmit}>{submitting ? "Отправляем..." : "Получить условия сотрудничества"} <ArrowRight size={18} /></button>
              <p className={styles.formNote}>Точные ставки и коммерческие расчёты отправляются только на подтверждённый в заявке e-mail.</p>
            </form>
          )}
        </div>
      </section>

      <footer className={styles.footer}>
        <div><strong>ORKEN.LIFE</strong><span>AI-платформа развития и профориентации</span></div>
        <nav><a href="mailto:orken.eco@gmail.com">orken.eco@gmail.com</a><Link href="/offer">Оферта</Link><Link href="/privacy">Политика</Link><Link href="/partners">Кабинет партнёра</Link></nav>
      </footer>
    </main>
  );
}
