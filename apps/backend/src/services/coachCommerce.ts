import { createHash } from "node:crypto";
import Stripe from "stripe";
import { env } from "../env.js";
import { prisma } from "../lib/prisma.js";
import { getActiveCoachSubscription, listCoachPlans } from "./coachPlatform.js";
import { recordCoachCommerceConversion, recordCoachCommerceConversionReversal } from "./partnerCore.js";
import { coachConsultationRefundAmount, hasValidCoachRevenueSplit } from "./coachRules.js";

const DAY_MS = 86_400_000;
export const COACH_CONSULTATION_CANCEL_HOURS_KEY = "coach_consultation_cancel_hours";
export const COACH_CONSULTATION_REFUND_PERCENT_KEY = "coach_consultation_refund_percent";
export const coachStripe = env.STRIPE_SECRET_KEY ? new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" }) : null;

export async function createCoachSubscriptionCheckout(input: { coachProfileId: string; planId: string; idempotencyKey: string }) {
  const existing = await prisma.coachSubscription.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing?.stripeCheckoutSessionId && coachStripe) {
    const checkout = await coachStripe.checkout.sessions.retrieve(existing.stripeCheckoutSessionId);
    return { subscription: existing, url: checkout.url };
  }
  const plan = (await listCoachPlans(input.coachProfileId)).find((item) => item.id === input.planId);
  if (!plan || plan.customQuote || !plan.includedClients) throw new Error("Этот пакет подключается через индивидуальный расчёт");
  const subscription = existing ?? await prisma.coachSubscription.create({
    data: {
      coachProfileId: input.coachProfileId,
      planId: plan.id,
      priceVersionId: plan.priceVersionId,
      amount: plan.amount,
      currency: plan.currency,
      clientLimit: plan.includedClients,
      idempotencyKey: input.idempotencyKey
    }
  });
  if (!coachStripe) {
    if (!env.DEV_TOOLS_ENABLED) throw new Error("Stripe is not configured");
    const now = new Date();
    const active = await prisma.coachSubscription.update({
      where: { id: subscription.id },
      data: { status: "ACTIVE", currentPeriodStart: now, currentPeriodEnd: new Date(now.getTime() + 30 * DAY_MS) }
    });
    return { subscription: active, url: `${env.APP_ORIGIN}/coach?subscription=active` };
  }
  const checkout = await coachStripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{
      quantity: 1,
      ...(plan.stripePriceId ? { price: plan.stripePriceId } : { price_data: {
        currency: plan.currency,
        unit_amount: plan.amount,
        recurring: { interval: "month" },
        product_data: { name: `ORKEN для коучей: ${plan.name}` }
      } })
    }],
    success_url: `${env.APP_ORIGIN}/coach?subscription=active&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${env.APP_ORIGIN}/coach?subscription=cancelled`,
    metadata: { kind: "coach_subscription", coachSubscriptionId: subscription.id, coachProfileId: input.coachProfileId },
    subscription_data: { metadata: { kind: "coach_subscription", coachSubscriptionId: subscription.id, coachProfileId: input.coachProfileId } }
  }, { idempotencyKey: input.idempotencyKey });
  const updated = await prisma.coachSubscription.update({
    where: { id: subscription.id },
    data: { stripeCheckoutSessionId: checkout.id }
  });
  return { subscription: updated, url: checkout.url };
}

