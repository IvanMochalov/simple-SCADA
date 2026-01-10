-- CreateTable
CREATE TABLE "ConnectionNode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "comPort" TEXT NOT NULL,
    "baudRate" INTEGER NOT NULL DEFAULT 9600,
    "dataBits" INTEGER NOT NULL DEFAULT 8,
    "stopBits" INTEGER NOT NULL DEFAULT 1,
    "parity" TEXT NOT NULL DEFAULT 'none',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "connectionNodeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" INTEGER NOT NULL,
    "responseTimeout" INTEGER NOT NULL DEFAULT 1000,
    "pollInterval" INTEGER NOT NULL DEFAULT 1000,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'unknown',
    "lastPollTime" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Device_connectionNodeId_fkey" FOREIGN KEY ("connectionNodeId") REFERENCES "ConnectionNode" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deviceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" INTEGER NOT NULL,
    "registerType" TEXT NOT NULL,
    "deviceDataType" TEXT NOT NULL,
    "serverDataType" TEXT NOT NULL,
    "accessType" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Tag_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "HistoryData" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deviceId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HistoryData_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "HistoryData_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "HistoryData_deviceId_tagId_timestamp_idx" ON "HistoryData"("deviceId", "tagId", "timestamp");

-- CreateIndex
CREATE INDEX "HistoryData_timestamp_idx" ON "HistoryData"("timestamp");
