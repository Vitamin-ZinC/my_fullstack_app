import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import test from "node:test";
import { createReportGateCheckout, isReportGatePaid, parseReportGateCallback, verifyReportGateCallback } from "./reportPaymentGate.js";

test("Gate callbacks require a recent signature over the exact raw body", () => {
  const now = 1795600000;
  const secret = "test-signing-secret-with-at-least-32-bytes";
  const raw = Buffer.from('{"status": "paid"}');
  const headers = {
    "x-payment-gate-contract": "payment_gate_signed_v1",
    "x-payment-gate-timestamp": String(now),
    "x-payment-gate-signature": createHmac("sha256", secret).update(`${now}.`).update(raw).digest("hex")
  };
  assert.equal(verifyReportGateCallback(raw, headers, secret, now), true);
  assert.equal(verifyReportGateCallback(Buffer.from('{"status":"paid"}'), headers, secret, now), false);
  assert.equal(verifyReportGateCallback(raw, headers, secret, now + 301), false);
  assert.equal(verifyReportGateCallback(raw, { ...headers, "x-payment-gate-contract": "unknown" }, secret, now), false);
});

test("only fully settled Stripe and BetaTransfer report orders can be fulfilled", () => {
  const callback = {
    id: randomUUID(), schema_version: "1", payment_session_id: randomUUID(), provider_session_id: "synthetic",
    provider: "stripe", event_type: "checkout.session.completed", status: "paid", amount: 300, currency: "usd",
    metadata: { orken_report_order: "fork-order" }
  };
  const cases: [Record<string, unknown>, boolean][] = [
    [callback, true],
    [{ ...callback, status: "unpaid" }, false],
    [{ ...callback, event_type: "invoice.paid" }, false],
    [{ ...callback, provider_session_id: null }, false],
    [{ ...callback, provider: "betatransfer", event_type: "payment.updated", status: "completed", metadata: { ...callback.metadata, raw_status: "success" } }, true],
    [{ ...callback, provider: "betatransfer", event_type: "payment.updated", status: "completed", metadata: { ...callback.metadata, raw_status: "partial_payment" } }, false]
  ];
  for (const [payload, expected] of cases) {
    const result = parseReportGateCallback(payload);
    assert.ok(result.success);
    assert.equal(isReportGatePaid(result.data), expected);
  }
});

test("report checkout sends a stable order and rejects a foreign redirect or changed price", async (t) => {
  const id = randomUUID();
  let checkout = { id, url: `https://pay.enchantstartup.com/checkout/${id}`, amount: 300, currency: "USD",
    metadata: { callback_contract: "payment_gate_signed_v1" } };
  t.mock.method(globalThis, "fetch", async (url: string, options: RequestInit) => {
    assert.equal(url, "https://api.enchantstartup.com/v1/payments/checkout");
    assert.equal(new Headers(options.headers).get("Idempotency-Key"), "orken-report:order-1");
    const payload = JSON.parse(String(options.body));
    assert.equal(payload.amount, 300);
    assert.equal(payload.metadata.orken_report_order, "order-1");
    return Response.json(checkout);
  });
  const order = { id: "order-1", analysisId: "report-1", amount: 300, currency: "usd" };
  assert.equal((await createReportGateCheckout(order, "test-key")).gateCheckoutId, id);
  checkout = { ...checkout, url: `https://foreign.example/checkout/${id}` };
  await assert.rejects(createReportGateCheckout(order, "test-key"), /inconsistent checkout/);
  checkout = { ...checkout, url: `https://pay.enchantstartup.com/checkout/${id}`, amount: 400 };
  await assert.rejects(createReportGateCheckout(order, "test-key"), /inconsistent checkout/);
});
