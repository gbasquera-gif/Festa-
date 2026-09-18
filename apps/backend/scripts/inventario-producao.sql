-- INVENTÁRIO DO ADMIN — fotografia do estado atual
--
-- SOMENTE LEITURA. Um único SELECT. Nenhum INSERT, UPDATE, DELETE, ALTER,
-- CREATE, DROP, tabela temporária ou SET de sessão.
--
-- Roda no schema de produção como ele está hoje. As tabelas da Sprint 1
-- (gastos, metas_mensais, excecoes_comerciais) ainda não existem lá; a
-- consulta detecta isso com to_regclass e informa em vez de quebrar.
--
-- Onde rodar:
--     railway link            (projeto fabulous-ambition)
--     railway status          (conferir Environment: production)
--     railway connect Postgres
--   e dentro do psql:
--     \o 'C:/Users/SEU_USUARIO/Desktop/inventario-admin.txt'
--     \i apps/backend/scripts/inventario-producao.sql
--     \o
--
-- Devolve uma tabela de três colunas: secao, indicador, valor.

WITH
vivas AS (
  SELECT r.id, o.total,
         COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'PAID'), 0) AS recebido
  FROM reservations r
  JOIN orders o ON o.id = r."orderId"
  LEFT JOIN payments p ON p."orderId" = o.id
  WHERE r.status NOT IN ('CANCELLED', 'REJECTED')
  GROUP BY r.id, o.total
),
-- A auditoria anterior foi em 13/09/2026. O que nasceu depois disso é o que
-- mudou desde então.
corte AS (SELECT TIMESTAMP '2026-09-13 00:00:00' AS quando)
SELECT * FROM (
  SELECT 1 AS ord, 'A-VOLUME'    AS secao, 'reservas (todas)'           AS indicador, count(*)::text AS valor FROM reservations
  UNION ALL SELECT 2,  'A-VOLUME', 'reservas ativas',        count(*)::text FROM reservations WHERE status NOT IN ('CANCELLED','REJECTED')
  UNION ALL SELECT 3,  'A-VOLUME', 'reservas canceladas',    count(*)::text FROM reservations WHERE status = 'CANCELLED'
  UNION ALL SELECT 4,  'A-VOLUME', 'reservas recusadas',     count(*)::text FROM reservations WHERE status = 'REJECTED'
  UNION ALL SELECT 5,  'A-VOLUME', 'clientes',               count(*)::text FROM users WHERE role = 'CLIENT'
  UNION ALL SELECT 6,  'A-VOLUME', 'usuarios internos',      count(*)::text FROM users WHERE role <> 'CLIENT'
  UNION ALL SELECT 7,  'A-VOLUME', 'eventos/festas',         count(*)::text FROM events
  UNION ALL SELECT 8,  'A-VOLUME', 'pedidos',                count(*)::text FROM orders
  UNION ALL SELECT 9,  'A-VOLUME', 'itens de pedido',        count(*)::text FROM order_items
  UNION ALL SELECT 10, 'A-VOLUME', 'pagamentos (todos)',     count(*)::text FROM payments
  UNION ALL SELECT 11, 'A-VOLUME', 'pagamentos PAID',        count(*)::text FROM payments WHERE status = 'PAID'
  UNION ALL SELECT 12, 'A-VOLUME', 'pagamentos PENDING',     count(*)::text FROM payments WHERE status = 'PENDING'
  UNION ALL SELECT 13, 'A-VOLUME', 'tarefas de checklist',   count(*)::text FROM reservation_tasks
  UNION ALL SELECT 14, 'A-VOLUME', 'eventos de analytics',   count(*)::text FROM analytics_events

  UNION ALL SELECT 20, 'B-DINHEIRO', 'faturamento contratado (ativas)', to_char(COALESCE(SUM(total),0),'FM999999990.00') FROM vivas
  UNION ALL SELECT 21, 'B-DINHEIRO', 'recebido',                        to_char(COALESCE(SUM(recebido),0),'FM999999990.00') FROM vivas
  UNION ALL SELECT 22, 'B-DINHEIRO', 'a receber',                       to_char(COALESCE(SUM(total-recebido),0),'FM999999990.00') FROM vivas
  UNION ALL SELECT 23, 'B-DINHEIRO', 'faturamento de canceladas',       to_char(COALESCE(SUM(o.total),0),'FM999999990.00')
              FROM reservations r JOIN orders o ON o.id=r."orderId" WHERE r.status IN ('CANCELLED','REJECTED')

  UNION ALL SELECT 30, 'C-STATUS', r.status::text, count(*)::text FROM reservations r GROUP BY r.status
  UNION ALL SELECT 40, 'D-ORIGEM', e."saleChannel"::text, count(*)::text
              FROM reservations r JOIN orders o ON o.id=r."orderId" JOIN events e ON e.id=o."eventId"
              GROUP BY e."saleChannel"

  UNION ALL SELECT 50, 'E-DESDE-13/09', 'reservas novas',   count(*)::text FROM reservations, corte WHERE "requestedAt" >= corte.quando
  UNION ALL SELECT 51, 'E-DESDE-13/09', 'clientes novos',   count(*)::text FROM users, corte WHERE role='CLIENT' AND "createdAt" >= corte.quando
  UNION ALL SELECT 52, 'E-DESDE-13/09', 'pedidos novos',    count(*)::text FROM orders, corte WHERE "createdAt" >= corte.quando
  UNION ALL SELECT 53, 'E-DESDE-13/09', 'pagamentos novos', count(*)::text FROM payments, corte WHERE "createdAt" >= corte.quando
  UNION ALL SELECT 54, 'E-DESDE-13/09', 'faturamento novo', to_char(COALESCE(SUM(o.total),0),'FM999999990.00')
              FROM reservations r JOIN orders o ON o.id=r."orderId", corte
              WHERE r."requestedAt" >= corte.quando AND r.status NOT IN ('CANCELLED','REJECTED')

  UNION ALL SELECT 60, 'F-CATALOGO', 'temas',    count(*)::text FROM themes
  UNION ALL SELECT 61, 'F-CATALOGO', 'produtos', count(*)::text FROM products
  UNION ALL SELECT 62, 'F-CATALOGO', 'kits',     count(*)::text FROM kits
  UNION ALL SELECT 63, 'F-CATALOGO', 'itens de kit', count(*)::text FROM kit_products
  UNION ALL SELECT 64, 'F-CATALOGO', 'parceiros', count(*)::text FROM partners

  UNION ALL SELECT 70, 'G-SPRINT-1', 'tabela gastos',
              CASE WHEN to_regclass('public.gastos') IS NULL THEN 'ainda nao existe (esperado)' ELSE 'existe' END
  UNION ALL SELECT 71, 'G-SPRINT-1', 'tabela metas_mensais',
              CASE WHEN to_regclass('public.metas_mensais') IS NULL THEN 'ainda nao existe (esperado)' ELSE 'existe' END
  UNION ALL SELECT 72, 'G-SPRINT-1', 'tabela excecoes_comerciais',
              CASE WHEN to_regclass('public.excecoes_comerciais') IS NULL THEN 'ainda nao existe (esperado)' ELSE 'existe' END
  UNION ALL SELECT 73, 'G-SPRINT-1', 'coluna reservations.referenciaExterna',
              CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                                WHERE table_name='reservations' AND column_name='referenciaExterna')
                   THEN 'existe' ELSE 'ainda nao existe (esperado)' END
) AS inventario
ORDER BY ord, indicador;
