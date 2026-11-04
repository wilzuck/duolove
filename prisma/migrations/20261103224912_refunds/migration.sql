-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('REQUESTED', 'PROCESSING', 'COMPLETED', 'REJECTED', 'FAILED');

-- CreateEnum
CREATE TYPE "RefundSource" AS ENUM ('USER', 'ADMIN');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'REFUND_UPDATE';

-- CreateTable
CREATE TABLE "Refund" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "amountXof" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "source" "RefundSource" NOT NULL,
    "status" "RefundStatus" NOT NULL DEFAULT 'REQUESTED',
    "requestedById" TEXT NOT NULL,
    "decidedById" TEXT,
    "decisionNote" TEXT,
    "providerRef" TEXT,
    "failureReason" TEXT,
    "creditsReversed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Refund_paymentId_idx" ON "Refund"("paymentId");

-- CreateIndex
CREATE INDEX "Refund_status_createdAt_idx" ON "Refund"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
