"use client";
import { uiText, getFormatLocale, useUiLocale } from "@/lib/locale";


import Link from "next/link";
import { useParams } from "next/navigation";
import { CreditCard, Lock, Percent, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { api, restoreSessionFromUrl } from "@/lib/api";
import { useSiteText } from "@/lib/useSiteText";

export default function PayPage() {
  useUiLocale();
  const siteText = useSiteText();
  const text = siteText.report.payment;
  const { analysisId } = useParams<{ analysisId: string }>();
  const [promoCode, setPromoCode] = useState("");
  const [message, setMessage] = useState("");
  const [priceLabel, setPriceLabel] = useState<string | null>(null);
  const [priceFailed, setPriceFailed] = useState(false);
  const [priceAttempt, setPriceAttempt] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    restoreSessionFromUrl();
    setMounted(true);
    let cancelled = false;
    setPriceFailed(false);
    api.getPaymentConfig()
      .then((config) => {
        if (!cancelled) setPriceLabel(config.priceLabel);
      })
      .catch(() => {
        if (!cancelled) { setPriceLabel(null); setPriceFailed(true); }
      });
    return () => {
      cancelled = true;
    };
  }, [priceAttempt]);

  async function createCheckout() {
    setBusy(true);
    setMessage("");
    const normalizedPromoCode = promoCode.trim();
    try {
      const session = await api.createCheckoutSession(analysisId, normalizedPromoCode);
      if (session.amount === 0) setMessage(text.openedByPromo);
      window.location.assign(session.url);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : text.startFailed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flow-inner" data-testid="payment-page">
      <div className="ub very-muted analysis-kicker">{text.eyebrow}</div>
      <h1 className="ub flow-title">{text.title}</h1>
      <p className="muted flow-copy">{text.subtitle}</p>

      <div className="payment-price-card card cyan-border">
        <div className="ub cyan">{priceLabel ?? (priceFailed ? text.priceUnavailable : text.priceLoading)}</div>
        {priceFailed && <button type="button" className="button secondary" onClick={() => setPriceAttempt(value => value + 1)}><RefreshCw size={16} />{text.retryPrice}</button>}
        <p className="muted">{text.priceHint}</p>
      </div>

      <div className="card">
        <div className="ub muted instruction-title">{text.compareTitle}</div>
        <div className="compare-table">
          <div className="compare-row">
            <div className="compare-col">
              <h3>Free</h3>
              {text.compareFree.map((item) => <div key={item}>{item}</div>)}
            </div>
            <div className="compare-col premium">
              <h3 className="cyan">Premium</h3>
              {siteText.report.free.premiumBenefits.map((item) => <div key={item}>{item}</div>)}
            </div>
          </div>
        </div>
      </div>

      <div className="card promo-code-card">
        <div className="ub muted instruction-title">{text.promoTitle}</div>
        <label className="promo-code-field">
          <Percent size={18} />
          <input
            className="input"
            data-testid="promo-code-input"
            value={promoCode}
            onChange={(event) => setPromoCode(event.target.value.toUpperCase())}
            placeholder={text.promoPlaceholder}
            disabled={!mounted || busy}
            autoComplete="off"
          />
        </label>
        <p className="muted">{text.promoHint}</p>
      </div>

      <div className="card secure-payment-note">
        <div className="secure-copy">
          <Lock size={15} />
          <span>{text.secureCopy}</span>
        </div>
      </div>

      <button className="button" data-testid="checkout-button" onClick={createCheckout} disabled={!mounted || busy || !priceLabel}>
        <CreditCard size={18} /> {busy ? text.busy : text.checkoutExternal}
      </button>
      <p className="legal-inline-links">
        {uiText(" Нажимая кнопку оплаты, вы принимаете ")}<Link href="/offer" target="_blank">{uiText("публичную оферту")}</Link> {uiText(" и соглашаетесь с ")}<Link href="/privacy" target="_blank">{uiText("политикой конфиденциальности")}</Link>.
      </p>
      {message && <div className="card">{message}</div>}
      <Link className="button secondary" href={`/report/${analysisId}/free`}>{text.backToFree}</Link>
    </div>
  );
}
