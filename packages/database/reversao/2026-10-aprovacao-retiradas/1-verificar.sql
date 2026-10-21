-- Reversão do código para 4c30da8 — passo 1: o que o código antigo não sabe ler.
--
-- Só leitura. Rode ANTES de reverter o código. Se as duas contagens forem
-- zero, reverter só o código é seguro e os passos 2 e 3 não são necessários.
-- Se alguma for maior que zero, o código antigo quebra ao ler esses registros
-- (o Prisma recusa valor de enum que não conhece) — rode o passo 2.
SELECT 'pagamentos ANULADO' AS item, count(*) AS quantidade FROM payments WHERE status::text = 'ANULADO'
UNION ALL
SELECT 'despesas PRO_LABORE', count(*) FROM gastos WHERE natureza::text = 'PRO_LABORE';
