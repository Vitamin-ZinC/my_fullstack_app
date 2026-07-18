"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  CheckCircle2,
  ClipboardList,
  Copy,
  HandCoins,
  Link2,
  LogIn,
  LogOut,
  Pencil,
  Plus,
  ReceiptText,
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

type Tab = "overview" | "links" | "offers" | "activity" | "ledger" | "payouts" | "profile";
type DataRecord = Record<string, unknown>;
type OfferKind = "paid_service" | "qualified_lead" | "portfolio_credit" | "reward_trial" | "manual_deal";
type OfferSurface = "rewards_tab" | "milestone_modal" | "home_module" | "admin_recommendation";
type OfferForm = { offer: string; kind: OfferKind; surface: OfferSurface; price: string; cap: string; partnerPayoutCents: string };

const defaultOfferForm: OfferForm = {
  offer: "",
  kind: "qualified_lead",
  surface: "rewards_tab",
  price: "120 Orken Points",
  cap: "25 / month",
  partnerPayoutCents: "0"
};

const tabs: Array<{ id: Tab; label: string; icon: typeof BarChart3 }> = [
  { id: "overview", label: "Обзор", icon: BarChart3 },
  { id: "links", label: "Реферальные ссылки", icon: Link2 },
  { id: "offers", label: "Офферы", icon: HandCoins },
  { id: "activity", label: "Лиды и конверсии", icon: ClipboardList },
  { id: "ledger", label: "Начисления", icon: ReceiptText },
  { id: "payouts", label: "Выплаты", icon: WalletCards },
  { id: "profile", label: "Профиль", icon: UserRound }
];

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
  if (normalized === "APPROVED" || normalized === "ACTIVE" || normalized === "PUBLISHED") return { label: "Одобрен", tone: "approved" };
  if (normalized === "REJECTED") return { label: "Нужны изменения", tone: "rejected" };
  if (normalized === "SUSPENDED") return { label: "Доступ приостановлен", tone: "suspended" };
  if (normalized === "DRAFT") return { label: "Черновик", tone: "draft" };
  return { label: "На проверке", tone: "pending" };
}

