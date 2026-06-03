"use client";

import Link from "next/link";
import { CreditCard } from "lucide-react";
import { api } from "@/lib/api";
import { useState } from "react";

export default function PayPage({ params }: { params: { analysisId: string } }) {
  const [message, setMessage] = useState("");

  async function createIntent() {
    const intent = await api.createPaymentIntent(params.analysisId);
    setMessage(`PaymentIntent готов: ${intent.paymentIntentId}. Следующий шаг: Stripe Elements confirmPayment.`);
  }

  return (
    <div className="stack">
      <div>
        <div className="eyebrow">Stripe</div>
        <h1>Оплата PRO-отчёта</h1>
        <p className="muted">Карта не собирается обычными input. Production-версия подключает Stripe Elements и подтверждает `clientSecret`.</p>
      </div>
      <button className="button" onClick={createIntent}><CreditCard size={18} /> Создать PaymentIntent</button>
      {message && <div className="card">{message}</div>}
      <Link className="button secondary" href={`/report/${params.analysisId}/full`}>Открыть полный отчёт после webhook</Link>
    </div>
  );
}