export async function createCoachServiceCheckout(input: { offerId: string; userId: string; idempotencyKey: string }) {
  const existing = await prisma.coachServiceOrder.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing?.stripeCheckoutSessionId && coachStripe) {
    const checkout = await coachStripe.checkout.sessions.retrieve(existing.stripeCheckoutSessionId);
    return { order: existing, url: checkout.url };
  }
  const offer = await prisma.coachServiceOffer.findFirst({
    where: { id: input.offerId, status: "APPROVED", paymentModel: "CLIENT_PAID", coachProfile: { status: "APPROVED", acceptingOrders: true } },
    include: { coachProfile: { include: { calendlyConnection: true, googleCalendarConnection: true, scheduleSettings: true } } }
  });
  if (!offer) throw new Error("Услуга сейчас недоступна");
  if (!env.COACH_PAYOUT_PARTNER_CORE_PROGRAM_ID || !offer.coachProfile.partnerCorePayoutReferralCode) throw new Error("Выплаты коучу ещё не настроены");
  if (!hasValidCoachRevenueSplit(offer.coachShareBps, offer.platformShareBps)) throw new Error("Для услуги не настроено распределение оплаты");
  const schedulingProvider = offer.coachProfile.scheduleSettings?.provider ?? "ORKEN";
  if (offer.type === "CONSULTATION" && schedulingProvider === "GOOGLE" && offer.coachProfile.googleCalendarConnection?.status !== "ACTIVE") {
    throw new Error("Коуч ещё не подключил Google Calendar");
  }
  if (offer.type === "CONSULTATION" && schedulingProvider === "CALENDLY" && (offer.coachProfile.calendlyConnection?.status !== "ACTIVE" || !offer.calendlyEventTypeUri || !offer.calendlySchedulingUrl)) {
    throw new Error("Calendly коуча пока не настроен");
  }
  const order = existing ?? await prisma.coachServiceOrder.create({
    data: {
      offerId: offer.id,
      userId: input.userId,
      amount: offer.amount,
      currency: offer.currency,
      coachShareBpsSnapshot: offer.coachShareBps!,
      platformShareBpsSnapshot: offer.platformShareBps!,
      idempotencyKey: input.idempotencyKey
    }
  });
  if (!coachStripe) {
    if (!env.DEV_TOOLS_ENABLED) throw new Error("Stripe is not configured");
    await activateCoachServiceOrder(order.id, null, null);
    return { order: await prisma.coachServiceOrder.findUniqueOrThrow({ where: { id: order.id } }), url: `${env.APP_ORIGIN}/habits?tab=coaching&order=${order.id}` };
  }
  const recurring = offer.type === "ONGOING_SUPPORT" ? { interval: "month" as const } : undefined;
  const checkout = await coachStripe.checkout.sessions.create({
    mode: recurring ? "subscription" : "payment",
    line_items: [{
      quantity: 1,
      price_data: {
        currency: offer.currency,
        unit_amount: offer.amount,
        ...(recurring ? { recurring } : {}),
        product_data: { name: offer.title, description: offer.description.slice(0, 500) }
      }
    }],
    success_url: `${env.APP_ORIGIN}/habits?tab=coaching&coach_order=${order.id}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${env.APP_ORIGIN}/coaches/${encodeURIComponent(offer.coachProfile.slug)}?payment=cancelled`,
    customer_email: (await prisma.user.findUnique({ where: { id: input.userId }, select: { email: true } }))?.email,
    metadata: { kind: "coach_service", coachOrderId: order.id, userId: input.userId },
    ...(recurring ? { subscription_data: { metadata: { kind: "coach_service", coachOrderId: order.id, userId: input.userId } } } : {})
  }, { idempotencyKey: input.idempotencyKey });
  const updated = await prisma.coachServiceOrder.update({ where: { id: order.id }, data: { stripeCheckoutSessionId: checkout.id } });
  return { order: updated, url: checkout.url };
}

async function activateCoachServiceOrder(orderId: string, paymentIntentId: string | null, subscriptionId: string | null) {
  const order = await prisma.coachServiceOrder.findUniqueOrThrow({ where: { id: orderId }, include: { offer: true } });
  const program = await prisma.habitProgram.findFirst({ where: { userId: order.userId, status: "ACTIVE" }, orderBy: { createdAt: "desc" } });
  const relationship = order.offer.type === "ONGOING_SUPPORT"
    ? await prisma.coachClientRelationship.findFirst({ where: { coachProfileId: order.offer.coachProfileId, userId: order.userId, status: { in: ["PENDING", "ACTIVE"] } } })
      ?? await prisma.coachClientRelationship.create({
        data: {
          coachProfileId: order.offer.coachProfileId,
          userId: order.userId,
          habitProgramId: program?.id,
          funding: "CLIENT_PAID",
          status: "PENDING",
          accessEndsAt: subscriptionId ? null : new Date(Date.now() + 30 * DAY_MS)
        }
      })
    : null;
  return prisma.coachServiceOrder.update({
    where: { id: order.id },
    data: {
      relationshipId: relationship?.id,
      stripePaymentIntentId: paymentIntentId,
      stripeSubscriptionId: subscriptionId,
      status: order.offer.type === "CONSULTATION" ? "AWAITING_BOOKING" : "ACTIVE",
      bookingDeadline: order.offer.type === "CONSULTATION" ? new Date(Date.now() + 7 * DAY_MS) : null
    }
  });
}

