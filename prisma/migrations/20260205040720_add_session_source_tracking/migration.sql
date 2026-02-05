-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT NOT NULL,
    "callsign" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    "lastActivity" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "browserId" TEXT,
    "sourceType" TEXT NOT NULL DEFAULT 'web',
    "sourceInfo" TEXT,
    CONSTRAINT "sessions_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "stations" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_sessions" ("browserId", "callsign", "createdAt", "expiresAt", "id", "lastActivity", "stationId", "token") SELECT "browserId", "callsign", "createdAt", "expiresAt", "id", "lastActivity", "stationId", "token" FROM "sessions";
DROP TABLE "sessions";
ALTER TABLE "new_sessions" RENAME TO "sessions";
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");
CREATE INDEX "sessions_callsign_idx" ON "sessions"("callsign");
CREATE INDEX "sessions_stationId_idx" ON "sessions"("stationId");
CREATE INDEX "sessions_expiresAt_idx" ON "sessions"("expiresAt");
CREATE INDEX "sessions_lastActivity_idx" ON "sessions"("lastActivity");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
