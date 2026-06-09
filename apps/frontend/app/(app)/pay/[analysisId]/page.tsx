"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CreditCard } from "lucide-react";
import { loadStripe, type StripeElements } from "@stripe/stripe-js";
import { useRef, useState } from "react";
import { api } from "@/lib/api";
import { useSiteText } from "@/lib/useSiteText";

const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";

export default function PayPage({ params }: { params: { analysisId: string } }) {
  const text = useSiteText().report.payment;
  const router = useRouter();
  const paymentElementRef = useRef<HTMLDivElement>(null);
  const elementsRef = useRef<StripeElements | null>(null);
  const [message, setMessage] = useState("");
  const [promoCode, setPromoCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  async function createIntent() {
    setBusy(true);
    setMessage("");
    try {
      if (!publishableKey) {
        const session = await api.createCheckoutSession(params.analysisId, promoCode);
        window.location.assign(session.url);
        return;
      }
      const intent = await api.createPaymentIntent(params.analysisId, promoCode);
      if (intent.status === "SUCCEEDED" && !intent.clientSecret) {
        setMessage(text.openedByPromo);
        router.push(`/report/${params.analysisId}/full`);
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
      setMessage(`${intent.amount} ${intent.currency}${intent.discountAmount ? `, скидка ${intent.discountAmount}` : ""}`);
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
          return_url: `${window.location.origin}/report/${params.analysisId}/full`
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
    <div className="stack" data-testid="payment-page">
      <div>
        <div className="eyebrow">{text.eyebrow}</div>
        <h1 className="ub">{text.title}</h1>
        <p className="muted">{text.subtitle}</p>
      </div>

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

      <p className="muted">{text.copy}</p>
      <input className="input" data-testid="promo-code-input" value={promoCode} onChange={(event) => setPromoCode(event.target.value)} placeholder={text.promoPlaceholder} />
      <button className="button" data-testid="checkout-button" onClick={createIntent} disabled={busy}>
        <CreditCard size={18} /> {busy ? text.busy : publishableKey ? text.checkout : text.checkoutExternal}
      </button>
      <div ref={paymentElementRef} className="card" style={{ display: ready ? "block" : "none" }} />
      {ready && <button className="button" onClick={confirmPayment} disabled={busy}>{text.confirm}</button>}
      {message && <div className="card">{message}</div>}
      <Link className="button secondary" href={`/report/${params.analysisId}/full`}>{text.openFull}</Link>
    </div>
  );
}
