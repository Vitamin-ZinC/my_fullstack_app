ALTER TABLE "HabitNavigatorMessage" ADD COLUMN "channel" TEXT NOT NULL DEFAULT 'WEB';

CREATE TABLE "TelegramAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "sessionId" TEXT,
    "telegramUserId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "username" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TelegramLinkToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT,
    "sessionId" TEXT,
    "programId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "TelegramLinkToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HabitNotificationPreference" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "telegramEnabled" BOOLEAN NOT NULL DEFAULT false,
    "reminderTime" TEXT NOT NULL DEFAULT '09:00',
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Moscow',
    "quietHoursStart" TEXT,
    "quietHoursEnd" TEXT,
    "motivationFrequency" TEXT NOT NULL DEFAULT 'daily',
    "lastReminderAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HabitNotificationPreference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TelegramAccount_telegramUserId_key" ON "TelegramAccount"("telegramUserId");
CREATE INDEX "TelegramAccount_userId_updatedAt_idx" ON "TelegramAccount"("userId", "updatedAt");
CREATE INDEX "TelegramAccount_sessionId_updatedAt_idx" ON "TelegramAccount"("sessionId", "updatedAt");
CREATE INDEX "TelegramAccount_chatId_idx" ON "TelegramAccount"("chatId");

CREATE UNIQUE INDEX "TelegramLinkToken_tokenHash_key" ON "TelegramLinkToken"("tokenHash");
CREATE INDEX "TelegramLinkToken_userId_expiresAt_idx" ON "TelegramLinkToken"("userId", "expiresAt");
CREATE INDEX "TelegramLinkToken_sessionId_expiresAt_idx" ON "TelegramLinkToken"("sessionId", "expiresAt");
CREATE INDEX "TelegramLinkToken_programId_expiresAt_idx" ON "TelegramLinkToken"("programId", "expiresAt");

CREATE UNIQUE INDEX "HabitNotificationPreference_programId_key" ON "HabitNotificationPreference"("programId");
CREATE INDEX "HabitNotificationPreference_telegramEnabled_reminderTime_idx" ON "HabitNotificationPreference"("telegramEnabled", "reminderTime");

CREATE INDEX "HabitNavigatorMessage_channel_createdAt_idx" ON "HabitNavigatorMessage"("channel", "createdAt");

ALTER TABLE "TelegramAccount" ADD CONSTRAINT "TelegramAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TelegramAccount" ADD CONSTRAINT "TelegramAccount_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HabitNotificationPreference" ADD CONSTRAINT "HabitNotificationPreference_programId_fkey" FOREIGN KEY ("programId") REFERENCES "HabitProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;
