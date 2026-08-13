CREATE TYPE "CoachSchedulingProvider" AS ENUM ('ORKEN', 'GOOGLE', 'CALENDLY');
CREATE TYPE "CoachAppointmentStatus" AS ENUM ('SYNC_PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW', 'SYNC_ERROR');

CREATE TABLE "CoachGoogleCalendarConnection" (
  "id" TEXT NOT NULL,
  "coachProfileId" TEXT NOT NULL,
  "accessTokenCiphertext" TEXT NOT NULL,
  "refreshTokenCiphertext" TEXT,
  "tokenExpiresAt" TIMESTAMP(3),
  "calendarId" TEXT NOT NULL DEFAULT 'primary',
  "calendarName" TEXT,
  "scopes" JSONB,
  "status" "CoachIntegrationStatus" NOT NULL DEFAULT 'ACTIVE',
  "lastSyncedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CoachGoogleCalendarConnection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CoachScheduleSettings" (
  "id" TEXT NOT NULL,
  "coachProfileId" TEXT NOT NULL,
  "provider" "CoachSchedulingProvider" NOT NULL DEFAULT 'ORKEN',
  "timezone" TEXT NOT NULL DEFAULT 'Europe/Moscow',
  "slotDurationMinutes" INTEGER NOT NULL DEFAULT 60,
  "bufferBeforeMinutes" INTEGER NOT NULL DEFAULT 0,
  "bufferAfterMinutes" INTEGER NOT NULL DEFAULT 15,
  "minNoticeMinutes" INTEGER NOT NULL DEFAULT 720,
  "bookingHorizonDays" INTEGER NOT NULL DEFAULT 30,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CoachScheduleSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CoachAvailabilityRule" (
  "id" TEXT NOT NULL,
  "settingsId" TEXT NOT NULL,
  "weekday" INTEGER NOT NULL,
  "startMinute" INTEGER NOT NULL,
  "endMinute" INTEGER NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CoachAvailabilityRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CoachAvailabilityException" (
  "id" TEXT NOT NULL,
  "settingsId" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "isAvailable" BOOLEAN NOT NULL DEFAULT false,
  "startMinute" INTEGER,
  "endMinute" INTEGER,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CoachAvailabilityException_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CoachAppointment" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "coachProfileId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "timezone" TEXT NOT NULL,
  "provider" "CoachSchedulingProvider" NOT NULL,
  "status" "CoachAppointmentStatus" NOT NULL DEFAULT 'CONFIRMED',
  "externalEventId" TEXT,
  "externalEventUrl" TEXT,
  "meetingUrl" TEXT,
  "syncError" TEXT,
  "cancelledAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CoachAppointment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CoachGoogleCalendarConnection_coachProfileId_key" ON "CoachGoogleCalendarConnection"("coachProfileId");
CREATE UNIQUE INDEX "CoachScheduleSettings_coachProfileId_key" ON "CoachScheduleSettings"("coachProfileId");
CREATE INDEX "CoachAvailabilityRule_settingsId_weekday_active_idx" ON "CoachAvailabilityRule"("settingsId", "weekday", "active");
CREATE INDEX "CoachAvailabilityException_settingsId_date_idx" ON "CoachAvailabilityException"("settingsId", "date");
CREATE UNIQUE INDEX "CoachAppointment_orderId_key" ON "CoachAppointment"("orderId");
CREATE INDEX "CoachAppointment_coachProfileId_startsAt_status_idx" ON "CoachAppointment"("coachProfileId", "startsAt", "status");
CREATE INDEX "CoachAppointment_userId_startsAt_status_idx" ON "CoachAppointment"("userId", "startsAt", "status");

ALTER TABLE "CoachGoogleCalendarConnection" ADD CONSTRAINT "CoachGoogleCalendarConnection_coachProfileId_fkey" FOREIGN KEY ("coachProfileId") REFERENCES "CoachProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CoachScheduleSettings" ADD CONSTRAINT "CoachScheduleSettings_coachProfileId_fkey" FOREIGN KEY ("coachProfileId") REFERENCES "CoachProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CoachAvailabilityRule" ADD CONSTRAINT "CoachAvailabilityRule_settingsId_fkey" FOREIGN KEY ("settingsId") REFERENCES "CoachScheduleSettings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CoachAvailabilityException" ADD CONSTRAINT "CoachAvailabilityException_settingsId_fkey" FOREIGN KEY ("settingsId") REFERENCES "CoachScheduleSettings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CoachAppointment" ADD CONSTRAINT "CoachAppointment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "CoachServiceOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CoachAppointment" ADD CONSTRAINT "CoachAppointment_coachProfileId_fkey" FOREIGN KEY ("coachProfileId") REFERENCES "CoachProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CoachAppointment" ADD CONSTRAINT "CoachAppointment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
