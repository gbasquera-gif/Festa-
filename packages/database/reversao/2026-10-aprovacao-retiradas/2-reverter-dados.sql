-- Reversão do código para 4c30da8 — passo 2 (só se o passo 1 achou algo).
--
-- Exige autorização: altera dados financeiros, de forma reversível (passo 3).
-- Uma transação só: ou tudo, ou nada.
BEGIN;

-- Pagamento anulado vira FAILED ("encerrado sem pagamento"). Os dois ficam
-- fora de todas as somas — recebido, caixa, saldo —, então nenhum número
-- muda. A anulação continua em alteracoes_financeiras, de onde o passo 3 lê.
UPDATE payments p SET status = 'FAILED'
 WHERE p.status::text = 'ANULADO'
   AND EXISTS (
     SELECT 1 FROM alteracoes_financeiras a
      WHERE a.entidade = 'PAGAMENTO' AND a.acao = 'ANULACAO' AND a."entidadeId" = p.id
   );

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM payments WHERE status::text = 'ANULADO') THEN
    RAISE EXCEPTION 'Há pagamento ANULADO sem registro de anulação. Nada foi alterado: investigue antes.';
  END IF;
END $$;

-- Pró-labore: o código antigo não conhece a natureza. Enquanto ele estiver no
-- ar, a despesa fica como CUSTEIO (a única natureza de despesa dele) e o id
-- fica guardado para voltar. Efeito enquanto durar: o Resultado Operacional
-- do código antigo inclui esse pró-labore como custeio.
CREATE TABLE IF NOT EXISTS reversao_pro_labore (
  gasto_id     text PRIMARY KEY,
  revertido_em timestamptz NOT NULL DEFAULT now()
);
INSERT INTO reversao_pro_labore (gasto_id)
  SELECT id FROM gastos WHERE natureza::text = 'PRO_LABORE'
  ON CONFLICT DO NOTHING;
UPDATE gastos SET natureza = 'CUSTEIO'
 WHERE natureza::text = 'PRO_LABORE'
   AND id IN (SELECT gasto_id FROM reversao_pro_labore);

COMMIT;
