CREATE TYPE "PromoDiscountType" AS ENUM ('PERCENT', 'FIXED_AMOUNT');

CREATE TABLE "PromoCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "discountType" "PromoDiscountType" NOT NULL,
    "percentOff" INTEGER,
    "amountOff" INTEGER,
    "currency" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "maxRedemptions" INTEGER,
    "redemptions" INTEGER NOT NULL DEFAULT 0,
    "startsAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromoCode_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PromoCode_code_key" ON "PromoCode"("code");
CREATE INDEX "PromoCode_active_expiresAt_idx" ON "PromoCode"("active", "expiresAt");

ALTER TABLE "Payment" ADD COLUMN "promoCodeId" TEXT;
ALTER TABLE "Payment" ADD COLUMN "stripeCheckoutSessionId" TEXT;
ALTER TABLE "Payment" ADD COLUMN "originalAmount" INTEGER;
ALTER TABLE "Payment" ADD COLUMN "discountAmount" INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX "Payment_stripeCheckoutSessionId_key" ON "Payment"("stripeCheckoutSessionId");

ALTER TABLE "Payment" ADD CONSTRAINT "Payment_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "PromoCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
