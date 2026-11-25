import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import test from "node:test";
import Fastify from "fastify";
import rawBody from "fastify-raw-body";

const secret = "synthetic-report-callback-signing-secret";
process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/orken_test";
process.env.REPORT_PAYMENT_GATE_CALLBACK_SECRET = secret;
const { prisma } = await import("../lib/prisma.js");
const { paymentRoutes } = await import("./payments.js");

test("report fulfillment binds the signed callback to one order and counts replays once", async (t) => {
  const app = Fastify();
  t.after(() => app.close());
  await app.register(rawBody, { field: "rawBody", global: false, encoding: false, runFirst: true });
  await app.register(paymentRoutes);
  const payment = {
    id: "order-1", viaPaymentGate: true, gateCheckoutId: randomUUID(), gateProvider: null as string | null,
    amount: 300, currency: "usd", status: "PENDING", userId: null, analysisId: "analysis-1", promoCodeId: "promo-1"
  };
  let analytics = 0;
  let redemptions = 0;
  const previousFind = prisma.payment.findUnique;
  prisma.payment.findUnique = t.mock.fn(async ({ where }: { where: { id: string } }) => where.id === payment.id ? { ...payment } : null) as unknown as typeof previousFind;
  t.after(() => { prisma.payment.findUnique = previousFind; });
  const previousTransaction = prisma.$transaction;
  prisma.$transaction = t.mock.fn(async (run: (tx: object) => Promise<unknown>) => run({
    payment: { updateMany: async ({ where, data }: { where: { id: string; status: string }; data: object }) => {
      if (where.id !== payment.id || where.status !== payment.status) return { count: 0 };
      Object.assign(payment, data);
      return { count: 1 };
    } },
    promoCode: { update: async () => { redemptions += 1; } },
    analysis: { findUniqueOrThrow: async () => ({ locale: "en", sessionId: "session-1" }) },
    analyticsEvent: { create: async () => { analytics += 1; } }
  })) as unknown as typeof previousTransaction;
  t.after(() => { prisma.$transaction = previousTransaction; });
  const event = {
    id: randomUUID(), schema_version: "1", payment_session_id: payment.gateCheckoutId, provider_session_id: "cs_synthetic",
    provider: "stripe", event_type: "checkout.session.completed", status: "paid", amount: 300, currency: "usd",
    metadata: { orken_report_order: payment.id }
  };
  const send = (event: object, signingSecret = secret) => {
    const payload = JSON.stringify(event);
    const timestamp = String(Math.floor(Date.now() / 1000));
    return app.inject({ method: "POST", url: "/api/webhooks/payment-gate", payload, headers: {
      "content-type": "application/json", "x-payment-gate-contract": "payment_gate_signed_v1",
      "x-payment-gate-timestamp": timestamp,
      "x-payment-gate-signature": createHmac("sha256", signingSecret).update(`${timestamp}.${payload}`).digest("hex")
    } });
  };
  assert.equal((await send(event, "invalid-signing-secret")).statusCode, 401);
  assert.equal((await send({ ...event, payment_session_id: randomUUID() })).statusCode, 409);
  assert.equal((await send({ ...event, amount: 299 })).statusCode, 409);
  assert.equal((await send({ ...event, status: "unpaid" })).statusCode, 200);
  assert.equal(payment.status, "PENDING");
  assert.equal((await send(event)).statusCode, 200);
  assert.equal((await send(event)).statusCode, 200);
  assert.equal(payment.status, "SUCCEEDED");
  assert.equal(payment.gateProvider, "stripe");
  assert.equal(analytics, 1);
  assert.equal(redemptions, 1);
});
