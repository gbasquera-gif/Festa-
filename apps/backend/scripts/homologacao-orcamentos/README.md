# Homologação da disponibilidade dos orçamentos

Confere de ponta a ponta a disponibilidade das propostas: o aviso do painel, a trava do envio, a simulação do editor, o selo da lista, o link da cliente e a aprovação. Roda a API compilada de verdade, num **banco local descartável**, com **dados fictícios**. Nada sai para a internet e nada toca produção.

## O que confere

`cenarios.mjs` faz cerca de 85 verificações:

- **Um item indisponível**
  - O aviso traz nome, identificador do catálogo, necessário, disponível, faltante, motivo e a reserva responsável (FE-0042).
  - O envio é recusado (409) com o mesmo detalhe.
  - Nada é gravado: a proposta continua rascunho e o link continua fechado.
- **Vários itens numa opção:** todos aparecem, cada um com o seu motivo — outra reserva, estoque cadastrado zero, pedido maior que o acervo.
- **Várias opções**
  - Os conflitos vêm agrupados por opção.
  - Peças compartilhadas entre opções alternativas não somam: três opções com o único arco do acervo cabem as três.
  - A proposta aprovada aguardando sinal aparece como responsável.
- **Parcial:** necessário 3, disponível 2, faltante 1.
- **Peça de kit:** a peça é apontada junto com o kit de onde vem.
- **Tudo disponível:** o envio passa e o link mostra a opção disponível.
- **Mudança depois do envio**
  - Uma reserva nova faz o link mostrar a opção como indisponível.
  - A aprovação é recusada, e o reenvio também.
  - O painel aponta a reserva nova.
- **Privacidade no link**
  - O link mostra só "disponível ou não" por opção.
  - Não traz número de reserva, nome de outra cliente, identificador nem número do acervo.
  - A recusa da aprovação nomeia a peça, sem números.
  - Painel e simulação exigem login da equipe (401 sem login, 403 para cliente).
- **Painel e link concordam** sobre cada opção.
- **Correção e liberação:** a opção corrigida libera o envio.
- **Rascunho e data**
  - Rascunho com conflito ou sem data pode ser salvo.
  - Sem data, o envio é recusado (DATA_NECESSARIA); com data passada, também (DATA_PASSADA).
- **Simulação do editor:** confere as opções da tela sem gravar nada.
- **Concorrência**
  - Uma aprovação segura a trava da data por 1,5 s. O envio que chega no meio espera, vê a peça segurada e é recusado.
  - Envio de outra data não espera.
- **Reserva da loja sem sinal, prazo vencido**
  - Abrir o painel aplica a liberação oficial antes de conferir: a vencida é cancelada e a peça volta ao acervo.
  - A que está no prazo e a pendente com pagamento confirmado não são tocadas.
  - Rodar de novo não muda nada.
- **Selo da lista:** disponível; com conflito (quantas opções); não verificado (sem data, data passada, perdida). A aprovada confere só a opção escolhida. O selo exige login da equipe.
- **A conta oficial não mudou**
  - As reservas, uma a uma, somam o mesmo que a conta do dia.
  - As propostas aprovadas somam o mesmo que a conta antiga, a que a Malu usa.

## Como rodar

Depois do build da API (`pnpm exec turbo run build --filter=@festae/backend...`), na raiz:

```bash
DATABASE_URL=postgresql://usuario:senha@localhost:5432/banco_descartavel \
JWT_SECRET=um-segredo-local-de-teste \
apps/backend/scripts/homologacao-orcamentos/executar.sh
```

O banco precisa estar com as migrations aplicadas (`pnpm --filter @festae/database run migrate:deploy`). O servidor recusa qualquer banco que não seja `localhost` e recusa rodar com `NODE_ENV=production`.

## Segurança

- **Só banco local:** o servidor confere o host do `DATABASE_URL` antes de subir.
- **Dados fictícios:** peças, kits, clientes e reservas são criados pelos próprios cenários, com nomes de teste.
- **Rotas `/__orc/*`:** existem só neste servidor de homologação, nunca na API publicada. Montam o cenário; a única que muda reservas é a que simula uma reserva da loja sem sinal, no banco descartável.
- **No CI:** o workflow `orcamentos-integracao.yml` cria um Postgres do próprio job, aplica as migrations, roda os cenários e apaga o banco. Não lê nenhum segredo do repositório.
