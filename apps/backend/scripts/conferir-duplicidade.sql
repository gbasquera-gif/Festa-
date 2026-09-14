-- CONCILIAÇÃO DOS 6 CONTRATOS HISTÓRICOS CONTRA O BANCO OPERACIONAL
--
-- SOMENTE LEITURA. Quatro comandos, todos SELECT. Nenhum INSERT, UPDATE,
-- DELETE, ALTER, CREATE, DROP, tabela temporária, SET de sessão ou chamada a
-- função com efeito colateral. Rodar não altera nada e não afeta a operação.
--
-- Roda no schema de produção COMO ELE ESTÁ HOJE, antes das migrations da
-- Sprint 1: usa só reservations, orders, events, users e payments, e apenas
-- colunas que já existem. Não toca em gastos, metas_mensais,
-- excecoes_comerciais, referenciaExterna, origemDoRegistro nem no valor
-- INDETERMINADO do enum.
--
-- Onde rodar, sem mover credencial nenhuma:
--     railway login
--     railway link            (escolher o projeto fabulous-ambition)
--     railway connect Postgres
--   e colar este arquivo inteiro no psql que abrir.
--
-- Devolve QUATRO tabelas. Cada uma traz na primeira coluna o próprio nome,
-- então dá para identificar qual é qual mesmo se o resultado for copiado solto.
--
-- Os valores do bloco `historico` são a referência histórica oficial, vinda do
-- painel financeiro: contratado R$ 2.500,00, recebido R$ 941,00, saldo
-- R$ 1.559,00. Nenhuma data de recebimento é presumida — a consulta não lê
-- nem infere data de pagamento em lugar nenhum.


-- ===========================================================================
-- TABELA 1 de 4 — CONCILIACAO: situação de cada contrato e as divergências
-- ===========================================================================
WITH historico(contrato, cliente, festa, valor, recebido) AS (
  VALUES
    ('001/2026', 'Carine Pasquali',                DATE '2026-08-29', 400.00, 400.00),
    ('002/2026', 'Jessica Fernanda de Oliveira',   DATE '2026-09-27', 530.00, 265.00),
    ('003/2026', 'Jussara Centenaro',              DATE '2026-09-05', 520.00,   0.00),
    ('004/2026', 'Marlene Pocai',                  DATE '2026-09-28', 250.00,   0.00),
    ('005/2026', 'Milca Andreia Machado de Moura', DATE '2026-09-20', 180.00,  90.00),
    ('006/2026', 'Kimberly Renata',                DATE '2026-10-17', 620.00, 186.00)
),
reservas AS (
  SELECT
    r.id,
    r.status,
    r."eventDate"::date AS festa,
    u.name              AS cliente,
    o.total,
    COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'PAID'), 0) AS recebido
  FROM reservations r
  JOIN orders o ON o.id = r."orderId"
  JOIN events e ON e.id = o."eventId"
  JOIN users  u ON u.id = e."userId"
  LEFT JOIN payments p ON p."orderId" = o.id
  GROUP BY r.id, r.status, r."eventDate", u.name, o.total
)
SELECT
  '1-CONCILIACAO'                                      AS tabela,
  h.contrato,
  CASE
    WHEN res.id IS NULL                        THEN 'AUSENTE'
    WHEN res.status IN ('CANCELLED','REJECTED') THEN 'CONFLITO-CANCELADA: ' || res.status
    ELSE 'JA-EXISTE: ' || res.status
  END                                                  AS situacao,
  trim(h.cliente)                                      AS cliente_painel,
  res.cliente                                          AS cliente_admin,
  h.festa                                              AS festa_painel,
  res.festa                                            AS festa_admin,
  h.valor                                              AS contratado_painel,
  res.total                                            AS contratado_admin,
  CASE WHEN res.total IS NOT NULL AND res.total <> h.valor THEN 'DIVERGE' ELSE '' END AS dif_valor,
  h.recebido                                           AS recebido_painel,
  res.recebido                                         AS recebido_admin,
  CASE WHEN res.recebido IS NOT NULL AND res.recebido <> h.recebido THEN 'DIVERGE' ELSE '' END AS dif_pagamento
FROM historico h
-- Mesma cliente + mesma data = mesmo negócio. Valor ou pagamento diferente é
-- divergência financeira a relatar, não outra festa. Entre duas candidatas, a
-- viva ganha da cancelada — a cancelada aparece inteira na tabela 3.
LEFT JOIN LATERAL (
  SELECT * FROM reservas r
  WHERE r.festa = h.festa
    AND lower(r.cliente) LIKE '%' || lower(split_part(trim(h.cliente), ' ', 1)) || '%'
  ORDER BY (r.status IN ('CANCELLED','REJECTED')), r.id
  LIMIT 1
) res ON TRUE
ORDER BY h.contrato;


-- ===========================================================================
-- TABELA 2 de 4 — DUPLICIDADE_PARCIAL: bate em 2 de 3 critérios (nome, data,
-- valor) sem ser a correspondência principal. É onde mora o registro digitado
-- duas vezes com um dedo trocado. Vazia significa nenhuma duplicidade.
-- ===========================================================================
WITH historico(contrato, cliente, festa, valor) AS (
  VALUES
    ('001/2026', 'Carine Pasquali',                DATE '2026-08-29', 400.00),
    ('002/2026', 'Jessica Fernanda de Oliveira',   DATE '2026-09-27', 530.00),
    ('003/2026', 'Jussara Centenaro',              DATE '2026-09-05', 520.00),
    ('004/2026', 'Marlene Pocai',                  DATE '2026-09-28', 250.00),
    ('005/2026', 'Milca Andreia Machado de Moura', DATE '2026-09-20', 180.00),
    ('006/2026', 'Kimberly Renata',                DATE '2026-10-17', 620.00)
)
SELECT
  '2-DUPLICIDADE_PARCIAL' AS tabela,
  h.contrato,
  u.name                  AS cliente_admin,
  r."eventDate"::date     AS festa_admin,
  o.total                 AS valor_admin,
  r.status,
  (CASE WHEN lower(u.name) LIKE '%' || lower(split_part(trim(h.cliente),' ',1)) || '%' THEN 1 ELSE 0 END
 + CASE WHEN r."eventDate"::date = h.festa THEN 1 ELSE 0 END
 + CASE WHEN o.total = h.valor THEN 1 ELSE 0 END) AS criterios_batendo
