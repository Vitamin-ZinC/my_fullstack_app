ALTER TABLE "FounderIntakeItem" ADD COLUMN "priority" TEXT NOT NULL DEFAULT 'NORMAL';

CREATE INDEX "FounderIntakeItem_priority_createdAt_idx" ON "FounderIntakeItem"("priority", "createdAt");