function metricsFromDashboard(dashboard: PartnerPortalDashboard | null) {
  const metrics = dashboard?.metrics ?? {};
  return [
    { label: "Клики", value: readValue(metrics, ["clicks", "linkClicks", "link_clicks"]) },
    { label: "Регистрации", value: readValue(metrics, ["signups", "registrations", "leads"]) },
    { label: "Платные конверсии", value: readValue(metrics, ["paidConversions", "paid_conversions", "payments", "conversions"]) },
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
    setSubmitting(true);
    setError("");
    try {
      const payload = {
        offer: offerForm.offer,
        kind: offerForm.kind,
        surface: offerForm.surface,
        price: offerForm.price,
        cap: offerForm.cap,
        partnerPayoutCents: Number(offerForm.partnerPayoutCents) || 0,
        idempotencyKey: makeIdempotencyKey()
      };
      if (editingOfferId) {
        await partnerPortalApi.updateOffer(editingOfferId, payload);
        setNotice("Изменения оффера сохранены.");
      } else {
        await partnerPortalApi.createOffer(payload);
        setNotice("Оффер сохранён как черновик.");
      }
      setOfferForm(defaultOfferForm);
      setEditingOfferId(null);
      await loadPortal();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Не удалось сохранить оффер");
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
      price: String(readValue(offer, ["price", "price_label"]) ?? ""),
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
      setNotice("Оффер отправлен на модерацию.");
      await loadPortal();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Не удалось отправить оффер");
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
            <p>Ссылки, офферы, конверсии и начисления по программе Orken.</p>
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
          <div><span className="partner-eyebrow">Orken · партнёрская программа</span><h1>{tabs.find((item) => item.id === tab)?.label}</h1></div>
          <button className="partner-icon-button" onClick={() => void loadPortal()} disabled={loading || submitting} type="button" title="Обновить данные"><RefreshCw size={18} /></button>
        </header>

        {error && <p className="partner-inline-error" role="alert">{error}</p>}
        {notice && <p className="partner-notice"><CheckCircle2 size={17} />{notice}</p>}
        {identity && status.tone !== "approved" && <section className={`partner-review-banner ${status.tone}`}><ShieldCheck size={20} /><div><strong>{status.label}</strong><span>{status.tone === "rejected" ? "Проверьте комментарии модератора и обновите оффер перед повторной отправкой." : "Доступ к данным сохранён. Публикация ссылок и офферов станет доступна после одобрения."}</span></div></section>}

        {tab === "overview" && <Overview metrics={metrics} dashboard={dashboard} />}
        {tab === "links" && <LinksSection links={dashboard?.referralLinks ?? []} linkName={linkName} setLinkName={setLinkName} submitting={submitting} onCreate={createLink} onCopy={copyLink} />}
        {tab === "offers" && <OffersSection offers={dashboard?.offers ?? []} form={offerForm} setForm={setOfferForm} editingOfferId={editingOfferId} submitting={submitting} onSave={saveOffer} onEdit={editOffer} onCancelEdit={cancelOfferEdit} onReview={submitOfferReview} />}
        {tab === "activity" && <ActivitySection dashboard={dashboard} />}
        {tab === "ledger" && <DataSection title="Начисления" subtitle="Строки начислений по Orken. Выплатные реквизиты в кабинете не отображаются." rows={asRows(ledger)} />}
        {tab === "payouts" && <DataSection title="Выплаты" subtitle="Статусы выплат из общей партнёрской системы." rows={asRows(payouts)} />}
        {tab === "profile" && <ProfileSection identity={identity} expiresAt={portalSession?.expiresAt} />}
      </section>
    </main>
  );
}

function Overview({ metrics, dashboard }: { metrics: Array<{ label: string; value: unknown }>; dashboard: PartnerPortalDashboard | null }) {
  const links = dashboard?.referralLinks.length ?? 0;
  const offers = dashboard?.offers.length ?? 0;
  return <div className="partner-section-stack">
    <section className="partner-metric-grid">{metrics.map((metric) => <article className="partner-metric" key={metric.label}><span>{metric.label}</span><strong>{textValue(metric.value)}</strong></article>)}</section>
    <section className="partner-panel partner-overview-panel"><div><span className="partner-eyebrow">Текущий проект</span><h2>Партнёрская программа Orken</h2><p>Здесь отражаются только ссылки, офферы и вознаграждения, связанные с Orken.</p></div><div className="partner-quick-facts"><span><Link2 size={16} />{links} ссылок</span><span><HandCoins size={16} />{offers} офферов</span></div></section>
  </div>;
}

function LinksSection({ links, linkName, setLinkName, submitting, onCreate, onCopy }: { links: DataRecord[]; linkName: string; setLinkName: (value: string) => void; submitting: boolean; onCreate: (event: React.FormEvent) => Promise<void>; onCopy: (value: unknown) => Promise<void> }) {
  return <div className="partner-section-stack"><section className="partner-panel"><div className="partner-panel-head"><div><h2>Новая ссылка</h2><p>Укажите название канала или кампании, чтобы различать источники.</p></div></div><form className="partner-inline-form" onSubmit={onCreate}><input value={linkName} onChange={(event) => setLinkName(event.target.value)} placeholder="Например: Telegram июль" required /><button className="partner-primary-button" disabled={submitting} type="submit"><Plus size={17} />Создать ссылку</button></form></section><section className="partner-panel"><div className="partner-panel-head"><div><h2>Ваши ссылки</h2><p>Ссылки принадлежат вашему аккаунту в Partner Core.</p></div></div><div className="partner-row-list">{links.length === 0 ? <EmptyState text="Пока нет ссылок. Создайте первую кампанию выше." /> : links.map((link, index) => { const url = readValue(link, ["url", "href", "referralUrl", "referral_url"]); return <article className="partner-row" key={rowId(link) ?? index}><div><strong>{rowTitle(link)}</strong><span>{typeof url === "string" ? url : "Ссылка готовится"}</span></div><div className="partner-row-actions"><span className="partner-status draft">{rowStatus(link)}</span>{typeof url === "string" && <button className="partner-icon-button" onClick={() => void onCopy(url)} type="button" title="Скопировать ссылку"><Copy size={16} /></button>}</div></article>; })}</div></section></div>;
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
        <div>
          <h2>{editingOfferId ? "Редактирование оффера" : "Новый оффер"}</h2>
          <p>{editingOfferId ? "После сохранения оффер можно повторно отправить на модерацию." : "Оффер создаётся черновиком. Публикация возможна после модерации."}</p>
        </div>
        {editingOfferId && <button className="partner-icon-button" onClick={onCancelEdit} type="button" title="Отменить редактирование"><X size={17} /></button>}
      </div>
      <form className="partner-offer-form" onSubmit={onSave}>
        <label>Название оффера<input value={form.offer} onChange={(event) => setForm({ ...form, offer: event.target.value })} placeholder="Например: личная установочная сессия" required /></label>
        <label>Тип оффера<select value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value as OfferKind })}><option value="qualified_lead">Квалифицированный лид</option><option value="paid_service">Платная услуга</option><option value="portfolio_credit">Кредит портфолио</option><option value="reward_trial">Пробный доступ</option><option value="manual_deal">Ручная сделка</option></select></label>
        <label>Размещение<select value={form.surface} onChange={(event) => setForm({ ...form, surface: event.target.value as OfferSurface })}><option value="rewards_tab">Вкладка наград</option><option value="milestone_modal">Окно достижения</option><option value="home_module">Главный экран</option><option value="admin_recommendation">Рекомендация администратора</option></select></label>
        <label>Цена для пользователя<input value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} required /></label>
        <label>Лимит в месяц<input value={form.cap} onChange={(event) => setForm({ ...form, cap: event.target.value })} required /></label>
        <label>Вознаграждение партнёра, центы<input value={form.partnerPayoutCents} onChange={(event) => setForm({ ...form, partnerPayoutCents: event.target.value })} inputMode="numeric" required /></label>
        <button className="partner-primary-button" disabled={submitting} type="submit">{editingOfferId ? <Pencil size={17} /> : <Plus size={17} />}{editingOfferId ? "Сохранить изменения" : "Сохранить черновик"}</button>
      </form>
    </section>
    <section className="partner-panel">
      <div className="partner-panel-head"><div><h2>Ваши офферы</h2><p>Статусы и модерация управляются Partner Core.</p></div></div>
      <div className="partner-row-list">{offers.length === 0 ? <EmptyState text="Офферов пока нет." /> : offers.map((offer, index) => {
        const id = rowId(offer);
        const status = statusCopy(rowStatus(offer));
        const editable = status.tone === "draft" || status.tone === "rejected";
        return <article className="partner-row" key={id ?? index}>
          <div><strong>{rowTitle(offer)}</strong><span>{textValue(readValue(offer, ["price", "price_label", "cap", "cap_label"]))}</span></div>
          <div className="partner-row-actions">
            <span className={`partner-status ${status.tone}`}>{status.label}</span>
            {id && editable && <button className="partner-icon-button" disabled={submitting} onClick={() => onEdit(offer)} type="button" title="Редактировать оффер"><Pencil size={16} /></button>}
            {id && editable && <button className="partner-secondary-button" disabled={submitting} onClick={() => void onReview(id)} type="button"><Send size={15} />На модерацию</button>}
          </div>
        </article>;
      })}</div>
    </section>
  </div>;
}

