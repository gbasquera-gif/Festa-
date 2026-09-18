-- APLICA a correção de um recebimento lançado em duplicidade.
--
-- ESTE ARQUIVO ESCREVE. Rode `corrigir-duplicidade-pagamento.sql` antes e
-- confira o dry-run.
--
-- Tudo acontece numa transação só, e a mesma guarda do dry-run roda de novo
-- aqui dentro: se o cenário tiver mudado entre a conferência e a aplicação, a
-- transação aborta inteira e nada é escrito.
--
-- NÃO HÁ DELETE. O lançamento duplicado permanece no banco como FAILED, com
-- marcador em `externalReference`, legível para sempre.
--
-- USO
--   psql "$DATABASE_URL" \
--     -v hist=<id do pagamento INDETERMINADO> \
--     -v dup=<id do pagamento BALANCE> \
--     -v quando='2026-08-29T12:00:00Z' \
--     -f corrigir-duplicidade-pagamento-aplicar.sql

\set ON_ERROR_STOP on
\pset border 2

SELECT set_config('festae.hist',   :'hist',   false),
       set_config('festae.dup',    :'dup',    false),
       set_config('festae.quando', :'quando', false) \gset

BEGIN;

-- A mesma guarda do dry-run. Dentro da transação: falhar aqui desfaz tudo.
DO $$
DECLARE
  v_hist payments%ROWTYPE; v_dup payments%ROWTYPE; v_total NUMERIC; v_qtd INT;
BEGIN
  SELECT * INTO v_hist FROM payments WHERE id = current_setting('festae.hist');
  SELECT * INTO v_dup  FROM payments WHERE id = current_setting('festae.dup');
  IF v_hist.id IS NULL OR v_dup.id IS NULL THEN
    RAISE EXCEPTION 'ABORTADO: pagamento não encontrado.'; END IF;
  IF v_hist."orderId" <> v_dup."orderId" THEN
    RAISE EXCEPTION 'ABORTADO: pedidos diferentes.'; END IF;
  SELECT total INTO v_total FROM orders WHERE id = v_hist."orderId";
  SELECT COUNT(*) INTO v_qtd FROM payments WHERE "orderId" = v_hist."orderId";
  IF v_hist.type <> 'INDETERMINADO' OR v_hist.status <> 'PAID' THEN
    RAISE EXCEPTION 'ABORTADO: histórico é %/%.', v_hist.type, v_hist.status; END IF;
  IF v_hist."paidAt" IS NOT NULL THEN
    RAISE EXCEPTION 'ABORTADO: histórico já tem paidAt (%).', v_hist."paidAt"; END IF;
  IF v_dup.type <> 'BALANCE' OR v_dup.status <> 'PAID' THEN
    RAISE EXCEPTION 'ABORTADO: duplicado é %/%.', v_dup.type, v_dup.status; END IF;
  IF v_hist.amount <> v_dup.amount OR v_hist.amount <> v_total THEN
    RAISE EXCEPTION 'ABORTADO: valores não conferem.'; END IF;
  IF v_qtd <> 2 THEN RAISE EXCEPTION 'ABORTADO: pedido tem % pagamentos.', v_qtd; END IF;
  RAISE NOTICE 'Guarda aprovada. Aplicando.';
END $$;

-- 1. A data real do recebimento, agora confirmada pela operação.
--
-- 12:00 UTC = 09:00 em Chapecó: o dia contábil é 29/08 com folga de horas nas
-- duas pontas. É a mesma âncora que o sistema usa para data de festa, e a
-- razão é a mesma -- meia-noite UTC seria 28/08 em Chapecó, e o recebimento
-- cairia no dia, e possivelmente no mês, errado.
--
-- O WHERE repete as condições de identidade: mesmo que alguém rode este
-- arquivo duas vezes, a segunda não encontra linha para atualizar.
UPDATE payments
   SET "paidAt" = current_setting('festae.quando')::timestamp
 WHERE id = current_setting('festae.hist')
   AND type = 'INDETERMINADO'
   AND status = 'PAID'
   AND "paidAt" IS NULL;

-- 2. O lançamento duplicado sai da apuração sem sair do banco.
--
-- FAILED é o status que este sistema já usa para cobrança que deixou de
-- valer, e é o que a apuração ignora: só PAID entra em recebido. O marcador
-- em `externalReference` diz por que, para quem abrir este registro daqui a
-- um ano. `amount` não é tocado.
UPDATE payments
   SET status = 'FAILED',
       "externalReference" = 'DUPLICIDADE-' || to_char(now(), 'YYYYMMDD')
 WHERE id = current_setting('festae.dup')
   AND type = 'BALANCE'
   AND status = 'PAID';

\echo ''
\echo '=== CONFERÊNCIA DENTRO DA TRANSAÇÃO (ainda dá para desfazer) ==='

SELECT p.id, p.type AS tipo, p.status, p.amount AS valor, p."paidAt", p."externalReference"
  FROM payments p
 WHERE p.id IN (current_setting('festae.hist'), current_setting('festae.dup'))
 ORDER BY p."createdAt";

SELECT to_char(o.total,'FM999G999D00')                                  AS contratado,
       to_char(COALESCE(SUM(p.amount) FILTER (WHERE p.status='PAID'),0),'FM999G999D00') AS recebido,
       to_char(GREATEST(o.total - COALESCE(SUM(p.amount) FILTER (WHERE p.status='PAID'),0), 0),
               'FM999G999D00')                                          AS saldo,
       COUNT(*) FILTER (WHERE p.status='PAID'  AND p."paidAt" IS NULL)  AS pagos_sem_data,
       COUNT(*) FILTER (WHERE p.status='PENDING')                       AS pendentes,
       to_char(MAX(p."paidAt") FILTER (WHERE p.status='PAID') - interval '3 hours', 'DD/MM/YYYY')
                                                                        AS dia_em_chapeco
  FROM payments p
  JOIN orders o ON o.id = p."orderId"
 WHERE p."orderId" = (SELECT "orderId" FROM payments WHERE id = current_setting('festae.hist'))
 GROUP BY o.total;

\echo ''
\echo 'Confira os números acima. Se estiverem certos, digite COMMIT; se não, ROLLBACK.'
