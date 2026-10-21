-- Assinatura de cada tabela: quantas linhas e um hash de todas elas.
--
-- Só lê. Rodado na origem e no banco restaurado, duas saídas iguais provam
-- que cada registro voltou idêntico, coluna por coluna — e não só que as
-- contagens e somas de verificar-banco.sql batem.
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

SELECT format(
  'SELECT %L || '' | '' || count(*) || '' | '' || md5(coalesce(string_agg(md5(t::text), '''' ORDER BY md5(t::text)), '''')) FROM %I.%I t',
  tablename, schemaname, tablename
)
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename
\gexec
