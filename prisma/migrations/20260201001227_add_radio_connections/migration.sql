-- CreateTable
CREATE TABLE "stations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "callsign" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "class" TEXT,
    "section" TEXT,
    "grid" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "clubId" TEXT,
    CONSTRAINT "stations_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "clubs" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "band_activities" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stationId" TEXT NOT NULL,
    "band" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "frequency" TEXT,
    "power" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastSeen" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "band_activities_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "stations" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "qso_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stationId" TEXT NOT NULL,
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "qso_logs_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "stations" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "context_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stationId" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "details" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "context_logs_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "stations" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "network_status" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stationId" TEXT NOT NULL,
    "isConnected" BOOLEAN NOT NULL DEFAULT false,
    "lastConnected" DATETIME,
    "ip" TEXT,
    "port" INTEGER,
    "relayHost" TEXT,
    "relayPort" INTEGER,
    "relayVersion" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "network_status_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "stations" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "adif_imports" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "filename" TEXT NOT NULL,
    "fileContent" TEXT NOT NULL,
    "recordCount" INTEGER NOT NULL DEFAULT 0,
    "importDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT
);

-- CreateTable
CREATE TABLE "contest_templates" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "organization" TEXT,
    "scoringRules" TEXT NOT NULL,
    "requiredFields" TEXT NOT NULL,
    "validationRules" TEXT NOT NULL,
    "uiConfig" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "contests" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "templateId" TEXT,
    "mode" TEXT NOT NULL DEFAULT 'FIELD_DAY',
    "startTime" DATETIME,
    "endTime" DATETIME,
    "duration" INTEGER,
    "config" TEXT,
    "scoringMode" TEXT NOT NULL DEFAULT 'ARRL',
    "pointsPerQso" INTEGER NOT NULL DEFAULT 1,
    "multiplierRule" TEXT,
    "powerBonus" BOOLEAN NOT NULL DEFAULT false,
    "maxStations" INTEGER NOT NULL DEFAULT 6,
    "allowRemote" BOOLEAN NOT NULL DEFAULT true,
    "bandSelection" TEXT,
    "modeSelection" TEXT,
    "totalQsos" INTEGER NOT NULL DEFAULT 0,
    "totalPoints" INTEGER NOT NULL DEFAULT 0,
    "statistics" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "contests_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "contest_templates" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "clubs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "callsign" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "section" TEXT,
    "grid" TEXT,
    "contestId" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "contactEmail" TEXT,
    "altCallsigns" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "totalQsos" INTEGER NOT NULL DEFAULT 0,
    "totalPoints" INTEGER NOT NULL DEFAULT 0,
    "operatorList" TEXT,
    "adminList" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "clubs_contestId_fkey" FOREIGN KEY ("contestId") REFERENCES "contests" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "special_callsigns" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "callsign" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "description" TEXT,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "clubId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "autoActivate" BOOLEAN NOT NULL DEFAULT true,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "lastUsed" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "special_callsigns_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "clubs" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "radio_connections" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 4532,
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

-- CreateTable
CREATE TABLE "radio_assignments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "radioId" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "assignedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unassignedAt" DATETIME,
    "qsoCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "radio_assignments_radioId_fkey" FOREIGN KEY ("radioId") REFERENCES "radio_connections" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "radio_assignments_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "stations" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "stations_callsign_key" ON "stations"("callsign");

-- CreateIndex
CREATE INDEX "stations_clubId_idx" ON "stations"("clubId");

-- CreateIndex
CREATE INDEX "band_activities_stationId_idx" ON "band_activities"("stationId");

-- CreateIndex
CREATE INDEX "band_activities_lastSeen_idx" ON "band_activities"("lastSeen");

-- CreateIndex
CREATE INDEX "qso_logs_stationId_idx" ON "qso_logs"("stationId");

-- CreateIndex
CREATE INDEX "qso_logs_qsoDate_idx" ON "qso_logs"("qsoDate");

-- CreateIndex
CREATE INDEX "qso_logs_callsign_idx" ON "qso_logs"("callsign");

-- CreateIndex
CREATE INDEX "context_logs_stationId_idx" ON "context_logs"("stationId");

-- CreateIndex
CREATE INDEX "context_logs_createdAt_idx" ON "context_logs"("createdAt");

-- CreateIndex
CREATE INDEX "context_logs_level_idx" ON "context_logs"("level");

-- CreateIndex
CREATE UNIQUE INDEX "network_status_stationId_key" ON "network_status"("stationId");

-- CreateIndex
CREATE UNIQUE INDEX "contest_templates_type_key" ON "contest_templates"("type");

-- CreateIndex
CREATE INDEX "contests_templateId_idx" ON "contests"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "clubs_callsign_key" ON "clubs"("callsign");

-- CreateIndex
CREATE INDEX "clubs_contestId_idx" ON "clubs"("contestId");

-- CreateIndex
CREATE UNIQUE INDEX "special_callsigns_callsign_key" ON "special_callsigns"("callsign");

-- CreateIndex
CREATE INDEX "special_callsigns_clubId_idx" ON "special_callsigns"("clubId");

-- CreateIndex
CREATE INDEX "special_callsigns_startDate_idx" ON "special_callsigns"("startDate");

-- CreateIndex
CREATE INDEX "special_callsigns_endDate_idx" ON "special_callsigns"("endDate");

-- CreateIndex
CREATE INDEX "special_callsigns_isActive_idx" ON "special_callsigns"("isActive");

-- CreateIndex
CREATE INDEX "radio_connections_isEnabled_idx" ON "radio_connections"("isEnabled");

-- CreateIndex
CREATE INDEX "radio_connections_isConnected_idx" ON "radio_connections"("isConnected");

-- CreateIndex
CREATE UNIQUE INDEX "radio_connections_host_port_key" ON "radio_connections"("host", "port");

-- CreateIndex
CREATE INDEX "radio_assignments_radioId_idx" ON "radio_assignments"("radioId");

-- CreateIndex
CREATE INDEX "radio_assignments_stationId_idx" ON "radio_assignments"("stationId");

-- CreateIndex
CREATE INDEX "radio_assignments_isActive_idx" ON "radio_assignments"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "radio_assignments_radioId_stationId_isActive_key" ON "radio_assignments"("radioId", "stationId", "isActive");
