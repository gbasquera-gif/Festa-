-- Venda manual idempotente: a chave do envio e a impressão do pedido ficam na
-- própria reserva. Aditiva: duas colunas opcionais e um índice único (vários
-- NULL convivem no índice; reservas antigas ficam como estão).
ALTER TABLE "reservations" ADD COLUMN "chaveDeIdempotencia" TEXT,
ADD COLUMN "impressaoDoPedido" TEXT;

CREATE UNIQUE INDEX "reservations_chaveDeIdempotencia_key" ON "reservations"("chaveDeIdempotencia");
