-- Festaê — divergência entre a data do evento e a data da reserva.
-- SOMENTE LEITURA. Devolve apenas números agregados: nenhum id, nome,
-- telefone, data individual ou valor sai daqui.
--
-- "Dia" = data UTC gravada (a mesma regra de diaDaFesta no código).
-- "Hoje" = o dia em Chapecó (America/Sao_Paulo).
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY;
SET LOCAL statement_timeout = '15s';
SET LOCAL lock_timeout = '2s';
SET LOCAL TimeZone = 'UTC';

SELECT 'transacao_somente_leitura=' || current_setting('transaction_read_only');

WITH base AS (
  SELECT r.status::text                 AS status,
         e.date::date                   AS dia_evento,
         r."eventDate"::date            AS dia_reserva,
         r."rescheduledAt" IS NOT NULL  AS remarcada
    FROM reservations r
    JOIN orders o ON o.id = r."orderId"
    JOIN events e ON e.id = o."eventId"
), hoje AS (
  SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date AS d
), div AS (
  SELECT b.*,
         b.status IN ('PENDING','CONFIRMED','PREPARING','READY','AGUARDANDO_DEVOLUCAO') AS em_andamento,
         abs(b.dia_evento - b.dia_reserva) AS dias_de_diferenca
    FROM base b
   WHERE b.dia_evento <> b.dia_reserva
)
SELECT x FROM (
  SELECT 1 AS o, 'divergentes_total=' || count(*) AS x FROM div
  UNION ALL SELECT 2, 'em_andamento=' || count(*) FILTER (WHERE em_andamento) FROM div
  UNION ALL SELECT 3, 'em_andamento_com_festa_hoje_ou_futura=' || count(*) FILTER (WHERE em_andamento AND dia_reserva >= (SELECT d FROM hoje)) FROM div
  UNION ALL SELECT 4, 'em_andamento_com_festa_passada=' || count(*) FILTER (WHERE em_andamento AND dia_reserva < (SELECT d FROM hoje)) FROM div
  UNION ALL SELECT 5, 'concluidas=' || count(*) FILTER (WHERE status = 'COMPLETED') FROM div
  UNION ALL SELECT 6, 'canceladas_ou_recusadas=' || count(*) FILTER (WHERE status IN ('CANCELLED','REJECTED')) FROM div
  UNION ALL SELECT 7, 'com_remarcacao_registrada=' || count(*) FILTER (WHERE remarcada) FROM div
  UNION ALL SELECT 8, 'diferenca_de_1_dia=' || count(*) FILTER (WHERE dias_de_diferenca = 1) FROM div
  UNION ALL SELECT 9, 'diferenca_maior_que_1_dia=' || count(*) FILTER (WHERE dias_de_diferenca > 1) FROM div
) t ORDER BY o;

ROLLBACK;
