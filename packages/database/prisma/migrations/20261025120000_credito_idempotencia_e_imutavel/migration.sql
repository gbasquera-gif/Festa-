-- Crédito Festaê: pedido repetido não grava de novo, e o extrato não se apaga.
-- Aditiva: nenhuma linha existente é alterada.

-- Chave de idempotência do movimento. Nula nos movimentos já existentes;
-- quando preenchida, é única.
ALTER TABLE "credito_cliente_movimentos" ADD COLUMN "chaveDeIdempotencia" TEXT;

CREATE UNIQUE INDEX "credito_cliente_movimentos_chaveDeIdempotencia_key" ON "credito_cliente_movimentos"("chaveDeIdempotencia");

-- O extrato só cresce. O código nunca altera nem apaga um movimento; o banco
-- passa a garantir isso também, como já faz com o reembolso realizado.
CREATE FUNCTION "credito_movimento_imutavel"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Movimento de crédito é registro definitivo: não pode ser alterado nem apagado.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "credito_movimento_imutavel"
  BEFORE UPDATE OR DELETE ON "credito_cliente_movimentos"
  FOR EACH ROW EXECUTE FUNCTION "credito_movimento_imutavel"();
