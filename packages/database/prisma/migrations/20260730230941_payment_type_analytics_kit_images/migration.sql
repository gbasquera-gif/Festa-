-- CreateEnum
CREATE TYPE "PaymentType" AS ENUM ('DEPOSIT', 'BALANCE');

-- AlterTable
ALTER TABLE "kits" ADD COLUMN     "images" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "checkoutUrl" TEXT,
ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "pixQrCode" TEXT,
ADD COLUMN     "pixQrCodeBase64" TEXT,
ADD COLUMN     "type" "PaymentType" NOT NULL DEFAULT 'DEPOSIT';

-- CreateTable
CREATE TABLE "analytics_events" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "userId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "analytics_events_type_idx" ON "analytics_events"("type");

-- CreateIndex
CREATE INDEX "analytics_events_createdAt_idx" ON "analytics_events"("createdAt");
