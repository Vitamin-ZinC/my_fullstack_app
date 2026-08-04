CREATE TYPE "TelegramCommunityChatStatus" AS ENUM ('PENDING', 'ACTIVE', 'PAUSED', 'LEFT');
CREATE TYPE "TelegramCommunityMemberStatus" AS ENUM ('ACTIVE', 'LEFT', 'BLOCKED');
CREATE TYPE "TelegramCommunityCommitmentStatus" AS ENUM ('PLANNED', 'DONE', 'PARTIAL', 'SKIPPED');
CREATE TYPE "TelegramCommunityPostType" AS ENUM ('MORNING', 'MIDDAY', 'EVENING', 'WAKE', 'MANUAL');

CREATE TABLE "TelegramCommunityChat" (
  "id" TEXT NOT NULL,
  "telegramChatId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "title" TEXT,
  "username" TEXT,
  "status" "TelegramCommunityChatStatus" NOT NULL DEFAULT 'PENDING',
  "timezone" TEXT NOT NULL DEFAULT 'Europe/Moscow',
  "schedulesEnabled" BOOLEAN NOT NULL DEFAULT false,
  "aiRepliesEnabled" BOOLEAN NOT NULL DEFAULT true,
  "smartPingEnabled" BOOLEAN NOT NULL DEFAULT false,
  "morningTime" TEXT NOT NULL DEFAULT '08:30',
  "middayTime" TEXT NOT NULL DEFAULT '13:30',
  "eveningTime" TEXT NOT NULL DEFAULT '21:00',
  "quietHoursStart" TEXT NOT NULL DEFAULT '22:00',
  "quietHoursEnd" TEXT NOT NULL DEFAULT '08:30',
  "installedByUserId" TEXT,
  "lastHumanMessageAt" TIMESTAMP(3),
  "lastMorningAt" TIMESTAMP(3),
  "lastMiddayAt" TIMESTAMP(3),
  "lastEveningAt" TIMESTAMP(3),
  "lastWakeAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TelegramCommunityChat_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TelegramCommunityMember" (
  "id" TEXT NOT NULL,
  "chatId" TEXT NOT NULL,
  "telegramUserId" TEXT NOT NULL,
  "username" TEXT,
  "firstName" TEXT,
  "lastName" TEXT,
  "status" "TelegramCommunityMemberStatus" NOT NULL DEFAULT 'ACTIVE',
  "optedIn" BOOLEAN NOT NULL DEFAULT false,
  "mentionEnabled" BOOLEAN NOT NULL DEFAULT false,
  "points" INTEGER NOT NULL DEFAULT 0,
  "lastActivityAt" TIMESTAMP(3),
  "lastCheckinAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TelegramCommunityMember_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TelegramCommunityCommitment" (
  "id" TEXT NOT NULL,
  "chatId" TEXT NOT NULL,
  "memberId" TEXT NOT NULL,
  "dateKey" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "status" "TelegramCommunityCommitmentStatus" NOT NULL DEFAULT 'PLANNED',
  "pointsAwarded" INTEGER NOT NULL DEFAULT 0,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TelegramCommunityCommitment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TelegramCommunityPost" (
  "id" TEXT NOT NULL,
  "chatId" TEXT NOT NULL,
  "dateKey" TEXT NOT NULL,
  "type" "TelegramCommunityPostType" NOT NULL,
  "telegramMessageId" TEXT,
  "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TelegramCommunityPost_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TelegramCommunityChat_telegramChatId_key" ON "TelegramCommunityChat"("telegramChatId");
CREATE INDEX "TelegramCommunityChat_status_schedulesEnabled_idx" ON "TelegramCommunityChat"("status", "schedulesEnabled");
CREATE INDEX "TelegramCommunityChat_updatedAt_idx" ON "TelegramCommunityChat"("updatedAt");
CREATE UNIQUE INDEX "TelegramCommunityMember_chatId_telegramUserId_key" ON "TelegramCommunityMember"("chatId", "telegramUserId");
CREATE INDEX "TelegramCommunityMember_chatId_optedIn_status_idx" ON "TelegramCommunityMember"("chatId", "optedIn", "status");
CREATE INDEX "TelegramCommunityMember_telegramUserId_updatedAt_idx" ON "TelegramCommunityMember"("telegramUserId", "updatedAt");
CREATE UNIQUE INDEX "TelegramCommunityCommitment_chatId_memberId_dateKey_key" ON "TelegramCommunityCommitment"("chatId", "memberId", "dateKey");
CREATE INDEX "TelegramCommunityCommitment_chatId_dateKey_status_idx" ON "TelegramCommunityCommitment"("chatId", "dateKey", "status");
CREATE UNIQUE INDEX "TelegramCommunityPost_chatId_dateKey_type_key" ON "TelegramCommunityPost"("chatId", "dateKey", "type");
CREATE INDEX "TelegramCommunityPost_chatId_sentAt_idx" ON "TelegramCommunityPost"("chatId", "sentAt");

ALTER TABLE "TelegramCommunityMember" ADD CONSTRAINT "TelegramCommunityMember_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "TelegramCommunityChat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TelegramCommunityCommitment" ADD CONSTRAINT "TelegramCommunityCommitment_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "TelegramCommunityChat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TelegramCommunityCommitment" ADD CONSTRAINT "TelegramCommunityCommitment_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "TelegramCommunityMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TelegramCommunityPost" ADD CONSTRAINT "TelegramCommunityPost_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "TelegramCommunityChat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
