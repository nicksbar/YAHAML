-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_log_aggregates" (
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
    CONSTRAINT "log_aggregates_contestId_fkey" FOREIGN KEY ("contestId") REFERENCES "contests" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_log_aggregates" ("bandBreakdown", "clubId", "contestId", "createdAt", "cwContacts", "ftxContacts", "id", "modeBreakdown", "operatorStats", "periodStart", "ssbContacts", "totalDupes", "totalQsos", "updatedAt") SELECT "bandBreakdown", "clubId", "contestId", "createdAt", "cwContacts", "ftxContacts", "id", "modeBreakdown", "operatorStats", "periodStart", "ssbContacts", "totalDupes", "totalQsos", "updatedAt" FROM "log_aggregates";
DROP TABLE "log_aggregates";
ALTER TABLE "new_log_aggregates" RENAME TO "log_aggregates";
CREATE INDEX "log_aggregates_contestId_idx" ON "log_aggregates"("contestId");
CREATE INDEX "log_aggregates_clubId_idx" ON "log_aggregates"("clubId");
CREATE INDEX "log_aggregates_periodStart_idx" ON "log_aggregates"("periodStart");
CREATE UNIQUE INDEX "log_aggregates_contestId_clubId_periodStart_key" ON "log_aggregates"("contestId", "clubId", "periodStart");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
