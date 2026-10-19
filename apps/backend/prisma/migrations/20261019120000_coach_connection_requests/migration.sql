ALTER TYPE "CoachClientFunding" ADD VALUE 'SELF_FUNDED';

CREATE TYPE "CoachConnectionRequestStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED');

CREATE TABLE "CoachConnectionRequest" (
    "id" TEXT NOT NULL,
    "coachProfileId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "CoachConnectionRequestStatus" NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "decisionNote" TEXT,
    "relationshipId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CoachConnectionRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CoachConnectionRequest_relationshipId_key" ON "CoachConnectionRequest"("relationshipId");
CREATE UNIQUE INDEX "CoachConnectionRequest_coachProfileId_userId_key" ON "CoachConnectionRequest"("coachProfileId", "userId");
CREATE INDEX "CoachConnectionRequest_coachProfileId_status_createdAt_idx" ON "CoachConnectionRequest"("coachProfileId", "status", "createdAt");
CREATE INDEX "CoachConnectionRequest_userId_status_idx" ON "CoachConnectionRequest"("userId", "status");

ALTER TABLE "CoachConnectionRequest" ADD CONSTRAINT "CoachConnectionRequest_coachProfileId_fkey" FOREIGN KEY ("coachProfileId") REFERENCES "CoachProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CoachConnectionRequest" ADD CONSTRAINT "CoachConnectionRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CoachConnectionRequest" ADD CONSTRAINT "CoachConnectionRequest_relationshipId_fkey" FOREIGN KEY ("relationshipId") REFERENCES "CoachClientRelationship"("id") ON DELETE SET NULL ON UPDATE CASCADE;
