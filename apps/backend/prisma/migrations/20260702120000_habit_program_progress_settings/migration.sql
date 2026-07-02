ALTER TABLE "HabitProgram"
  ADD COLUMN "currentCycle" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "currentWeek" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "reminderEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "reminderTime" TEXT NOT NULL DEFAULT '09:00',
  ADD COLUMN "weeklyFreezes" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "trialStartedAt" TIMESTAMP(3),
  ADD COLUMN "trialEndsAt" TIMESTAMP(3),
  ADD COLUMN "subscriptionStatus" TEXT NOT NULL DEFAULT 'TRIAL';

UPDATE "HabitProgram"
SET
  "trialStartedAt" = COALESCE("trialStartedAt", "startedAt"),
  "trialEndsAt" = COALESCE("trialEndsAt", "startedAt" + INTERVAL '30 days');

CREATE INDEX "HabitProgram_status_currentCycle_currentWeek_idx"
  ON "HabitProgram"("status", "currentCycle", "currentWeek");
