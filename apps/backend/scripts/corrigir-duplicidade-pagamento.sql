-- DIAGNÓSTICO E DRY-RUN de um recebimento lançado em duplicidade.
--
-- SOMENTE LEITURA. Não há INSERT, UPDATE, DELETE nem COMMIT neste arquivo.
-- A escrita mora em `corrigir-duplicidade-pagamento-aplicar.sql`, separada de
-- propósito: dois arquivos tornam impossível alterar produção por engano ao
-- rodar a conferência.
--
-- CONTEXTO
-- Um contrato migrado do painel antigo entrou com um pagamento PAID sem data,
-- porque o painel guardava o valor e nunca o dia. Ao atualizar o pagamento
-- pela tela, um segundo PAID foi criado em vez de o primeiro ser corrigido --
-- `registrarPagamento` sempre acrescenta, nunca reescreve. O pedido passou a
-- somar o dobro do que foi recebido.
--
-- USO
--   psql "$DATABASE_URL" \
--     -v hist=<id do pagamento INDETERMINADO> \
--     -v dup=<id do pagamento BALANCE> \
--     -v quando='2026-08-29T12:00:00Z' \
--     -f corrigir-duplicidade-pagamento.sql

\set ON_ERROR_STOP on
\pset border 2

SELECT set_config('festae.hist',   :'hist',   false),
       set_config('festae.dup',    :'dup',    false),
       set_config('festae.quando', :'quando', false) \gset

\echo ''
\echo '=== 1. ESTADO ATUAL DOS DOIS PAGAMENTOS ==='

SELECT p.id, p.type AS tipo, p.status, p.amount AS valor, p.method AS forma,
       p."createdAt", p."paidAt", p."expiresAt", p."externalReference", p."checkoutUrl",
       u.name AS cliente, o.total AS total_do_pedido
  FROM payments p
  JOIN orders o       ON o.id = p."orderId"
  JOIN reservations r ON r."orderId" = o.id
  JOIN events e       ON e.id = o."eventId"
  JOIN users  u       ON u.id = e."userId"
 WHERE p.id IN (current_setting('festae.hist'), current_setting('festae.dup'))
 ORDER BY p."createdAt";

\echo ''
\echo '=== 2. GUARDA: o cenário é exatamente o diagnosticado? ==='

DO $$
DECLARE
  v_hist  payments%ROWTYPE;
  v_dup   payments%ROWTYPE;
  v_total NUMERIC;
  v_qtd   INT;
BEGIN
  SELECT * INTO v_hist FROM payments WHERE id = current_setting('festae.hist');
  SELECT * INTO v_dup  FROM payments WHERE id = current_setting('festae.dup');

  IF v_hist.id IS NULL THEN RAISE EXCEPTION 'ABORTADO: pagamento histórico não encontrado.'; END IF;
  IF v_dup.id  IS NULL THEN RAISE EXCEPTION 'ABORTADO: pagamento duplicado não encontrado.'; END IF;
  IF v_hist.id = v_dup.id THEN RAISE EXCEPTION 'ABORTADO: os dois ids são o mesmo.'; END IF;
  IF v_hist."orderId" <> v_dup."orderId" THEN
    RAISE EXCEPTION 'ABORTADO: os pagamentos são de pedidos diferentes.';
  END IF;

  SELECT total INTO v_total FROM orders WHERE id = v_hist."orderId";
  SELECT COUNT(*) INTO v_qtd FROM payments WHERE "orderId" = v_hist."orderId";

  IF v_hist.type <> 'INDETERMINADO' OR v_hist.status <> 'PAID' THEN
    RAISE EXCEPTION 'ABORTADO: o histórico é %/%, e o diagnóstico previa INDETERMINADO/PAID.',
      v_hist.type, v_hist.status;
  END IF;
  IF v_hist."paidAt" IS NOT NULL THEN
    RAISE EXCEPTION 'ABORTADO: o histórico já tem paidAt (%). A correção já foi aplicada.',
      v_hist."paidAt";
  END IF;
  IF v_dup.type <> 'BALANCE' OR v_dup.status <> 'PAID' THEN
    RAISE EXCEPTION 'ABORTADO: o duplicado é %/%, e o diagnóstico previa BALANCE/PAID.',
      v_dup.type, v_dup.status;
  END IF;
  IF v_hist.amount <> v_dup.amount THEN
    RAISE EXCEPTION 'ABORTADO: valores diferentes (% e %). Não é duplicidade simples.',
      v_hist.amount, v_dup.amount;
  END IF;
  IF v_hist.amount <> v_total THEN
    RAISE EXCEPTION 'ABORTADO: o valor (%) não é o total do pedido (%).', v_hist.amount, v_total;
  END IF;
  IF v_qtd <> 2 THEN
    RAISE EXCEPTION 'ABORTADO: o pedido tem % pagamentos; o diagnóstico previa exatamente 2.', v_qtd;
  END IF;

  RAISE NOTICE 'CENARIO CONFERE: pedido %, 2 pagamentos de R$ %, total do pedido R$ %.',
    v_hist."orderId", v_hist.amount, v_total;
END $$;

\echo ''
\echo '=== 3. DRY-RUN: o que a aplicação faria ==='

SELECT p.id,
       p.type AS tipo,
       p.status                         AS status_antes,
       CASE WHEN p.id = current_setting('festae.dup') THEN 'FAILED' ELSE p.status END
                                        AS status_depois,
       p."paidAt"                       AS paid_at_antes,
       CASE WHEN p.id = current_setting('festae.hist')
            THEN current_setting('festae.quando')::timestamp
            ELSE p."paidAt" END         AS paid_at_depois,
       p.amount                         AS valor_antes,
       p.amount                         AS valor_depois,
       CASE WHEN p.id = current_setting('festae.dup')
            THEN 'DUPLICIDADE-' || to_char(now(),'YYYYMMDD')
            ELSE p."externalReference" END AS referencia_depois
  FROM payments p
 WHERE p.id IN (current_setting('festae.hist'), current_setting('festae.dup'))
 ORDER BY p."createdAt";

\echo ''
\echo '=== 4. EFEITO NOS NÚMEROS ==='

SELECT 'recebido do pedido (antes)' AS campo,
       to_char(SUM(amount) FILTER (WHERE status='PAID'),'FM999G999D00') AS valor
  FROM payments WHERE "orderId" = (SELECT "orderId" FROM payments WHERE id=current_setting('festae.hist'))
UNION ALL
SELECT 'recebido do pedido (depois)',
       to_char(SUM(amount) FILTER (WHERE status='PAID' AND id <> current_setting('festae.dup')),'FM999G999D00')
  FROM payments WHERE "orderId" = (SELECT "orderId" FROM payments WHERE id=current_setting('festae.hist'))
UNION ALL
SELECT 'dia contábil do recebimento (fuso de Chapecó)',
       to_char(current_setting('festae.quando')::timestamp - interval '3 hours', 'DD/MM/YYYY')
UNION ALL
SELECT 'mês do caixa',
       to_char(current_setting('festae.quando')::timestamp - interval '3 hours', 'YYYY-MM');

\echo ''
\echo 'Nada foi alterado. Para aplicar, rode corrigir-duplicidade-pagamento-aplicar.sql'