function ActivitySection({ dashboard }: { dashboard: PartnerPortalDashboard | null }) {
  return <div className="partner-section-stack"><DataSection title="Лиды" subtitle="Регистрации, пришедшие по вашим ссылкам." rows={dashboard?.leads ?? []} /><DataSection title="Конверсии" subtitle="Оплаты и другие подтверждённые события Orken." rows={dashboard?.conversions ?? []} /></div>;
}

function DataSection({ title, subtitle, rows }: { title: string; subtitle: string; rows: DataRecord[] }) {
  return <section className="partner-panel"><div className="partner-panel-head"><div><h2>{title}</h2><p>{subtitle}</p></div></div><div className="partner-row-list">{rows.length === 0 ? <EmptyState text="Данных пока нет." /> : rows.map((row, index) => <article className="partner-row" key={rowId(row) ?? index}><div><strong>{rowTitle(row)}</strong><span>{textValue(readValue(row, ["amount", "amountCents", "amount_cents", "createdAt", "created_at", "date"]))}</span></div><span className="partner-status draft">{rowStatus(row)}</span></article>)}</div></section>;
}

function ProfileSection({ identity, expiresAt }: { identity: PartnerPortalIdentity | null; expiresAt?: string }) {
  return <section className="partner-panel partner-profile-panel"><div className="partner-panel-head"><div><h2>Профиль</h2><p>Базовые данные из общей партнёрской системы студии.</p></div></div><dl><div><dt>Имя</dt><dd>{identity?.displayName ?? "—"}</dd></div><div><dt>Аккаунт</dt><dd>{identity?.accountName ?? "—"}</dd></div><div><dt>Email</dt><dd>{identity?.email ?? "—"}</dd></div><div><dt>Статус</dt><dd>{statusCopy(identity?.status ?? "").label}</dd></div><div><dt>Сессия действует до</dt><dd>{expiresAt ? new Date(expiresAt).toLocaleString("ru-RU") : "—"}</dd></div></dl></section>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="partner-empty"><ClipboardList size={19} /><span>{text}</span></div>;
}
