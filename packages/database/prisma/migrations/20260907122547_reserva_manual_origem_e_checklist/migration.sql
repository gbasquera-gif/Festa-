-- CreateEnum
CREATE TYPE "SaleChannel" AS ENUM ('WEB', 'WHATSAPP', 'INSTAGRAM', 'INDICACAO', 'PRESENCIAL', 'TELEFONE', 'OUTRO');

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "saleChannel" "SaleChannel" NOT NULL DEFAULT 'WEB';

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL,
ALTER COLUMN "passwordHash" DROP NOT NULL;

-- CreateTable
CREATE TABLE "reservation_tasks" (
    "id" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "doneAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "doneById" TEXT,

    CONSTRAINT "reservation_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reservation_tasks_doneById_idx" ON "reservation_tasks"("doneById");

-- CreateIndex
CREATE UNIQUE INDEX "reservation_tasks_reservationId_key_key" ON "reservation_tasks"("reservationId", "key");

-- AddForeignKey
ALTER TABLE "reservation_tasks" ADD CONSTRAINT "reservation_tasks_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_tasks" ADD CONSTRAINT "reservation_tasks_doneById_fkey" FOREIGN KEY ("doneById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
