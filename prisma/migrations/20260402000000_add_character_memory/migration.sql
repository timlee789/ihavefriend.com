-- Migration: add per-character memory support
-- Recreate UserMemory with id PK and characterId column
-- Preserve existing rows (assign characterId = 'emma')

-- 1. Create new table with correct schema
CREATE TABLE "UserMemory_new" (
    "id"             INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId"         INTEGER NOT NULL,
    "characterId"    TEXT    NOT NULL DEFAULT 'emma',
    "factsJson"      TEXT    NOT NULL DEFAULT '[]',
    "summary"        TEXT    NOT NULL DEFAULT '',
    "transcriptJson" TEXT    NOT NULL DEFAULT '[]',
    "updatedAt"      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserMemory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- 2. Copy existing data, assigning characterId = 'emma'
INSERT INTO "UserMemory_new" ("userId", "characterId", "factsJson", "summary", "transcriptJson", "updatedAt")
SELECT "userId", 'emma', "factsJson", "summary", "transcriptJson", "updatedAt"
FROM "UserMemory";

-- 3. Drop old table
DROP TABLE "UserMemory";

-- 4. Rename new table
ALTER TABLE "UserMemory_new" RENAME TO "UserMemory";

-- 5. Create unique index on userId + characterId
CREATE UNIQUE INDEX "UserMemory_userId_characterId_key" ON "UserMemory"("userId", "characterId");

-- 6. Remove avatarId and avatarChosen columns from User (SQLite workaround)
CREATE TABLE "User_new" (
    "id"           INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email"        TEXT    NOT NULL,
    "passwordHash" TEXT    NOT NULL,
    "name"         TEXT    NOT NULL DEFAULT '',
    "role"         TEXT    NOT NULL DEFAULT 'user',
    "isActive"     BOOLEAN NOT NULL DEFAULT 1,
    "createdAt"    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO "User_new" ("id", "email", "passwordHash", "name", "role", "isActive", "createdAt")
SELECT "id", "email", "passwordHash", "name", "role", "isActive", "createdAt"
FROM "User";

DROP TABLE "User";
ALTER TABLE "User_new" RENAME TO "User";

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