export async function handleCoachCheckoutCompleted(session: Stripe.Checkout.Session) {
  const kind = session.metadata?.kind;
  if (kind === "coach_subscription" && session.metadata?.coachSubscriptionId) {
    const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id ?? null;
    const stripeSubscription = subscriptionId && coachStripe ? await coachStripe.subscriptions.retrieve(subscriptionId) : null;
    const periodStart = (stripeSubscription as any)?.current_period_start ? new Date(Number((stripeSubscription as any).current_period_start) * 1000) : new Date();
    const periodEnd = (stripeSubscription as any)?.current_period_end ? new Date(Number((stripeSubscription as any).current_period_end) * 1000) : new Date(Date.now() + 30 * DAY_MS);
    const updated = await prisma.coachSubscription.update({
      where: { id: session.metadata.coachSubscriptionId },
      data: {
        status: "ACTIVE",
        stripeSubscriptionId: subscriptionId,
        stripeCustomerId: typeof session.customer === "string" ? session.customer : session.customer?.id,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        graceEndsAt: null
      },
      include: { coachProfile: true }
    });
    return true;
  }
  if (kind === "coach_service" && session.metadata?.coachOrderId) {
    const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;
    const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id ?? null;
    const order = await activateCoachServiceOrder(session.metadata.coachOrderId, paymentIntentId, subscriptionId);
    const details = await prisma.coachServiceOrder.findUnique({
      where: { id: order.id },
      include: { offer: { include: { coachProfile: true } } }
    });
    if (details && !subscriptionId) {
      const coachShare = Math.round(details.amount * details.coachShareBpsSnapshot / 10_000);
      await recordCoachCommerceConversion({
        externalId: session.id,
        partnerCorePartnerId: details.offer.coachProfile.partnerCorePartnerId,
        referralCode: details.offer.coachProfile.partnerCorePayoutReferralCode,
        programId: env.COACH_PAYOUT_PARTNER_CORE_PROGRAM_ID,
        customerRef: coachCustomerRef(details.userId),
        amountPaidCents: coachShare,
        eventType: "coach_service_payment",
        idempotencyKey: `orken:coach-service:${session.id}`
      });
    }
    return true;
  }
  if (kind === "coach_site" && session.metadata?.coachSiteId) {
    const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id ?? null;
    await prisma.coachSite.update({
      where: { id: session.metadata.coachSiteId },
      data: { status: "ACTIVE", stripeCheckoutSessionId: session.id, stripeSubscriptionId: subscriptionId, supportCurrentPeriodEnd: new Date(Date.now() + 30 * DAY_MS), graceEndsAt: null, publishedAt: new Date() }
    });
    return true;
  }
  return false;
}

