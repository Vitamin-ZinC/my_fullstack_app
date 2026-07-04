CREATE TABLE "TelegramWebLoginToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "telegramUserId" TEXT NOT NULL,
    "userId" TEXT,
    "sessionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "TelegramWebLoginToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TelegramWebLoginToken_tokenHash_key" ON "TelegramWebLoginToken"("tokenHash");
CREATE INDEX "TelegramWebLoginToken_telegramUserId_expiresAt_idx" ON "TelegramWebLoginToken"("telegramUserId", "expiresAt");
CREATE INDEX "TelegramWebLoginToken_sessionId_expiresAt_idx" ON "TelegramWebLoginToken"("sessionId", "expiresAt");
