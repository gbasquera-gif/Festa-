# Homologação do crédito Festaê

Confere o crédito Festaê de ponta a ponta: a API compilada de verdade, num **banco local descartável**, com **dados fictícios** criados pela própria API. Nada de produção e nenhum serviço externo.

## O que confere

`cenarios.mjs` roda cerca de 60 verificações. Cada uma é regressão de algo que já deu errado ou poderia dar:

- **Dinheiro**
  - Crédito aplicado não vira pagamento nem entrada de caixa, e não muda o faturamento.
  - O crédito em aberto cai exatamente o valor aplicado.
- **Uso**
  - Uso total e parcial, com o saldo que sobra e o extrato (saldo é sempre a soma dos movimentos).
  - Recusa acima do saldo, acima do que falta pagar, de valor zero ou negativo, e em festa cancelada.
- **Repetição** (chave de idempotência)
  - Reenvio devolve o mesmo resultado sem gastar de novo.
  - A mesma chave com outros dados é recusada.
  - Envios simultâneos com a mesma chave geram uma festa só e um movimento só, inclusive quando o saldo só cobre um envio.
- **Concorrência**
  - Duas aplicações com chaves diferentes e saldo para uma: uma passa, a outra é recusada.
  - O saldo nunca fica negativo.
- **Permissões**
  - OPS aplica, e o extrato registra quem aplicou.
  - CLIENT recebe 403 e quem não está logado recebe 401.
  - Só ADMIN estorna, uma vez.
- **Extrato definitivo:** o banco recusa alterar ou apagar um movimento (gatilho da migration).
- **Ficha da cliente**
  - Telefone ou e-mail que bate com mais de uma ficha vira pergunta.
  - Contato mascarado nas opções.
  - Escolha inválida é recusada.
  - E-mail com outra capitalização acha a ficha; com `_` ou `%`, não acha a ficha de outra pessoa.
  - O e-mail digitado fica na ficha antiga que só tinha telefone.
  - Crédito de outra ficha é recusado.
- **Logs:** linhas de crédito e cancelamento sem valores em reais.

## Pré-requisitos

- Postgres **local** num banco descartável, com as migrations aplicadas (`pnpm --filter @festae/database run migrate:deploy` com `DATABASE_URL` apontando para ele).
- `pnpm turbo run build`.
- `JWT_SECRET` no ambiente. Qualquer valor local serve.

O servidor se recusa a rodar com banco que não seja `localhost` ou com `NODE_ENV=production`.

## Rodar

```bash
apps/backend/scripts/homologacao-credito/executar.sh
```

Saída esperada: `N ok, 0 falha(s)`. As fichas e festas criadas ficam no banco descartável. Apague o banco depois, se quiser.
