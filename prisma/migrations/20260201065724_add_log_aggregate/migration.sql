-- CreateTable
CREATE TABLE "log_aggregates" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contestId" TEXT NOT NULL,
    "clubId" TEXT,
    "periodStart" DATETIME NOT NULL,
    "totalQsos" INTEGER NOT NULL DEFAULT 0,
    "totalDupes" INTEGER NOT NULL DEFAULT 0,
    "cwContacts" INTEGER NOT NULL DEFAULT 0,
    "ssbContacts" INTEGER NOT NULL DEFAULT 0,
    "ftxContacts" INTEGER NOT NULL DEFAULT 0,
    "bandBreakdown" TEXT NOT NULL DEFAULT '{}',
    "modeBreakdown" TEXT NOT NULL DEFAULT '{}',
    "operatorStats" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "log_aggregates_contestId_fkey" FOREIGN KEY ("contestId") REFERENCES "contests" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "log_aggregates_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "clubs" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "log_aggregates_contestId_idx" ON "log_aggregates"("contestId");

-- CreateIndex
CREATE INDEX "log_aggregates_clubId_idx" ON "log_aggregates"("clubId");

-- CreateIndex
CREATE INDEX "log_aggregates_periodStart_idx" ON "log_aggregates"("periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "log_aggregates_contestId_clubId_periodStart_key" ON "log_aggregates"("contestId", "clubId", "periodStart");
