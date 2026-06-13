"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { CreditCard, Lock, Percent } from "lucide-react";
import { loadStripe, type StripeElements } from "@stripe/stripe-js";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useSiteText } from "@/lib/useSiteText";

const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";

export default function PayPage() {
  const text = useSiteText().report.payment;
  const { analysisId } = useParams<{ analysisId: string }>();
  const paymentElementRef = useRef<HTMLDivElement>(null);
  const elementsRef = useRef<StripeElements | null>(null);
  const [holderName, setHolderName] = useState("");
  const [promoCode, setPromoCode] = useState("");
  const [message, setMessage] = useState("");
  const [priceLabel, setPriceLabel] = useState(text.price);
  const [mounted, setMounted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setMounted(true);
    let cancelled = false;
    api.getPaymentConfig()
      .then((config) => {
        if (!cancelled) setPriceLabel(config.priceLabel);
      })
      .catch(() => {
        if (!cancelled) setPriceLabel(text.price);
      });
    return () => {
      cancelled = true;
    };
  }, [text.price]);

  async function createIntent() {
    setBusy(true);
    setMessage("");
    const normalizedPromoCode = promoCode.trim();
    try {
      if (!publishableKey) {
        const session = await api.createCheckoutSession(analysisId, normalizedPromoCode);
        if (session.amount === 0) setMessage(text.openedByPromo);
        window.location.assign(session.url);
        return;
      }

      const intent = await api.createPaymentIntent(analysisId, normalizedPromoCode);
      if (!intent.clientSecret && intent.status === "SUCCEEDED") {
        setMessage(text.openedByPromo);
        window.location.assign(`/report/${analysisId}/full`);
        return;
      }
      if (!intent.clientSecret) throw new Error(text.stripeNoSecret);
      const stripe = await loadStripe(publishableKey);
      if (!stripe) throw new Error(text.stripeNotLoaded);
      const elements = stripe.elements({ clientSecret: intent.clientSecret });
      elementsRef.current = elements;
      const paymentElement = elements.create("payment");
      paymentElement.mount(paymentElementRef.current!);
      setReady(true);
      setMessage(`${intent.amount} ${intent.currency}`);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : text.startFailed);
    } finally {
      setBusy(false);
    }
  }

  async function confirmPayment() {
    setBusy(true);
    setMessage("");
    try {
      const stripe = await loadStripe(publishableKey);
      if (!stripe || !elementsRef.current) throw new Error(text.paymentNotReady);
      const result = await stripe.confirmPayment({
        elements: elementsRef.current,
        confirmParams: {
          payment_method_data: holderName ? { billing_details: { name: holderName } } : undefined,
          return_url: `${window.location.origin}/report/${analysisId}/full`
        }
      });
      if (result.error) throw new Error(result.error.message);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : text.failed);
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
        <div className="ub cyan">{priceLabel}</div>
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
              {text.comparePremium.map((item) => <div key={item}>{item}</div>)}
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
            disabled={!mounted || busy || ready}
            autoComplete="off"
          />
        </label>
        <p className="muted">{text.promoHint}</p>
      </div>

      <div className="card-art">
        <div className="ub card-art-title">{text.cardTitle}</div>
        <label>
          <span className="ub very-muted card-field-label">{text.cardName}</span>
          <input className="input" value={holderName} onChange={(event) => setHolderName(event.target.value.toUpperCase())} placeholder={text.cardNamePlaceholder} autoComplete="cc-name" />
        </label>
        <div className="payment-element-shell" ref={paymentElementRef}>
          {!ready && <div className="stripe-placeholder">{publishableKey ? text.stripePlaceholder : text.checkoutPlaceholder}</div>}
        </div>
        <div className="secure-copy">
          <Lock size={15} />
          <span>{text.secureCopy}</span>
        </div>
      </div>

      {!ready && (
        <button className="button" data-testid="checkout-button" onClick={createIntent} disabled={!mounted || busy}>
          <CreditCard size={18} /> {busy ? text.busy : publishableKey ? text.checkout : text.checkoutExternal}
        </button>
      )}
      {ready && <button className="button" onClick={confirmPayment} disabled={busy}>{busy ? text.busy : text.confirm}</button>}
      {message && <div className="card">{message}</div>}
      <Link className="button secondary" href={`/report/${analysisId}/free`}>{text.backToFree}</Link>
    </div>
  );
}
