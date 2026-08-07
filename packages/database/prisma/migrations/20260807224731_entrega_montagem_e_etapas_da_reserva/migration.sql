-- CreateEnum
CREATE TYPE "Fulfillment" AS ENUM ('PICKUP', 'DELIVERY');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ReservationStatus" ADD VALUE 'PREPARING';
ALTER TYPE "ReservationStatus" ADD VALUE 'READY';

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "assembly" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "assemblyFee" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "deliveryFee" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "fulfillment" "Fulfillment" NOT NULL DEFAULT 'PICKUP';
