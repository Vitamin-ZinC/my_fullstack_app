"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CreditCard } from "lucide-react";
import { loadStripe, type StripeElements } from "@stripe/stripe-js";
import { useRef, useState } from "react";
import { api } from "@/lib/api";

const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";

export default function PayPage({ params }: { params: { analysisId: string } }) {
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
        setMessage("Промокод применён. Полный отчёт открыт.");
        router.push(`/report/${params.analysisId}/full`);
        return;
      }
      if (!intent.clientSecret) throw new Error("Stripe не вернул clientSecret");
      const stripe = await loadStripe(publishableKey);
      if (!stripe) throw new Error("Stripe.js не загрузился");
      const elements = stripe.elements({ clientSecret: intent.clientSecret });
      elementsRef.current = elements;
      const paymentElement = elements.create("payment");
      paymentElement.mount(paymentElementRef.current!);
      setReady(true);
      setMessage(`К оплате: ${intent.amount} ${intent.currency}${intent.discountAmount ? `, скидка ${intent.discountAmount}` : ""}`);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Не удалось начать оплату");
    } finally {
      setBusy(false);
    }
  }

  async function confirmPayment() {
    setBusy(true);
    setMessage("");
    try {
      const stripe = await loadStripe(publishableKey);
      if (!stripe || !elementsRef.current) throw new Error("Платёжная форма ещё не готова");
      const result = await stripe.confirmPayment({
        elements: elementsRef.current,
        confirmParams: {
          return_url: `${window.location.origin}/report/${params.analysisId}/full`
        }
      });
      if (result.error) throw new Error(result.error.message);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Оплата не прошла");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack" data-testid="payment-page">
      <div>
        <div className="eyebrow">Stripe</div>
        <h1 className="ub">Оплата PRO-отчёта</h1>
        <p className="muted">Платёжные данные вводятся на стороне Stripe. Можно применить промокод.</p>
      </div>
      <input className="input" data-testid="promo-code-input" value={promoCode} onChange={(event) => setPromoCode(event.target.value)} placeholder="Промокод" />
      <button className="button" data-testid="checkout-button" onClick={createIntent} disabled={busy}>
        <CreditCard size={18} /> {busy ? "Подготовка..." : publishableKey ? "Открыть форму оплаты" : "Перейти к оплате"}
      </button>
      <div ref={paymentElementRef} className="card" style={{ display: ready ? "block" : "none" }} />
      {ready && <button className="button" onClick={confirmPayment} disabled={busy}>Подтвердить оплату</button>}
      {message && <div className="card">{message}</div>}
      <Link className="button secondary" href={`/report/${params.analysisId}/full`}>Открыть полный отчёт</Link>
    </div>
  );
}
