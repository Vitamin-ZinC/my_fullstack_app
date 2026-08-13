CREATE TABLE "DemoAccessCode" (
  "id" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "codeHint" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "expiresAt" TIMESTAMP(3),
  "maxSessions" INTEGER,
  "sessionsCreated" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DemoAccessCode_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DemoSession" (
  "id" TEXT NOT NULL,
  "accessCodeId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DemoSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DemoAccessCode_codeHash_key" ON "DemoAccessCode"("codeHash");
CREATE INDEX "DemoAccessCode_active_expiresAt_idx" ON "DemoAccessCode"("active", "expiresAt");
CREATE UNIQUE INDEX "DemoSession_tokenHash_key" ON "DemoSession"("tokenHash");
CREATE INDEX "DemoSession_accessCodeId_expiresAt_idx" ON "DemoSession"("accessCodeId", "expiresAt");
CREATE INDEX "DemoSession_expiresAt_revokedAt_idx" ON "DemoSession"("expiresAt", "revokedAt");

ALTER TABLE "DemoSession" ADD CONSTRAINT "DemoSession_accessCodeId_fkey" FOREIGN KEY ("accessCodeId") REFERENCES "DemoAccessCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
