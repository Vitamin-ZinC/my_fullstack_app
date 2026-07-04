CREATE TABLE "HabitDailyTask" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "date" TIMESTAMP(3),
    "dayIndex" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "taskText" TEXT NOT NULL,
    "microAction" TEXT NOT NULL,
    "whyToday" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3),
    "xpAwarded" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HabitDailyTask_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HabitWeekSummary" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "cycle" INTEGER NOT NULL,
    "week" INTEGER NOT NULL,
    "checkinsDone" INTEGER NOT NULL,
    "completionMode" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "pingviFeedback" TEXT NOT NULL,
    "rewardLabel" TEXT NOT NULL,
    "xpAwarded" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HabitWeekSummary_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HabitDailyTask_programId_enrollmentId_dayIndex_key" ON "HabitDailyTask"("programId", "enrollmentId", "dayIndex");
CREATE INDEX "HabitDailyTask_programId_date_idx" ON "HabitDailyTask"("programId", "date");
CREATE INDEX "HabitDailyTask_enrollmentId_dayIndex_idx" ON "HabitDailyTask"("enrollmentId", "dayIndex");

CREATE UNIQUE INDEX "HabitWeekSummary_programId_enrollmentId_key" ON "HabitWeekSummary"("programId", "enrollmentId");
CREATE INDEX "HabitWeekSummary_programId_createdAt_idx" ON "HabitWeekSummary"("programId", "createdAt");

ALTER TABLE "HabitDailyTask" ADD CONSTRAINT "HabitDailyTask_programId_fkey" FOREIGN KEY ("programId") REFERENCES "HabitProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HabitDailyTask" ADD CONSTRAINT "HabitDailyTask_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "HabitEnrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HabitWeekSummary" ADD CONSTRAINT "HabitWeekSummary_programId_fkey" FOREIGN KEY ("programId") REFERENCES "HabitProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HabitWeekSummary" ADD CONSTRAINT "HabitWeekSummary_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "HabitEnrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
