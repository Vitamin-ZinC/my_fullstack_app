import type { FastifyInstance } from "fastify";
import { z } from "zod";
import Stripe from "stripe";
import { env } from "../env.js";
import { requireAnalysisAccess } from "../lib/auth.js";
import { prisma } from "../lib/prisma.js";
import { calculatePromoDiscount, normalizePromoCode, validatePromoCode } from "../services/promoCodes.js";

const stripe = env.STRIPE_SECRET_KEY ? new Stripe(env.STRIPE_SECRET_KEY) : null;

const createIntentSchema = z.object({
  analysisId: z.string(),
  promoCode: z.string().trim().min(1).max(64).optional()
});

async function resolvePromoDiscount(rawCode: string | undefined, amount: number, currency: string) {
  if (!rawCode) {
    return { promo: null, discountAmount: 0 };
  }

  const code = normalizePromoCode(rawCode);
  const promo = await prisma.promoCode.findUnique({ where: { code } });
  validatePromoCode(promo, amount, currency);

  return {
    promo,
    discountAmount: calculatePromoDiscount(promo!, amount)
  };
}

export async function paymentRoutes(app: FastifyInstance) {
  app.post("/api/payments/create-intent", async (request, reply) => {
    const body = createIntentSchema.parse(request.body);
    const access = await requireAnalysisAccess(request, reply, body.analysisId);
    if (!access) return;
    const analysis = access.analysis;
    if (!analysis || analysis.status !== "DONE") return reply.code(400).send({ error: "Analysis not ready" });
    if (analysis.payment?.status === "SUCCEEDED") {
      return {
        clientSecret: null,
        paymentIntentId: analysis.payment.stripePaymentIntentId,
        status: analysis.payment.status,
        amount: analysis.payment.amount,
        originalAmount: analysis.payment.originalAmount ?? analysis.payment.amount,
        discountAmount: analysis.payment.discountAmount,
        currency: analysis.payment.currency,
        promoCode: null
      };
    }

    let promoResult: Awaited<ReturnType<typeof resolvePromoDiscount>>;
    try {
      promoResult = await resolvePromoDiscount(body.promoCode, env.PRICE_AMOUNT, env.PRICE_CURRENCY);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid promo code";
      return reply.code(400).send({ error: message });
    }
    const finalAmount = env.PRICE_AMOUNT - promoResult.discountAmount;
    if (env.PRICE_CURRENCY.toLowerCase() === "usd" && finalAmount > 0 && finalAmount < 50) {
      return reply.code(400).send({ error: "Discounted amount is below Stripe minimum charge" });
    }

    if (!stripe) {
      if (env.NODE_ENV === "production" || !env.DEV_TOOLS_ENABLED) {
        return reply.code(501).send({ error: "Stripe is not configured" });
      }
      const payment = await prisma.payment.upsert({
        where: { analysisId: analysis.id },
        update: {
          status: "SUCCEEDED",
          originalAmount: env.PRICE_AMOUNT,
          discountAmount: promoResult.discountAmount,
          amount: finalAmount,
          currency: env.PRICE_CURRENCY,
          promoCodeId: promoResult.promo?.id ?? null,
          paidAt: new Date()
        },
        create: {
          analysisId: analysis.id,
          stripePaymentIntentId: `dev_${analysis.id}`,
          originalAmount: env.PRICE_AMOUNT,
          discountAmount: promoResult.discountAmount,
          amount: finalAmount,
          currency: env.PRICE_CURRENCY,
          status: "SUCCEEDED",
          promoCodeId: promoResult.promo?.id ?? null,
          userId: analysis.userId,
          paidAt: new Date()
        }
      });
      return {
        clientSecret: "dev_client_secret",
        paymentIntentId: payment.stripePaymentIntentId,
        status: payment.status,
        amount: payment.amount,
        originalAmount: payment.originalAmount ?? env.PRICE_AMOUNT,
        discountAmount: payment.discountAmount,
        currency: payment.currency,
        promoCode: promoResult.promo?.code ?? null
      };
    }

    if (finalAmount === 0) {
      const payment = await prisma.$transaction(async (tx) => {
        const nextPayment = await tx.payment.upsert({
          where: { analysisId: analysis.id },
          update: {
            stripePaymentIntentId: `promo_${analysis.id}_${Date.now()}`,
            status: "SUCCEEDED",
            originalAmount: env.PRICE_AMOUNT,
            discountAmount: promoResult.discountAmount,
            amount: 0,
            currency: env.PRICE_CURRENCY,
            promoCodeId: promoResult.promo?.id ?? null,
            paidAt: new Date()
          },
          create: {
            analysisId: analysis.id,
            stripePaymentIntentId: `promo_${analysis.id}_${Date.now()}`,
            originalAmount: env.PRICE_AMOUNT,
            discountAmount: promoResult.discountAmount,
            amount: 0,
            currency: env.PRICE_CURRENCY,
            status: "SUCCEEDED",
            promoCodeId: promoResult.promo?.id ?? null,
            userId: analysis.userId,
            paidAt: new Date()
          }
        });
        if (promoResult.promo) {
          await tx.promoCode.update({
            where: { id: promoResult.promo.id },
            data: { redemptions: { increment: 1 } }
          });
        }
        return nextPayment;
      });
      await prisma.analyticsEvent.create({
        data: {
          name: "payment_succeeded",
          locale: analysis.locale,
          sessionId: access.session.id,
          userId: access.session.userId,
          analysisId: analysis.id,
          properties: {
            paymentIntentId: payment.stripePaymentIntentId,
            originalAmount: env.PRICE_AMOUNT,
            discountAmount: promoResult.discountAmount,
            promoCode: promoResult.promo?.code
          }
        }
      });
      return {
        clientSecret: null,
        paymentIntentId: payment.stripePaymentIntentId,
        status: payment.status,
        amount: payment.amount,
        originalAmount: payment.originalAmount ?? env.PRICE_AMOUNT,
        discountAmount: payment.discountAmount,
        currency: payment.currency,
        promoCode: promoResult.promo?.code ?? null
      };
    }

    const intent = await stripe.paymentIntents.create({
      amount: finalAmount,
      currency: env.PRICE_CURRENCY,
      automatic_payment_methods: { enabled: true },
      metadata: {
        analysisId: analysis.id,
        sessionId: analysis.sessionId,
        originalAmount: String(env.PRICE_AMOUNT),
        discountAmount: String(promoResult.discountAmount),
        promoCodeId: promoResult.promo?.id ?? "",
        promoCode: promoResult.promo?.code ?? ""
      }
    });
    await prisma.payment.upsert({
      where: { analysisId: analysis.id },
      update: {
        stripePaymentIntentId: intent.id,
        status: "PENDING",
        originalAmount: env.PRICE_AMOUNT,
        discountAmount: promoResult.discountAmount,
        amount: finalAmount,
        currency: env.PRICE_CURRENCY,
        promoCodeId: promoResult.promo?.id ?? null,
        paidAt: null
      },
      create: {
        analysisId: analysis.id,
        stripePaymentIntentId: intent.id,
        originalAmount: env.PRICE_AMOUNT,
        discountAmount: promoResult.discountAmount,
        amount: finalAmount,
        currency: env.PRICE_CURRENCY,
        promoCodeId: promoResult.promo?.id ?? null,
        userId: analysis.userId
      }
    });
    await prisma.analyticsEvent.create({
      data: {
        name: "payment_started",
        locale: analysis.locale,
        sessionId: access.session.id,
        userId: access.session.userId,
        analysisId: analysis.id,
        properties: {
          paymentIntentId: intent.id,
          originalAmount: env.PRICE_AMOUNT,
          discountAmount: promoResult.discountAmount,
          amount: finalAmount,
          promoCode: promoResult.promo?.code
        }
      }
    });
    return {
      clientSecret: intent.client_secret,
      paymentIntentId: intent.id,
      status: "PENDING",
      amount: finalAmount,
      originalAmount: env.PRICE_AMOUNT,
      discountAmount: promoResult.discountAmount,
      currency: env.PRICE_CURRENCY,
      promoCode: promoResult.promo?.code ?? null
    };
  });

  app.post("/api/payments/create-checkout-session", async (request, reply) => {
    const body = createIntentSchema.parse(request.body);
    const access = await requireAnalysisAccess(request, reply, body.analysisId);
    if (!access) return;
    const analysis = access.analysis;
    if (!analysis || analysis.status !== "DONE") return reply.code(400).send({ error: "Analysis not ready" });
    if (!stripe) return reply.code(501).send({ error: "Stripe is not configured" });
    if (analysis.payment?.status === "SUCCEEDED") {
      return {
        url: `${env.APP_ORIGIN}/report/${analysis.id}/full`,
        sessionId: analysis.payment.stripeCheckoutSessionId ?? analysis.payment.stripePaymentIntentId,
        amount: analysis.payment.amount,
        originalAmount: analysis.payment.originalAmount ?? analysis.payment.amount,
        discountAmount: analysis.payment.discountAmount,
        currency: analysis.payment.currency,
        promoCode: null
      };
    }

    let promoResult: Awaited<ReturnType<typeof resolvePromoDiscount>>;
    try {
      promoResult = await resolvePromoDiscount(body.promoCode, env.PRICE_AMOUNT, env.PRICE_CURRENCY);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid promo code";
      return reply.code(400).send({ error: message });
    }
    const finalAmount = env.PRICE_AMOUNT - promoResult.discountAmount;
    if (env.PRICE_CURRENCY.toLowerCase() === "usd" && finalAmount > 0 && finalAmount < 50) {
      return reply.code(400).send({ error: "Discounted amount is below Stripe minimum charge" });
    }

    if (finalAmount === 0) {
      const payment = await prisma.$transaction(async (tx) => {
        const paymentIntentId = `promo_${analysis.id}_${Date.now()}`;
        const nextPayment = await tx.payment.upsert({
          where: { analysisId: analysis.id },
          update: {
            stripePaymentIntentId: paymentIntentId,
            stripeCheckoutSessionId: null,
            status: "SUCCEEDED",
            originalAmount: env.PRICE_AMOUNT,
            discountAmount: promoResult.discountAmount,
            amount: 0,
            currency: env.PRICE_CURRENCY,
            promoCodeId: promoResult.promo?.id ?? null,
            paidAt: new Date()
          },
          create: {
            analysisId: analysis.id,
            stripePaymentIntentId: paymentIntentId,
            originalAmount: env.PRICE_AMOUNT,
            discountAmount: promoResult.discountAmount,
            amount: 0,
            currency: env.PRICE_CURRENCY,
            status: "SUCCEEDED",
            promoCodeId: promoResult.promo?.id ?? null,
            userId: analysis.userId,
            paidAt: new Date()
          }
        });
        if (promoResult.promo) {
          await tx.promoCode.update({
            where: { id: promoResult.promo.id },
            data: { redemptions: { increment: 1 } }
          });
        }
        return nextPayment;
      });
      return {
        url: `${env.APP_ORIGIN}/report/${analysis.id}/full`,
        sessionId: payment.stripePaymentIntentId,
        amount: payment.amount,
        originalAmount: payment.originalAmount ?? env.PRICE_AMOUNT,
        discountAmount: payment.discountAmount,
        currency: payment.currency,
        promoCode: promoResult.promo?.code ?? null
      };
    }

    const metadata = {
      analysisId: analysis.id,
      sessionId: analysis.sessionId,
      originalAmount: String(env.PRICE_AMOUNT),
      discountAmount: String(promoResult.discountAmount),
      promoCodeId: promoResult.promo?.id ?? "",
      promoCode: promoResult.promo?.code ?? ""
    };
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      client_reference_id: analysis.id,
      success_url: `${env.APP_ORIGIN}/report/${analysis.id}/full?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${env.APP_ORIGIN}/pay/${analysis.id}`,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: env.PRICE_CURRENCY,
          unit_amount: finalAmount,
          product_data: {
            name: "LevelUP.AI PRO report"
          }
        }
      }],
      metadata,
      payment_intent_data: { metadata }
    });
    const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : `checkout_${session.id}`;
    await prisma.payment.upsert({
      where: { analysisId: analysis.id },
      update: {
        stripePaymentIntentId: paymentIntentId,
        stripeCheckoutSessionId: session.id,
        status: "PENDING",
        originalAmount: env.PRICE_AMOUNT,
        discountAmount: promoResult.discountAmount,
        amount: finalAmount,
        currency: env.PRICE_CURRENCY,
        promoCodeId: promoResult.promo?.id ?? null,
        paidAt: null
      },
      create: {
        analysisId: analysis.id,
        stripePaymentIntentId: paymentIntentId,
        stripeCheckoutSessionId: session.id,
        originalAmount: env.PRICE_AMOUNT,
        discountAmount: promoResult.discountAmount,
        amount: finalAmount,
        currency: env.PRICE_CURRENCY,
        promoCodeId: promoResult.promo?.id ?? null,
        userId: analysis.userId
      }
    });
    await prisma.analyticsEvent.create({
      data: {
        name: "checkout_started",
        locale: analysis.locale,
        sessionId: access.session.id,
        userId: access.session.userId,
        analysisId: analysis.id,
        properties: {
          checkoutSessionId: session.id,
          paymentIntentId,
          originalAmount: env.PRICE_AMOUNT,
          discountAmount: promoResult.discountAmount,
          amount: finalAmount,
          promoCode: promoResult.promo?.code
        }
      }
    });
    if (!session.url) return reply.code(502).send({ error: "Stripe Checkout did not return a redirect URL" });
    return {
      url: session.url,
      sessionId: session.id,
      amount: finalAmount,
      originalAmount: env.PRICE_AMOUNT,
      discountAmount: promoResult.discountAmount,
      currency: env.PRICE_CURRENCY,
      promoCode: promoResult.promo?.code ?? null
    };
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
      const payment = await prisma.$transaction(async (tx) => {
        const current = await tx.payment.findFirst({
          where: {
            OR: [
              { stripePaymentIntentId: intent.id },
              ...(intent.metadata.analysisId ? [{ analysisId: intent.metadata.analysisId }] : [])
            ]
          }
        });
        if (!current) throw new Error(`Payment record not found for PaymentIntent ${intent.id}`);
        const nextPayment = await tx.payment.update({
          where: { id: current.id },
          data: { stripePaymentIntentId: intent.id, status: "SUCCEEDED", paidAt: new Date() }
        });
        if (current?.status !== "SUCCEEDED" && nextPayment.promoCodeId) {
          await tx.promoCode.update({
            where: { id: nextPayment.promoCodeId },
            data: { redemptions: { increment: 1 } }
          });
        }
        return nextPayment;
      });
      await prisma.analyticsEvent.create({
        data: {
          name: "payment_succeeded",
          analysisId: payment.analysisId,
          userId: payment.userId,
          properties: {
            paymentIntentId: intent.id,
            amount: payment.amount,
            originalAmount: payment.originalAmount,
            discountAmount: payment.discountAmount,
            currency: payment.currency,
            promoCodeId: payment.promoCodeId
          }
        }
      });
    }
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : undefined;
      const payment = await prisma.$transaction(async (tx) => {
        const current = await tx.payment.findFirst({
          where: {
            OR: [
              { stripeCheckoutSessionId: session.id },
              ...(session.client_reference_id ? [{ analysisId: session.client_reference_id }] : [])
            ]
          }
        });
        if (!current) throw new Error(`Payment record not found for Checkout Session ${session.id}`);
        const nextPayment = await tx.payment.update({
          where: { id: current.id },
          data: {
            ...(paymentIntentId ? { stripePaymentIntentId: paymentIntentId } : {}),
            stripeCheckoutSessionId: session.id,
            status: "SUCCEEDED",
            paidAt: new Date()
          }
        });
        if (current.status !== "SUCCEEDED" && nextPayment.promoCodeId) {
          await tx.promoCode.update({
            where: { id: nextPayment.promoCodeId },
            data: { redemptions: { increment: 1 } }
          });
        }
        return nextPayment;
      });
      await prisma.analyticsEvent.create({
        data: {
          name: "checkout_completed",
          analysisId: payment.analysisId,
          userId: payment.userId,
          properties: {
            checkoutSessionId: session.id,
            paymentIntentId,
            amount: payment.amount,
            originalAmount: payment.originalAmount,
            discountAmount: payment.discountAmount,
            currency: payment.currency,
            promoCodeId: payment.promoCodeId
          }
        }
      });
    }
    if (event.type === "payment_intent.payment_failed") {
      const intent = event.data.object as Stripe.PaymentIntent;
      const payment = await prisma.payment.findFirst({
        where: {
          OR: [
            { stripePaymentIntentId: intent.id },
            ...(intent.metadata.analysisId ? [{ analysisId: intent.metadata.analysisId }] : [])
          ]
        }
      });
      if (payment) {
        await prisma.payment.update({
          where: { id: payment.id },
          data: { stripePaymentIntentId: intent.id, status: "FAILED" }
        });
      }
    }
    return { received: true };
  });
}
