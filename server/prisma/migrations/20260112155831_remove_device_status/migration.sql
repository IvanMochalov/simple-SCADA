/*
  Warnings:

  - You are about to drop the column `status` on the `Device` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Device" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "connectionNodeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" INTEGER NOT NULL,
    "responseTimeout" INTEGER NOT NULL DEFAULT 1000,
    "pollInterval" INTEGER NOT NULL DEFAULT 1000,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastPollTime" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Device_connectionNodeId_fkey" FOREIGN KEY ("connectionNodeId") REFERENCES "ConnectionNode" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Device" ("address", "connectionNodeId", "createdAt", "enabled", "id", "lastPollTime", "name", "pollInterval", "responseTimeout", "updatedAt") SELECT "address", "connectionNodeId", "createdAt", "enabled", "id", "lastPollTime", "name", "pollInterval", "responseTimeout", "updatedAt" FROM "Device";
DROP TABLE "Device";
ALTER TABLE "new_Device" RENAME TO "Device";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