export async function handleCoachSubscriptionLifecycle(subscription: Stripe.Subscription, deleted: boolean) {
  if (subscription.metadata?.kind === "coach_subscription" && subscription.metadata.coachSubscriptionId) {
    const currentPeriodEnd = (subscription as any).current_period_end ? new Date(Number((subscription as any).current_period_end) * 1000) : new Date();
    await prisma.coachSubscription.update({
      where: { id: subscription.metadata.coachSubscriptionId },
      data: deleted
        ? { status: "GRACE", currentPeriodEnd, graceEndsAt: new Date(currentPeriodEnd.getTime() + 7 * DAY_MS) }
        : { status: subscription.cancel_at_period_end ? "CANCEL_AT_PERIOD_END" : "ACTIVE", currentPeriodEnd, cancelAtPeriodEnd: subscription.cancel_at_period_end }
    });
    return true;
  }
  if (subscription.metadata?.kind === "coach_service" && subscription.metadata.coachOrderId) {
    const order = await prisma.coachServiceOrder.findUnique({ where: { id: subscription.metadata.coachOrderId } });
    if (order && deleted) {
      await prisma.coachServiceOrder.update({ where: { id: order.id }, data: { status: "CANCELLED", cancelledAt: new Date() } });
      if (order.relationshipId) await prisma.coachClientRelationship.update({ where: { id: order.relationshipId }, data: { status: "ENDED", endedAt: new Date(), accessEndsAt: new Date() } });
    }
    return true;
  }
  if (subscription.metadata?.kind === "coach_site" && subscription.metadata.coachSiteId) {
    const currentPeriodEnd = (subscription as any).current_period_end ? new Date(Number((subscription as any).current_period_end) * 1000) : new Date();
    await prisma.coachSite.update({
      where: { id: subscription.metadata.coachSiteId },
      data: deleted
        ? { status: "GRACE", supportCurrentPeriodEnd: currentPeriodEnd, graceEndsAt: new Date(currentPeriodEnd.getTime() + 7 * DAY_MS) }
        : { status: "ACTIVE", supportCurrentPeriodEnd: currentPeriodEnd, graceEndsAt: null }
    });
    return true;
  }
  return false;
}

export async function handleCoachInvoicePaid(invoice: Stripe.Invoice) {
  const invoiceAny = invoice as any;
  const subscriptionId = typeof invoiceAny.subscription === "string" ? invoiceAny.subscription : invoiceAny.subscription?.id;
  if (!subscriptionId || !coachStripe) return false;
  const subscription = await coachStripe.subscriptions.retrieve(subscriptionId).catch(() => null);
  if (!subscription) return false;
  if (subscription.metadata?.kind === "coach_service" && subscription.metadata.coachOrderId) {
    const order = await prisma.coachServiceOrder.findUnique({
      where: { id: subscription.metadata.coachOrderId },
      include: { offer: { include: { coachProfile: true } } }
    });
    if (!order) return true;
    const coachShare = Math.round(Number(invoice.amount_paid ?? 0) * order.coachShareBpsSnapshot / 10_000);
    await recordCoachCommerceConversion({
      externalId: invoice.id,
      partnerCorePartnerId: order.offer.coachProfile.partnerCorePartnerId,
      referralCode: order.offer.coachProfile.partnerCorePayoutReferralCode,
      programId: env.COACH_PAYOUT_PARTNER_CORE_PROGRAM_ID,
      customerRef: coachCustomerRef(order.userId),
      amountPaidCents: coachShare,
      eventType: "coach_service_payment",
      idempotencyKey: `orken:coach-service-invoice:${invoice.id}`
    });
    return true;
  }
  if (subscription.metadata?.kind === "coach_package" || subscription.metadata?.kind === "coach_subscription") {
    const coachSubscriptionId = subscription.metadata.coachSubscriptionId;
    const current = coachSubscriptionId ? await prisma.coachSubscription.findUnique({ where: { id: coachSubscriptionId }, include: { coachProfile: true } }) : null;
    if (current) {
      await recordCoachCommerceConversion({
        externalId: invoice.id,
        partnerCorePartnerId: current.coachProfile.partnerCorePartnerId,
        referralCode: current.coachProfile.referredByReferralCode,
        amountPaidCents: Number(invoice.amount_paid ?? 0),
        eventType: "coach_package_payment",
        idempotencyKey: `orken:coach-package-invoice:${invoice.id}`
      });
    }
    return true;
  }
  if (subscription.metadata?.kind === "coach_site") return true;
  return false;
}

