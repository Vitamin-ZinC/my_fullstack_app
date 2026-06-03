import type { FastifyInstance } from "fastify";
import { z } from "zod";
import Stripe from "stripe";
import { env } from "../env.js";
import { prisma } from "../lib/prisma.js";

const stripe = env.STRIPE_SECRET_KEY ? new Stripe(env.STRIPE_SECRET_KEY) : null;

export async function paymentRoutes(app: FastifyInstance) {
  app.post("/api/payments/create-intent", async (request, reply) => {
    const body = z.object({ analysisId: z.string() }).parse(request.body);
    const analysis = await prisma.analysis.findUnique({
      where: { id: body.analysisId },
      include: { payment: true }
    });
    if (!analysis || analysis.status !== "DONE") return reply.code(400).send({ error: "Analysis not ready" });

    if (!stripe) {
      const payment = await prisma.payment.upsert({
        where: { analysisId: analysis.id },
        update: { status: "SUCCEEDED", paidAt: new Date() },
        create: {
          analysisId: analysis.id,
          stripePaymentIntentId: `dev_${analysis.id}`,
          amount: env.PRICE_AMOUNT,
          currency: env.PRICE_CURRENCY,
          status: "SUCCEEDED",
          paidAt: new Date()
        }
      });
      return { clientSecret: "dev_client_secret", paymentIntentId: payment.stripePaymentIntentId };
    }

    const intent = await stripe.paymentIntents.create({
      amount: env.PRICE_AMOUNT,
      currency: env.PRICE_CURRENCY,
      metadata: { analysisId: analysis.id, sessionId: analysis.sessionId }
    });
    await prisma.payment.upsert({
      where: { analysisId: analysis.id },
      update: { stripePaymentIntentId: intent.id, status: "PENDING" },
      create: {
        analysisId: analysis.id,
        stripePaymentIntentId: intent.id,
        amount: env.PRICE_AMOUNT,
        currency: env.PRICE_CURRENCY
      }
    });
    return { clientSecret: intent.client_secret, paymentIntentId: intent.id };
  });

  app.post("/api/webhooks/stripe", { config: { rawBody: true } }, async (request, reply) => {
    if (!stripe || !env.STRIPE_WEBHOOK_SECRET) return reply.code(501).send({ error: "Stripe is not configured" });
    const signature = request.headers["stripe-signature"];
    if (!signature || Array.isArray(signature)) return reply.code(400).send({ error: "Missing stripe-signature" });

    let event: Stripe.Event;
    try {
      const rawBody = (request as any).rawBody ?? Buffer.from(JSON.stringify(request.body ?? {}));
      event = stripe.webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid webhook";
      return reply.code(400).send(`Webhook Error: ${message}`);
    }

    if (event.type === "payment_intent.succeeded") {
      const intent = event.data.object as Stripe.PaymentIntent;
      await prisma.payment.update({
        where: { stripePaymentIntentId: intent.id },
        data: { status: "SUCCEEDED", paidAt: new Date() }
      });
    }
    if (event.type === "payment_intent.payment_failed") {
      const intent = event.data.object as Stripe.PaymentIntent;
      await prisma.payment.update({
        where: { stripePaymentIntentId: intent.id },
        data: { status: "FAILED" }
      });
    }
    return { received: true };
  });
}
