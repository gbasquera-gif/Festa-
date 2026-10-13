-- Pagamento recebido depois do cancelamento.
--
-- Só acréscimos: duas tabelas novas. Nenhum pagamento, reserva ou
-- tratamento existente é alterado, e não há backfill.

-- CreateTable
CREATE TABLE "pagamentos_apos_cancelamento" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "valor" DECIMAL(10,2) NOT NULL,
    "registradoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tratamentoComplementarId" TEXT,

    CONSTRAINT "pagamentos_apos_cancelamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tratamentos_complementares_de_cancelamento" (
    "id" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "observacao" TEXT,
    "recebido" DECIMAL(10,2) NOT NULL,
    "creditoGerado" DECIMAL(10,2) NOT NULL,
    "reembolsado" DECIMAL(10,2) NOT NULL,
    "retido" DECIMAL(10,2) NOT NULL,
    "definidoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,
    "movimentoDeCreditoId" TEXT,

    CONSTRAINT "tratamentos_complementares_de_cancelamento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pagamentos_apos_cancelamento_paymentId_key" ON "pagamentos_apos_cancelamento"("paymentId");

-- CreateIndex
CREATE INDEX "pagamentos_apos_cancelamento_reservationId_idx" ON "pagamentos_apos_cancelamento"("reservationId");

-- CreateIndex
CREATE INDEX "pagamentos_apos_cancelamento_tratamentoComplementarId_idx" ON "pagamentos_apos_cancelamento"("tratamentoComplementarId");

-- CreateIndex
CREATE UNIQUE INDEX "tratamentos_complementares_de_cancelamento_movimentoDeCredi_key" ON "tratamentos_complementares_de_cancelamento"("movimentoDeCreditoId");

-- CreateIndex
CREATE INDEX "tratamentos_complementares_de_cancelamento_reservationId_idx" ON "tratamentos_complementares_de_cancelamento"("reservationId");

-- CreateIndex
CREATE INDEX "tratamentos_complementares_de_cancelamento_definidoEm_idx" ON "tratamentos_complementares_de_cancelamento"("definidoEm");

-- CreateIndex
CREATE INDEX "tratamentos_complementares_de_cancelamento_createdById_idx" ON "tratamentos_complementares_de_cancelamento"("createdById");

-- AddForeignKey
ALTER TABLE "pagamentos_apos_cancelamento" ADD CONSTRAINT "pagamentos_apos_cancelamento_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagamentos_apos_cancelamento" ADD CONSTRAINT "pagamentos_apos_cancelamento_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "reservations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagamentos_apos_cancelamento" ADD CONSTRAINT "pagamentos_apos_cancelamento_tratamentoComplementarId_fkey" FOREIGN KEY ("tratamentoComplementarId") REFERENCES "tratamentos_complementares_de_cancelamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tratamentos_complementares_de_cancelamento" ADD CONSTRAINT "tratamentos_complementares_de_cancelamento_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "reservations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tratamentos_complementares_de_cancelamento" ADD CONSTRAINT "tratamentos_complementares_de_cancelamento_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tratamentos_complementares_de_cancelamento" ADD CONSTRAINT "tratamentos_complementares_de_cancelamento_movimentoDeCred_fkey" FOREIGN KEY ("movimentoDeCreditoId") REFERENCES "credito_cliente_movimentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Integridade que não depende da aplicação lembrar.

ALTER TABLE "pagamentos_apos_cancelamento" ADD CONSTRAINT "pagamento_apos_cancelamento_positivo"
  CHECK ("valor" > 0);

-- O tratamento complementar distribui por inteiro o que resolve.
ALTER TABLE "tratamentos_complementares_de_cancelamento" ADD CONSTRAINT "complementar_distribui_o_recebido"
  CHECK ("creditoGerado" + "reembolsado" + "retido" = "recebido");
ALTER TABLE "tratamentos_complementares_de_cancelamento" ADD CONSTRAINT "complementar_sem_valor_negativo"
  CHECK ("recebido" > 0 AND "creditoGerado" >= 0 AND "reembolsado" >= 0 AND "retido" >= 0);
