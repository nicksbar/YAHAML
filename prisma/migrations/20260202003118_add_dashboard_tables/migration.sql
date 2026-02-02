/*
  Warnings:

  - You are about to drop the column `altCallsigns` on the `clubs` table. All the data in the column will be lost.

*/
-- CreateTable
CREATE TABLE "locations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "latitude" TEXT,
    "longitude" TEXT,
    "grid" TEXT,
    "elevation" INTEGER,
    "section" TEXT,
    "county" TEXT,
    "cqZone" INTEGER,
    "ituZone" INTEGER,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "operator_messages" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stationId" TEXT NOT NULL,
    "fromCall" TEXT NOT NULL,
    "toCall" TEXT NOT NULL,
    "messageType" TEXT NOT NULL DEFAULT 'DIRECT',
    "content" TEXT NOT NULL,
    "readAt" DATETIME,
    "source" TEXT NOT NULL DEFAULT 'n3fjp',
    "rawPayload" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "operator_messages_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "stations" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "qso_contacts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stationId" TEXT NOT NULL,
    "contestId" TEXT,
    "callsign" TEXT NOT NULL,
    "band" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "frequency" TEXT,
    "rstSent" TEXT,
    "rstRcvd" TEXT,
    "name" TEXT,
    "section" TEXT,
    "grid" TEXT,
    "state" TEXT,
    "latitude" REAL,
    "longitude" REAL,
    "qsoDateTime" DATETIME NOT NULL,
    "duration" INTEGER,
    "source" TEXT NOT NULL DEFAULT 'unknown',
    "logEntryId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "qso_contacts_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "stations" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "qso_contacts_contestId_fkey" FOREIGN KEY ("contestId") REFERENCES "contests" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "qso_contacts_logEntryId_fkey" FOREIGN KEY ("logEntryId") REFERENCES "qso_logs" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "contest_stats" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contestId" TEXT NOT NULL,
    "stationId" TEXT,
    "periodStart" DATETIME NOT NULL,
    "periodEnd" DATETIME NOT NULL,
    "period" TEXT NOT NULL DEFAULT 'hour',
    "qsoCount" INTEGER NOT NULL DEFAULT 0,
    "pointsTotal" INTEGER NOT NULL DEFAULT 0,
    "mults" INTEGER NOT NULL DEFAULT 0,
    "dupeCount" INTEGER NOT NULL DEFAULT 0,
    "topCallsign" TEXT,
    "topCallCount" INTEGER,
    "bandDist" TEXT,
    "modeDist" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "contest_stats_contestId_fkey" FOREIGN KEY ("contestId") REFERENCES "contests" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "contest_stats_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "stations" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "band_occupancy" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "contestId" TEXT,
    "stationId" TEXT NOT NULL,
    "band" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "lastSeen" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "band_occupancy_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "stations" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "band_occupancy_contestId_fkey" FOREIGN KEY ("contestId") REFERENCES "contests" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_clubs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "callsign" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "section" TEXT,
    "grid" TEXT,
    "contestId" TEXT,
    "description" TEXT,
    "location" TEXT,
    "contactEmail" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "totalQsos" INTEGER NOT NULL DEFAULT 0,
    "totalPoints" INTEGER NOT NULL DEFAULT 0,
    "operatorList" TEXT,
    "adminList" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "clubs_contestId_fkey" FOREIGN KEY ("contestId") REFERENCES "contests" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_clubs" ("adminList", "callsign", "contactEmail", "contestId", "createdAt", "description", "grid", "id", "isActive", "location", "name", "operatorList", "section", "totalPoints", "totalQsos", "updatedAt") SELECT "adminList", "callsign", "contactEmail", "contestId", "createdAt", "description", "grid", "id", "isActive", "location", "name", "operatorList", "section", "totalPoints", "totalQsos", "updatedAt" FROM "clubs";
DROP TABLE "clubs";
ALTER TABLE "new_clubs" RENAME TO "clubs";
CREATE UNIQUE INDEX "clubs_callsign_key" ON "clubs"("callsign");
CREATE INDEX "clubs_contestId_idx" ON "clubs"("contestId");
CREATE TABLE "new_stations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "callsign" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "class" TEXT,
    "section" TEXT,
    "grid" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "locationId" TEXT,
    "clubId" TEXT,
    CONSTRAINT "stations_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "stations_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "clubs" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_stations" ("callsign", "class", "clubId", "createdAt", "grid", "id", "name", "section", "updatedAt") SELECT "callsign", "class", "clubId", "createdAt", "grid", "id", "name", "section", "updatedAt" FROM "stations";
DROP TABLE "stations";
ALTER TABLE "new_stations" RENAME TO "stations";
CREATE UNIQUE INDEX "stations_callsign_key" ON "stations"("callsign");
CREATE INDEX "stations_clubId_idx" ON "stations"("clubId");
CREATE INDEX "stations_locationId_idx" ON "stations"("locationId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "operator_messages_stationId_idx" ON "operator_messages"("stationId");

-- CreateIndex
CREATE INDEX "operator_messages_createdAt_idx" ON "operator_messages"("createdAt");

-- CreateIndex
CREATE INDEX "operator_messages_fromCall_idx" ON "operator_messages"("fromCall");

-- CreateIndex
CREATE INDEX "operator_messages_toCall_idx" ON "operator_messages"("toCall");

-- CreateIndex
CREATE UNIQUE INDEX "qso_contacts_logEntryId_key" ON "qso_contacts"("logEntryId");

-- CreateIndex
CREATE INDEX "qso_contacts_stationId_idx" ON "qso_contacts"("stationId");

-- CreateIndex
CREATE INDEX "qso_contacts_contestId_idx" ON "qso_contacts"("contestId");

-- CreateIndex
CREATE INDEX "qso_contacts_qsoDateTime_idx" ON "qso_contacts"("qsoDateTime");

-- CreateIndex
CREATE INDEX "qso_contacts_band_idx" ON "qso_contacts"("band");

-- CreateIndex
CREATE INDEX "qso_contacts_mode_idx" ON "qso_contacts"("mode");

-- CreateIndex
CREATE INDEX "qso_contacts_createdAt_idx" ON "qso_contacts"("createdAt");

-- CreateIndex
CREATE INDEX "contest_stats_contestId_idx" ON "contest_stats"("contestId");

-- CreateIndex
CREATE INDEX "contest_stats_stationId_idx" ON "contest_stats"("stationId");

-- CreateIndex
CREATE INDEX "contest_stats_periodStart_idx" ON "contest_stats"("periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "contest_stats_contestId_stationId_periodStart_period_key" ON "contest_stats"("contestId", "stationId", "periodStart", "period");

-- CreateIndex
CREATE INDEX "band_occupancy_contestId_idx" ON "band_occupancy"("contestId");

-- CreateIndex
CREATE INDEX "band_occupancy_band_idx" ON "band_occupancy"("band");

-- CreateIndex
CREATE INDEX "band_occupancy_mode_idx" ON "band_occupancy"("mode");

-- CreateIndex
CREATE INDEX "band_occupancy_lastSeen_idx" ON "band_occupancy"("lastSeen");

-- CreateIndex
CREATE UNIQUE INDEX "band_occupancy_stationId_band_mode_key" ON "band_occupancy"("stationId", "band", "mode");
