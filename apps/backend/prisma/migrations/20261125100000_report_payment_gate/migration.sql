ALTER TABLE "Payment"
    ALTER COLUMN "stripePaymentIntentId" DROP NOT NULL,
    ADD COLUMN "viaPaymentGate" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "gateCheckoutId" TEXT,
    ADD COLUMN "gateCheckoutUrl" TEXT,
    ADD COLUMN "gateProvider" TEXT;

CREATE UNIQUE INDEX "Payment_gateCheckoutId_key" ON "Payment"("gateCheckoutId");
