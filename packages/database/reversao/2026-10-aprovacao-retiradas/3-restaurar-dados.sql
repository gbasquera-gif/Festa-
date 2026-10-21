-- Volta do passo 2 — rode DEPOIS de publicar de novo o código novo.
--
-- Devolve cada pagamento anulado e cada pró-labore ao que eram, pelos
-- registros guardados no passo 2. Uma transação só.
BEGIN;

UPDATE payments p SET status = 'ANULADO'
 WHERE p.status::text = 'FAILED'
   AND EXISTS (
     SELECT 1 FROM alteracoes_financeiras a
      WHERE a.entidade = 'PAGAMENTO' AND a.acao = 'ANULACAO' AND a."entidadeId" = p.id
   );

UPDATE gastos SET natureza = 'PRO_LABORE'
 WHERE natureza::text = 'CUSTEIO'
   AND id IN (SELECT gasto_id FROM reversao_pro_labore);

DROP TABLE reversao_pro_labore;

COMMIT;
