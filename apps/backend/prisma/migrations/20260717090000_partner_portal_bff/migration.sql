ALTER TABLE "PartnerAttribution" ADD COLUMN "partnerCorePartnerId" TEXT;

CREATE TABLE "PartnerPortalSession" (
  "id" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "coreSessionCiphertext" TEXT NOT NULL,
  "partnerCorePartnerId" TEXT NOT NULL,
  "partnerStatus" TEXT NOT NULL,
  "displayName" TEXT,
  "accountName" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "lastSeenAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PartnerPortalSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PartnerPortalSession_tokenHash_key" ON "PartnerPortalSession"("tokenHash");
CREATE INDEX "PartnerPortalSession_partnerCorePartnerId_expiresAt_idx" ON "PartnerPortalSession"("partnerCorePartnerId", "expiresAt");
CREATE INDEX "PartnerPortalSession_expiresAt_idx" ON "PartnerPortalSession"("expiresAt");
CREATE INDEX "PartnerAttribution_partnerCorePartnerId_idx" ON "PartnerAttribution"("partnerCorePartnerId");
