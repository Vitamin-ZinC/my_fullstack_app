"use client";
import { uiText, getFormatLocale, useUiLocale } from "@/lib/locale";


import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
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
import { localizeStaticText, DEFAULT_COACH_PUBLIC_CONTENT, type CoachPartnershipApplicationInput, type CoachPartnershipInterest, type PublicCoachPlatformConfig } from "@levelup/contracts";
import { coachCatalogApi, coachPartnershipApi } from "@/lib/api";
import styles from "./coaches.module.css";

function interestOptions(): Array<{ id: CoachPartnershipInterest; label: string }> { return [
  { id: "wholesale", label: uiText("Подключать ORKEN к своим пакетам") },
  { id: "referral", label: uiText("Получать доход с рекомендаций") },
  { id: "marketplace", label: uiText("Разместить программу в витрине") },
  { id: "white_label", label: uiText("Запустить White Label") },
  { id: "personal", label: uiText("Вести клиентов лично через ORKEN") }
]; }

function collaborationCards() { return [
  {
    icon: CircleDollarSign,
    accent: "cyan",
    title: uiText("Экономика для коуча"),
    text: uiText("Добавляйте диагностику и трекер в собственные пакеты на партнёрских условиях. Разница между вашим чеком и стоимостью технологии остаётся в экономике практики."),
    points: [uiText("Партнёрская стоимость модулей"), uiText("Своя цена клиентского пакета"), uiText("Без роста количества сессий")]
  },
  {
    icon: Link2,
    accent: "violet",
    title: uiText("Реферальная программа"),
    text: uiText("Получайте доход с оплат пользователей, которые пришли по вашей персональной ссылке. Переходы, регистрации и начисления отражаются в кабинете."),
    points: [uiText("Персональная ссылка"), uiText("Прозрачная атрибуция"), uiText("Доход с каждого активного клиента")]
  },
  {
    icon: Store,
    accent: "green",
    title: uiText("Витрина коучей"),
    text: uiText("Разместите свою программу в ORKEN. Пользователь увидит специализацию, формат работы и доступность сопровождения в понятной карточке."),
    points: [uiText("Профиль и программа"), uiText("Модерация качества"), uiText("Управление доступными слотами")]
  },
  {
    icon: Layers3,
    accent: "yellow",
    title: "White Label",
    text: uiText("Предложите клиентам технологию под своим брендом: логотип, цвета, домен и коммуникации согласуются под формат практики."),
    points: [uiText("Ваш бренд в интерфейсе"), uiText("Свой домен или поддомен"), uiText("Единый путь клиента")]
  },
  {
    icon: UsersRound,
    accent: "coral",
    title: uiText("Личное сопровождение"),
    text: uiText("Берите клиентов из платформы в персональную работу. Вознаграждение за ваше время и лимит одновременной нагрузки фиксируются до запуска."),
    points: [uiText("Оплата личной работы"), uiText("Контролируемая загрузка"), uiText("Правила закрепления клиента")]
  }
] as const; }

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
  const locale = useUiLocale();
  const [form, setForm] = useState(initialForm);
  const [idempotencyKey, setIdempotencyKey] = useState(makeIdempotencyKey);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<"sent" | "manual_follow_up" | null>(null);
  const [platformConfig, setPlatformConfig] = useState<PublicCoachPlatformConfig | null>(null);
  const publicContent = localizeStaticText(platformConfig?.content ?? DEFAULT_COACH_PUBLIC_CONTENT, locale);
  useEffect(() => { let cancelled = false; coachCatalogApi.config().then(value => { if (!cancelled) setPlatformConfig(value); }).catch(() => { if (!cancelled) setPlatformConfig(null); }); return () => { cancelled = true; }; }, [locale]);
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
      setError(reason instanceof Error ? reason.message : uiText("Не удалось отправить заявку. Повторите попытку позже."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.brand} href="/coaches" aria-label={uiText("ORKEN.LIFE для коучей")}>
          <span className={styles.brandMark}><BrainCircuit size={20} /></span>
          <span><strong>ORKEN.LIFE</strong><small>{uiText("Для коучей")}</small></span>
        </Link>
        <Link className={styles.portalLink} href="/partners">{uiText("Войти партнёру ")}<ArrowRight size={16} /></Link>
      </header>

      <section className={styles.hero}>
        <img className={styles.heroVisual} src="/assets/ikigai-cones-transparent.png" alt="" aria-hidden="true" />
        <div className={styles.heroInner}>
          <p className={styles.eyebrow}><Sparkles size={17} /> {publicContent.heroEyebrow}</p>
          <h1>{publicContent.heroTitle}</h1>
          <p className={styles.heroLead}>{publicContent.heroLead}</p>
          <div className={styles.heroActions}>
            <a className={styles.primaryButton} href="#application">{publicContent.heroPrimaryCta} <ArrowRight size={18} /></a>
            <a className={styles.secondaryButton} href="#formats">{publicContent.heroSecondaryCta}</a>
          </div>
          <div className={styles.heroProof}>
            <span><BadgeCheck size={18} /> {uiText(" Продукт работает между встречами")}</span>
            <span><ShieldCheck size={18} /> {uiText(" Условия фиксируются до запуска")}</span>
          </div>
        </div>
      </section>

      {platformConfig && <section className={styles.pricingBand}>
        <div className={styles.sectionInner}>
          <div className={styles.sectionHeading}><p className={styles.eyebrow}>{publicContent.pricingEyebrow}</p><h2>{publicContent.pricingTitle}</h2><p>{publicContent.pricingLead}</p></div>
          <div className={styles.publicPricingGrid}>{platformConfig.plans.map((plan) => <article key={plan.id} className={styles.publicPriceCard}><span>{plan.includedClients ? uiText("До {v0} клиентов", { v0: plan.includedClients }) : uiText("Более 30 клиентов")}</span><h3>{plan.customQuote ? uiText("Индивидуально") : uiText("{v0} / мес", { v0: formatPrice(plan.amount, plan.currency) })}</h3><p>{plan.description ? uiText(plan.description) : ''}</p><a href="#application">{uiText("Оставить заявку ")}<ArrowRight size={16}/></a></article>)}</div>
          <div className={styles.sitePriceGrid}>{platformConfig.sitePlans.map((plan) => <article key={plan.id}><Globe2/><div><strong>{uiText(plan.name)}</strong><span>{formatPrice(plan.setupAmount, plan.currency)} {uiText(" разово + ")}{formatPrice(plan.monthlySupportAmount, plan.currency)}{uiText("/мес")}</span></div></article>)}</div>
        </div>
      </section>}

      <section className={styles.problemBand}>
        <div className={styles.sectionInner}>
          <div className={styles.sectionHeading}>
            <p className={styles.eyebrow}>{uiText("Рост практики")}</p>
            <h2>{uiText("То, что тормозит масштабирование, не всегда связано с квалификацией")}</h2>
          </div>
          <div className={styles.problemGrid}>
            <div><Clock3 /><h3>{uiText("Клиент теряет фокус")}</h3><p>{uiText("Между сессиями рекомендации растворяются в повседневности.")}</p></div>
            <div><BarChart3 /><h3>{uiText("Прогресс трудно показать")}</h3><p>{uiText("Изменения остаются ощущением, а не наблюдаемой динамикой.")}</p></div>
            <div><BriefcaseBusiness /><h3>{uiText("Доход упирается во время")}</h3><p>{uiText("Каждый новый клиент требует ещё одного свободного часа в календаре.")}</p></div>
          </div>
        </div>
      </section>

      <section className={styles.productsBand}>
        <div className={styles.sectionInner}>
          <div className={styles.sectionHeading}>
            <p className={styles.eyebrow}>{uiText("Продуктовый слой")}</p>
            <h2>{uiText("Два инструмента поддерживают клиента круглосуточно")}</h2>
            <p>{uiText("Вы получаете данные до встречи и сохраняете ритм после неё, не превращая практику в бесконечную переписку.")}</p>
          </div>
          <div className={styles.productGrid}>
            <article className={styles.productCard}>
              <div className={`${styles.iconBox} ${styles.cyan}`}><ScanFace /></div>
              <div><h3>{uiText("AI-диагностика Икигай")}</h3><p>{uiText("Анализирует голос, лицо и ответы, собирая стартовую карту наблюдений для первой сессии.")}</p></div>
              <ul><li><Check /> {uiText(" Быстрый вход в контекст")}</li><li><Check /> {uiText(" Профессиональные направления")}</li><li><Check /> {uiText(" Точки роста и вопросы коучу")}</li></ul>
            </article>
            <article className={styles.productCard}>
              <div className={`${styles.iconBox} ${styles.violet}`}><Bot /></div>
              <div><h3>{uiText("AI-трекер состояний")}</h3><p>{uiText("Поддерживает выбранные привычки, фиксирует инсайты и показывает динамику энергии, ясности и устойчивости.")}</p></div>
              <ul><li><Check /> {uiText(" Микрошаги между сессиями")}</li><li><Check /> {uiText(" Измеримая динамика")}</li><li><Check /> {uiText(" Общий контекст с Пингви")}</li></ul>
            </article>
          </div>
        </div>
      </section>

      <section className={styles.formatsBand} id="formats">
        <div className={styles.sectionInner}>
          <div className={styles.sectionHeading}>
            <p className={styles.eyebrow}>{uiText("Форматы сотрудничества")}</p>
            <h2>{uiText("Выберите модель под текущий масштаб практики")}</h2>
            <p>{uiText("Можно начать с одного сценария и подключать остальные по мере роста.")}</p>
          </div>
          <div className={styles.collaborationGrid}>
            {collaborationCards().map((card) => {
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
              <h2>{uiText("Ваш бренд остаётся главным для клиента")}</h2>
              <p>{uiText("ORKEN работает как технологический слой внутри вашей программы. Клиент проходит единый путь с вашим именем, визуальным стилем и методологией.")}</p>
            </div>
            <div className={styles.whiteLabelList}>
              <span><Boxes /> {uiText(" Брендированный интерфейс")}</span>
              <span><Globe2 /> {uiText(" Домен или поддомен")}</span>
              <span><MailCheck /> {uiText(" Свои коммуникации")}</span>
              <span><BrainCircuit /> {uiText(" AI-контекст методологии")}</span>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.stepsBand}>
        <div className={styles.sectionInner}>
          <div className={styles.sectionHeading}>
            <p className={styles.eyebrow}>{uiText("Подключение")}</p>
            <h2>{uiText("От заявки до первого клиента")}</h2>
          </div>
          <ol className={styles.steps}>
            <li><span>01</span><div><h3>{uiText("Оставьте заявку")}</h3><p>{uiText("Расскажите о формате практики и интересующей модели.")}</p></div></li>
            <li><span>02</span><div><h3>{uiText("Получите закрытые условия")}</h3><p>{uiText("На e-mail придут экономика, правила витрины и лимиты сопровождения.")}</p></div></li>
            <li><span>03</span><div><h3>{uiText("Согласуйте программу")}</h3><p>{uiText("Команда проверит профиль и зафиксирует индивидуальные параметры.")}</p></div></li>
            <li><span>04</span><div><h3>{uiText("Запустите партнёрский кабинет")}</h3><p>{uiText("Ссылки, конверсии, начисления и предложения появятся в одном месте.")}</p></div></li>
          </ol>
        </div>
      </section>

      <section className={styles.applicationBand} id="application">
        <div className={styles.applicationInner}>
          <div className={styles.applicationCopy}>
            <p className={styles.eyebrow}>{publicContent.applicationEyebrow}</p>
            <h2>{publicContent.applicationTitle}</h2>
            <p>{publicContent.applicationLead}</p>
            <ul>
              <li><Check /> {uiText(" Никаких публичных обещаний без соглашения")}</li>
              <li><Check /> {uiText(" Условия под ваш формат и нагрузку")}</li>
              <li><Check /> {uiText(" Единый аккаунт в партнёрской системе студии")}</li>
            </ul>
          </div>

          {success ? (
            <div className={styles.successPanel} role="status">
              <MailCheck size={42} />
              <h3>{uiText("Заявка принята")}</h3>
              <p>{success === "sent"
                ? uiText("Закрытые условия отправлены на указанный e-mail. Проверьте также папку «Спам».")
                : uiText("Команда получила заявку и отправит закрытые условия вручную после проверки контакта.")}</p>
              <button className={styles.secondaryButton} type="button" onClick={() => setSuccess(null)}>{uiText("Отправить ещё одну заявку")}</button>
            </div>
          ) : (
            <form className={styles.applicationForm} onSubmit={submitApplication} noValidate>
              <div className={styles.formGrid}>
                <label><span>{uiText("Имя и фамилия *")}</span><input value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} autoComplete="name" maxLength={120} required /></label>
                <label><span>E-mail *</span><input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} autoComplete="email" maxLength={320} required /></label>
                <label><span>Telegram</span><input value={form.telegram} onChange={(event) => setForm({ ...form, telegram: event.target.value })} placeholder="@username" maxLength={80} /></label>
                <label><span>{uiText("Город")}</span><input value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} autoComplete="address-level2" maxLength={120} /></label>
                <label><span>{uiText("Формат практики *")}</span><select value={form.practiceFormat} onChange={(event) => setForm({ ...form, practiceFormat: event.target.value as CoachPartnershipApplicationInput["practiceFormat"] })}><option value="individual">{uiText("Индивидуальная работа")}</option><option value="groups">{uiText("Групповые программы")}</option><option value="corporate">{uiText("Корпоративные клиенты")}</option><option value="education">{uiText("Обучение и наставничество")}</option><option value="mixed">{uiText("Смешанный формат")}</option></select></label>
                <label><span>{uiText("Лет практики")}</span><input type="number" min="0" max="80" value={form.experienceYears} onChange={(event) => setForm({ ...form, experienceYears: event.target.value })} inputMode="numeric" /></label>
                <label className={styles.fullField}><span>{uiText("Активных клиентов сейчас")}</span><input type="number" min="0" max="100000" value={form.activeClients} onChange={(event) => setForm({ ...form, activeClients: event.target.value })} inputMode="numeric" /></label>
              </div>
              <fieldset className={styles.interests}>
                <legend>{uiText("Что вас интересует? *")}</legend>
                {interestOptions().map((item) => <label key={item.id}><input type="checkbox" checked={form.interests.includes(item.id)} onChange={() => toggleInterest(item.id)} /><span>{item.label}</span></label>)}
              </fieldset>
              <label className={styles.messageField}><span>{uiText("О практике или задаче")}</span><textarea value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} rows={4} maxLength={2000} placeholder={uiText("Например: веду карьерные группы и хочу добавить диагностику до старта программы")} /></label>
              <label className={styles.honeypot} aria-hidden="true"><span>{uiText("Ваш сайт")}</span><input value={form.website} onChange={(event) => setForm({ ...form, website: event.target.value })} tabIndex={-1} autoComplete="off" /></label>
              <label className={styles.consent}><input type="checkbox" checked={form.consent} onChange={(event) => setForm({ ...form, consent: event.target.checked })} /><span>{uiText("Я согласен(на) на обработку данных для рассмотрения заявки согласно ")}<Link href="/privacy" target="_blank">{uiText("Политике конфиденциальности")}</Link>.</span></label>
              {error && <p className={styles.formError} role="alert">{error}</p>}
              <button className={styles.submitButton} type="submit" disabled={!canSubmit}>{submitting ? uiText("Отправляем...") : publicContent.applicationSubmitLabel} <ArrowRight size={18} /></button>
              <p className={styles.formNote}>{uiText("Точные ставки и коммерческие расчёты отправляются только на подтверждённый в заявке e-mail.")}</p>
            </form>
          )}
        </div>
      </section>

      <footer className={styles.footer}>
        <div><strong>ORKEN.LIFE</strong><span>{uiText("AI-платформа развития и профориентации")}</span></div>
        <nav><a href="mailto:orken.eco@gmail.com">orken.eco@gmail.com</a><Link href="/offer">{uiText("Оферта")}</Link><Link href="/privacy">{uiText("Политика")}</Link><Link href="/partners">{uiText("Кабинет партнёра")}</Link></nav>
      </footer>
    </main>
  );
}

function formatPrice(amount: number, currency: string) {
  return new Intl.NumberFormat(getFormatLocale(), { style: "currency", currency: currency.toUpperCase(), maximumFractionDigits: 0 }).format(amount / 100);
}
