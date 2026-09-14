-- CreateEnum
CREATE TYPE "OrigemDoRegistro" AS ENUM ('OPERACAO', 'MIGRACAO');

-- AlterEnum
ALTER TYPE "PaymentType" ADD VALUE 'INDETERMINADO';

-- AlterTable
ALTER TABLE "reservations" ADD COLUMN     "origemDoRegistro" "OrigemDoRegistro" NOT NULL DEFAULT 'OPERACAO',
ADD COLUMN     "referenciaExterna" TEXT;

-- CreateTable
CREATE TABLE "excecoes_comerciais" (
    "id" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "regra" TEXT NOT NULL,
    "justificativa" TEXT NOT NULL,
    "origemDaInformacao" TEXT NOT NULL DEFAULT 'declarada',
    "autorizadaPorId" TEXT,
    "autorizadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "excecoes_comerciais_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "excecoes_comerciais_regra_idx" ON "excecoes_comerciais"("regra");

-- CreateIndex
CREATE INDEX "excecoes_comerciais_autorizadaPorId_idx" ON "excecoes_comerciais"("autorizadaPorId");

-- CreateIndex
CREATE UNIQUE INDEX "excecoes_comerciais_reservationId_regra_key" ON "excecoes_comerciais"("reservationId", "regra");

-- CreateIndex
CREATE UNIQUE INDEX "reservations_referenciaExterna_key" ON "reservations"("referenciaExterna");

-- AddForeignKey
ALTER TABLE "excecoes_comerciais" ADD CONSTRAINT "excecoes_comerciais_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "excecoes_comerciais" ADD CONSTRAINT "excecoes_comerciais_autorizadaPorId_fkey" FOREIGN KEY ("autorizadaPorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
