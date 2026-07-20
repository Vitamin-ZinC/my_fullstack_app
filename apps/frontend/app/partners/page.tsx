"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  CircleCheckBig,
  ClipboardList,
  Copy,
  HandCoins,
  Info,
  Link2,
  LogIn,
  LogOut,
  Pencil,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  UserRound,
  WalletCards,
  X
} from "lucide-react";
import type {
  PartnerPortalDashboard,
  PartnerPortalIdentity,
  PartnerPortalLedgerResponse,
  PartnerPortalPayoutsResponse,
  PartnerPortalSessionResponse
} from "@levelup/contracts";
import { partnerPortalApi } from "@/lib/api";

type Tab = "overview" | "links" | "offers" | "results" | "finances" | "profile";
type DataRecord = Record<string, unknown>;
type OfferKind = "paid_service" | "qualified_lead" | "portfolio_credit" | "reward_trial" | "manual_deal";
type OfferSurface = "rewards_tab" | "milestone_modal" | "home_module" | "admin_recommendation";
type OfferForm = { offer: string; kind: OfferKind; surface: OfferSurface; price: string; cap: string; partnerPayoutCents: string };

const defaultOfferForm: OfferForm = {
  offer: "",
  kind: "qualified_lead",
  surface: "rewards_tab",
  price: "120",
  cap: "25 в месяц",
  partnerPayoutCents: "0"
};

const tabs: Array<{ id: Tab; label: string; icon: typeof BarChart3 }> = [
  { id: "overview", label: "Главная", icon: BarChart3 },
  { id: "links", label: "Мои ссылки", icon: Link2 },
  { id: "offers", label: "Предложения", icon: HandCoins },
  { id: "results", label: "Результаты", icon: ClipboardList },
  { id: "finances", label: "Финансы", icon: WalletCards },
  { id: "profile", label: "Профиль", icon: UserRound }
];

const tabDescriptions: Record<Tab, string> = {
  overview: "Что сделать сейчас и как работает ваша партнёрская программа.",
  links: "Создавайте отдельную ссылку для каждого канала и делитесь ею.",
  offers: "Предлагайте пользователям Orken свои услуги и бонусы.",
  results: "Регистрации и оплаты, пришедшие по вашим ссылкам.",
  finances: "Начисленные комиссии и статусы выплат.",
  profile: "Данные аккаунта и статус доступа к программе."
};

function makeIdempotencyKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function asRecord(value: unknown): DataRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as DataRecord : {};
}

function asRows(value: unknown) {
  if (Array.isArray(value)) return value.map(asRecord);
  const record = asRecord(value);
  for (const key of ["items", "entries", "rows", "data", "payouts", "ledger"]) {
    if (Array.isArray(record[key])) return record[key].map(asRecord);
  }
  return [] as DataRecord[];
}

function readValue(record: DataRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return null;
}

function textValue(value: unknown) {
  if (typeof value === "number") return new Intl.NumberFormat("ru-RU").format(value);
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "Да" : "Нет";
  return "—";
}

function rowTitle(row: DataRecord) {
  return textValue(readValue(row, ["title", "offer", "name", "label", "channel", "id"]));
}

