# Publicação e reversão — aprovação manual, retiradas, saldo e pró-labore

Três migrations, todas aditivas (só criam tipos, valores de enum, colunas que aceitam vazio, tabelas, índices e chaves):

| Migration | O que acrescenta |
|---|---|
| `20261021120000_aprovacao_manual_e_retiradas` | origem/autor/chave nos pagamentos, status `ANULADO`, histórico de alterações financeiras, sócios e retiradas |
| `20261022120000_saldo_de_caixa` | saldos iniciais da conta |
| `20261023120000_natureza_pro_labore` | natureza `PRO_LABORE` nas despesas |

Nenhuma altera ou apaga dado existente.

## Antes de publicar

1. Backup do Postgres no Railway: serviço do Postgres → aba **Backups** → backup manual. Conferir que ele aparece com a data e a hora de agora.
2. Segunda camada, recomendada pelo próprio Railway: um `pg_dump` do banco, guardado fora do Railway. A URL do banco fica nas variáveis do serviço e nunca vai para chat, e-mail nem repositório.
3. Conferir que produção está em `4c30da8` e que a última migration aplicada é `20261019190000_assistente_uso`.

## Publicar

Enviar os commits para o branch de produção. O Railway reconstrói e o entrypoint roda `migrate deploy`, que aplica só as três migrations acima.

Depois, conferir:
- os logs mostram as três migrations aplicadas;
- o login funciona;
- o Financeiro abre;
- a aba Retiradas abre, vazia;
- a natureza "Pró-labore" aparece em Despesas.

Nenhum número existente pode mudar.

## Reverter o código para 4c30da8

O código antigo ignora as tabelas e as colunas novas. Ele só não sabe ler dois valores novos: pagamento `ANULADO` e despesa `PRO_LABORE`. O Prisma recusa valor de enum desconhecido, e a tela quebra com erro 500.

1. Rodar `1-verificar.sql` (só leitura).
2. Se as duas contagens forem **zero**, reverter só o código (revert dos commits e push). Fim.
3. Se alguma for **maior que zero**, com autorização:
   - rodar `2-reverter-dados.sql`;
   - depois reverter o código.

   O que muda enquanto o código antigo estiver no ar:
   - o pagamento anulado aparece como "encerrado sem pagamento", e nenhuma soma muda;
   - o pró-labore aparece como custeio e entra no Resultado Operacional antigo.
4. Ao publicar o código novo de novo, rodar `3-restaurar-dados.sql`. Ele devolve exatamente o que era, a partir do histórico de alterações e da tabela auxiliar, que então é removida.

As tabelas e colunas novas ficam no banco sem efeito. Não apague nada sem autorização.

## Ensaio

Ensaiado num banco descartável com o schema de `4c30da8` e dados copiados:

- as migrations mantiveram os dados existentes idênticos, e o banco ficou igual ao schema;
- o código antigo quebrou (500) diante de `ANULADO` e `PRO_LABORE`;
- depois do passo 2, o código antigo voltou a funcionar, com os mesmos recebimentos e o mesmo a receber;
- depois do passo 3, o código novo voltou com todos os números iguais aos de antes.
