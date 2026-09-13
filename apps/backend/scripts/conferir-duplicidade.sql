-- Os contratos que já existem no banco operacional.
--
-- Serve para responder, sem precisar rodar a carga, se os contratos do painel
-- financeiro antigo já estão cadastrados como reserva — e portanto se carregá-los
-- duplicaria faturamento.
--
-- É SOMENTE LEITURA. Não altera nada.
--
-- Onde rodar: painel do Railway → projeto fabulous-ambition → serviço Postgres
-- → aba de dados/consulta. Não é preciso copiar senha para lugar nenhum.

SELECT
  r."contractSeq"                                  AS contrato,
  u.name                                           AS cliente,
  to_char(r."eventDate", 'YYYY-MM-DD')             AS festa,
  e.city                                           AS cidade,
  o.fulfillment                                    AS modalidade,
  o.total                                          AS valor_do_contrato,
  COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'PAID'), 0) AS recebido,
  o.total - COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'PAID'), 0) AS saldo,
  r.status
FROM reservations r
JOIN orders   o ON o.id = r."orderId"
JOIN events   e ON e.id = o."eventId"
JOIN users    u ON u.id = e."userId"
LEFT JOIN payments p ON p."orderId" = o.id
-- Canceladas e recusadas entram de propósito, com o status à vista: uma
-- reserva cancelada que bate com um contrato do painel antigo é conflito de
-- dado, não ausência. Esconder isso faria a carga recriar a reserva.
WHERE r."eventDate" >= DATE '2026-07-01'
GROUP BY r."contractSeq", u.name, r."eventDate", e.city, o.fulfillment, o.total, r.status
ORDER BY r."eventDate";
