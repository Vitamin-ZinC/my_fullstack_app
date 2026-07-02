CREATE TYPE "AuthTokenPurpose" AS ENUM ('MAGIC_LOGIN');

ALTER TABLE "User"
  ADD COLUMN "name" TEXT,
  ADD COLUMN "passwordHash" TEXT,
  ADD COLUMN "emailVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "lastLoginAt" TIMESTAMP(3),
  ADD COLUMN "avatarUrl" TEXT;

CREATE TABLE "LoginToken" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "purpose" "AuthTokenPurpose" NOT NULL DEFAULT 'MAGIC_LOGIN',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),

  CONSTRAINT "LoginToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LoginToken_tokenHash_key" ON "LoginToken"("tokenHash");
CREATE INDEX "LoginToken_email_expiresAt_idx" ON "LoginToken"("email", "expiresAt");