export async function handleCoachConsultationCancelled(orderId: string, scheduledFor?: Date | null) {
  const order = await prisma.coachServiceOrder.findFirst({
    where: { id: orderId, status: { in: ["BOOKED", "AWAITING_BOOKING", "REFUND_PENDING"] } },
    include: { offer: true }
  });
  if (!order || order.offer.type !== "CONSULTATION") return false;
  const [hoursSetting, percentSetting] = await Promise.all([
    prisma.appSetting.findUnique({ where: { key: COACH_CONSULTATION_CANCEL_HOURS_KEY } }),
    prisma.appSetting.findUnique({ where: { key: COACH_CONSULTATION_REFUND_PERCENT_KEY } })
  ]);
  const cancellationHours = numericSetting(hoursSetting?.value, 24, 0, 720);
  const refundPercent = numericSetting(percentSetting?.value, 100, 0, 100);
  const sessionStart = scheduledFor ?? order.scheduledFor;
  const refundAmount = coachConsultationRefundAmount({ amount: order.amount, scheduledFor: sessionStart, cancellationHours, refundPercent });
  if (!refundAmount) {
    await prisma.coachServiceOrder.update({ where: { id: order.id }, data: { status: "CANCELLED", cancelledAt: new Date(), scheduledFor: sessionStart ?? null, refundAmount: 0 } });
    return true;
  }
  await prisma.coachServiceOrder.update({ where: { id: order.id }, data: { status: "REFUND_PENDING", cancelledAt: new Date(), scheduledFor: sessionStart ?? null, refundRequestedAt: new Date(), refundAmount } });
  if (!coachStripe || !order.stripePaymentIntentId) return true;
  await coachStripe.refunds.create({ payment_intent: order.stripePaymentIntentId, amount: refundAmount }, { idempotencyKey: `coach-order-cancel-refund:${order.id}` });
  await prisma.coachServiceOrder.update({ where: { id: order.id }, data: { status: "REFUNDED", refundedAt: new Date() } });
  return true;
}

export async function handleCoachRefund(input: { paymentIntentId?: string | null; invoiceId?: string | null; refundId: string; reason: string }) {
  const order = input.paymentIntentId
    ? await prisma.coachServiceOrder.findFirst({ where: { stripePaymentIntentId: input.paymentIntentId } })
    : null;
  if (!order && !input.invoiceId) return false;
  const invoiceContext = !order && input.invoiceId && coachStripe
    ? await (async () => {
      const invoice = await coachStripe.invoices.retrieve(input.invoiceId!).catch(() => null) as any;
      const subscriptionId = typeof invoice?.subscription === "string" ? invoice.subscription : invoice?.subscription?.id;
      const subscription = subscriptionId ? await coachStripe.subscriptions.retrieve(subscriptionId).catch(() => null) : null;
      return { subscription, order: subscription?.metadata?.coachOrderId ? await prisma.coachServiceOrder.findUnique({ where: { id: subscription.metadata.coachOrderId } }) : null };
    })()
    : null;
  if (!order && invoiceContext?.subscription?.metadata?.coachSubscriptionId) {
    await recordCoachCommerceConversionReversal({ originalExternalId: input.invoiceId!, refundId: input.refundId, reason: input.reason, idempotencyKey: `orken:coach-refund:${input.refundId}` });
    return true;
  }
  const current = order ?? invoiceContext?.order;
  if (!current) return false;
  await prisma.coachServiceOrder.update({ where: { id: current.id }, data: { status: "REFUNDED", refundedAt: new Date() } });
  const originalExternalId = input.invoiceId ?? current.stripeCheckoutSessionId;
  if (originalExternalId) {
    await recordCoachCommerceConversionReversal({
      originalExternalId,
      refundId: input.refundId,
      reason: input.reason,
      idempotencyKey: `orken:coach-refund:${input.refundId}`,
      programId: env.COACH_PAYOUT_PARTNER_CORE_PROGRAM_ID
    });
  }
  return true;
}

