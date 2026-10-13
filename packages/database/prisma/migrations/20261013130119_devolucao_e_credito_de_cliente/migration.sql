-- Aguardando devolução + crédito de cliente por cancelamento.
--
-- Só acréscimos: um valor novo de enum, um enum novo e duas tabelas novas.
-- Nenhuma linha existente é alterada e não há backfill — cancelamentos
-- anteriores continuam como estão, sem tratamento financeiro inferido.

-- CreateEnum
CREATE TYPE "TipoDeMovimentoDeCredito" AS ENUM ('CREDITO_GERADO_CANCELAMENTO', 'CREDITO_UTILIZADO', 'ESTORNO_CREDITO_POR_CANCELAMENTO', 'CREDITO_ESTORNADO');

-- AlterEnum
-- Na mesma posição do schema: depois de READY, antes de COMPLETED. O valor
-- novo não é usado nesta migration (o Postgres não deixa usar um valor de
-- enum na mesma transação que o criou).
ALTER TYPE "ReservationStatus" ADD VALUE 'AGUARDANDO_DEVOLUCAO' AFTER 'READY';

-- CreateTable
CREATE TABLE "credito_cliente_movimentos" (
    "id" TEXT NOT NULL,
    "numero" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "tipo" "TipoDeMovimentoDeCredito" NOT NULL,
    "valor" DECIMAL(10,2) NOT NULL,
    "reservationOrigemId" TEXT,
    "reservationDestinoId" TEXT,
    "movimentoReferenciaId" TEXT,
    "observacao" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credito_cliente_movimentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tratamentos_de_cancelamento" (
    "id" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "contratado" DECIMAL(10,2) NOT NULL,
    "recebido" DECIMAL(10,2) NOT NULL,
    "creditoAplicadoDevolvido" DECIMAL(10,2) NOT NULL,
    "creditoGerado" DECIMAL(10,2) NOT NULL,
    "reembolsado" DECIMAL(10,2) NOT NULL,
    "reembolsadoEm" TIMESTAMP(3),
    "retido" DECIMAL(10,2) NOT NULL,
    "definidoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "tratamentos_de_cancelamento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "credito_cliente_movimentos_numero_key" ON "credito_cliente_movimentos"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "credito_cliente_movimentos_movimentoReferenciaId_key" ON "credito_cliente_movimentos"("movimentoReferenciaId");

-- CreateIndex
CREATE INDEX "credito_cliente_movimentos_userId_createdAt_idx" ON "credito_cliente_movimentos"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "credito_cliente_movimentos_reservationOrigemId_idx" ON "credito_cliente_movimentos"("reservationOrigemId");

-- CreateIndex
CREATE INDEX "credito_cliente_movimentos_reservationDestinoId_idx" ON "credito_cliente_movimentos"("reservationDestinoId");

-- CreateIndex
CREATE INDEX "credito_cliente_movimentos_createdById_idx" ON "credito_cliente_movimentos"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "tratamentos_de_cancelamento_reservationId_key" ON "tratamentos_de_cancelamento"("reservationId");

-- CreateIndex
CREATE INDEX "tratamentos_de_cancelamento_definidoEm_idx" ON "tratamentos_de_cancelamento"("definidoEm");

-- CreateIndex
CREATE INDEX "tratamentos_de_cancelamento_createdById_idx" ON "tratamentos_de_cancelamento"("createdById");

-- AddForeignKey
ALTER TABLE "credito_cliente_movimentos" ADD CONSTRAINT "credito_cliente_movimentos_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credito_cliente_movimentos" ADD CONSTRAINT "credito_cliente_movimentos_reservationOrigemId_fkey" FOREIGN KEY ("reservationOrigemId") REFERENCES "reservations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credito_cliente_movimentos" ADD CONSTRAINT "credito_cliente_movimentos_reservationDestinoId_fkey" FOREIGN KEY ("reservationDestinoId") REFERENCES "reservations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credito_cliente_movimentos" ADD CONSTRAINT "credito_cliente_movimentos_movimentoReferenciaId_fkey" FOREIGN KEY ("movimentoReferenciaId") REFERENCES "credito_cliente_movimentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credito_cliente_movimentos" ADD CONSTRAINT "credito_cliente_movimentos_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tratamentos_de_cancelamento" ADD CONSTRAINT "tratamentos_de_cancelamento_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "reservations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tratamentos_de_cancelamento" ADD CONSTRAINT "tratamentos_de_cancelamento_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Integridade que não depende da aplicação lembrar.

-- O pago de um cancelamento é distribuído inteiro, sem sobra e sem invenção.
ALTER TABLE "tratamentos_de_cancelamento" ADD CONSTRAINT "tratamento_distribui_o_recebido"
  CHECK ("creditoGerado" + "reembolsado" + "retido" = "recebido");
ALTER TABLE "tratamentos_de_cancelamento" ADD CONSTRAINT "tratamento_sem_valor_negativo"
  CHECK ("contratado" >= 0 AND "recebido" >= 0 AND "creditoAplicadoDevolvido" >= 0
     AND "creditoGerado" >= 0 AND "reembolsado" >= 0 AND "retido" >= 0);
-- Reembolso sem data não tem como entrar no caixa.
ALTER TABLE "tratamentos_de_cancelamento" ADD CONSTRAINT "reembolso_tem_data"
  CHECK ("reembolsado" = 0 OR "reembolsadoEm" IS NOT NULL);

-- O sinal do movimento é o do seu tipo: crédito gerado e estornos entram,
-- utilização sai. Movimento de valor zero não registra nada.
ALTER TABLE "credito_cliente_movimentos" ADD CONSTRAINT "movimento_de_credito_com_sinal_do_tipo"
  CHECK (
    ("tipo" = 'CREDITO_UTILIZADO' AND "valor" < 0)
    OR ("tipo" <> 'CREDITO_UTILIZADO' AND "valor" > 0)
  );
