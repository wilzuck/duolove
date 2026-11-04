-- CreateEnum
CREATE TYPE "LivingSituation" AS ENUM ('ALONE', 'FAMILY', 'ROOMMATES');

-- CreateEnum
CREATE TYPE "LiveSearchStatus" AS ENUM ('ACTIVE', 'CLOSED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "LiveInviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CHOSEN');

-- AlterEnum
ALTER TYPE "CreditReason" ADD VALUE 'GRANT_PROFILE';

-- AlterEnum
ALTER TYPE "CreditType" ADD VALUE 'MATCH_TOKEN';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'LIVE_INVITE';
ALTER TYPE "NotificationType" ADD VALUE 'LIVE_ACCEPTED';

-- AlterEnum
ALTER TYPE "ProductKind" ADD VALUE 'TOKEN_PACK';

-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "hasChildren" BOOLEAN,
ADD COLUMN     "heightCm" INTEGER,
ADD COLUMN     "likesPets" BOOLEAN,
ADD COLUMN     "liveOptIn" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "living" "LivingSituation",
ADD COLUMN     "originCountry" TEXT;

-- CreateTable
CREATE TABLE "LiveSearch" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "criteria" JSONB NOT NULL,
    "status" "LiveSearchStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LiveSearch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveInvite" (
    "id" TEXT NOT NULL,
    "searchId" TEXT NOT NULL,
    "seekerId" TEXT NOT NULL,
    "inviteeId" TEXT NOT NULL,
    "status" "LiveInviteStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LiveInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LiveSearch_userId_createdAt_idx" ON "LiveSearch"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "LiveSearch_status_expiresAt_idx" ON "LiveSearch"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "LiveInvite_inviteeId_status_idx" ON "LiveInvite"("inviteeId", "status");

-- CreateIndex
CREATE INDEX "LiveInvite_seekerId_status_idx" ON "LiveInvite"("seekerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "LiveInvite_searchId_inviteeId_key" ON "LiveInvite"("searchId", "inviteeId");

-- AddForeignKey
ALTER TABLE "LiveSearch" ADD CONSTRAINT "LiveSearch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveInvite" ADD CONSTRAINT "LiveInvite_searchId_fkey" FOREIGN KEY ("searchId") REFERENCES "LiveSearch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveInvite" ADD CONSTRAINT "LiveInvite_seekerId_fkey" FOREIGN KEY ("seekerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveInvite" ADD CONSTRAINT "LiveInvite_inviteeId_fkey" FOREIGN KEY ("inviteeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
