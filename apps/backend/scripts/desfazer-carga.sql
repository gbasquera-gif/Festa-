-- DESFAZ A CARGA HISTÓRICA
--
-- Use SOMENTE se a carga der errado. Transacional: desfaz tudo ou nada.
--
-- O critério é a referência externa `legado:`. Nada que a operação cadastre
-- carrega essa marca — é exatamente para isso que ela existe. As reservas,
-- pedidos, pagamentos, clientes e eventos que já estavam no banco antes da
-- carga não são alcançados por este arquivo.
--
-- O que ele NÃO desfaz, de propósito:
--   clientes — a carga cria quando não acha pelo nome, e não há marca que
--   separe "criado agora" de "já existia". Apagar um cliente que já estava
--   ali seria pior que deixar um cadastro vazio.
--   meta mensal — pode ter sobrescrito um valor anterior que ninguém guardou.
--
-- Como usar:
--     \i 'C:/Users/gbasq/Desktop/desfazer-carga.sql'

BEGIN;

-- Apagar o evento derruba pedido, pagamentos, reserva e exceções em cascata.
DELETE FROM events
 WHERE id IN (
   SELECT o."eventId"
     FROM reservations r
     JOIN orders o ON o.id = r."orderId"
    WHERE r."referenciaExterna" LIKE 'legado:%'
 );

DELETE FROM gastos WHERE "referenciaExterna" LIKE 'legado:%';

COMMIT;

-- Conferência: as três primeiras linhas têm de voltar a zero.
SELECT 'reservas migradas restantes' AS controle, count(*)::text AS valor
  FROM reservations WHERE "referenciaExterna" LIKE 'legado:%'
UNION ALL SELECT 'gastos importados restantes', count(*)::text FROM gastos WHERE "referenciaExterna" LIKE 'legado:%'
UNION ALL SELECT 'excecoes comerciais restantes', count(*)::text FROM excecoes_comerciais
UNION ALL SELECT 'reservas totais (deve voltar ao valor de antes)', count(*)::text FROM reservations
UNION ALL SELECT 'pagamentos totais', count(*)::text FROM payments
UNION ALL SELECT 'faturamento contratado', to_char(sum(o.total),'FM999999990.00')
  FROM reservations r JOIN orders o ON o.id=r."orderId" WHERE r.status NOT IN ('CANCELLED','REJECTED');
