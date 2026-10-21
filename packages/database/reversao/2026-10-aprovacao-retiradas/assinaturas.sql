-- Assinatura do banco: estrutura, cada tabela (quantas linhas e um hash de
-- todas elas) e a posição de cada sequência.
--
-- Só lê. Rodado na origem e no banco restaurado, saídas iguais provam que a
-- estrutura voltou igual (colunas, índices, restrições, enums), que cada
-- registro voltou idêntico, coluna por coluna, e que os próximos ids vão
-- continuar de onde estavam — e não só que as contagens e somas de
-- verificar-banco.sql batem.
--
-- Não cria nada (nem função temporária): o \gexec do psql executa, uma a uma,
-- as consultas que a primeira monta. Funciona dentro de uma sessão
-- "somente leitura".
--
-- Fuso e formato de data fixos: o texto de um timestamptz depende do fuso da
-- sessão, e as duas pontas precisam escrever as datas do mesmo jeito.
SET TIME ZONE 'UTC';
SET DateStyle = 'ISO, YMD';
SET extra_float_digits = 1;

SELECT 'estrutura | ' || md5(string_agg(x, E'\n' ORDER BY x)) FROM (
  SELECT 'coluna ' || table_name || '.' || column_name || ' ' || udt_name || ' ' || is_nullable || ' ' || coalesce(column_default, '') AS x
  FROM information_schema.columns WHERE table_schema = 'public'
  UNION ALL
  SELECT 'indice ' || indexdef FROM pg_indexes WHERE schemaname = 'public'
  UNION ALL
  SELECT 'restricao ' || c.conrelid::regclass::text || ' ' || c.conname || ' ' || pg_get_constraintdef(c.oid)
  FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace WHERE n.nspname = 'public'
  UNION ALL
  SELECT 'enum ' || t.typname || ' ' || string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder)
  FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid JOIN pg_namespace n ON n.oid = t.typnamespace
  WHERE n.nspname = 'public' GROUP BY t.typname
) s;

SELECT format(
  'SELECT %L || '' | '' || count(*) || '' | '' || md5(coalesce(string_agg(md5(t::text), '''' ORDER BY md5(t::text)), '''')) FROM %I.%I t',
  tablename, schemaname, tablename
)
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename
\gexec

SELECT 'sequencia ' || sequencename || ' | ' || coalesce(last_value::text, 'nunca usada')
FROM pg_sequences WHERE schemaname = 'public' ORDER BY sequencename;
