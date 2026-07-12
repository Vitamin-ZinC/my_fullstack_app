CREATE TYPE "PartnerCustomerBonusType" AS ENUM ('NONE', 'FREE_DAYS', 'DISCOUNT', 'CREDITS', 'CUSTOM_ENTITLEMENT');
CREATE TYPE "PartnerCommissionModel" AS ENUM ('FIXED', 'PERCENT', 'HYBRID');
CREATE TYPE "PartnerCommissionWindow" AS ENUM ('FIRST_PAYMENT', 'MONTHS', 'LIFETIME');
CREATE TYPE "PartnerProgramStatus" AS ENUM ('ACTIVE', 'PAUSED');
CREATE TYPE "PartnerBonusStatus" AS ENUM ('PENDING', 'APPLIED', 'NOT_APPLICABLE', 'FAILED');
CREATE TYPE "PartnerEventStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'SKIPPED', 'FAILED');
CREATE TYPE "PartnerEventType" AS ENUM ('SIGNUP', 'PAYMENT', 'REDEMPTION');
CREATE TYPE "PartnerOfferStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'PAUSED');
CREATE TYPE "PartnerRedemptionStatus" AS ENUM ('PENDING', 'FULFILLED', 'PARTNER_FAILED', 'REFUNDED');

CREATE TABLE "PartnerAffiliateProgram" (
  "id" TEXT NOT NULL,
  "partnerCoreProgramId" TEXT,
  "name" TEXT NOT NULL,
  "referralDestination" TEXT NOT NULL,
  "customerBonusType" "PartnerCustomerBonusType" NOT NULL DEFAULT 'NONE',
  "customerBonusValue" INTEGER,
  "customerBonusEntitlement" TEXT,
  "commissionModel" "PartnerCommissionModel" NOT NULL DEFAULT 'PERCENT',
  "commissionRateBps" INTEGER,
  "fixedPayoutCents" INTEGER,
  "commissionWindowType" "PartnerCommissionWindow" NOT NULL DEFAULT 'FIRST_PAYMENT',
  "commissionWindowMonths" INTEGER,
  "lockDays" INTEGER NOT NULL DEFAULT 0,
  "status" "PartnerProgramStatus" NOT NULL DEFAULT 'PAUSED',
  "termsVersion" TEXT NOT NULL DEFAULT 'v1',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PartnerAffiliateProgram_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PartnerReferralLink" (
  "id" TEXT NOT NULL,
  "programConfigId" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "referralCode" TEXT,
  "url" TEXT,
  "partnerCoreLinkId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'CREATED',
  "idempotencyKey" TEXT NOT NULL,
  "rawResponse" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PartnerReferralLink_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PartnerAttribution" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "programConfigId" TEXT,
  "partnerCoreProgramId" TEXT,
  "referralCode" TEXT NOT NULL,
  "customerBonusType" "PartnerCustomerBonusType" NOT NULL DEFAULT 'NONE',
  "customerBonusValue" INTEGER,
  "customerBonusEntitlement" TEXT,
  "bonusStatus" "PartnerBonusStatus" NOT NULL DEFAULT 'PENDING',
  "bonusAppliedAt" TIMESTAMP(3),
  "bonusAppliedProgramId" TEXT,
  "signupEventStatus" "PartnerEventStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PartnerAttribution_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PartnerEvent" (
  "id" TEXT NOT NULL,
  "type" "PartnerEventType" NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "programConfigId" TEXT,
  "userId" TEXT,
  "paymentId" TEXT,
  "externalId" TEXT NOT NULL,
  "status" "PartnerEventStatus" NOT NULL DEFAULT 'PENDING',
  "request" JSONB NOT NULL,
  "response" JSONB,
  "error" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PartnerEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PartnerOffer" (
  "id" TEXT NOT NULL,
  "programConfigId" TEXT,
  "partnerId" TEXT,
  "partnerCorePlacementId" TEXT,
  "partnerCoreStatus" TEXT,
  "partnerCoreSyncedAt" TIMESTAMP(3),
  "kind" TEXT NOT NULL DEFAULT 'manual_deal',
  "surface" TEXT NOT NULL DEFAULT 'rewards_tab',
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "imageUrl" TEXT,
  "redemptionCurrency" TEXT NOT NULL DEFAULT 'orken_points',
  "redemptionAmount" INTEGER NOT NULL,
  "userBenefit" TEXT NOT NULL,
  "partnerPayoutCents" INTEGER NOT NULL DEFAULT 0,
  "capPerMonth" INTEGER,
  "status" "PartnerOfferStatus" NOT NULL DEFAULT 'DRAFT',
  "entitlementType" TEXT NOT NULL DEFAULT 'manual',
  "entitlementValue" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PartnerOffer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PartnerOfferRedemption" (
  "id" TEXT NOT NULL,
  "offerId" TEXT NOT NULL,
  "userId" TEXT,
  "sessionId" TEXT,
  "costCurrency" TEXT NOT NULL DEFAULT 'orken_points',
  "costAmount" INTEGER NOT NULL,
  "status" "PartnerRedemptionStatus" NOT NULL DEFAULT 'PENDING',
  "entitlementType" TEXT,
  "entitlementValue" TEXT,
  "partnerCoreRedemptionId" TEXT,
  "partnerCoreResponse" JSONB,
  "deliveryError" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PartnerOfferRedemption_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InternalWalletTransaction" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "sessionId" TEXT,
  "programId" TEXT,
  "currency" TEXT NOT NULL DEFAULT 'orken_points',
  "amountDelta" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InternalWalletTransaction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PartnerReferralLink_idempotencyKey_key" ON "PartnerReferralLink"("idempotencyKey");
CREATE UNIQUE INDEX "PartnerAttribution_userId_key" ON "PartnerAttribution"("userId");
CREATE UNIQUE INDEX "PartnerEvent_idempotencyKey_key" ON "PartnerEvent"("idempotencyKey");
CREATE UNIQUE INDEX "PartnerOffer_partnerCorePlacementId_key" ON "PartnerOffer"("partnerCorePlacementId");
CREATE UNIQUE INDEX "PartnerOfferRedemption_idempotencyKey_key" ON "PartnerOfferRedemption"("idempotencyKey");
CREATE UNIQUE INDEX "InternalWalletTransaction_idempotencyKey_key" ON "InternalWalletTransaction"("idempotencyKey");

CREATE INDEX "PartnerAffiliateProgram_status_updatedAt_idx" ON "PartnerAffiliateProgram"("status", "updatedAt");
CREATE INDEX "PartnerAffiliateProgram_partnerCoreProgramId_idx" ON "PartnerAffiliateProgram"("partnerCoreProgramId");
CREATE INDEX "PartnerReferralLink_programConfigId_channel_idx" ON "PartnerReferralLink"("programConfigId", "channel");
CREATE INDEX "PartnerAttribution_referralCode_createdAt_idx" ON "PartnerAttribution"("referralCode", "createdAt");
CREATE INDEX "PartnerAttribution_partnerCoreProgramId_idx" ON "PartnerAttribution"("partnerCoreProgramId");
CREATE INDEX "PartnerAttribution_bonusStatus_createdAt_idx" ON "PartnerAttribution"("bonusStatus", "createdAt");
CREATE INDEX "PartnerEvent_type_status_createdAt_idx" ON "PartnerEvent"("type", "status", "createdAt");
CREATE INDEX "PartnerEvent_userId_createdAt_idx" ON "PartnerEvent"("userId", "createdAt");
CREATE INDEX "PartnerEvent_paymentId_idx" ON "PartnerEvent"("paymentId");
CREATE INDEX "PartnerOffer_status_updatedAt_idx" ON "PartnerOffer"("status", "updatedAt");
CREATE INDEX "PartnerOffer_programConfigId_idx" ON "PartnerOffer"("programConfigId");
CREATE INDEX "PartnerOffer_partnerId_idx" ON "PartnerOffer"("partnerId");
CREATE INDEX "PartnerOfferRedemption_offerId_createdAt_idx" ON "PartnerOfferRedemption"("offerId", "createdAt");
CREATE INDEX "PartnerOfferRedemption_userId_createdAt_idx" ON "PartnerOfferRedemption"("userId", "createdAt");
CREATE INDEX "PartnerOfferRedemption_sessionId_createdAt_idx" ON "PartnerOfferRedemption"("sessionId", "createdAt");
CREATE INDEX "PartnerOfferRedemption_status_createdAt_idx" ON "PartnerOfferRedemption"("status", "createdAt");
CREATE INDEX "InternalWalletTransaction_userId_currency_createdAt_idx" ON "InternalWalletTransaction"("userId", "currency", "createdAt");
CREATE INDEX "InternalWalletTransaction_sessionId_currency_createdAt_idx" ON "InternalWalletTransaction"("sessionId", "currency", "createdAt");
CREATE INDEX "InternalWalletTransaction_programId_createdAt_idx" ON "InternalWalletTransaction"("programId", "createdAt");

ALTER TABLE "PartnerReferralLink" ADD CONSTRAINT "PartnerReferralLink_programConfigId_fkey" FOREIGN KEY ("programConfigId") REFERENCES "PartnerAffiliateProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PartnerAttribution" ADD CONSTRAINT "PartnerAttribution_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PartnerAttribution" ADD CONSTRAINT "PartnerAttribution_programConfigId_fkey" FOREIGN KEY ("programConfigId") REFERENCES "PartnerAffiliateProgram"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PartnerAttribution" ADD CONSTRAINT "PartnerAttribution_bonusAppliedProgramId_fkey" FOREIGN KEY ("bonusAppliedProgramId") REFERENCES "HabitProgram"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PartnerEvent" ADD CONSTRAINT "PartnerEvent_programConfigId_fkey" FOREIGN KEY ("programConfigId") REFERENCES "PartnerAffiliateProgram"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PartnerEvent" ADD CONSTRAINT "PartnerEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PartnerOffer" ADD CONSTRAINT "PartnerOffer_programConfigId_fkey" FOREIGN KEY ("programConfigId") REFERENCES "PartnerAffiliateProgram"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PartnerOfferRedemption" ADD CONSTRAINT "PartnerOfferRedemption_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "PartnerOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PartnerOfferRedemption" ADD CONSTRAINT "PartnerOfferRedemption_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PartnerOfferRedemption" ADD CONSTRAINT "PartnerOfferRedemption_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InternalWalletTransaction" ADD CONSTRAINT "InternalWalletTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InternalWalletTransaction" ADD CONSTRAINT "InternalWalletTransaction_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InternalWalletTransaction" ADD CONSTRAINT "InternalWalletTransaction_programId_fkey" FOREIGN KEY ("programId") REFERENCES "HabitProgram"("id") ON DELETE SET NULL ON UPDATE CASCADE;
