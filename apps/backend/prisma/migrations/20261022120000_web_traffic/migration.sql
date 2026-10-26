CREATE TABLE "WebTrafficVisit" (
    "id" TEXT NOT NULL,
    "visitorHash" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "medium" TEXT NOT NULL,
    "campaign" TEXT,
    "device" TEXT NOT NULL,
    "entryPage" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WebTrafficVisit_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "WebTrafficPageView" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "page" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WebTrafficPageView_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "WebTrafficConversion" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "entityHash" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WebTrafficConversion_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "WebTrafficVisit_createdAt_idx" ON "WebTrafficVisit"("createdAt");
CREATE INDEX "WebTrafficVisit_visitorHash_createdAt_idx" ON "WebTrafficVisit"("visitorHash", "createdAt");
CREATE INDEX "WebTrafficPageView_createdAt_page_idx" ON "WebTrafficPageView"("createdAt", "page");
CREATE INDEX "WebTrafficPageView_visitId_idx" ON "WebTrafficPageView"("visitId");
CREATE UNIQUE INDEX "WebTrafficConversion_kind_entityHash_key" ON "WebTrafficConversion"("kind", "entityHash");
CREATE INDEX "WebTrafficConversion_visitId_kind_idx" ON "WebTrafficConversion"("visitId", "kind");
ALTER TABLE "WebTrafficPageView" ADD CONSTRAINT "WebTrafficPageView_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "WebTrafficVisit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WebTrafficConversion" ADD CONSTRAINT "WebTrafficConversion_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "WebTrafficVisit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