FROM historico h
CROSS JOIN reservations r
JOIN orders o ON o.id = r."orderId"
JOIN events e ON e.id = o."eventId"
JOIN users  u ON u.id = e."userId"
WHERE (CASE WHEN lower(u.name) LIKE '%' || lower(split_part(trim(h.cliente),' ',1)) || '%' THEN 1 ELSE 0 END
     + CASE WHEN r."eventDate"::date = h.festa THEN 1 ELSE 0 END
     + CASE WHEN o.total = h.valor THEN 1 ELSE 0 END) >= 2
  AND NOT (lower(u.name) LIKE '%' || lower(split_part(trim(h.cliente),' ',1)) || '%'
           AND r."eventDate"::date = h.festa)
ORDER BY h.contrato, r."eventDate";


-- ===========================================================================
-- TABELA 3 de 4 — CANCELADAS_RELACIONADAS: toda reserva cancelada ou recusada
-- que casa por cliente OU por data com algum dos seis. Vazia significa nenhum
-- conflito de cancelada.
-- ===========================================================================
WITH historico(contrato, cliente, festa) AS (
  VALUES
    ('001/2026', 'Carine Pasquali',                DATE '2026-08-29'),
    ('002/2026', 'Jessica Fernanda de Oliveira',   DATE '2026-09-27'),
    ('003/2026', 'Jussara Centenaro',              DATE '2026-09-05'),
    ('004/2026', 'Marlene Pocai',                  DATE '2026-09-28'),
    ('005/2026', 'Milca Andreia Machado de Moura', DATE '2026-09-20'),
    ('006/2026', 'Kimberly Renata',                DATE '2026-10-17')
)
SELECT DISTINCT
  '3-CANCELADAS_RELACIONADAS' AS tabela,
  h.contrato,
  u.name              AS cliente_admin,
  r."eventDate"::date AS festa_admin,
  o.total             AS valor_admin,
  r.status
FROM historico h
CROSS JOIN reservations r
JOIN orders o ON o.id = r."orderId"
JOIN events e ON e.id = o."eventId"
JOIN users  u ON u.id = e."userId"
WHERE r.status IN ('CANCELLED','REJECTED')
  AND (lower(u.name) LIKE '%' || lower(split_part(trim(h.cliente),' ',1)) || '%'
       OR r."eventDate"::date = h.festa)
ORDER BY h.contrato;


-- ===========================================================================
-- TABELA 4 de 4 — CONTROLES: o oficial contra o que já existe no Admin.
-- "esperado" é a referência histórica; "no_admin" é o que o banco tem hoje
-- para esses seis. A diferença é o que a carga precisaria criar.
-- ===========================================================================
WITH historico(cliente, festa, valor, recebido) AS (
  VALUES
    ('Carine Pasquali',                DATE '2026-08-29', 400.00, 400.00),
    ('Jessica Fernanda de Oliveira',   DATE '2026-09-27', 530.00, 265.00),
    ('Jussara Centenaro',              DATE '2026-09-05', 520.00,   0.00),
    ('Marlene Pocai',                  DATE '2026-09-28', 250.00,   0.00),
    ('Milca Andreia Machado de Moura', DATE '2026-09-20', 180.00,  90.00),
    ('Kimberly Renata',                DATE '2026-10-17', 620.00, 186.00)
),
no_admin AS (
  SELECT r.id, o.total,
         COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'PAID'), 0) AS recebido
  FROM historico h
  JOIN reservations r ON r."eventDate"::date = h.festa
  JOIN orders o ON o.id = r."orderId"
  JOIN events e ON e.id = o."eventId"
  JOIN users  u ON u.id = e."userId"
  LEFT JOIN payments p ON p."orderId" = o.id
  WHERE lower(u.name) LIKE '%' || lower(split_part(trim(h.cliente),' ',1)) || '%'
    AND r.status NOT IN ('CANCELLED','REJECTED')
  GROUP BY r.id, o.total
)
SELECT '4-CONTROLES' AS tabela, controle, esperado, no_admin, esperado - no_admin AS falta_migrar
FROM (
  SELECT 'contratado' AS controle,
         (SELECT SUM(valor) FROM historico)                    AS esperado,
         (SELECT COALESCE(SUM(total), 0) FROM no_admin)        AS no_admin
  UNION ALL
  SELECT 'recebido',
         (SELECT SUM(recebido) FROM historico),
         (SELECT COALESCE(SUM(recebido), 0) FROM no_admin)
  UNION ALL
  SELECT 'saldo_a_receber',
         (SELECT SUM(valor) - SUM(recebido) FROM historico),
         (SELECT COALESCE(SUM(total) - SUM(recebido), 0) FROM no_admin)
  UNION ALL
  SELECT 'reservas_correspondentes',
         6,
         (SELECT count(*) FROM no_admin)
) AS t
ORDER BY controle;
