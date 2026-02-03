-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_radio_connections" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 4532,
    "connectionType" TEXT NOT NULL DEFAULT 'hamlib',
    "manufacturer" TEXT,
    "model" TEXT,
    "isConnected" BOOLEAN NOT NULL DEFAULT false,
    "lastSeen" DATETIME,
    "lastError" TEXT,
    "frequency" TEXT,
    "mode" TEXT,
    "bandwidth" INTEGER,
    "power" INTEGER,
    "pollInterval" INTEGER NOT NULL DEFAULT 1000,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_radio_connections" ("bandwidth", "createdAt", "frequency", "host", "id", "isConnected", "isEnabled", "lastError", "lastSeen", "manufacturer", "mode", "model", "name", "pollInterval", "port", "power", "updatedAt") SELECT "bandwidth", "createdAt", "frequency", "host", "id", "isConnected", "isEnabled", "lastError", "lastSeen", "manufacturer", "mode", "model", "name", "pollInterval", "port", "power", "updatedAt" FROM "radio_connections";
DROP TABLE "radio_connections";
ALTER TABLE "new_radio_connections" RENAME TO "radio_connections";
CREATE INDEX "radio_connections_isEnabled_idx" ON "radio_connections"("isEnabled");
CREATE INDEX "radio_connections_isConnected_idx" ON "radio_connections"("isConnected");
CREATE UNIQUE INDEX "radio_connections_host_port_key" ON "radio_connections"("host", "port");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
