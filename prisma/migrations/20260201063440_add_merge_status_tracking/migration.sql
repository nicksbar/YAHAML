/*
  Warnings:

  - Added the required column `dedupeKey` to the `qso_logs` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_qso_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stationId" TEXT NOT NULL,
    "contestId" TEXT,
    "clubId" TEXT,
    "operatorCallsign" TEXT,
    "source" TEXT NOT NULL DEFAULT 'unknown',
    "dedupeKey" TEXT NOT NULL,
    "callsign" TEXT NOT NULL,
    "band" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "frequency" TEXT,
    "rstSent" TEXT,
    "rstRcvd" TEXT,
    "power" INTEGER,
    "qsoDate" DATETIME NOT NULL,
    "qsoTime" TEXT NOT NULL,
    "duration" INTEGER,
    "points" INTEGER NOT NULL DEFAULT 0,
    "multiplier" TEXT,
    "name" TEXT,
    "state" TEXT,
    "grid" TEXT,
    "rawPayload" TEXT,
    "merge_status" TEXT NOT NULL DEFAULT 'primary',
    "merged_into_id" TEXT,
    "merge_reason" TEXT,
    "merge_timestamp" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "qso_logs_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "stations" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "qso_logs_contestId_fkey" FOREIGN KEY ("contestId") REFERENCES "contests" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "qso_logs_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "clubs" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "qso_logs_merged_into_id_fkey" FOREIGN KEY ("merged_into_id") REFERENCES "qso_logs" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_qso_logs" ("band", "callsign", "createdAt", "duration", "frequency", "grid", "id", "mode", "multiplier", "name", "points", "power", "qsoDate", "qsoTime", "rstRcvd", "rstSent", "state", "stationId", "updatedAt") SELECT "band", "callsign", "createdAt", "duration", "frequency", "grid", "id", "mode", "multiplier", "name", "points", "power", "qsoDate", "qsoTime", "rstRcvd", "rstSent", "state", "stationId", "updatedAt" FROM "qso_logs";
DROP TABLE "qso_logs";
ALTER TABLE "new_qso_logs" RENAME TO "qso_logs";
CREATE UNIQUE INDEX "qso_logs_dedupeKey_key" ON "qso_logs"("dedupeKey");
CREATE INDEX "qso_logs_stationId_idx" ON "qso_logs"("stationId");
CREATE INDEX "qso_logs_contestId_idx" ON "qso_logs"("contestId");
CREATE INDEX "qso_logs_clubId_idx" ON "qso_logs"("clubId");
CREATE INDEX "qso_logs_qsoDate_idx" ON "qso_logs"("qsoDate");
CREATE INDEX "qso_logs_callsign_idx" ON "qso_logs"("callsign");
CREATE INDEX "qso_logs_operatorCallsign_idx" ON "qso_logs"("operatorCallsign");
CREATE INDEX "qso_logs_merge_status_idx" ON "qso_logs"("merge_status");
CREATE INDEX "qso_logs_merged_into_id_idx" ON "qso_logs"("merged_into_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