function referralSourceTitle(row: DataRecord) {
  const value = rowTitle(row);
  if (!/^https?:\/\//i.test(value)) return value;
  try {
    return new URL(value).hostname.replace(/^www\./i, "");
  } catch {
    return value;
  }
}

function numericText(value: unknown) {
  const match = String(value ?? "").replace(/\s+/g, "").match(/\d+/);
  return match?.[0] ?? "";
}

function xpPriceLabel(value: unknown) {
  const amount = numericText(value);
  return amount ? `${amount} XP` : textValue(value);
}

function looksLikeUrl(value: string) {
  return /^(?:https?:\/\/|www\.)/i.test(value) || /^[a-z0-9.-]+\.[a-z]{2,}(?:\/|$)/i.test(value);
}

function rowStatus(row: DataRecord) {
  const reviewStatus = textValue(readValue(row, ["reviewStatus", "review_status"])).toUpperCase();
  if (reviewStatus === "CHANGES_REQUESTED") return "REJECTED";
  return textValue(readValue(row, ["status", "state"]));
}

function offerKind(value: unknown): OfferKind {
  return ["paid_service", "qualified_lead", "portfolio_credit", "reward_trial", "manual_deal"].includes(String(value))
    ? value as OfferKind
    : "qualified_lead";
}

function offerSurface(value: unknown): OfferSurface {
  return ["rewards_tab", "milestone_modal", "home_module", "admin_recommendation"].includes(String(value))
    ? value as OfferSurface
    : "rewards_tab";
}

function rowId(row: DataRecord) {
  const value = readValue(row, ["id", "offerId", "placementId", "placement_id"]);
  return typeof value === "string" ? value : null;
}

function statusCopy(status: string) {
  const normalized = status.toUpperCase();
  if (normalized === "APPROVED" || normalized === "PUBLISHED") return { label: "Одобрено", tone: "approved" };
  if (normalized === "ACTIVE") return { label: "Активна", tone: "approved" };
  if (normalized === "PAID") return { label: "Выплачено", tone: "approved" };
  if (normalized === "AVAILABLE") return { label: "Доступно", tone: "approved" };
  if (normalized === "NEW") return { label: "Новый", tone: "pending" };
  if (normalized === "PENDING" || normalized === "PROCESSING") return { label: "Ожидает", tone: "pending" };
  if (normalized === "REJECTED") return { label: "Нужны изменения", tone: "rejected" };
  if (normalized === "SUSPENDED") return { label: "Доступ приостановлен", tone: "suspended" };
  if (normalized === "DRAFT") return { label: "Черновик", tone: "draft" };
  return { label: "На проверке", tone: "pending" };
}

function metricsFromDashboard(dashboard: PartnerPortalDashboard | null) {
  const metrics = dashboard?.metrics ?? {};
  return [
    { label: "Переходы по ссылкам", value: readValue(metrics, ["clicks", "linkClicks", "link_clicks"]) },
    { label: "Новые пользователи", value: readValue(metrics, ["signups", "registrations", "leads"]) },
    { label: "Оплаты", value: readValue(metrics, ["paidConversions", "paid_conversions", "payments", "conversions"]) },
    { label: "Начислено", value: readValue(metrics, ["earned", "accrued", "ledgerBalance", "ledger_balance"]) },
    { label: "Выплаты в ожидании", value: readValue(metrics, ["pendingPayouts", "pending_payouts", "payoutsPending", "payouts_pending"]) },
    { label: "Выплачено", value: readValue(metrics, ["paidPayouts", "paid_payouts", "payoutsPaid", "payouts_paid"]) }
  ];
}

export default function PartnersPage() {
  const [portalSession, setPortalSession] = useState<PartnerPortalSessionResponse | null>(null);
  const [dashboard, setDashboard] = useState<PartnerPortalDashboard | null>(null);
  const [ledger, setLedger] = useState<PartnerPortalLedgerResponse | null>(null);
  const [payouts, setPayouts] = useState<PartnerPortalPayoutsResponse | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [registerKey, setRegisterKey] = useState(makeIdempotencyKey);
  const [authForm, setAuthForm] = useState({ email: "", password: "", displayName: "", accountName: "", accountType: "organization" as "organization" | "individual" });
  const [linkName, setLinkName] = useState("");
  const [offerForm, setOfferForm] = useState<OfferForm>(defaultOfferForm);
  const [editingOfferId, setEditingOfferId] = useState<string | null>(null);

  const loadPortal = useCallback(async (options?: { initial?: boolean }) => {
    setLoading(true);
    setError("");
    try {
      const [me, nextDashboard, nextLedger, nextPayouts] = await Promise.all([
        partnerPortalApi.me(),
        partnerPortalApi.dashboard(),
        partnerPortalApi.ledger(),
        partnerPortalApi.payouts()
      ]);
      setPortalSession(me);
      setDashboard(nextDashboard);
      setLedger(nextLedger.ledger);
      setPayouts(nextPayouts.payouts);
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "Не удалось загрузить кабинет";
      if (/login required|session expired|401/i.test(message)) {
        setPortalSession(null);
        setDashboard(null);
      } else if (!options?.initial) {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPortal({ initial: true });
  }, [loadPortal]);

  const identity = portalSession?.partner ?? dashboard?.partner ?? null;
  const status = statusCopy(identity?.status ?? "PENDING_REVIEW");
  const metrics = useMemo(() => metricsFromDashboard(dashboard), [dashboard]);

  async function submitAuth(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const response = authMode === "register"
        ? await partnerPortalApi.register({ ...authForm, idempotencyKey: registerKey })
        : await partnerPortalApi.login({ email: authForm.email, password: authForm.password });
      setPortalSession(response);
      setRegisterKey(makeIdempotencyKey());
      await loadPortal();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Не удалось продолжить");
    } finally {
      setSubmitting(false);
    }
  }

  async function logout() {
    setSubmitting(true);
    try {
      await partnerPortalApi.logout();
      setPortalSession(null);
      setDashboard(null);
      setLedger(null);
      setPayouts(null);
      setNotice("");
      setTab("overview");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Не удалось завершить сессию");
    } finally {
      setSubmitting(false);
    }
  }

  async function createLink(event: React.FormEvent) {
    event.preventDefault();
    if (!linkName.trim()) return;
    if (looksLikeUrl(linkName.trim())) {
      setError("Введите короткое название источника, например «Instagram». Адрес страницы вставлять не нужно.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const result = await partnerPortalApi.createReferralLink({ channel: linkName.trim(), idempotencyKey: makeIdempotencyKey() });
      const link = asRecord(result.link);
      const url = readValue(link, ["url", "href", "referralUrl", "referral_url"]);
      setNotice(typeof url === "string" ? "Ссылка создана." : "Ссылка создана и появится после обновления данных.");
      setLinkName("");
      await loadPortal();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Не удалось создать ссылку");
    } finally {
      setSubmitting(false);
    }
  }

  async function saveOffer(event: React.FormEvent) {
    event.preventDefault();
    const xpPrice = Number(offerForm.price);
    if (!Number.isInteger(xpPrice) || xpPrice < 1) {
      setError("Укажите стоимость предложения целым числом XP.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const payload = {
        offer: offerForm.offer,
        kind: offerForm.kind,
        surface: offerForm.surface,
        price: `${xpPrice} Orken Points`,
        cap: offerForm.cap,
        partnerPayoutCents: Number(offerForm.partnerPayoutCents) || 0,
        idempotencyKey: makeIdempotencyKey()
      };
      if (editingOfferId) {
        await partnerPortalApi.updateOffer(editingOfferId, payload);
        setNotice("Изменения предложения сохранены.");
      } else {
        await partnerPortalApi.createOffer(payload);
        setNotice("Предложение сохранено как черновик.");
      }
      setOfferForm(defaultOfferForm);
      setEditingOfferId(null);
      await loadPortal();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Не удалось сохранить предложение");
    } finally {
      setSubmitting(false);
    }
  }

  function editOffer(offer: DataRecord) {
    const id = rowId(offer);
    if (!id) return;
    setEditingOfferId(id);
    setOfferForm({
      offer: String(readValue(offer, ["offer", "title"]) ?? ""),
      kind: offerKind(readValue(offer, ["kind"])),
      surface: offerSurface(readValue(offer, ["surface"])),
      price: numericText(readValue(offer, ["price", "price_label"])),
      cap: String(readValue(offer, ["cap", "cap_label"]) ?? ""),
      partnerPayoutCents: String(readValue(offer, ["partnerPayoutCents", "partner_payout_cents"]) ?? "0")
    });
    setError("");
    setNotice("");
  }

  function cancelOfferEdit() {
    setEditingOfferId(null);
    setOfferForm(defaultOfferForm);
  }

  async function submitOfferReview(offerId: string) {
    setSubmitting(true);
    setError("");
    try {
      await partnerPortalApi.submitOfferReview(offerId, makeIdempotencyKey());
      setNotice("Предложение отправлено на модерацию.");
      await loadPortal();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Не удалось отправить предложение");
    } finally {
      setSubmitting(false);
    }
  }

  async function copyLink(value: unknown) {
    if (typeof value !== "string" || !value) return;
    try {
      await navigator.clipboard.writeText(value);
      setNotice("Ссылка скопирована.");
    } catch {
      setError("Не удалось скопировать ссылку");
    }
  }

  if (!loading && !portalSession) {
    return (
      <main className="partner-auth-page">
        <section className="partner-auth-shell" aria-labelledby="partner-auth-title">
          <a className="partner-brand" href="/">ORKEN.LIFE</a>
          <div className="partner-auth-copy">
            <span className="partner-eyebrow">Партнёрская программа</span>
            <h1 id="partner-auth-title">Кабинет партнёра</h1>
            <p>Ссылки, новые пользователи, оплаты и вознаграждения по программе Orken.</p>
          </div>
          <div className="partner-auth-tabs" role="tablist" aria-label="Доступ к кабинету">
            <button className={authMode === "login" ? "active" : ""} onClick={() => setAuthMode("login")} type="button">Войти</button>
            <button className={authMode === "register" ? "active" : ""} onClick={() => setAuthMode("register")} type="button">Стать партнёром</button>
          </div>
          <form className="partner-auth-form" onSubmit={submitAuth}>
            {authMode === "register" && <>
              <label>Ваше имя<input value={authForm.displayName} onChange={(event) => setAuthForm({ ...authForm, displayName: event.target.value })} required autoComplete="name" /></label>
              <label>Название аккаунта<input value={authForm.accountName} onChange={(event) => setAuthForm({ ...authForm, accountName: event.target.value })} required autoComplete="organization" /></label>
              <label>Тип аккаунта<select value={authForm.accountType} onChange={(event) => setAuthForm({ ...authForm, accountType: event.target.value as "organization" | "individual" })}><option value="organization">Компания</option><option value="individual">Частный партнёр</option></select></label>
            </>}
            <label>Email<input value={authForm.email} onChange={(event) => setAuthForm({ ...authForm, email: event.target.value })} type="email" required autoComplete="email" /></label>
            <label>Пароль<input value={authForm.password} onChange={(event) => setAuthForm({ ...authForm, password: event.target.value })} type="password" required minLength={authMode === "register" ? 12 : undefined} autoComplete={authMode === "register" ? "new-password" : "current-password"} /></label>
            {error && <p className="partner-form-error" role="alert">{error}</p>}
            <button className="partner-primary-button" disabled={submitting} type="submit"><LogIn size={17} />{submitting ? "Проверяем..." : authMode === "register" ? "Создать кабинет" : "Войти в кабинет"}</button>
          </form>
          <p className="partner-auth-note"><ShieldCheck size={15} /> Учётная запись хранится в общей партнёрской системе студии.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="partner-portal">
      <aside className="partner-sidebar">
        <a className="partner-brand" href="/">ORKEN.LIFE</a>
        <div className="partner-user-summary">
          <div className="partner-avatar">{(identity?.displayName ?? identity?.accountName ?? "P").slice(0, 1).toUpperCase()}</div>
          <div><strong>{identity?.accountName ?? identity?.displayName ?? "Партнёр"}</strong><span className={`partner-status ${status.tone}`}>{status.label}</span></div>
        </div>
        <nav className="partner-nav" aria-label="Разделы кабинета">
          {tabs.map((item) => {
            const Icon = item.icon;
            return <button className={tab === item.id ? "active" : ""} key={item.id} onClick={() => setTab(item.id)} type="button"><Icon size={17} />{item.label}</button>;
          })}
        </nav>
        <button className="partner-logout" onClick={logout} disabled={submitting} type="button"><LogOut size={16} />Выйти</button>
      </aside>

      <section className="partner-main">
        <header className="partner-header">
          <div>
            <span className="partner-eyebrow">Orken · партнёрская программа</span>
            <h1>{tabs.find((item) => item.id === tab)?.label}</h1>
            <p className="partner-header-copy">{tabDescriptions[tab]}</p>
          </div>
          <button className="partner-icon-button" onClick={() => void loadPortal()} disabled={loading || submitting} type="button" title="Обновить данные"><RefreshCw size={18} /></button>
        </header>

        {error && <p className="partner-inline-error" role="alert">{error}</p>}
        {notice && <p className="partner-notice"><CheckCircle2 size={17} />{notice}</p>}
        {identity && status.tone !== "approved" && <section className={`partner-review-banner ${status.tone}`}><ShieldCheck size={20} /><div><strong>{status.label}</strong><span>{status.tone === "rejected" ? "Проверьте комментарии модератора и обновите предложение перед повторной отправкой." : "Доступ к данным сохранён. Публикация ссылок и предложений станет доступна после одобрения."}</span></div></section>}

        {tab === "overview" && <Overview metrics={metrics} dashboard={dashboard} onNavigate={setTab} />}
        {tab === "links" && <LinksSection links={dashboard?.referralLinks ?? []} linkName={linkName} setLinkName={setLinkName} submitting={submitting} onCreate={createLink} onCopy={copyLink} />}
        {tab === "offers" && <OffersSection offers={dashboard?.offers ?? []} form={offerForm} setForm={setOfferForm} editingOfferId={editingOfferId} submitting={submitting} onSave={saveOffer} onEdit={editOffer} onCancelEdit={cancelOfferEdit} onReview={submitOfferReview} />}
        {tab === "results" && <ActivitySection dashboard={dashboard} />}
        {tab === "finances" && <FinancesSection ledger={asRows(ledger)} payouts={asRows(payouts)} dashboard={dashboard} />}
        {tab === "profile" && <ProfileSection identity={identity} expiresAt={portalSession?.expiresAt} />}
      </section>
    </main>
  );
}

function Overview({ metrics, dashboard, onNavigate }: {
  metrics: Array<{ label: string; value: unknown }>;
  dashboard: PartnerPortalDashboard | null;
  onNavigate: (tab: Tab) => void;
}) {
  const links = dashboard?.referralLinks.length ?? 0;
  const offers = dashboard?.offers.length ?? 0;
  const primaryMetrics = metrics.slice(0, 4);
  const registrations = Number(metrics[1]?.value) || 0;
  const paidConversions = Number(metrics[2]?.value) || 0;
  const steps = [
    { done: links > 0, title: "Создайте партнёрскую ссылку", copy: "Отдельная ссылка поможет понять, откуда приходят пользователи.", action: "Создать ссылку", tab: "links" as Tab },
    { done: registrations > 0, title: "Поделитесь ссылкой", copy: "Разместите её в Telegram, соцсетях, рассылке или на своём сайте.", action: "Открыть ссылки", tab: "links" as Tab },
    { done: paidConversions > 0, title: "Следите за результатом", copy: "Регистрации и оплаты автоматически появятся в кабинете.", action: "Смотреть результаты", tab: "results" as Tab }
  ];

  return <div className="partner-section-stack">
    <section className="partner-panel partner-start-panel">
      <div className="partner-start-copy">
        <span className="partner-eyebrow">Начните отсюда</span>
        <h2>Привлекайте пользователей Orken и получайте вознаграждение</h2>
        <p>Создайте ссылку, поделитесь ею и отслеживайте регистрации, оплаты и начисления в одном месте.</p>
        <div className="partner-start-actions">
          <button className="partner-primary-button" onClick={() => onNavigate("links")} type="button"><Link2 size={17} />Создать ссылку</button>
          <button className="partner-secondary-button" onClick={() => onNavigate("results")} type="button">Посмотреть результаты<ArrowRight size={16} /></button>
        </div>
      </div>
      <div className="partner-start-facts" aria-label="Состояние программы">
        <strong>{links}</strong><span>активных ссылок</span>
        <strong>{offers}</strong><span>предложений</span>
      </div>
    </section>

    <section className="partner-metric-grid partner-metric-grid-primary">
      {primaryMetrics.map((metric) => <article className="partner-metric" key={metric.label}><span>{metric.label}</span><strong>{textValue(metric.value)}</strong></article>)}
    </section>

    <section className="partner-panel">
      <div className="partner-panel-head"><div><h2>Как начать</h2><p>Три шага от ссылки до первого вознаграждения.</p></div></div>
      <div className="partner-journey-list">
        {steps.map((step, index) => <div className={`partner-journey-step ${step.done ? "done" : ""}`} key={step.title}>
          <span className="partner-step-marker">{step.done ? <CircleCheckBig size={18} /> : index + 1}</span>
          <div><strong>{step.title}</strong><p>{step.copy}</p></div>
          <button className="partner-text-button" onClick={() => onNavigate(step.tab)} type="button">{step.action}<ArrowRight size={15} /></button>
        </div>)}
      </div>
    </section>

    <section className="partner-panel partner-finance-preview">
      <div><span className="partner-eyebrow">Вознаграждение</span><h2>{textValue(metrics[3]?.value)}</h2><p>Всего начислено по программе Orken.</p></div>
      <div className="partner-finance-preview-values">
        <span>Ожидает выплаты<strong>{textValue(metrics[4]?.value)}</strong></span>
        <span>Уже выплачено<strong>{textValue(metrics[5]?.value)}</strong></span>
        <button className="partner-secondary-button" onClick={() => onNavigate("finances")} type="button">Подробнее<ArrowRight size={15} /></button>
      </div>
    </section>
  </div>;
}

function LinksSection({ links, linkName, setLinkName, submitting, onCreate, onCopy }: { links: DataRecord[]; linkName: string; setLinkName: (value: string) => void; submitting: boolean; onCreate: (event: React.FormEvent) => Promise<void>; onCopy: (value: unknown) => Promise<void> }) {
  return <div className="partner-section-stack">
    <section className="partner-panel partner-link-create-panel">
      <div className="partner-panel-head">
        <div><h2>Создать новую ссылку</h2><p>Назовите источник, где будете размещать ссылку. Это название увидите только вы.</p></div>
      </div>
      <form className="partner-inline-form" onSubmit={onCreate}>
        <label className="partner-field-label">
          Название источника
          <input value={linkName} onChange={(event) => setLinkName(event.target.value)} placeholder="Например: Telegram, Instagram или сайт" maxLength={60} required />
        </label>
        <button className="partner-primary-button" disabled={submitting} type="submit"><Plus size={17} />Создать ссылку</button>
      </form>
      <p className="partner-field-help">Введите только короткое название. Не вставляйте сюда адрес профиля или сайта: готовую ссылку Orken создаст автоматически.</p>
    </section>

    <section className="partner-panel">
      <div className="partner-panel-head"><div><h2>Готовые ссылки</h2><p>Используйте отдельную ссылку для каждого канала, чтобы сравнивать результат.</p></div></div>
      <div className="partner-row-list">{links.length === 0 ? <EmptyState text="Пока нет ссылок. Создайте первую ссылку выше." /> : links.map((link, index) => {
        const url = readValue(link, ["url", "href", "referralUrl", "referral_url"]);
        const status = statusCopy(rowStatus(link));
        return <article className="partner-row" key={rowId(link) ?? index}>
          <div><strong>{referralSourceTitle(link)}</strong><span>{typeof url === "string" ? url : "Ссылка готовится"}</span></div>
          <div className="partner-row-actions">
            <span className={`partner-status ${status.tone}`}>{status.label}</span>
            {typeof url === "string" && <button className="partner-secondary-button" onClick={() => void onCopy(url)} type="button"><Copy size={16} />Скопировать</button>}
          </div>
        </article>;
      })}</div>
    </section>
  </div>;
}

function OffersSection({ offers, form, setForm, editingOfferId, submitting, onSave, onEdit, onCancelEdit, onReview }: {
  offers: DataRecord[];
  form: OfferForm;
  setForm: React.Dispatch<React.SetStateAction<OfferForm>>;
  editingOfferId: string | null;
  submitting: boolean;
  onSave: (event: React.FormEvent) => Promise<void>;
  onEdit: (offer: DataRecord) => void;
  onCancelEdit: () => void;
  onReview: (offerId: string) => Promise<void>;
}) {
  return <div className="partner-section-stack">
    <section className="partner-panel">
      <div className="partner-panel-head">
        <div><h2>Ваши предложения</h2><p>После создания отправьте предложение на проверку. Одобренные предложения увидят пользователи Orken.</p></div>
      </div>
      <div className="partner-context-note"><Info size={17} /><span>Предложения активируются за накопленные XP. Комиссия за приведённые оплаты Orken рассчитывается отдельно по условиям партнёрской программы.</span></div>
      <div className="partner-row-list">{offers.length === 0 ? <EmptyState text="Предложений пока нет. Создайте первое ниже." /> : offers.map((offer, index) => {
        const id = rowId(offer);
        const status = statusCopy(rowStatus(offer));
        const editable = status.tone === "draft" || status.tone === "rejected";
        return <article className="partner-row" key={id ?? index}>
          <div><strong>{rowTitle(offer)}</strong><span>{xpPriceLabel(readValue(offer, ["price", "price_label"]))}</span></div>
          <div className="partner-row-actions">
            <span className={`partner-status ${status.tone}`}>{status.label}</span>
            {id && editable && <button className="partner-icon-button" disabled={submitting} onClick={() => onEdit(offer)} type="button" title="Редактировать предложение"><Pencil size={16} /></button>}
            {id && editable && <button className="partner-secondary-button" disabled={submitting} onClick={() => void onReview(id)} type="button"><Send size={15} />На модерацию</button>}
          </div>
        </article>;
      })}</div>
    </section>

    <details className="partner-panel partner-offer-builder" open={editingOfferId ? true : undefined}>
      <summary>
        <span><Plus size={17} />{editingOfferId ? "Редактировать предложение" : "Создать предложение"}</span>
        <small>{editingOfferId ? "Сохраните изменения и повторно отправьте на проверку" : "Услуга, бонус или специальное условие для пользователей Orken"}</small>
      </summary>
      <div className="partner-offer-builder-body">
        <div className="partner-panel-head">
          <div><h2>{editingOfferId ? "Редактирование предложения" : "Новое предложение"}</h2><p>Сначала оно сохранится как черновик. Вы сможете проверить данные перед отправкой на модерацию.</p></div>
          {editingOfferId && <button className="partner-icon-button" onClick={onCancelEdit} type="button" title="Отменить редактирование"><X size={17} /></button>}
        </div>
        <form className="partner-offer-form" onSubmit={onSave}>
          <label>Что вы предлагаете<input value={form.offer} onChange={(event) => setForm({ ...form, offer: event.target.value })} placeholder="Например: личная установочная сессия" required /></label>
          <label>Категория<select value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value as OfferKind })}><option value="qualified_lead">Заявка на консультацию</option><option value="paid_service">Платная услуга</option><option value="portfolio_credit">Бонус или сертификат</option><option value="reward_trial">Пробный доступ</option><option value="manual_deal">Другое предложение</option></select></label>
          <label>Стоимость для пользователя, XP<input value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} type="number" min="1" step="1" placeholder="Например: 120" required /><small>Пользователь сможет активировать услугу, когда накопит эту сумму. XP спишутся после подтверждения.</small></label>
          <label>Сколько раз доступно<input value={form.cap} onChange={(event) => setForm({ ...form, cap: event.target.value })} placeholder="Например: 25 в месяц" required /><small>Лимит помогает не получить больше заявок, чем вы сможете обработать.</small></label>
          <details className="partner-advanced-options">
            <summary>Дополнительная настройка размещения</summary>
            <label>Где показать предложение<select value={form.surface} onChange={(event) => setForm({ ...form, surface: event.target.value as OfferSurface })}><option value="rewards_tab">В разделе наград</option><option value="milestone_modal">После достижения</option><option value="home_module">На главном экране</option><option value="admin_recommendation">По рекомендации команды Orken</option></select></label>
          </details>
          <button className="partner-primary-button" disabled={submitting} type="submit">{editingOfferId ? <Pencil size={17} /> : <Plus size={17} />}{editingOfferId ? "Сохранить изменения" : "Сохранить предложение"}</button>
        </form>
      </div>
    </details>
  </div>;
}

