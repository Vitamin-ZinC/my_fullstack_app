CREATE TYPE "HabitProgramStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED');
CREATE TYPE "HabitEnrollmentStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'SKIPPED', 'ARCHIVED');

CREATE TABLE "HabitDefinition" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "cycle" INTEGER NOT NULL DEFAULT 1,
  "week" INTEGER NOT NULL DEFAULT 1,
  "title" TEXT NOT NULL,
  "focus" TEXT NOT NULL,
  "essence" TEXT NOT NULL,
  "practice" TEXT NOT NULL,
  "why" TEXT NOT NULL,
  "book" TEXT,
  "zone" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "HabitDefinition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HabitProgram" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "sessionId" TEXT,
  "analysisId" TEXT,
  "status" "HabitProgramStatus" NOT NULL DEFAULT 'ACTIVE',
  "source" TEXT NOT NULL DEFAULT 'manual',
  "title" TEXT NOT NULL,
  "weakZone" TEXT,
  "archetype" TEXT,
  "topRole" TEXT,
  "careerAction" TEXT,
  "finalInsight" TEXT,
  "profile" JSONB,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "HabitProgram_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HabitEnrollment" (
  "id" TEXT NOT NULL,
  "programId" TEXT NOT NULL,
  "habitDefinitionId" TEXT,
  "title" TEXT NOT NULL,
  "focus" TEXT NOT NULL,
  "essence" TEXT NOT NULL,
  "practice" TEXT NOT NULL,
  "why" TEXT NOT NULL,
  "book" TEXT,
  "zone" TEXT,
  "week" INTEGER NOT NULL DEFAULT 1,
  "sortOrder" INTEGER NOT NULL DEFAULT 1,
  "status" "HabitEnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "HabitEnrollment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HabitCheckin" (
  "id" TEXT NOT NULL,
  "programId" TEXT NOT NULL,
  "enrollmentId" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "completed" BOOLEAN NOT NULL DEFAULT true,
  "note" TEXT,
  "energy" INTEGER,
  "clarity" INTEGER,
  "stability" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "HabitCheckin_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HabitInsight" (
  "id" TEXT NOT NULL,
  "programId" TEXT NOT NULL,
  "enrollmentId" TEXT,
  "text" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'user',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "HabitInsight_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HabitDailyMetric" (
  "id" TEXT NOT NULL,
  "programId" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "energy" INTEGER NOT NULL,
  "clarity" INTEGER NOT NULL,
  "stability" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "HabitDailyMetric_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HabitRewardEvent" (
  "id" TEXT NOT NULL,
  "programId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "xp" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "HabitRewardEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HabitNavigatorThread" (
  "id" TEXT NOT NULL,
  "programId" TEXT,
  "userId" TEXT,
  "sessionId" TEXT,
  "title" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "HabitNavigatorThread_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HabitNavigatorMessage" (
  "id" TEXT NOT NULL,
  "threadId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "model" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "HabitNavigatorMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HabitDefinition_slug_key" ON "HabitDefinition"("slug");
CREATE INDEX "HabitDefinition_active_cycle_week_idx" ON "HabitDefinition"("active", "cycle", "week");
CREATE INDEX "HabitProgram_userId_status_createdAt_idx" ON "HabitProgram"("userId", "status", "createdAt");
CREATE INDEX "HabitProgram_sessionId_status_createdAt_idx" ON "HabitProgram"("sessionId", "status", "createdAt");
CREATE INDEX "HabitProgram_analysisId_idx" ON "HabitProgram"("analysisId");
CREATE INDEX "HabitEnrollment_programId_status_sortOrder_idx" ON "HabitEnrollment"("programId", "status", "sortOrder");
CREATE UNIQUE INDEX "HabitCheckin_enrollmentId_date_key" ON "HabitCheckin"("enrollmentId", "date");
CREATE INDEX "HabitCheckin_programId_date_idx" ON "HabitCheckin"("programId", "date");
CREATE INDEX "HabitInsight_programId_createdAt_idx" ON "HabitInsight"("programId", "createdAt");
CREATE UNIQUE INDEX "HabitDailyMetric_programId_date_key" ON "HabitDailyMetric"("programId", "date");
CREATE INDEX "HabitDailyMetric_programId_date_idx" ON "HabitDailyMetric"("programId", "date");
CREATE INDEX "HabitRewardEvent_programId_createdAt_idx" ON "HabitRewardEvent"("programId", "createdAt");
CREATE INDEX "HabitNavigatorThread_programId_updatedAt_idx" ON "HabitNavigatorThread"("programId", "updatedAt");
CREATE INDEX "HabitNavigatorThread_userId_updatedAt_idx" ON "HabitNavigatorThread"("userId", "updatedAt");
CREATE INDEX "HabitNavigatorThread_sessionId_updatedAt_idx" ON "HabitNavigatorThread"("sessionId", "updatedAt");
CREATE INDEX "HabitNavigatorMessage_threadId_createdAt_idx" ON "HabitNavigatorMessage"("threadId", "createdAt");

ALTER TABLE "HabitProgram" ADD CONSTRAINT "HabitProgram_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HabitProgram" ADD CONSTRAINT "HabitProgram_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HabitProgram" ADD CONSTRAINT "HabitProgram_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "Analysis"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HabitEnrollment" ADD CONSTRAINT "HabitEnrollment_programId_fkey" FOREIGN KEY ("programId") REFERENCES "HabitProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HabitEnrollment" ADD CONSTRAINT "HabitEnrollment_habitDefinitionId_fkey" FOREIGN KEY ("habitDefinitionId") REFERENCES "HabitDefinition"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HabitCheckin" ADD CONSTRAINT "HabitCheckin_programId_fkey" FOREIGN KEY ("programId") REFERENCES "HabitProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HabitCheckin" ADD CONSTRAINT "HabitCheckin_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "HabitEnrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HabitInsight" ADD CONSTRAINT "HabitInsight_programId_fkey" FOREIGN KEY ("programId") REFERENCES "HabitProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HabitInsight" ADD CONSTRAINT "HabitInsight_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "HabitEnrollment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HabitDailyMetric" ADD CONSTRAINT "HabitDailyMetric_programId_fkey" FOREIGN KEY ("programId") REFERENCES "HabitProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HabitRewardEvent" ADD CONSTRAINT "HabitRewardEvent_programId_fkey" FOREIGN KEY ("programId") REFERENCES "HabitProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HabitNavigatorThread" ADD CONSTRAINT "HabitNavigatorThread_programId_fkey" FOREIGN KEY ("programId") REFERENCES "HabitProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HabitNavigatorThread" ADD CONSTRAINT "HabitNavigatorThread_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HabitNavigatorThread" ADD CONSTRAINT "HabitNavigatorThread_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HabitNavigatorMessage" ADD CONSTRAINT "HabitNavigatorMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "HabitNavigatorThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
