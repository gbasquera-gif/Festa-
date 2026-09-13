-- CreateEnum
CREATE TYPE "NaturezaDoGasto" AS ENUM ('ACERVO', 'CONSUMO', 'CUSTEIO');

-- CreateTable
CREATE TABLE "gastos" (
    "id" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "natureza" "NaturezaDoGasto" NOT NULL,
    "valor" DECIMAL(10,2) NOT NULL,
    "pagoEm" TIMESTAMP(3),
    "venceEm" TIMESTAMP(3),
    "categoria" TEXT,
    "formaDePagamento" TEXT,
    "observacao" TEXT,
    "referenciaExterna" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gastos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metas_mensais" (
    "id" TEXT NOT NULL,
    "competencia" TEXT NOT NULL,
    "lucroAlvo" DECIMAL(10,2) NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "metas_mensais_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "gastos_referenciaExterna_key" ON "gastos"("referenciaExterna");

-- CreateIndex
CREATE INDEX "gastos_pagoEm_idx" ON "gastos"("pagoEm");

-- CreateIndex
CREATE INDEX "gastos_natureza_idx" ON "gastos"("natureza");

-- CreateIndex
CREATE UNIQUE INDEX "metas_mensais_competencia_key" ON "metas_mensais"("competencia");
