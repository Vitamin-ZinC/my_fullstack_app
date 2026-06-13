"use client";

import { useEffect, useState } from "react";
import type { AdminStats, AppSetting, FeatureFlag, PromoCode, PromptTemplate, PromptTemplateInput } from "@levelup/contracts";
import { adminApi, contentSettingKey, reportPriceAmountSettingKey, reportPriceCurrencySettingKey, type TextLocale } from "@/lib/api";
import { defaultSiteText } from "@/lib/messages";

const textLocales: TextLocale[] = ["ru", "en"];
const emptyPromptForm: PromptTemplateInput = {
  key: "ikigai.report.free.user",
  locale: "ru",
  version: 1,
  status: "ACTIVE",
  title: "",
  content: ""
};

export default function AdminPage() {
  const adminText = defaultSiteText.ru.admin;
  const [password, setPassword] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [analyses, setAnalyses] = useState<unknown[]>([]);
  const [settings, setSettings] = useState<AppSetting[]>([]);
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [prompts, setPrompts] = useState<PromptTemplate[]>([]);
  const [promptDefaults, setPromptDefaults] = useState<PromptTemplateInput[]>([]);
  const [promptForm, setPromptForm] = useState<PromptTemplateInput>(emptyPromptForm);
  const [promoCodes, setPromoCodes] = useState<PromoCode[]>([]);
  const [activeTextLocale, setActiveTextLocale] = useState<TextLocale>("ru");
  const [textDrafts, setTextDrafts] = useState<Record<TextLocale, string>>({
    ru: JSON.stringify(defaultSiteText.ru, null, 2),
    en: JSON.stringify(defaultSiteText.en, null, 2)
  });
  const [priceForm, setPriceForm] = useState({
    amount: "300",
    currency: "usd"
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
      const [nextStats, nextAnalyses, nextSettings, nextFlags, nextPrompts, nextPromptDefaults, nextPromoCodes] = await Promise.all([
        adminApi.stats(),
        adminApi.analyses(),
        adminApi.settings(),
        adminApi.flags(),
        adminApi.prompts(),
        adminApi.promptDefaults(),
        adminApi.promoCodes()
      ]);
      setStats(nextStats);
      setAnalyses(nextAnalyses);
      setSettings(nextSettings);
      setFlags(nextFlags);
      setPrompts(nextPrompts);
      setPromptDefaults(nextPromptDefaults);
      setPromoCodes(nextPromoCodes);
      hydrateTextDrafts(nextSettings);
      hydratePriceForm(nextSettings);
      hydratePromptForm(nextPrompts, nextPromptDefaults);
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

  function hydratePriceForm(nextSettings: AppSetting[]) {
    const amount = nextSettings.find((item) => item.key === reportPriceAmountSettingKey)?.value;
    const currency = nextSettings.find((item) => item.key === reportPriceCurrencySettingKey)?.value;
    setPriceForm({
      amount: typeof amount === "number" || typeof amount === "string" ? String(amount) : "300",
      currency: typeof currency === "string" ? currency : "usd"
    });
  }

  function toPromptForm(prompt: PromptTemplate | PromptTemplateInput): PromptTemplateInput {
    return {
      key: prompt.key,
      locale: prompt.locale,
      version: prompt.version,
      status: prompt.status,
      title: prompt.title,
      content: prompt.content
    };
  }

  function hydratePromptForm(nextPrompts: PromptTemplate[], nextDefaults: PromptTemplateInput[]) {
    const preferred = nextPrompts.find((item) => item.key === "ikigai.report.free.user" && item.locale === "ru" && item.status === "ACTIVE")
      ?? nextPrompts[0]
      ?? nextDefaults.find((item) => item.key === "ikigai.report.free.user" && item.locale === "ru")
      ?? nextDefaults[0];
    if (preferred) setPromptForm(toPromptForm(preferred));
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
    setMessage("");
    const version = Number(promptForm.version);
    if (!promptForm.key.trim() || !promptForm.title.trim() || !promptForm.content.trim()) {
      setMessage("Prompt key, title and content are required");
      return;
    }
    if (!Number.isInteger(version) || version <= 0) {
      setMessage("Prompt version must be a positive integer");
      return;
    }

    await adminApi.upsertPrompt({
      ...promptForm,
      key: promptForm.key.trim(),
      locale: promptForm.locale.trim().toLowerCase() || "ru",
      version,
      title: promptForm.title.trim()
    });
    setMessage(adminText.savedPrompt);
    await refresh();
  }

  async function seedDefaultPrompts() {
    setMessage("");
    await Promise.all(promptDefaults.map((prompt) => adminApi.upsertPrompt(prompt)));
    setMessage(adminText.savedPrompt);
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

  async function saveReportPrice() {
    setMessage("");
    const amount = Number(priceForm.amount);
    const currency = priceForm.currency.trim().toLowerCase();
    if (!Number.isInteger(amount) || amount <= 0) {
      setMessage("Amount must be a positive integer in cents");
      return;
    }
    if (!/^[a-z]{3}$/.test(currency)) {
      setMessage("Currency must be a 3-letter ISO code");
      return;
    }

    await adminApi.upsertSetting(reportPriceAmountSettingKey, amount);
    await adminApi.upsertSetting(reportPriceCurrencySettingKey, currency);
    setMessage(adminText.savedPrice);
    await refresh();
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

  const promptChoices = [
    ...prompts.map((prompt) => ({ label: `${prompt.key}/${prompt.locale}/v${prompt.version} ${prompt.status}`, value: `${prompt.key}|${prompt.locale}|${prompt.version}|saved`, prompt })),
    ...promptDefaults
      .filter((prompt) => !prompts.some((item) => item.key === prompt.key && item.locale === prompt.locale && item.version === prompt.version))
      .map((prompt) => ({ label: `${prompt.key}/${prompt.locale}/v${prompt.version} default`, value: `${prompt.key}|${prompt.locale}|${prompt.version}|default`, prompt }))
  ];

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
            <button className="button secondary" onClick={seedDefaultPrompts}>{adminText.seedPrompt}</button>
          </section>

          <section className="card stack">
            <div>
              <h2>{adminText.priceTitle}</h2>
              <p className="muted">{adminText.priceCopy}</p>
            </div>
            <div className="grid grid-3">
              <input className="input" value={priceForm.amount} onChange={(event) => setPriceForm({ ...priceForm, amount: event.target.value })} placeholder={adminText.priceAmount} inputMode="numeric" />
              <input className="input" value={priceForm.currency} onChange={(event) => setPriceForm({ ...priceForm, currency: event.target.value.toLowerCase() })} placeholder={adminText.priceCurrency} />
              <button className="button" onClick={saveReportPrice}>{adminText.savePrice}</button>
            </div>
          </section>

          <section className="card stack">
            <div>
              <h2>{adminText.promptTitle}</h2>
              <p className="muted">{adminText.promptCopy}</p>
            </div>
            <div className="prompt-output-note">
              <strong>{adminText.promptOutputTitle}</strong>
              <span>{adminText.promptOutputCopy}</span>
            </div>
            <select
              className="input"
              value=""
              onChange={(event) => {
                const selected = promptChoices.find((item) => item.value === event.target.value);
                if (selected) setPromptForm(toPromptForm(selected.prompt));
              }}
            >
              <option value="">{adminText.promptSelect}</option>
              {promptChoices.map((item) => (
                <option value={item.value} key={item.value}>{item.label}</option>
              ))}
            </select>
            <div className="grid grid-3">
              <input className="input" data-testid="admin-prompt-key" value={promptForm.key} onChange={(event) => setPromptForm({ ...promptForm, key: event.target.value })} placeholder={adminText.promptKey} />
              <input className="input" value={promptForm.locale} onChange={(event) => setPromptForm({ ...promptForm, locale: event.target.value.toLowerCase() })} placeholder={adminText.promptLocale} />
              <input className="input" value={promptForm.version} onChange={(event) => setPromptForm({ ...promptForm, version: Number(event.target.value) || 1 })} placeholder={adminText.promptVersion} inputMode="numeric" />
              <select className="input" value={promptForm.status} onChange={(event) => setPromptForm({ ...promptForm, status: event.target.value as PromptTemplateInput["status"] })}>
                <option value="DRAFT">DRAFT</option>
                <option value="ACTIVE">ACTIVE</option>
                <option value="ARCHIVED">ARCHIVED</option>
              </select>
              <input className="input" value={promptForm.title} onChange={(event) => setPromptForm({ ...promptForm, title: event.target.value })} placeholder={adminText.promptTitleField} />
            </div>
            <textarea
              className="input text-editor prompt-editor"
              data-testid="admin-prompt-content"
              value={promptForm.content}
              onChange={(event) => setPromptForm({ ...promptForm, content: event.target.value })}
              spellCheck={false}
            />
            <div className="prompt-help">
              <strong>{adminText.promptPlaceholdersTitle}</strong>
              <span>{adminText.promptPlaceholders}</span>
            </div>
            <div className="grid grid-2">
              <button className="button" data-testid="admin-save-prompt" onClick={upsertPrompt}>{adminText.savePrompt}</button>
              <button className="button secondary" onClick={seedDefaultPrompts}>{adminText.seedPrompt}</button>
            </div>
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
