-- CONCILIAÇÃO DOS 6 CONTRATOS HISTÓRICOS CONTRA O BANCO OPERACIONAL
--
-- SOMENTE LEITURA. Nenhum INSERT, UPDATE, DELETE ou migration. Rodar esta
-- consulta não altera nada e não tem efeito sobre a operação.
--
-- Onde rodar, sem mover credencial nenhuma:
--     railway login
--     railway link            (escolher o projeto fabulous-ambition)
--     railway connect Postgres
--   e colar este arquivo inteiro no psql que abrir.
--
-- Devolve três tabelas: a conciliação contrato a contrato, as duplicidades
-- parciais, e os totais de controle. Mande as três de volta.
--
-- Os valores do bloco `historico` são a referência histórica oficial, vinda
-- do painel financeiro, conforme decidido: contratado R$ 2.500,00, recebido
-- R$ 941,00, saldo R$ 1.559,00.

\pset border 2

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
    r."eventDate"::date                           AS festa,
    r."referenciaExterna",
    u.name                                        AS cliente,
    o.total,
    COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'PAID'), 0) AS recebido
  FROM reservations r
  JOIN orders o ON o.id = r."orderId"
  JOIN events e ON e.id = o."eventId"
  JOIN users  u ON u.id = e."userId"
  LEFT JOIN payments p ON p."orderId" = o.id
  GROUP BY r.id, r.status, r."eventDate", r."referenciaExterna", u.name, o.total
),
-- Mesma cliente + mesma data = mesmo negócio. Pagamento diferente é
-- divergência financeira, não outra festa.
correspondencia AS (
  SELECT h.*, res.id AS reserva_id, res.status, res.cliente AS cliente_admin,
         res.total AS total_admin, res.recebido AS recebido_admin
  FROM historico h
  LEFT JOIN LATERAL (
    SELECT * FROM reservas r
    WHERE r.festa = h.festa
      AND lower(r.cliente) LIKE '%' || lower(split_part(trim(h.cliente), ' ', 1)) || '%'
    ORDER BY r."referenciaExterna" NULLS LAST
    LIMIT 1
  ) res ON TRUE
)
SELECT
  contrato,
  CASE
    WHEN reserva_id IS NULL                            THEN 'AUSENTE'
    WHEN status IN ('CANCELLED', 'REJECTED')           THEN 'CONFLITO: ' || status
    ELSE 'JA EXISTE: ' || status
  END                                                  AS situacao,
  trim(cliente)                                        AS cliente_painel,
  cliente_admin,
  valor                                                AS contratado_painel,
  total_admin                                          AS contratado_admin,
  CASE WHEN total_admin IS NOT NULL AND total_admin <> valor
       THEN 'DIVERGE' ELSE '' END                      AS diverge_valor,
  recebido                                             AS recebido_painel,
  recebido_admin,
  CASE WHEN recebido_admin IS NOT NULL AND recebido_admin <> recebido
       THEN 'DIVERGE' ELSE '' END                      AS diverge_pagamento
FROM correspondencia
ORDER BY contrato;

-- Duplicidade parcial: bate em pelo menos dois de três (nome, data, valor)
-- sem ser a correspondência principal. É onde mora o registro digitado duas
-- vezes com um dedo trocado.
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
  h.contrato,
  u.name           AS cliente_admin,
  r."eventDate"::date AS festa_admin,
  o.total          AS valor_admin,
  r.status,
  (CASE WHEN lower(u.name) LIKE '%' || lower(split_part(trim(h.cliente), ' ', 1)) || '%' THEN 1 ELSE 0 END
   + CASE WHEN r."eventDate"::date = h.festa THEN 1 ELSE 0 END
   + CASE WHEN o.total = h.valor THEN 1 ELSE 0 END) AS criterios_batendo
FROM historico h
JOIN reservations r ON TRUE
JOIN orders o ON o.id = r."orderId"
JOIN events e ON e.id = o."eventId"
JOIN users  u ON u.id = e."userId"
WHERE (CASE WHEN lower(u.name) LIKE '%' || lower(split_part(trim(h.cliente), ' ', 1)) || '%' THEN 1 ELSE 0 END
       + CASE WHEN r."eventDate"::date = h.festa THEN 1 ELSE 0 END
       + CASE WHEN o.total = h.valor THEN 1 ELSE 0 END) >= 2
  AND NOT (lower(u.name) LIKE '%' || lower(split_part(trim(h.cliente), ' ', 1)) || '%'
           AND r."eventDate"::date = h.festa)
ORDER BY h.contrato;

-- Quanto já existe no Admin para estes contratos, para comparar com os
-- controles de R$ 2.500,00 / R$ 941,00 / R$ 1.559,00.
SELECT
  count(*)                             AS reservas_correspondentes,
  COALESCE(sum(total_admin), 0)        AS contratado_no_admin,
  COALESCE(sum(recebido_admin), 0)     AS recebido_no_admin
FROM (
  WITH historico(cliente, festa) AS (
    VALUES
      ('Carine Pasquali',                DATE '2026-08-29'),
      ('Jessica Fernanda de Oliveira',   DATE '2026-09-27'),
      ('Jussara Centenaro',              DATE '2026-09-05'),
      ('Marlene Pocai',                  DATE '2026-09-28'),
      ('Milca Andreia Machado de Moura', DATE '2026-09-20'),
      ('Kimberly Renata',                DATE '2026-10-17')
  )
  SELECT o.total AS total_admin,
         COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'PAID'), 0) AS recebido_admin
  FROM historico h
  JOIN reservations r ON r."eventDate"::date = h.festa
  JOIN orders o ON o.id = r."orderId"
  JOIN events e ON e.id = o."eventId"
  JOIN users  u ON u.id = e."userId"
  LEFT JOIN payments p ON p."orderId" = o.id
  WHERE lower(u.name) LIKE '%' || lower(split_part(trim(h.cliente), ' ', 1)) || '%'
    AND r.status NOT IN ('CANCELLED', 'REJECTED')
  GROUP BY r.id, o.total
) AS correspondentes;
