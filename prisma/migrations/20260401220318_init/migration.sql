-- CreateTable
CREATE TABLE "User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "avatarId" TEXT NOT NULL DEFAULT 'lily',
    "role" TEXT NOT NULL DEFAULT 'user',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "avatarChosen" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "UserLimit" (
    "userId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "dailyMinutes" INTEGER NOT NULL DEFAULT 30,
    "monthlyMinutes" INTEGER NOT NULL DEFAULT 300,
    "memoryKb" INTEGER NOT NULL DEFAULT 512,
    CONSTRAINT "UserLimit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UserMemory" (
    "userId" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "factsJson" TEXT NOT NULL DEFAULT '[]',
    "summary" TEXT NOT NULL DEFAULT '',
    "transcriptJson" TEXT NOT NULL DEFAULT '[]',
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserMemory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UsageLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "sessionDate" TEXT NOT NULL,
    "minutesUsed" REAL NOT NULL DEFAULT 0,
    "turnsCount" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "UsageLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "UsageLog_userId_sessionDate_key" ON "UsageLog"("userId", "sessionDate");
