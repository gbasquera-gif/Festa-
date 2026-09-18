-- LISTAGEM DAS RESERVAS DO ADMIN — uma linha por reserva
--
-- SOMENTE LEITURA. Um único SELECT. Sem INSERT, UPDATE, DELETE, ALTER,
-- CREATE, DROP, tabela temporária ou SET de sessão. Executar não altera nada.
--
-- Não contém nenhum dado do painel financeiro: é uma listagem pura do Admin.
-- O cruzamento contrato a contrato é feito depois, fora do banco, com esta
-- saída e a exportação do painel lado a lado.
--
-- Roda no schema de produção como ele está hoje, e continua rodando depois
-- das migrations da Sprint 1.
--
-- COMO USAR (Windows, arquivo salvo no Desktop):
--
--     railway link          -- projeto fabulous-ambition
--     railway status        -- conferir Environment: production
--     railway connect Postgres
--
--   e dentro do psql:
--
--     \o 'C:/Users/gbasq/Desktop/reservas-admin.txt'
--     \i 'C:/Users/gbasq/Desktop/listar-reservas.sql'
--     \o
--     \q

SELECT
  r."contractSeq"                                   AS contrato,
  to_char(r."requestedAt", 'DD/MM/YY')              AS criada_em,
  to_char(r."eventDate", 'DD/MM/YY')                AS festa,
  u.name                                            AS cliente,
  COALESCE(u.phone, '')                             AS telefone,
  e.type                                            AS tipo_evento,
  e.city                                            AS cidade,
  o.fulfillment || CASE WHEN o.assembly THEN '+montagem' ELSE '' END AS modalidade,
  o.total                                           AS valor,
  COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'PAID'), 0)        AS recebido,
  o.total - COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'PAID'), 0) AS a_receber,
  count(p.id) FILTER (WHERE p.status = 'PAID')      AS qtd_pagamentos,
  r.status                                          AS status_reserva,
  e."saleChannel"                                   AS origem
FROM reservations r
JOIN orders o ON o.id = r."orderId"
JOIN events e ON e.id = o."eventId"
JOIN users  u ON u.id = e."userId"
LEFT JOIN payments p ON p."orderId" = o.id
GROUP BY r."contractSeq", r."requestedAt", r."eventDate", u.name, u.phone,
         e.type, e.city, o.fulfillment, o.assembly, o.total, r.status, e."saleChannel"
ORDER BY r."eventDate";
