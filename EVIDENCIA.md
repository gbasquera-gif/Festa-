# Evidência — datas divergentes entre evento e reserva (produção)

Consulta autorizada pela dona em 04/11/2026: somente leitura, só números
agregados, sem nomes, dados pessoais ou alteração no banco.

## Como foi feita

- Branch isolado `consulta/datas-divergentes`, sem o código do app (só este
  workflow rodou; nenhum deploy).
- Transação `READ ONLY` + `default_transaction_read_only=on`,
  `statement_timeout` de 15 s. O endereço do banco entrou pela entrada padrão
  do contêiner e não foi impresso.
- "Dia" = data UTC gravada (a mesma regra de `diaDaFesta` no código).
- SQL: `consulta/contagem.sql` (neste commit).

## Execuções (GitHub Actions)

| execução | commit | resultado |
|---|---|---|
| 41752576257 (job 126320977622), 2026-11-04 01:13 UTC | 9531262 | sucesso |
| 41752890450 (job 126321999981), 2026-11-04 01:16 UTC | 708c4c6 | sucesso |

## Resultado (segunda execução, que confirma haver dados para comparar)

| indicador | valor |
|---|---|
| transacao_somente_leitura | on |
| havia_reservas_para_comparar | on |
| divergentes_total | 0 |
| em_andamento | 0 |
| em_andamento_com_festa_hoje_ou_futura | 0 |
| em_andamento_com_festa_passada | 0 |
| concluidas | 0 |
| canceladas_ou_recusadas | 0 |
| com_remarcacao_registrada | 0 |
| diferenca_de_1_dia | 0 |
| diferenca_maior_que_1_dia | 0 |

Aceito pela dona como diagnóstico do momento da consulta.
