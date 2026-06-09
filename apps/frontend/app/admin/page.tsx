"use client";

import { useEffect, useState } from "react";
import type { AdminStats, AppSetting, FeatureFlag, PromoCode, PromptTemplate } from "@levelup/contracts";
import { adminApi, contentSettingKey, type TextLocale } from "@/lib/api";
import { defaultSiteText } from "@/lib/messages";

const textLocales: TextLocale[] = ["ru", "en"];

export default function AdminPage() {
  const adminText = defaultSiteText.ru.admin;
  const [password, setPassword] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [analyses, setAnalyses] = useState<unknown[]>([]);
  const [settings, setSettings] = useState<AppSetting[]>([]);
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [prompts, setPrompts] = useState<PromptTemplate[]>([]);
  const [promoCodes, setPromoCodes] = useState<PromoCode[]>([]);
  const [activeTextLocale, setActiveTextLocale] = useState<TextLocale>("ru");
  const [textDrafts, setTextDrafts] = useState<Record<TextLocale, string>>({
    ru: JSON.stringify(defaultSiteText.ru, null, 2),
    en: JSON.stringify(defaultSiteText.en, null, 2)
  });
  const [promoForm, setPromoForm] = useState({
    code: "",
    description: "",
    discountType: "PERCENT" as "PERCENT" | "FIXED_AMOUNT",
    percentOff: "20",
    amountOff: "500",
    currency: "usd",
    maxRedemptions: "",
    expiresAt: ""
  });
  const [message, setMessage] = useState("");

  useEffect(() => {
    const saved = window.sessionStorage.getItem("levelup_admin_session") ?? "";
    if (saved) {
      setAuthenticated(true);
      void refresh();
    }
  }, []);

  async function refresh() {
    setMessage("");
    try {
      const [nextStats, nextAnalyses, nextSettings, nextFlags, nextPrompts, nextPromoCodes] = await Promise.all([
        adminApi.stats(),
        adminApi.analyses(),
        adminApi.settings(),
        adminApi.flags(),
        adminApi.prompts(),
        adminApi.promoCodes()
      ]);
      setStats(nextStats);
      setAnalyses(nextAnalyses);
      setSettings(nextSettings);
      setFlags(nextFlags);
      setPrompts(nextPrompts);
      setPromoCodes(nextPromoCodes);
      hydrateTextDrafts(nextSettings);
    } catch (reason) {
      setAuthenticated(false);
      window.sessionStorage.removeItem("levelup_admin_session");
      setMessage(reason instanceof Error ? reason.message : "Admin API failed");
    }
  }

  function hydrateTextDrafts(nextSettings: AppSetting[]) {
    setTextDrafts({
      ru: JSON.stringify(readTextSetting(nextSettings, "ru"), null, 2),
      en: JSON.stringify(readTextSetting(nextSettings, "en"), null, 2)
    });
  }

  function readTextSetting(nextSettings: AppSetting[], locale: TextLocale) {
    const setting = nextSettings.find((item) => item.key === contentSettingKey(locale));
    return setting?.value && typeof setting.value === "object" ? setting.value : defaultSiteText[locale];
  }

  async function login() {
    setMessage("");
    try {
      const result = await adminApi.login(password);
      window.sessionStorage.setItem("levelup_admin_session", result.adminSession);
      window.sessionStorage.removeItem("levelup_admin_token");
      setPassword("");
      setAuthenticated(true);
      await refresh();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Login failed");
    }
  }

  function logout() {
    window.sessionStorage.removeItem("levelup_admin_session");
    window.sessionStorage.removeItem("levelup_admin_token");
    setAuthenticated(false);
    setStats(null);
  }

  async function upsertLocaleSettings() {
    await adminApi.upsertSetting("enabled_locales", ["ru", "en"]);
    await adminApi.upsertSetting("default_locale", "ru");
    await refresh();
  }

  async function upsertFeatureFlag() {
    await adminApi.upsertFlag("new_report_pipeline", true, { rollout: 0 });
    await refresh();
  }

  async function upsertPrompt() {
    await adminApi.upsertPrompt({
      key: "ikigai.report.full",
      locale: "ru",
      version: 1,
      status: "DRAFT",
      title: "Full ORKEN.LIFE report",
      content: "Generate a structured Ikigai career report from voice, face and questionnaire signals."
    });
    await refresh();
  }

  async function saveTexts(locale: TextLocale) {
    setMessage("");
    try {
      const parsed = JSON.parse(textDrafts[locale]);
      await adminApi.saveContent(locale, parsed);
      setMessage(adminText.savedTexts);
      await refresh();
    } catch (reason) {
      setMessage(reason instanceof SyntaxError ? adminText.invalidJson : reason instanceof Error ? reason.message : "Failed to save texts");
    }
  }

  function resetTexts(locale: TextLocale) {
    setTextDrafts((current) => ({
      ...current,
      [locale]: JSON.stringify(defaultSiteText[locale], null, 2)
    }));
  }

  async function upsertPromoCode() {
    await adminApi.upsertPromoCode({
      code: promoForm.code,
      description: promoForm.description || null,
      discountType: promoForm.discountType,
      percentOff: promoForm.discountType === "PERCENT" ? Number(promoForm.percentOff) : null,
      amountOff: promoForm.discountType === "FIXED_AMOUNT" ? Number(promoForm.amountOff) : null,
      currency: promoForm.discountType === "FIXED_AMOUNT" ? promoForm.currency : null,
      active: true,
      maxRedemptions: promoForm.maxRedemptions ? Number(promoForm.maxRedemptions) : null,
      startsAt: null,
      expiresAt: promoForm.expiresAt ? new Date(promoForm.expiresAt).toISOString() : null
    });
    setPromoForm((current) => ({ ...current, code: "", description: "" }));
    await refresh();
  }

  async function togglePromoCode(promoCode: PromoCode) {
    await adminApi.setPromoCodeActive(promoCode.id, !promoCode.active);
    await refresh();
  }

  return (
    <main className="page stack">
      <section className="stack">
        <div>
          <div className="eyebrow">{adminText.eyebrow}</div>
          <h1>{adminText.title}</h1>
        </div>
        {!authenticated ? (
          <div className="grid grid-2">
            <input className="input" data-testid="admin-password-input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={adminText.passwordPlaceholder} />
            <button className="button" data-testid="admin-login-button" onClick={login}>{adminText.login}</button>
          </div>
        ) : (
          <div className="row">
            <p className="muted" style={{ margin: 0 }}>{adminText.activeSession}</p>
            <button className="button secondary" style={{ width: "auto" }} onClick={logout}>{adminText.logout}</button>
          </div>
        )}
        {message && <div className="card" style={{ borderColor: "var(--danger)" }}>{message}</div>}
      </section>

      {authenticated && (
        <>
          {stats && (
            <section className="grid grid-3" data-testid="admin-stats">
              <Metric label={adminText.stats[0]} value={stats.analysesTotal} />
              <Metric label={adminText.stats[1]} value={stats.paymentsSucceeded} />
              <Metric label={adminText.stats[2]} value={stats.revenueSucceeded} />
              <Metric label={adminText.stats[3]} value={stats.eventsLast24h} />
              <Metric label={adminText.stats[4]} value={stats.failedAnalyses} />
              <Metric label={adminText.stats[5]} value={stats.analysesByStatus.map((item) => `${item.status}:${item.count}`).join(" ")} />
            </section>
          )}

          <section className="grid grid-3">
            <button className="button secondary" onClick={upsertLocaleSettings}>{adminText.seedLocales}</button>
            <button className="button secondary" onClick={upsertFeatureFlag}>{adminText.seedFlag}</button>
            <button className="button secondary" onClick={upsertPrompt}>{adminText.seedPrompt}</button>
          </section>

          <section className="card stack">
            <div>
              <h2>{adminText.textTitle}</h2>
              <p className="muted">{adminText.textCopy}</p>
            </div>
            <div className="row" style={{ justifyContent: "flex-start" }}>
              {textLocales.map((locale) => (
                <button
                  className={`button secondary ${activeTextLocale === locale ? "active-control" : ""}`}
                  key={locale}
                  onClick={() => setActiveTextLocale(locale)}
                  style={{ width: "auto" }}
                >
                  {locale.toUpperCase()}
                </button>
              ))}
            </div>
            <textarea
              className="input text-editor"
              value={textDrafts[activeTextLocale]}
              onChange={(event) => setTextDrafts((current) => ({ ...current, [activeTextLocale]: event.target.value }))}
              spellCheck={false}
            />
            <div className="grid grid-2">
              <button className="button" onClick={() => saveTexts(activeTextLocale)}>{adminText.saveTexts}</button>
              <button className="button secondary" onClick={() => resetTexts(activeTextLocale)}>{adminText.resetTexts}</button>
            </div>
          </section>

          <section className="card stack">
            <h2>{adminText.promoTitle}</h2>
            <div className="grid grid-3">
              <input className="input" value={promoForm.code} onChange={(event) => setPromoForm({ ...promoForm, code: event.target.value })} placeholder="Code" />
              <input className="input" value={promoForm.description} onChange={(event) => setPromoForm({ ...promoForm, description: event.target.value })} placeholder="Description" />
              <select className="input" value={promoForm.discountType} onChange={(event) => setPromoForm({ ...promoForm, discountType: event.target.value as "PERCENT" | "FIXED_AMOUNT" })}>
                <option value="PERCENT">Percent</option>
                <option value="FIXED_AMOUNT">Fixed amount</option>
              </select>
              {promoForm.discountType === "PERCENT" ? (
                <input className="input" value={promoForm.percentOff} onChange={(event) => setPromoForm({ ...promoForm, percentOff: event.target.value })} placeholder="Percent off" />
              ) : (
                <input className="input" value={promoForm.amountOff} onChange={(event) => setPromoForm({ ...promoForm, amountOff: event.target.value })} placeholder="Amount off, cents" />
              )}
              <input className="input" value={promoForm.currency} onChange={(event) => setPromoForm({ ...promoForm, currency: event.target.value })} placeholder="Currency" />
              <input className="input" value={promoForm.maxRedemptions} onChange={(event) => setPromoForm({ ...promoForm, maxRedemptions: event.target.value })} placeholder="Max redemptions" />
              <input className="input" type="datetime-local" value={promoForm.expiresAt} onChange={(event) => setPromoForm({ ...promoForm, expiresAt: event.target.value })} />
              <button className="button" onClick={upsertPromoCode}>Save promo</button>
            </div>
            <div className="stack">
              {promoCodes.length === 0 ? <p className="muted">No promo codes</p> : promoCodes.map((promoCode) => (
                <div className="row" key={promoCode.id}>
                  <span>
                    <strong>{promoCode.code}</strong>{" "}
                    {promoCode.discountType === "PERCENT" ? `${promoCode.percentOff}%` : `${promoCode.amountOff} ${promoCode.currency}`}
                    {" "}used {promoCode.redemptions}{promoCode.maxRedemptions ? `/${promoCode.maxRedemptions}` : ""}
                  </span>
                  <button className="button secondary" onClick={() => togglePromoCode(promoCode)}>
                    {promoCode.active ? "Deactivate" : "Activate"}
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section className="grid grid-2">
            <List title={adminText.lists[0]} items={settings.map((item) => `${item.key}: ${JSON.stringify(item.value).slice(0, 180)}`)} />
            <List title={adminText.lists[1]} items={flags.map((item) => `${item.key}: ${item.enabled}`)} />
            <List title={adminText.lists[2]} items={prompts.map((item) => `${item.key}/${item.locale}/v${item.version}: ${item.status}`)} />
            <List title={adminText.lists[3]} items={analyses.map((item) => JSON.stringify(item).slice(0, 220))} />
          </section>
        </>
      )}
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card">
      <div className="eyebrow">{label}</div>
      <h2>{value}</h2>
    </div>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="card stack">
      <h2>{title}</h2>
      {items.length === 0 ? <p className="muted">No data</p> : items.map((item) => <p className="muted" key={item}>{item}</p>)}
    </div>
  );
}
