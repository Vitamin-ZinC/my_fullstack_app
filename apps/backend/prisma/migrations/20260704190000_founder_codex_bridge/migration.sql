CREATE TABLE "FounderIntakeItem" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "queueStatus" TEXT NOT NULL DEFAULT 'NOT_QUEUED',
    "codexStatus" TEXT NOT NULL DEFAULT 'NEW',
    "bridgeStatus" TEXT NOT NULL DEFAULT 'NOT_CONFIGURED',
    "bridgeAttempts" INTEGER NOT NULL DEFAULT 0,
    "bridgeLastError" TEXT,
    "bridgeDeliveredAt" TIMESTAMP(3),
    "bridgeRespondedAt" TIMESTAMP(3),
    "codexReply" TEXT,
    "summary" TEXT NOT NULL,
    "sanitizedBody" TEXT NOT NULL,
    "answer" TEXT,
    "allowedWork" JSONB NOT NULL,
    "risks" JSONB NOT NULL,
    "blockedReasons" JSONB NOT NULL,
    "requiredChecks" JSONB NOT NULL,
    "howToMakeWorkable" JSONB NOT NULL,
    "clarifyingQuestions" JSONB NOT NULL,
    "rawAudit" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FounderIntakeItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FounderIntakeItem_decision_queueStatus_createdAt_idx" ON "FounderIntakeItem"("decision", "queueStatus", "createdAt");
CREATE INDEX "FounderIntakeItem_codexStatus_createdAt_idx" ON "FounderIntakeItem"("codexStatus", "createdAt");
CREATE INDEX "FounderIntakeItem_bridgeStatus_createdAt_idx" ON "FounderIntakeItem"("bridgeStatus", "createdAt");