export async function createCoachSiteCheckout(input: { coachProfileId: string; planId: string; slug: string }) {
  const plan = await prisma.coachSitePlan.findFirst({ where: { id: input.planId, active: true } });
  if (!plan) throw new Error("Тариф сайта не найден");
  const existing = await prisma.coachSite.findUnique({ where: { slug: input.slug } });
  if (existing && existing.coachProfileId !== input.coachProfileId) throw new Error("Этот адрес уже занят");
  if (existing?.stripeCheckoutSessionId && existing.planId === plan.id && existing.status === "PENDING_PAYMENT" && coachStripe) {
    const checkout = await coachStripe.checkout.sessions.retrieve(existing.stripeCheckoutSessionId);
    return { site: existing, url: checkout.url };
  }
  if (existing && ["ACTIVE", "GRACE"].includes(existing.status)) throw new Error("Сайт уже подключён");
  const site = existing
    ? await prisma.coachSite.update({ where: { id: existing.id }, data: { planId: plan.id, status: "PENDING_PAYMENT" } })
    : await prisma.coachSite.create({ data: { coachProfileId: input.coachProfileId, planId: plan.id, slug: input.slug, status: "PENDING_PAYMENT" } });
  if (!coachStripe) {
    if (!env.DEV_TOOLS_ENABLED) throw new Error("Stripe is not configured");
    const active = await prisma.coachSite.update({ where: { id: site.id }, data: { status: "ACTIVE", publishedAt: new Date(), supportCurrentPeriodEnd: new Date(Date.now() + 30 * DAY_MS) } });
    return { site: active, url: `${env.APP_ORIGIN}/coach?site=active` };
  }
  const checkout = await coachStripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [
      { quantity: 1, price_data: { currency: plan.currency, unit_amount: plan.setupAmount, product_data: { name: `${plan.name}: подключение` } } },
      { quantity: 1, price_data: { currency: plan.currency, unit_amount: plan.monthlySupportAmount, recurring: { interval: "month" }, product_data: { name: `${plan.name}: поддержка` } } }
    ],
    success_url: `${env.APP_ORIGIN}/coach?site=active&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${env.APP_ORIGIN}/coach?site=cancelled`,
    metadata: { kind: "coach_site", coachSiteId: site.id, coachProfileId: input.coachProfileId },
    subscription_data: { metadata: { kind: "coach_site", coachSiteId: site.id, coachProfileId: input.coachProfileId } }
  }, { idempotencyKey: `coach-site:${site.id}:${plan.id}` });
  await prisma.coachSite.update({ where: { id: site.id }, data: { stripeCheckoutSessionId: checkout.id } });
  return { site, url: checkout.url };
}

export async function runCoachCommerceMaintenance() {
  const now = new Date();
  const expiredGrace = await prisma.coachSubscription.findMany({ where: { status: "GRACE", graceEndsAt: { lte: now } }, select: { id: true, coachProfileId: true } });
  for (const subscription of expiredGrace) {
    await prisma.$transaction([
      prisma.coachSubscription.update({ where: { id: subscription.id }, data: { status: "CANCELLED" } }),
      prisma.coachClientRelationship.updateMany({ where: { coachProfileId: subscription.coachProfileId, funding: "COACH_PAID", status: "ACTIVE" }, data: { status: "PAUSED", accessEndsAt: now } })
    ]);
  }
  const expiredSites = await prisma.coachSite.findMany({ where: { status: "GRACE", graceEndsAt: { lte: now } }, select: { id: true } });
  if (expiredSites.length) await prisma.coachSite.updateMany({ where: { id: { in: expiredSites.map((site) => site.id) } }, data: { status: "UNPUBLISHED" } });
  const unbooked = await prisma.coachServiceOrder.findMany({ where: { status: { in: ["AWAITING_BOOKING", "REFUND_PENDING"] }, bookingDeadline: { lte: now } } });
  let refundFailures = 0;
  for (const order of unbooked) {
    if (order.status === "AWAITING_BOOKING") await prisma.coachServiceOrder.update({ where: { id: order.id }, data: { status: "REFUND_PENDING", refundRequestedAt: now, refundAmount: order.amount } });
    if (coachStripe && order.stripePaymentIntentId) {
      try {
        await coachStripe.refunds.create({ payment_intent: order.stripePaymentIntentId }, { idempotencyKey: `coach-order-refund:${order.id}` });
        await prisma.coachServiceOrder.update({ where: { id: order.id }, data: { status: "REFUNDED", refundedAt: new Date() } });
      } catch {
        refundFailures += 1;
      }
    }
  }
  return { expiredSubscriptions: expiredGrace.length, expiredSites: expiredSites.length, unbookedOrders: unbooked.length, refundFailures };
}

function numericSetting(value: unknown, fallback: number, min: number, max: number) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function coachCustomerRef(userId: string) {
  return createHash("sha256").update(`orken-coach-customer:${userId}`).digest("hex");
}

export async function currentCoachSubscription(coachProfileId: string) {
  return getActiveCoachSubscription(coachProfileId);
}
