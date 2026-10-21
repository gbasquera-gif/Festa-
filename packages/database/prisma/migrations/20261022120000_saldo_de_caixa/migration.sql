-- Saldo de caixa informado pela gestão: ponto de partida do saldo disponível.
--
-- Só ACRESCENTA: uma tabela nova, um índice e uma chave estrangeira. Nenhuma
-- tabela ou coluna existente é alterada e nenhum dado existente é tocado.

-- CreateTable
CREATE TABLE "saldos_de_caixa" (
    "id" TEXT NOT NULL,
    "referenciaEm" TIMESTAMP(3) NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,
    "observacao" TEXT,
    "registradoPorId" TEXT,
    "registradoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "chaveDeIdempotencia" TEXT NOT NULL,

    CONSTRAINT "saldos_de_caixa_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "saldos_de_caixa_chaveDeIdempotencia_key" ON "saldos_de_caixa"("chaveDeIdempotencia");

-- CreateIndex
CREATE INDEX "saldos_de_caixa_referenciaEm_idx" ON "saldos_de_caixa"("referenciaEm");

-- AddForeignKey
ALTER TABLE "saldos_de_caixa" ADD CONSTRAINT "saldos_de_caixa_registradoPorId_fkey" FOREIGN KEY ("registradoPorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
