-- CreateEnum
CREATE TYPE "CreditType" AS ENUM ('SUPER_LIKE', 'BOOST_30', 'BOOST_120', 'BOOST_1440');

-- CreateEnum
CREATE TYPE "CreditReason" AS ENUM ('PURCHASE', 'GRANT_PLAN', 'CONSUME', 'REFUND', 'ADMIN_GRANT');

-- CreateEnum
CREATE TYPE "PaymentKind" AS ENUM ('SUBSCRIPTION', 'PRODUCT');

-- CreateEnum
CREATE TYPE "ProductKind" AS ENUM ('BOOST', 'SUPER_LIKE_PACK');

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "kind" "PaymentKind" NOT NULL DEFAULT 'SUBSCRIPTION',
ADD COLUMN     "months" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "productId" TEXT,
ADD COLUMN     "quantity" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "months" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "SubscriptionPlan" ADD COLUMN     "featured" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "PlanPrice" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "months" INTEGER NOT NULL,
    "discountPercent" INTEGER NOT NULL DEFAULT 0,
    "amountOverride" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "PlanPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "kind" "ProductKind" NOT NULL,
    "creditType" "CreditType" NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "priceXof" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'XOF',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditWallet" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "CreditType" NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditWallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "CreditType" NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" "CreditReason" NOT NULL,
    "refId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Boost" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Boost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlanPrice_planId_months_key" ON "PlanPrice"("planId", "months");

-- CreateIndex
CREATE UNIQUE INDEX "Product_code_key" ON "Product"("code");

-- CreateIndex
CREATE UNIQUE INDEX "CreditWallet_userId_type_key" ON "CreditWallet"("userId", "type");

-- CreateIndex
CREATE INDEX "CreditTransaction_userId_createdAt_idx" ON "CreditTransaction"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CreditTransaction_userId_reason_refId_key" ON "CreditTransaction"("userId", "reason", "refId");

-- CreateIndex
CREATE INDEX "Boost_userId_endsAt_idx" ON "Boost"("userId", "endsAt");

-- AddForeignKey
ALTER TABLE "PlanPrice" ADD CONSTRAINT "PlanPrice_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditWallet" ADD CONSTRAINT "CreditWallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditTransaction" ADD CONSTRAINT "CreditTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Boost" ADD CONSTRAINT "Boost_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
