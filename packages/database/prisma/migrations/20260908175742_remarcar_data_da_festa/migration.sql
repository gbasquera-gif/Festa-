-- AlterTable
ALTER TABLE "reservations" ADD COLUMN     "rescheduledAt" TIMESTAMP(3),
ADD COLUMN     "rescheduledFrom" TIMESTAMP(3);