function ActivitySection({ dashboard }: { dashboard: PartnerPortalDashboard | null }) {
  const clicks = readValue(dashboard?.metrics ?? {}, ["clicks", "linkClicks", "link_clicks"]);
  const registrations = readValue(dashboard?.metrics ?? {}, ["signups", "registrations", "leads"]);
  const payments = readValue(dashboard?.metrics ?? {}, ["paidConversions", "paid_conversions", "payments", "conversions"]);
  return <div className="partner-section-stack">
    <section className="partner-panel">
      <div className="partner-panel-head"><div><h2>Путь пользователя</h2><p>Здесь видно, сколько людей перешло по ссылке, зарегистрировалось и оплатило продукт Orken.</p></div></div>
      <div className="partner-funnel" aria-label="Воронка партнёрской программы">
        <span><small>1. Перешли по ссылке</small><strong>{textValue(clicks)}</strong></span>
        <ArrowRight size={18} />
        <span><small>2. Зарегистрировались</small><strong>{textValue(registrations)}</strong></span>
        <ArrowRight size={18} />
        <span><small>3. Оплатили</small><strong>{textValue(payments)}</strong></span>
      </div>
    </section>
    <DataSection title="Новые пользователи" subtitle="Регистрации, пришедшие по вашим партнёрским ссылкам." rows={dashboard?.leads ?? []} />
    <DataSection title="Оплаты" subtitle="Подтверждённые оплаты и другие целевые действия." rows={dashboard?.conversions ?? []} />
  </div>;
}

