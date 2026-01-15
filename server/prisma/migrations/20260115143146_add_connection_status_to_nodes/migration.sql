-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ConnectionNode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "comPort" TEXT NOT NULL,
    "baudRate" INTEGER NOT NULL DEFAULT 9600,
    "dataBits" INTEGER NOT NULL DEFAULT 8,
    "stopBits" INTEGER NOT NULL DEFAULT 1,
    "parity" TEXT NOT NULL DEFAULT 'none',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "connectionStatus" TEXT NOT NULL DEFAULT 'disconnected',
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_ConnectionNode" ("baudRate", "comPort", "createdAt", "dataBits", "enabled", "id", "name", "parity", "stopBits", "type", "updatedAt") SELECT "baudRate", "comPort", "createdAt", "dataBits", "enabled", "id", "name", "parity", "stopBits", "type", "updatedAt" FROM "ConnectionNode";
DROP TABLE "ConnectionNode";
ALTER TABLE "new_ConnectionNode" RENAME TO "ConnectionNode";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
