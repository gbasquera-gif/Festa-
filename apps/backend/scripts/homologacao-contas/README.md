# Homologação de contas a pagar

Confere contas a pagar e despesas recorrentes de ponta a ponta. Roda a API compilada de verdade, num **banco local descartável**, com **dados fictícios**. O e-mail é gravado em arquivos temporários: nada sai para a internet, nada toca produção.

## O que confere

`cenarios.mjs` faz cerca de 110 verificações:

- **Geração**
  - Mensal: o cadastro gera o mês corrente e o seguinte, nunca o que venceu antes dele.
  - Meses e anos diferentes, inclusive a virada de ano.
  - Meses anteriores ao cadastro só por ação explícita, e só uma vez.
- **Calendário**
  - Dias 29, 30 e 31 em meses curtos e em fevereiro, em ano comum e bissexto.
  - Ajuste para o último dia do mês ou para o 1º do mês seguinte.
  - Feriado nacional e fim de semana: adiar.
  - Cadência trimestral.
- **Duplicidade**
  - Gerar de novo não duplica, nem com seis gerações ao mesmo tempo.
  - Lançamento manual parecido abre conferência. Ela pode vincular, gerar ou dispensar, e só se resolve uma vez.
  - Mês apagado em Despesas não renasce.
- **Edição:** só alcança contas em aberto que vencem de hoje em diante. Pagas, vencidas e ajustes feitos à mão ficam. O histórico guarda o antes e o depois.
- **Pausa, retomada e encerramento**
  - Removem só as contas futuras em aberto.
  - Pausada e encerrada não geram.
  - O período pausado volta só como oferta.
- **Pagamento**
  - Data futura é recusada.
  - Dois cliques registram um pagamento só.
  - OPS recebe 403.
  - Valor real e forma ficam gravados.
- **Indicadores financeiros**
  - Cadastrar e gerar não muda panorama, indicadores nem saldo disponível.
  - Pagar move a despesa do mês, o resultado e o saldo exatamente no valor pago.
  - Acervo continua fora da despesa.
  - Pró-labore como custeio é recusado.
- **Permissões:** OPS e cliente recebem 403 em todas as rotas novas; sem login, 401.
- **Avisos**
  - Hora mínima (8h de Brasília) e marcos de 7 e 3 dias.
  - Sem repetição ao rodar de novo, no dia seguinte ou em duas execuções simultâneas (trava).
  - Central com contagem de não lidos.
  - Conta paga para os lembretes.
- **E-mail**
  - Destinatário só recebe depois de confirmar o código. O código fica fora da API e dos logs.
  - Falha 503 tenta de novo com o mesmo texto e a mesma chave.
  - Queda do processo depois do envio é retomada sem segundo e-mail.
  - Envio preso há mais de 23h fica "incerto".
  - Esgota em 5 tentativas; erro definitivo esgota na primeira.
  - Conta paga antes da retentativa cancela o envio.
  - Valor no e-mail só com a opção ligada; e-mail desligado não envia.
- **Serviço agendado**
  - O binário `dist/tarefas/contas-a-pagar.js` roda e termina.
  - O log só tem contagens.
  - Cada execução fica registrada.

## Como rodar

Pré-requisitos:

- Postgres **local** num banco descartável, com as migrations aplicadas (`pnpm --filter @festae/database run migrate:deploy`, com `DATABASE_URL` apontando para ele);
- `pnpm turbo run build`;
- `JWT_SECRET` com qualquer valor local.

```bash
DATABASE_URL=postgresql://usuario:senha@localhost:5432/festae_descartavel \
JWT_SECRET=$(openssl rand -hex 32) NODE_ENV=test \
  apps/backend/scripts/homologacao-contas/executar.sh
```

O servidor recusa banco que não seja `localhost` e `NODE_ENV=production`. Ele só aceita o transporte de e-mail em arquivo. As rotas `/__contas/*` existem apenas neste servidor de teste, nunca na API publicada.

No CI, o workflow `.github/workflows/contas-integracao.yml` roda os mesmos cenários num Postgres descartável criado para o job.
