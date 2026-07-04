-- CreateTable
CREATE TABLE "HabitCalendarEvent" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "enrollmentId" TEXT,
    "dailyTaskId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL DEFAULT 15,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "source" TEXT NOT NULL DEFAULT 'habit',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HabitCalendarEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HabitCalendarEvent_programId_dailyTaskId_key" ON "HabitCalendarEvent"("programId", "dailyTaskId");

-- CreateIndex
CREATE INDEX "HabitCalendarEvent_programId_startsAt_idx" ON "HabitCalendarEvent"("programId", "startsAt");

-- CreateIndex
CREATE INDEX "HabitCalendarEvent_enrollmentId_startsAt_idx" ON "HabitCalendarEvent"("enrollmentId", "startsAt");

-- AddForeignKey
ALTER TABLE "HabitCalendarEvent" ADD CONSTRAINT "HabitCalendarEvent_programId_fkey" FOREIGN KEY ("programId") REFERENCES "HabitProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HabitCalendarEvent" ADD CONSTRAINT "HabitCalendarEvent_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "HabitEnrollment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HabitCalendarEvent" ADD CONSTRAINT "HabitCalendarEvent_dailyTaskId_fkey" FOREIGN KEY ("dailyTaskId") REFERENCES "HabitDailyTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;
