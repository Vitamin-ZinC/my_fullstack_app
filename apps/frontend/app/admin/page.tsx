"use client";

import { useEffect, useState } from "react";
import type { AdminStats, AppSetting, FeatureFlag, PromoCode, PromptTemplate } from "@levelup/contracts";
import { adminApi } from "@/lib/api";

export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [analyses, setAnalyses] = useState<unknown[]>([]);
  const [settings, setSettings] = useState<AppSetting[]>([]);
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [prompts, setPrompts] = useState<PromptTemplate[]>([]);
  const [promoCodes, setPromoCodes] = useState<PromoCode[]>([]);
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
    } catch (reason) {
      setAuthenticated(false);
      window.sessionStorage.removeItem("levelup_admin_session");
      setMessage(reason instanceof Error ? reason.message : "Admin API failed");
    }
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
      title: "Full Ikigai report",
      content: "Generate a structured Ikigai career report from voice, face and questionnaire signals."
    });
    await refresh();
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
          <div className="eyebrow">Admin</div>
          <h1>Operations dashboard</h1>
        </div>
        {!authenticated ? (
          <div className="grid grid-2">
            <input className="input" data-testid="admin-password-input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Admin password" />
            <button className="button" data-testid="admin-login-button" onClick={login}>Log in</button>
          </div>
        ) : (
          <div className="row">
            <p className="muted" style={{ margin: 0 }}>Admin session is active for this browser tab.</p>
            <button className="button secondary" style={{ width: "auto" }} onClick={logout}>Log out</button>
          </div>
        )}
        {message && <div className="card" style={{ borderColor: "var(--danger)" }}>{message}</div>}
      </section>

      {authenticated && (
        <>
          {stats && (
            <section className="grid grid-3" data-testid="admin-stats">
              <Metric label="Analyses" value={stats.analysesTotal} />
              <Metric label="Paid reports" value={stats.paymentsSucceeded} />
              <Metric label="Revenue cents" value={stats.revenueSucceeded} />
              <Metric label="Events 24h" value={stats.eventsLast24h} />
              <Metric label="Failed" value={stats.failedAnalyses} />
              <Metric label="Statuses" value={stats.analysesByStatus.map((item) => `${item.status}:${item.count}`).join(" ")} />
            </section>
          )}

          <section className="grid grid-3">
            <button className="button secondary" onClick={upsertLocaleSettings}>Seed locales</button>
            <button className="button secondary" onClick={upsertFeatureFlag}>Seed flag</button>
            <button className="button secondary" onClick={upsertPrompt}>Seed prompt</button>
          </section>

          <section className="card stack">
            <h2>Promo codes</h2>
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
            <List title="Settings" items={settings.map((item) => `${item.key}: ${JSON.stringify(item.value)}`)} />
            <List title="Feature flags" items={flags.map((item) => `${item.key}: ${item.enabled}`)} />
            <List title="Prompts" items={prompts.map((item) => `${item.key}/${item.locale}/v${item.version}: ${item.status}`)} />
            <List title="Recent analyses" items={analyses.map((item) => JSON.stringify(item).slice(0, 220))} />
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
