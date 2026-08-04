CREATE TYPE "CoachPartnershipLeadStatus" AS ENUM ('NEW', 'CONTACTED', 'APPROVED', 'REJECTED');

CREATE TABLE "CoachPartnershipLead" (
  "id" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "fullName" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "telegram" TEXT,
  "city" TEXT,
  "practiceFormat" TEXT NOT NULL,
  "experienceYears" INTEGER,
  "activeClients" INTEGER,
  "interests" JSONB NOT NULL,
  "message" TEXT,
  "source" TEXT NOT NULL DEFAULT 'coaches_landing',
  "status" "CoachPartnershipLeadStatus" NOT NULL DEFAULT 'NEW',
  "consentAt" TIMESTAMP(3) NOT NULL,
  "materialTokenHash" TEXT NOT NULL,
  "materialExpiresAt" TIMESTAMP(3) NOT NULL,
  "materialOpenedAt" TIMESTAMP(3),
  "applicantEmailStatus" TEXT NOT NULL DEFAULT 'PENDING',
  "teamNotificationStatus" TEXT NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CoachPartnershipLead_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CoachPartnershipLead_idempotencyKey_key" ON "CoachPartnershipLead"("idempotencyKey");
CREATE UNIQUE INDEX "CoachPartnershipLead_materialTokenHash_key" ON "CoachPartnershipLead"("materialTokenHash");
CREATE INDEX "CoachPartnershipLead_status_createdAt_idx" ON "CoachPartnershipLead"("status", "createdAt");
CREATE INDEX "CoachPartnershipLead_email_createdAt_idx" ON "CoachPartnershipLead"("email", "createdAt");
