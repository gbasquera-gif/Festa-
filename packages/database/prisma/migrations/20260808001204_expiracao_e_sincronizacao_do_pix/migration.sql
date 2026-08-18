-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "syncedAt" TIMESTAMP(3);