function FinancesSection({ ledger, payouts, dashboard }: { ledger: DataRecord[]; payouts: DataRecord[]; dashboard: PartnerPortalDashboard | null }) {
  const metrics = dashboard?.metrics ?? {};
  return <div className="partner-section-stack">
    <section className="partner-finance-summary" aria-label="Сводка по финансам">
      <div><span>Всего начислено</span><strong>{textValue(readValue(metrics, ["earned", "accrued", "ledgerBalance", "ledger_balance"]))}</strong></div>
      <div><span>Ожидает выплаты</span><strong>{textValue(readValue(metrics, ["pendingPayouts", "pending_payouts", "payoutsPending", "payouts_pending"]))}</strong></div>
      <div><span>Выплачено</span><strong>{textValue(readValue(metrics, ["paidPayouts", "paid_payouts", "payoutsPaid", "payouts_paid"]))}</strong></div>
    </section>
    <DataSection title="История начислений" subtitle="Комиссии по подтверждённым действиям пользователей Orken." rows={ledger} />
    <DataSection title="История выплат" subtitle="Статусы выплат. Реквизиты безопасно хранятся в общей партнёрской системе." rows={payouts} />
  </div>;
}

function DataSection({ title, subtitle, rows }: { title: string; subtitle: string; rows: DataRecord[] }) {
  return <section className="partner-panel"><div className="partner-panel-head"><div><h2>{title}</h2><p>{subtitle}</p></div></div><div className="partner-row-list">{rows.length === 0 ? <EmptyState text="Данных пока нет." /> : rows.map((row, index) => {
    const amount = readValue(row, ["amount", "amountText", "amount_text", "amountCents", "amount_cents"]);
    const date = readValue(row, ["createdAt", "created_at", "date"]);
    const status = statusCopy(rowStatus(row));
    return <article className="partner-row" key={rowId(row) ?? index}>
      <div><strong>{rowTitle(row)}</strong><span>{[amount, date].filter(Boolean).map(textValue).join(" · ") || "Подробности появятся после обработки"}</span></div>
      <span className={`partner-status ${status.tone}`}>{status.label}</span>
    </article>;
  })}</div></section>;
}

function ProfileSection({ identity, expiresAt }: { identity: PartnerPortalIdentity | null; expiresAt?: string }) {
  return <section className="partner-panel partner-profile-panel"><div className="partner-panel-head"><div><h2>Профиль</h2><p>Базовые данные из общей партнёрской системы студии.</p></div></div><dl><div><dt>Имя</dt><dd>{identity?.displayName ?? "—"}</dd></div><div><dt>Аккаунт</dt><dd>{identity?.accountName ?? "—"}</dd></div><div><dt>Email</dt><dd>{identity?.email ?? "—"}</dd></div><div><dt>Статус</dt><dd>{statusCopy(identity?.status ?? "").label}</dd></div><div><dt>Сессия действует до</dt><dd>{expiresAt ? new Date(expiresAt).toLocaleString("ru-RU") : "—"}</dd></div></dl></section>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="partner-empty"><ClipboardList size={19} /><span>{text}</span></div>;
}
