import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const apiUrl = "https://api.enchantstartup.com/v1/payments/checkout";
const callbackUrl = "https://orken.life/api/webhooks/payment-gate";
const checkoutOrigin = "https://pay.enchantstartup.com";
const contract = "payment_gate_signed_v1";

const gateCheckoutSchema = z.object({
  id: z.uuid(), url: z.url(), amount: z.number().int().positive(), currency: z.string(),
  metadata: z.object({ callback_contract: z.literal(contract) })
});
const settlementSchema = z.object({
  id: z.uuid(),
  schema_version: z.literal("1"),
  payment_session_id: z.uuid(),
  provider_session_id: z.string().min(1).nullable(),
  provider: z.enum(["stripe", "betatransfer"]),
  event_type: z.string(),
  status: z.string().nullable(),
  amount: z.number().int().nonnegative().nullable(),
  currency: z.string().nullable(),
  metadata: z.object({ orken_report_order: z.string().min(1), raw_status: z.string().nullable().optional() })
});

export type GateSettlement = z.infer<typeof settlementSchema>;

export function verifyReportGateCallback(
  rawBody: unknown,
  headers: Record<string, string | string[] | undefined>,
  secret: string,
  now = Math.floor(Date.now() / 1000)
) {
  const timestamp = headers["x-payment-gate-timestamp"];
  const signature = headers["x-payment-gate-signature"];
  if (!Buffer.isBuffer(rawBody) || Buffer.byteLength(secret, "utf8") < 32 || headers["x-payment-gate-contract"] !== contract ||
      typeof timestamp !== "string" || !/^\d{10}$/.test(timestamp) || Math.abs(now - Number(timestamp)) > 300 ||
      typeof signature !== "string" || !/^[a-f0-9]{64}$/.test(signature)) return false;
  const digest = createHmac("sha256", secret).update(`${timestamp}.`).update(rawBody).digest();
  return timingSafeEqual(digest, Buffer.from(signature, "hex"));
}

export function parseReportGateCallback(body: unknown) {
  return settlementSchema.safeParse(body);
}

export function isReportGatePaid(event: GateSettlement) {
  if (!event.provider_session_id) return false;
  if (event.provider === "stripe") {
    return event.status === "paid" && ["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(event.event_type);
  }
  return event.event_type === "payment.updated" && event.status === "completed" &&
    ["success", "completed", "paid", "succeeded"].includes(event.metadata.raw_status?.trim().toLowerCase() ?? "");
}

export async function createReportGateCheckout(input: { id: string; analysisId: string; amount: number; currency: string }, key: string) {
  const report = encodeURIComponent(input.analysisId);
  const response = await fetch(apiUrl, {
    method: "POST",
    redirect: "error",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": `orken-report:${input.id}` },
    body: JSON.stringify({
      domain: "orken.life",
      amount: input.amount,
      currency: input.currency,
      line_items: [{ name: "ORKEN.LIFE PRO report", amount: input.amount, currency: input.currency, quantity: 1 }],
      success_url: `https://orken.life/report/${report}/full?payment=processing`,
      cancel_url: `https://orken.life/pay/${report}`,
      metadata: { order_id: input.id, orken_report_order: input.id, product_callback_url: callbackUrl }
    }),
    signal: AbortSignal.timeout(12000)
  });
  if (!response.ok) throw new Error(`Payment Gate checkout returned HTTP ${response.status}`);
  const checkout = gateCheckoutSchema.parse(await response.json());
  const url = new URL(checkout.url);
  if (url.origin !== checkoutOrigin || url.username || url.password || url.pathname !== `/checkout/${checkout.id}` ||
      checkout.amount !== input.amount || checkout.currency.toLowerCase() !== input.currency.toLowerCase()) {
    throw new Error("Payment Gate returned an inconsistent checkout");
  }
  return { gateCheckoutId: checkout.id, gateCheckoutUrl: url.href };
}
