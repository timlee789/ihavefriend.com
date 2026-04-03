-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "role" TEXT NOT NULL DEFAULT 'user',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserLimit" (
    "userId" INTEGER NOT NULL,
    "dailyMinutes" INTEGER NOT NULL DEFAULT 30,
    "monthlyMinutes" INTEGER NOT NULL DEFAULT 300,
    "memoryKb" INTEGER NOT NULL DEFAULT 512,

    CONSTRAINT "UserLimit_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "UserMemory" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "characterId" TEXT NOT NULL DEFAULT 'emma',
    "factsJson" TEXT NOT NULL DEFAULT '[]',
    "summary" TEXT NOT NULL DEFAULT '',
    "transcriptJson" TEXT NOT NULL DEFAULT '[]',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserMemory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageLog" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "sessionDate" TEXT NOT NULL,
    "minutesUsed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "turnsCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "UsageLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "UserMemory_userId_characterId_key" ON "UserMemory"("userId", "characterId");

-- CreateIndex
CREATE UNIQUE INDEX "UsageLog_userId_sessionDate_key" ON "UsageLog"("userId", "sessionDate");

-- AddForeignKey
ALTER TABLE "UserLimit" ADD CONSTRAINT "UserLimit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserMemory" ADD CONSTRAINT "UserMemory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageLog" ADD CONSTRAINT "UsageLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
