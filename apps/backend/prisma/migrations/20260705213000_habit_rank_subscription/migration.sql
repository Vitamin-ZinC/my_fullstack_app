-- Extend habit programs with real subscription state and monthly rank history.
ALTER TABLE "HabitProgram"
  ADD COLUMN "stripeSubscriptionId" TEXT,
  ADD COLUMN "subscriptionCurrentPeriodEnd" TIMESTAMP(3),
  ADD COLUMN "subscriptionCancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "currentRankProvisional" TEXT,
  ADD COLUMN "guruStreakCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "legendStatus" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "HabitProgram_stripeSubscriptionId_key" ON "HabitProgram"("stripeSubscriptionId");

CREATE TABLE "HabitRankHistory" (
  "id" TEXT NOT NULL,
  "programId" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "month" INTEGER NOT NULL,
  "rankTitle" TEXT NOT NULL,
  "rankLevel" INTEGER NOT NULL,
  "monthXp" INTEGER NOT NULL,
  "monthMaxXp" INTEGER NOT NULL,
  "monthPercent" INTEGER NOT NULL,
  "guruStreakCount" INTEGER NOT NULL DEFAULT 0,
  "legendStatus" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "HabitRankHistory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HabitRankHistory_programId_year_month_key" ON "HabitRankHistory"("programId", "year", "month");
CREATE INDEX "HabitRankHistory_programId_createdAt_idx" ON "HabitRankHistory"("programId", "createdAt");

ALTER TABLE "HabitRankHistory"
  ADD CONSTRAINT "HabitRankHistory_programId_fkey"
  FOREIGN KEY ("programId") REFERENCES "HabitProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;
