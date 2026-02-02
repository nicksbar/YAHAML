-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_stations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "callsign" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "class" TEXT,
    "licenseClass" TEXT,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zip" TEXT,
    "country" TEXT,
    "section" TEXT,
    "grid" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "locationId" TEXT,
    "clubId" TEXT,
    "contestId" TEXT,
    CONSTRAINT "stations_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "stations_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "clubs" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "stations_contestId_fkey" FOREIGN KEY ("contestId") REFERENCES "contests" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_stations" ("address", "callsign", "city", "class", "clubId", "country", "createdAt", "grid", "id", "licenseClass", "locationId", "name", "section", "state", "updatedAt", "zip") SELECT "address", "callsign", "city", "class", "clubId", "country", "createdAt", "grid", "id", "licenseClass", "locationId", "name", "section", "state", "updatedAt", "zip" FROM "stations";
DROP TABLE "stations";
ALTER TABLE "new_stations" RENAME TO "stations";
CREATE UNIQUE INDEX "stations_callsign_key" ON "stations"("callsign");
CREATE INDEX "stations_clubId_idx" ON "stations"("clubId");
CREATE INDEX "stations_locationId_idx" ON "stations"("locationId");
CREATE INDEX "stations_contestId_idx" ON "stations"("contestId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
