-- CreateTable
CREATE TABLE "WorkspaceSlot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "position" INTEGER NOT NULL,
    "memoryId" TEXT,
    "conceptLabel" TEXT,
    "loading" REAL NOT NULL DEFAULT 0.0,
    "decayRate" REAL NOT NULL DEFAULT 0.0000688,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "sourceSignal" TEXT NOT NULL DEFAULT 'activity',
    "activatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "loadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WorkspaceSlot_memoryId_fkey" FOREIGN KEY ("memoryId") REFERENCES "Memory" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ActivitySignal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "keywords" TEXT NOT NULL,
    "categories" TEXT NOT NULL,
    "sourceType" TEXT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Memory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "content" TEXT NOT NULL,
    "subject" TEXT NOT NULL DEFAULT 'user',
    "category" TEXT NOT NULL,
    "confidence" REAL NOT NULL,
    "verbatimQuote" TEXT,
    "temporality" TEXT NOT NULL DEFAULT 'durable',
    "sensitive" BOOLEAN NOT NULL DEFAULT false,
    "referenceCount" INTEGER NOT NULL DEFAULT 1,
    "lastReferencedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "manuallyStrong" BOOLEAN NOT NULL DEFAULT false,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "sourceId" TEXT NOT NULL,
    "conversationId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "approvedAt" DATETIME,
    "archivedAt" DATETIME,
    "archivedReason" TEXT,
    "project" TEXT,
    "tier" TEXT NOT NULL DEFAULT 'background',
    "suppressedUntil" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Memory_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Memory_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Memory" ("approvedAt", "archivedAt", "archivedReason", "category", "confidence", "content", "conversationId", "createdAt", "id", "lastReferencedAt", "manuallyStrong", "project", "referenceCount", "sensitive", "sourceId", "status", "subject", "temporality", "updatedAt", "verbatimQuote") SELECT "approvedAt", "archivedAt", "archivedReason", "category", "confidence", "content", "conversationId", "createdAt", "id", "lastReferencedAt", "manuallyStrong", "project", "referenceCount", "sensitive", "sourceId", "status", "subject", "temporality", "updatedAt", "verbatimQuote" FROM "Memory";
DROP TABLE "Memory";
ALTER TABLE "new_Memory" RENAME TO "Memory";
CREATE INDEX "Memory_category_idx" ON "Memory"("category");
CREATE INDEX "Memory_status_idx" ON "Memory"("status");
CREATE INDEX "Memory_sourceId_idx" ON "Memory"("sourceId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceSlot_position_key" ON "WorkspaceSlot"("position");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceSlot_memoryId_key" ON "WorkspaceSlot"("memoryId");

-- CreateIndex
CREATE INDEX "ActivitySignal_processed_idx" ON "ActivitySignal"("processed");

-- CreateIndex
CREATE INDEX "ActivitySignal_timestamp_idx" ON "ActivitySignal"("timestamp");
