-- Só leitura. Funciona no schema de produção atual (4c30da8) e no novo.
--
-- Identifica em que migration o banco está e tira uma "foto" de contagens e
-- somas para comparar: produção × backup restaurado, e antes × depois de
-- publicar. Não altera nada.
SELECT item, valor FROM (
  SELECT 1 AS o, 'ultima_migration' AS item,
         (SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY finished_at DESC, migration_name DESC LIMIT 1) AS valor
  UNION ALL SELECT 2, 'migrations_aplicadas', (SELECT count(*)::text FROM _prisma_migrations WHERE finished_at IS NOT NULL)
  UNION ALL SELECT 3, 'migrations_com_falha', (SELECT count(*)::text FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL)
  UNION ALL SELECT 10, 'usuarios', (SELECT count(*)::text FROM users)
  UNION ALL SELECT 11, 'reservas', (SELECT count(*)::text FROM reservations)
  UNION ALL SELECT 12, 'pedidos', (SELECT count(*)::text FROM orders)
  UNION ALL SELECT 13, 'propostas', (SELECT count(*)::text FROM orcamentos)
  UNION ALL SELECT 20, 'pagamentos', (SELECT count(*)::text FROM payments)
  UNION ALL SELECT 21, 'pagamentos_recebidos_soma', (SELECT coalesce(sum(amount), 0)::text FROM payments WHERE status::text = 'PAID')
  UNION ALL SELECT 22, 'pagamentos_por_status', (SELECT string_agg(s || '=' || n, ' ' ORDER BY s) FROM (SELECT status::text AS s, count(*) AS n FROM payments GROUP BY 1) x)
  UNION ALL SELECT 30, 'despesas', (SELECT count(*)::text FROM gastos)
  UNION ALL SELECT 31, 'despesas_por_natureza', (SELECT string_agg(nat || '=' || total, ' ' ORDER BY nat) FROM (SELECT natureza::text AS nat, sum(valor) AS total FROM gastos GROUP BY 1) x)
  UNION ALL SELECT 40, 'credito_movimentos_soma', (SELECT coalesce(sum(valor), 0)::text FROM credito_cliente_movimentos)
  UNION ALL SELECT 41, 'reembolsos_realizados_soma', (SELECT coalesce(sum(valor), 0)::text FROM reembolsos_realizados)
) t ORDER BY o;
