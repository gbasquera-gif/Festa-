-- AlterTable
ALTER TABLE "gastos" ADD COLUMN     "fornecedor" TEXT,
ADD COLUMN     "valorResidual" DECIMAL(10,2),
ADD COLUMN     "vidaUtilMeses" INTEGER;
