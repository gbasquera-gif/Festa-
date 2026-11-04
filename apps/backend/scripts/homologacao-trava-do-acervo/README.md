# Homologação da trava única do acervo

Confere que loja, venda manual, conversão e aprovação de proposta, edição e
remarcação de reserva não comprometem a mesma peça duas vezes — nem quando
chegam no mesmo instante — e que a loja e a venda manual respeitam o que
propostas aprovadas, ainda sem reserva, seguram.

Só roda com banco **local** (`localhost`), fora de produção e sem
`MP_ACCESS_TOKEN`. Usa dados fictícios criados na hora.

```bash
pnpm --filter @festae/shared build && pnpm --filter @festae/database build
pnpm --filter @festae/backend build
DATABASE_URL=postgresql://usuario:senha@localhost:5432/festae_descartavel \
  pnpm --filter @festae/database exec prisma migrate deploy
DATABASE_URL=postgresql://usuario:senha@localhost:5432/festae_descartavel \
  JWT_SECRET=homologacao apps/backend/scripts/homologacao-trava-do-acervo/executar.sh
```

Como o cruzamento é forçado: a rota `/__trv/segurar` segura por 1,5 s as
linhas que a gravação precisa (produtos ou reservas). As operações disparadas
nesse intervalo passam pela conferência e param antes de gravar. Sem a trava
do dia, todas gravam quando as linhas são soltas; com ela, a segunda só
confere depois que a primeira terminou.

Cada cenário termina conferindo a regra que não pode quebrar: no dia, o que
reservas e propostas aprovadas comprometem não passa do acervo.
