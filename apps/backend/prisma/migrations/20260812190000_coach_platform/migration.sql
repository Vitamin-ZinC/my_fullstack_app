-- CreateEnum
CREATE TYPE "CoachProfileStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "CoachPriceMigrationMode" AS ENUM ('NEW_ONLY', 'NEXT_RENEWAL');

-- CreateEnum
CREATE TYPE "CoachSubscriptionStatus" AS ENUM ('PENDING', 'ACTIVE', 'CANCEL_AT_PERIOD_END', 'PAST_DUE', 'GRACE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CoachClientFunding" AS ENUM ('COACH_PAID', 'CLIENT_PAID');

-- CreateEnum
CREATE TYPE "CoachRelationshipStatus" AS ENUM ('PENDING', 'ACTIVE', 'PAUSED', 'ENDED');

-- CreateEnum
CREATE TYPE "CoachServiceType" AS ENUM ('ONGOING_SUPPORT', 'CONSULTATION');

-- CreateEnum
CREATE TYPE "CoachServicePaymentModel" AS ENUM ('INCLUDED', 'CLIENT_PAID');

-- CreateEnum
CREATE TYPE "CoachOfferStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'PAUSED');

-- CreateEnum
CREATE TYPE "CoachServiceOrderStatus" AS ENUM ('PENDING_PAYMENT', 'AWAITING_BOOKING', 'BOOKED', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'REFUND_PENDING', 'REFUNDED', 'FAILED');

-- CreateEnum
CREATE TYPE "CoachMessageAuthorRole" AS ENUM ('COACH', 'CLIENT');

-- CreateEnum
CREATE TYPE "CoachAssignmentStatus" AS ENUM ('OPEN', 'COMPLETED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "CoachHabitAssignmentStatus" AS ENUM ('PROPOSED', 'ACTIVE', 'DECLINED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CoachSiteStatus" AS ENUM ('DRAFT', 'PENDING_PAYMENT', 'ACTIVE', 'GRACE', 'UNPUBLISHED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "CoachDomainStatus" AS ENUM ('NOT_CONFIGURED', 'PENDING_VERIFICATION', 'VERIFIED', 'FAILED');

-- CreateEnum
CREATE TYPE "CoachIntegrationStatus" AS ENUM ('ACTIVE', 'DISCONNECTED', 'ERROR');

-- CreateEnum
CREATE TYPE "CoachRewardStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'PAUSED');

-- CreateEnum
CREATE TYPE "CoachRewardRedemptionStatus" AS ENUM ('FULFILLED', 'REFUNDED', 'FAILED');

-- CreateTable
CREATE TABLE "CoachProfile" (
    "id" TEXT NOT NULL,
    "partnerCorePartnerId" TEXT NOT NULL,
    "partnerCorePayoutReferralCode" TEXT,
    "referredByReferralCode" TEXT,
    "slug" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "headline" TEXT,
    "bio" TEXT,
    "city" TEXT,
    "specializations" JSONB,
    "languages" JSONB,
    "avatarUrl" TEXT,
    "coverImageUrl" TEXT,
    "status" "CoachProfileStatus" NOT NULL DEFAULT 'DRAFT',
    "acceptingOrders" BOOLEAN NOT NULL DEFAULT false,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "moderationNote" TEXT,
    "publicSince" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoachProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoachPlan" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "stripeProductId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "includedClients" INTEGER,
    "customQuote" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoachPlan_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CoachPlan_stripeProductId_key" ON "CoachPlan"("stripeProductId");

-- CreateTable
CREATE TABLE "CoachPlanPriceVersion" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "stripePriceId" TEXT,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "migrationMode" "CoachPriceMigrationMode" NOT NULL DEFAULT 'NEW_ONLY',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoachPlanPriceVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoachPriceOverride" (
    "id" TEXT NOT NULL,
    "coachProfileId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoachPriceOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoachSubscription" (
    "id" TEXT NOT NULL,
    "coachProfileId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "priceVersionId" TEXT,
    "status" "CoachSubscriptionStatus" NOT NULL DEFAULT 'PENDING',
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "clientLimit" INTEGER,
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "stripeCheckoutSessionId" TEXT,
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "graceEndsAt" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoachSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoachClientInvite" (
    "id" TEXT NOT NULL,
    "coachProfileId" TEXT NOT NULL,
    "email" TEXT,
    "tokenHash" TEXT NOT NULL,
    "funding" "CoachClientFunding" NOT NULL DEFAULT 'COACH_PAID',
    "metricsConsent" BOOLEAN NOT NULL DEFAULT true,
    "journalConsent" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "relationshipId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoachClientInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoachClientRelationship" (
    "id" TEXT NOT NULL,
    "coachProfileId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "habitProgramId" TEXT,
    "funding" "CoachClientFunding" NOT NULL DEFAULT 'COACH_PAID',
    "status" "CoachRelationshipStatus" NOT NULL DEFAULT 'PENDING',
    "metricsConsentAt" TIMESTAMP(3),
    "journalConsentAt" TIMESTAMP(3),
    "consentRevokedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "accessEndsAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoachClientRelationship_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoachServiceOffer" (
    "id" TEXT NOT NULL,
    "coachProfileId" TEXT NOT NULL,
    "type" "CoachServiceType" NOT NULL,
    "paymentModel" "CoachServicePaymentModel" NOT NULL DEFAULT 'CLIENT_PAID',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "coachShareBps" INTEGER,
    "platformShareBps" INTEGER,
    "calendlyEventTypeUri" TEXT,
    "calendlySchedulingUrl" TEXT,
    "status" "CoachOfferStatus" NOT NULL DEFAULT 'DRAFT',
    "moderationNote" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoachServiceOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoachServiceOrder" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "relationshipId" TEXT,
    "status" "CoachServiceOrderStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "coachShareBpsSnapshot" INTEGER NOT NULL,
    "platformShareBpsSnapshot" INTEGER NOT NULL,
    "stripeCheckoutSessionId" TEXT,
    "stripePaymentIntentId" TEXT,
    "stripeSubscriptionId" TEXT,
    "calendlyEventUri" TEXT,
    "calendlyInviteeUri" TEXT,
    "scheduledFor" TIMESTAMP(3),
    "bookingDeadline" TIMESTAMP(3),
    "bookedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "refundRequestedAt" TIMESTAMP(3),
    "refundAmount" INTEGER,
    "refundedAt" TIMESTAMP(3),
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoachServiceOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoachMessage" (
    "id" TEXT NOT NULL,
    "relationshipId" TEXT NOT NULL,
    "coachProfileId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "authorRole" "CoachMessageAuthorRole" NOT NULL,
    "text" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoachMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoachAssignment" (
    "id" TEXT NOT NULL,
    "relationshipId" TEXT NOT NULL,
    "coachProfileId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "details" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3),
    "status" "CoachAssignmentStatus" NOT NULL DEFAULT 'OPEN',
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoachAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoachHabitAssignment" (
    "id" TEXT NOT NULL,
    "relationshipId" TEXT NOT NULL,
    "coachProfileId" TEXT NOT NULL,
    "habitDefinitionId" TEXT,
    "enrollmentId" TEXT,
    "title" TEXT NOT NULL,
    "focus" TEXT NOT NULL,
    "practice" TEXT NOT NULL,
    "why" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),
    "status" "CoachHabitAssignmentStatus" NOT NULL DEFAULT 'PROPOSED',
    "clientAcceptedAt" TIMESTAMP(3),
    "clientDeclinedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoachHabitAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoachSitePlan" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "setupAmount" INTEGER NOT NULL,
    "monthlySupportAmount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "features" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoachSitePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoachSite" (
    "id" TEXT NOT NULL,
    "coachProfileId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "customDomain" TEXT,
    "customDomainVerificationTokenHash" TEXT,
    "customDomainStatus" "CoachDomainStatus" NOT NULL DEFAULT 'NOT_CONFIGURED',
    "status" "CoachSiteStatus" NOT NULL DEFAULT 'DRAFT',
    "content" JSONB,
    "theme" JSONB,
    "stripeCheckoutSessionId" TEXT,
    "stripeSubscriptionId" TEXT,
    "supportCurrentPeriodEnd" TIMESTAMP(3),
    "graceEndsAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoachSite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoachCalendlyConnection" (
    "id" TEXT NOT NULL,
    "coachProfileId" TEXT NOT NULL,
    "accessTokenCiphertext" TEXT NOT NULL,
    "refreshTokenCiphertext" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "calendlyUserUri" TEXT,
    "calendlyOrganizationUri" TEXT,
    "webhookSubscriptionUri" TEXT,
    "scopes" JSONB,
    "status" "CoachIntegrationStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoachCalendlyConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoachReward" (
    "id" TEXT NOT NULL,
    "coachProfileId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "pointsCost" INTEGER NOT NULL,
    "entitlementType" TEXT NOT NULL DEFAULT 'manual',
    "entitlementValue" TEXT,
    "status" "CoachRewardStatus" NOT NULL DEFAULT 'DRAFT',
    "moderationNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoachReward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoachRewardRedemption" (
    "id" TEXT NOT NULL,
    "rewardId" TEXT NOT NULL,
    "relationshipId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pointsCost" INTEGER NOT NULL,
    "walletTransactionId" TEXT NOT NULL,
    "status" "CoachRewardRedemptionStatus" NOT NULL DEFAULT 'FULFILLED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoachRewardRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CoachProfile_partnerCorePartnerId_key" ON "CoachProfile"("partnerCorePartnerId");

-- CreateIndex
CREATE UNIQUE INDEX "CoachProfile_slug_key" ON "CoachProfile"("slug");

-- CreateIndex
CREATE INDEX "CoachProfile_status_acceptingOrders_featured_idx" ON "CoachProfile"("status", "acceptingOrders", "featured");

-- CreateIndex
CREATE UNIQUE INDEX "CoachPlan_code_key" ON "CoachPlan"("code");

-- CreateIndex
CREATE INDEX "CoachPlanPriceVersion_planId_active_effectiveFrom_idx" ON "CoachPlanPriceVersion"("planId", "active", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "CoachPlanPriceVersion_stripePriceId_key" ON "CoachPlanPriceVersion"("stripePriceId");

-- CreateIndex
CREATE INDEX "CoachPriceOverride_coachProfileId_planId_active_idx" ON "CoachPriceOverride"("coachProfileId", "planId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "CoachSubscription_stripeSubscriptionId_key" ON "CoachSubscription"("stripeSubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "CoachSubscription_stripeCheckoutSessionId_key" ON "CoachSubscription"("stripeCheckoutSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "CoachSubscription_idempotencyKey_key" ON "CoachSubscription"("idempotencyKey");

-- CreateIndex
CREATE INDEX "CoachSubscription_coachProfileId_status_currentPeriodEnd_idx" ON "CoachSubscription"("coachProfileId", "status", "currentPeriodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "CoachClientInvite_tokenHash_key" ON "CoachClientInvite"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "CoachClientInvite_relationshipId_key" ON "CoachClientInvite"("relationshipId");

-- CreateIndex
CREATE INDEX "CoachClientInvite_coachProfileId_expiresAt_idx" ON "CoachClientInvite"("coachProfileId", "expiresAt");

-- CreateIndex
CREATE INDEX "CoachClientRelationship_coachProfileId_status_funding_idx" ON "CoachClientRelationship"("coachProfileId", "status", "funding");

-- CreateIndex
CREATE INDEX "CoachClientRelationship_userId_status_idx" ON "CoachClientRelationship"("userId", "status");

-- CreateIndex
CREATE INDEX "CoachClientRelationship_habitProgramId_idx" ON "CoachClientRelationship"("habitProgramId");

-- CreateIndex
CREATE INDEX "CoachServiceOffer_coachProfileId_status_type_idx" ON "CoachServiceOffer"("coachProfileId", "status", "type");

-- CreateIndex
CREATE UNIQUE INDEX "CoachServiceOrder_stripeCheckoutSessionId_key" ON "CoachServiceOrder"("stripeCheckoutSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "CoachServiceOrder_stripePaymentIntentId_key" ON "CoachServiceOrder"("stripePaymentIntentId");

-- CreateIndex
CREATE UNIQUE INDEX "CoachServiceOrder_stripeSubscriptionId_key" ON "CoachServiceOrder"("stripeSubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "CoachServiceOrder_idempotencyKey_key" ON "CoachServiceOrder"("idempotencyKey");

-- CreateIndex
CREATE INDEX "CoachServiceOrder_userId_status_createdAt_idx" ON "CoachServiceOrder"("userId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "CoachServiceOrder_offerId_status_createdAt_idx" ON "CoachServiceOrder"("offerId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "CoachServiceOrder_bookingDeadline_status_idx" ON "CoachServiceOrder"("bookingDeadline", "status");

-- CreateIndex
CREATE INDEX "CoachMessage_relationshipId_createdAt_idx" ON "CoachMessage"("relationshipId", "createdAt");

-- CreateIndex
CREATE INDEX "CoachAssignment_relationshipId_status_dueAt_idx" ON "CoachAssignment"("relationshipId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "CoachHabitAssignment_relationshipId_status_startsAt_idx" ON "CoachHabitAssignment"("relationshipId", "status", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "CoachSitePlan_code_key" ON "CoachSitePlan"("code");

-- CreateIndex
CREATE UNIQUE INDEX "CoachSite_slug_key" ON "CoachSite"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "CoachSite_customDomain_key" ON "CoachSite"("customDomain");

-- CreateIndex
CREATE UNIQUE INDEX "CoachSite_stripeCheckoutSessionId_key" ON "CoachSite"("stripeCheckoutSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "CoachSite_stripeSubscriptionId_key" ON "CoachSite"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "CoachSite_coachProfileId_status_idx" ON "CoachSite"("coachProfileId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CoachCalendlyConnection_coachProfileId_key" ON "CoachCalendlyConnection"("coachProfileId");

-- CreateIndex
CREATE INDEX "CoachReward_coachProfileId_status_idx" ON "CoachReward"("coachProfileId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CoachRewardRedemption_walletTransactionId_key" ON "CoachRewardRedemption"("walletTransactionId");

-- CreateIndex
CREATE INDEX "CoachRewardRedemption_userId_createdAt_idx" ON "CoachRewardRedemption"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "CoachRewardRedemption_rewardId_createdAt_idx" ON "CoachRewardRedemption"("rewardId", "createdAt");

-- AddForeignKey
ALTER TABLE "CoachPlanPriceVersion" ADD CONSTRAINT "CoachPlanPriceVersion_planId_fkey" FOREIGN KEY ("planId") REFERENCES "CoachPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachPriceOverride" ADD CONSTRAINT "CoachPriceOverride_coachProfileId_fkey" FOREIGN KEY ("coachProfileId") REFERENCES "CoachProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachPriceOverride" ADD CONSTRAINT "CoachPriceOverride_planId_fkey" FOREIGN KEY ("planId") REFERENCES "CoachPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachSubscription" ADD CONSTRAINT "CoachSubscription_coachProfileId_fkey" FOREIGN KEY ("coachProfileId") REFERENCES "CoachProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachSubscription" ADD CONSTRAINT "CoachSubscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "CoachPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachSubscription" ADD CONSTRAINT "CoachSubscription_priceVersionId_fkey" FOREIGN KEY ("priceVersionId") REFERENCES "CoachPlanPriceVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachClientInvite" ADD CONSTRAINT "CoachClientInvite_coachProfileId_fkey" FOREIGN KEY ("coachProfileId") REFERENCES "CoachProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachClientInvite" ADD CONSTRAINT "CoachClientInvite_relationshipId_fkey" FOREIGN KEY ("relationshipId") REFERENCES "CoachClientRelationship"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachClientRelationship" ADD CONSTRAINT "CoachClientRelationship_coachProfileId_fkey" FOREIGN KEY ("coachProfileId") REFERENCES "CoachProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachClientRelationship" ADD CONSTRAINT "CoachClientRelationship_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachClientRelationship" ADD CONSTRAINT "CoachClientRelationship_habitProgramId_fkey" FOREIGN KEY ("habitProgramId") REFERENCES "HabitProgram"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachServiceOffer" ADD CONSTRAINT "CoachServiceOffer_coachProfileId_fkey" FOREIGN KEY ("coachProfileId") REFERENCES "CoachProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachServiceOrder" ADD CONSTRAINT "CoachServiceOrder_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "CoachServiceOffer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachServiceOrder" ADD CONSTRAINT "CoachServiceOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachServiceOrder" ADD CONSTRAINT "CoachServiceOrder_relationshipId_fkey" FOREIGN KEY ("relationshipId") REFERENCES "CoachClientRelationship"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachMessage" ADD CONSTRAINT "CoachMessage_relationshipId_fkey" FOREIGN KEY ("relationshipId") REFERENCES "CoachClientRelationship"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachMessage" ADD CONSTRAINT "CoachMessage_coachProfileId_fkey" FOREIGN KEY ("coachProfileId") REFERENCES "CoachProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachMessage" ADD CONSTRAINT "CoachMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachAssignment" ADD CONSTRAINT "CoachAssignment_relationshipId_fkey" FOREIGN KEY ("relationshipId") REFERENCES "CoachClientRelationship"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachAssignment" ADD CONSTRAINT "CoachAssignment_coachProfileId_fkey" FOREIGN KEY ("coachProfileId") REFERENCES "CoachProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachAssignment" ADD CONSTRAINT "CoachAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachHabitAssignment" ADD CONSTRAINT "CoachHabitAssignment_relationshipId_fkey" FOREIGN KEY ("relationshipId") REFERENCES "CoachClientRelationship"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachHabitAssignment" ADD CONSTRAINT "CoachHabitAssignment_coachProfileId_fkey" FOREIGN KEY ("coachProfileId") REFERENCES "CoachProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachHabitAssignment" ADD CONSTRAINT "CoachHabitAssignment_habitDefinitionId_fkey" FOREIGN KEY ("habitDefinitionId") REFERENCES "HabitDefinition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachHabitAssignment" ADD CONSTRAINT "CoachHabitAssignment_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "HabitEnrollment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachSite" ADD CONSTRAINT "CoachSite_coachProfileId_fkey" FOREIGN KEY ("coachProfileId") REFERENCES "CoachProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachSite" ADD CONSTRAINT "CoachSite_planId_fkey" FOREIGN KEY ("planId") REFERENCES "CoachSitePlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachCalendlyConnection" ADD CONSTRAINT "CoachCalendlyConnection_coachProfileId_fkey" FOREIGN KEY ("coachProfileId") REFERENCES "CoachProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachReward" ADD CONSTRAINT "CoachReward_coachProfileId_fkey" FOREIGN KEY ("coachProfileId") REFERENCES "CoachProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachRewardRedemption" ADD CONSTRAINT "CoachRewardRedemption_rewardId_fkey" FOREIGN KEY ("rewardId") REFERENCES "CoachReward"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachRewardRedemption" ADD CONSTRAINT "CoachRewardRedemption_relationshipId_fkey" FOREIGN KEY ("relationshipId") REFERENCES "CoachClientRelationship"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoachRewardRedemption" ADD CONSTRAINT "CoachRewardRedemption_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed the versioned coach plans. Prices are cents and remain editable through the admin API.
INSERT INTO "CoachPlan" ("id", "code", "name", "description", "includedClients", "customQuote", "active", "sortOrder", "createdAt", "updatedAt") VALUES
  ('coach-plan-5', 'clients-5', 'До 5 клиентов', 'Кабинет коуча и доступ для пяти клиентов', 5, false, true, 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('coach-plan-15', 'clients-15', 'До 15 клиентов', 'Для устойчивой частной практики', 15, false, true, 20, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('coach-plan-30', 'clients-30', 'До 30 клиентов', 'Для групп и растущей практики', 30, false, true, 30, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('coach-plan-custom', 'clients-custom', 'Более 30 клиентов', 'Индивидуальные условия', NULL, true, true, 40, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "CoachPlanPriceVersion" ("id", "planId", "amount", "currency", "effectiveFrom", "migrationMode", "active", "createdAt") VALUES
  ('coach-price-5-v1', 'coach-plan-5', 3900, 'usd', CURRENT_TIMESTAMP, 'NEW_ONLY', true, CURRENT_TIMESTAMP),
  ('coach-price-15-v1', 'coach-plan-15', 10900, 'usd', CURRENT_TIMESTAMP, 'NEW_ONLY', true, CURRENT_TIMESTAMP),
  ('coach-price-30-v1', 'coach-plan-30', 19900, 'usd', CURRENT_TIMESTAMP, 'NEW_ONLY', true, CURRENT_TIMESTAMP),
  ('coach-price-custom-v1', 'coach-plan-custom', 0, 'usd', CURRENT_TIMESTAMP, 'NEW_ONLY', true, CURRENT_TIMESTAMP);

INSERT INTO "CoachSitePlan" ("id", "code", "name", "setupAmount", "monthlySupportAmount", "currency", "features", "active", "sortOrder", "createdAt", "updatedAt") VALUES
  ('coach-site-standard', 'standard', 'Стандартный сайт', 7500, 500, 'usd', '{"subdomain":true,"fixedTemplate":true}'::jsonb, true, 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('coach-site-premium', 'premium', 'Premium-сайт', 35000, 1500, 'usd', '{"customDomain":true,"editableContent":true,"calendar":true,"aiChat":true,"customHabits":true}'::jsonb, true, 20, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO "FeatureFlag" ("key", "enabled", "payload", "updatedAt") VALUES
  ('coach_workspace', true, '{"version":1}'::jsonb, CURRENT_TIMESTAMP),
  ('coach_commerce', false, '{"reason":"Enable after Stripe and Calendly production smoke tests"}'::jsonb, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "AppSetting" ("key", "value", "updatedAt") VALUES
  ('coach_consultation_cancel_hours', '24'::jsonb, CURRENT_TIMESTAMP),
  ('coach_consultation_refund_percent', '100'::jsonb, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
