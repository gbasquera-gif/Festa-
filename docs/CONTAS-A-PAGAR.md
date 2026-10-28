# Contas a pagar e despesas recorrentes

Aba **Financeiro › Contas a pagar**, só para ADMIN. Ela mostra:

- o que venceu, o que vence hoje, o que vence nos próximos 7 dias, o que está a vencer e o que já foi pago;
- o cadastro de despesas recorrentes;
- os avisos, no sino do painel e, se você ligar, por e-mail.

## Princípio: obrigação prevista não é pagamento

Cada mês de uma despesa recorrente vira um `Gasto` comum, sem `pagoEm`, na mesma tabela que a aba Despesas já usa. **Não existe** uma segunda estrutura de despesas com totais próprios.

- **Em aberto** (`pagoEm` nulo): aparece em Despesas e em Contas a pagar como "a pagar". **Não** entra em DRE, Resultado Operacional, fluxo de caixa, saldo disponível nem acumulados.
- **Paga** (`pagoEm` preenchido pelo "Registrar pagamento", com o valor real): entra em tudo isso no mês do pagamento, como qualquer gasto.

Os acumulados ("acervo acumulado", "gasto acumulado") somavam também gastos sem `pagoEm`. A apuração agora ignora as contas de recorrência ainda não pagas. Os lançamentos avulsos seguem como antes, então nenhum número existente muda.

As naturezas continuam as mesmas:

| Natureza | Como entra depois de paga |
|---|---|
| CONSUMO, CUSTEIO | Despesa do mês do pagamento. |
| ACERVO | Capital, fora da despesa. |
| PRO_LABORE | Despesa fora do Resultado Operacional. |

A regra do pró-labore vale também na recorrência: "pró-labore" como custeio é recusado.

## Regras de vencimento

Estão em `packages/shared/src/contas-a-pagar.ts`, com testes, e são usadas pelo servidor e pela prévia da tela.

- **Frequência:** mensal, bimestral, trimestral, semestral ou anual. A contagem parte do mês da data inicial.
- **Dia inexistente** (29, 30 ou 31 em mês curto ou em fevereiro): vai para o **último dia do mês** (padrão) ou para o **dia 1º do mês seguinte**, conforme a conta.
- **Fim de semana e feriado:** o padrão é **manter a data**, sem presumir regra fiscal ou bancária. A conta pode **antecipar** para o dia útil anterior ou **adiar** para o próximo.
  - Só os feriados **nacionais** são considerados, inclusive a Sexta-feira Santa e o 20/11 a partir de 2024.
  - Feriado estadual ou municipal e ponto facultativo (Carnaval, Corpus Christi) não são presumidos.
- **Período:** data inicial e data final opcional. Uma competência vale quando o dia previsto fica entre as duas.

## Geração

- **O que gera:** cria o mês corrente e o seguinte de cada recorrência **ativa**. Também recupera até 2 meses para trás, para o caso de a tarefa ter ficado parada.
- **Limite no passado:** nunca cria o que venceu antes do cadastro (ou da retomada). Esses meses aparecem como **"meses anteriores"** e só são gerados se marcados, um a um. Nenhum vem marcado.
- **Uma vez por mês:** `gastos (recorrenciaId, competencia)` é único. Gerar de novo, em paralelo ou após falha nunca duplica (teste com seis gerações simultâneas).
- **Lançamento manual parecido:** se já existe um gasto avulso parecido, a geração **não cria** o mês e abre uma **conferência**. Parecido quer dizer:
  - mesma natureza;
  - data a até 12 dias do vencimento;
  - mesmo fornecedor ou descrição parecida;
  - valor compatível.

  Na conferência, a pessoa escolhe:
  - **vincular** — o lançamento manual passa a ser aquele mês, sem mudar valor, datas ou pagamento;
  - **gerar** — são contas diferentes;
  - **dispensar** — o mês não terá conta.
- **Mês apagado em Despesas:** fica dispensado e não renasce.
- **Pagamento automático:** nunca acontece. Nenhuma conta é quitada sozinha.

## Edição, pausa e encerramento

- **Edição:** só alcança contas **em aberto que vencem de hoje em diante**, e campo a campo, só onde a conta ainda está como foi gerada.
  - Ajuste feito à mão (por exemplo, a fatura de energia chegou) fica.
  - Contas pagas e vencidas não mudam.
  - Frequência e data inicial não se editam: para mudar a cadência, encerra-se esta despesa e cadastra-se outra.
  - O histórico guarda o antes e o depois de cada alteração.
- **Pausa:** remove só as contas futuras em aberto que foram geradas. Lançamentos vinculados são da pessoa e ficam. Enquanto pausada, nada é gerado.
- **Retomada:** volta a gerar a partir do dia da retomada. Os meses do período pausado aparecem como "meses anteriores", para gerar só se você pedir.
- **Encerramento:** encerra hoje e remove as futuras em aberto. Pagas e vencidas ficam.

## Registrar pagamento

O pagamento informa:

- o dia, que não pode ser futuro;
- o valor pago de fato (a conta de valor variável nasce com a estimativa);
- a forma de pagamento e uma observação, ambas opcionais.

A gravação é um `UPDATE … WHERE pagoEm IS NULL`. Dois cliques ou duas abas registram um pagamento só; o segundo recebe 409. Para corrigir um pagamento já registrado, edite o lançamento em Despesas, como sempre.

## Avisos

**Marcos:** 7, 3 e 1 dia antes, no dia do vencimento e 1 dia depois, cada um ligável ou desligável. A hora padrão é 8h (Brasília), configurável.

**Na central (sino):** um aviso por conta, vencimento e marco; a chave é única. Avisos de conta paga não contam como pendentes.

**Recuperação depois de parada:** se a tarefa parar, sai só o marco mais recente, até 2 dias depois do dia dele. Na primeira execução, contas vencidas há meses não disparam enxurrada de avisos.

**E-mail:** um resumo por destinatário e execução, com descrição, vencimento e link do painel.
- O valor só vai no e-mail se a opção "mostrar o valor" estiver ligada; vem desligada.
- O assunto não traz a descrição.
- É só texto, sem HTML.

**Destinatários:** só recebe quem confirma o endereço com um código de 6 dígitos.
- O código vale 30 min, aceita 5 tentativas e tem 1 min de espera entre envios.
- O banco guarda só o hash, nunca o código.
- O limite é de 10 destinatários.
- Remover quem já recebeu e-mail só desativa, para preservar o histórico.

**Sem duplicidade de e-mail:**
- Um aviso entra uma vez por destinatário: `(aviso, destinatário)` é único.
- Cada envio é tomado por `UPDATE` condicional. A tarefa também tem trava, então duas execuções nunca mandam o mesmo envio.
- O texto é congelado na primeira tentativa, e toda retentativa manda o **mesmo** texto com a **mesma** chave (`Idempotency-Key` = id do envio). O provedor guarda a chave por 24 h e não entrega de novo.
- Envio preso por queda do processo é retomado com a mesma chave. Se já passaram 23 h da primeira tentativa, ele vira **incerto** e não é reenviado.

**Retentativas:**
- 503, 429 e falhas de rede tentam de novo em 15 min, 1 h, 4 h e 8 h, com 5 tentativas no máximo. Todas cabem dentro das 24 h da chave.
- Erro definitivo (4xx) esgota na hora.
- Conta paga antes da retentativa cancela o envio.

**Registro:** cada envio tem situação, tentativas e o último erro em forma curta (código HTTP e tipo, nunca conteúdo). Cada execução da tarefa fica em `execucoes_de_tarefa`, com contagens.

**Sem e-mail configurado:** os avisos ficam só no sino. Nada quebra: nem o painel, nem a tarefa, nem o financeiro.

## Tarefa agendada

`node apps/backend/dist/tarefas/contas-a-pagar.js` é um processo que roda e termina, de hora em hora. A cada execução ele:

1. pega a trava no banco, que vence sozinha em 15 min;
2. gera os meses;
3. a partir da hora configurada, cria os avisos do dia;
4. monta e despacha os e-mails;
5. registra a execução.

O log tem só contagens: nunca descrição, valor, fornecedor ou e-mail. Não existe endpoint HTTP para a tarefa. O botão "gerar agora" do painel é uma ação ADMIN comum e só cria o que falta. Fora de produção, `AVISOS_AGORA` fixa o relógio para testes; em produção é ignorada.

## Ativação na Railway (só com autorização)

Nada disto está ativo. Quando autorizado:

1. **Publicar** o código. A API aplica a migration no boot, como hoje.
2. **Criar um serviço novo** a partir do mesmo repositório e branch:
   - config-as-code: `railway.avisos.json` (mesmo Dockerfile da API; `startCommand` da tarefa; `cronSchedule` `0 * * * *`; `restartPolicyType` `NEVER`);
   - sem domínio público.
3. **Variáveis do serviço da tarefa:**
   - `DATABASE_URL` (referência ao Postgres);
   - `ADMIN_URL` (endereço do painel, para o link do e-mail);
   - as de e-mail, se for usar.
4. **E-mail (opcional; sem ele, só o sino)**, nas variáveis da API **e** da tarefa:
   - `AVISOS_EMAIL_PROVEDOR=resend`;
   - `AVISOS_EMAIL_REMETENTE`, por exemplo `Festaê <avisos@SEU-DOMINIO>`;
   - `RESEND_API_KEY` como **variável secreta** na Railway, nunca no repositório nem no chat.
5. **Domínio de envio** (no Resend):
   - usar um subdomínio só para avisos, por exemplo `avisos.` + domínio da empresa;
   - publicar no DNS os registros SPF e DKIM que o Resend mostrar, e um DMARC (começando em `p=none`);
   - só ligar o e-mail no painel depois de o domínio aparecer como verificado.
6. **No painel**, em Contas a pagar › Avisos:
   - cadastrar os destinatários e confirmar cada um com o código;
   - ligar "Enviar também por e-mail".

## Impacto da migration `20261028120000_contas_a_pagar`

**É aditiva.** Ela cria:

- 7 tipos (enums);
- 10 tabelas novas;
- em `gastos`, 2 colunas **nulas** (`recorrenciaId`, `competencia`), um índice único sobre as duas (vários NULL convivem) e um índice em `venceEm`;
- chaves estrangeiras só entre colunas novas.

Ela não tem `DROP`, `UPDATE`, `DELETE` nem `RENAME`, e não reescreve linha nenhuma.

**Bloqueios:**
- `CREATE INDEX` em `gastos` segura escrita na tabela só pelo tempo de indexar algumas centenas de linhas;
- `ADD CONSTRAINT … FOREIGN KEY` valida uma coluna inteira de nulos.

**Ensaio no PG16 e no PG18.** O banco foi montado no esquema de produção (ebfa590) com dados fictícios, a migration foi aplicada, e o ensaio conferiu:

- linhas de gastos, reservas, pagamentos e usuários iguais;
- md5 de todas as colunas antigas de `gastos` igual;
- colunas novas nulas;
- nenhuma tabela removida;
- reaplicar não faz nada.

**Código de produção sobre o banco migrado (rollback de código):** panorama, indicadores, saldo e lista de gastos ficaram idênticos, e criar, editar e apagar gasto funciona. Mesmo com contas de recorrência já geradas, DRE, caixa e saldo seguem iguais no código antigo. A única diferença é que "gasto acumulado" (indicador sem uso nas telas) inclui as contas em aberto, como já fazia com qualquer lançamento a pagar.

**Rollback de dados:** não é necessário, e não se deve apagar as tabelas novas.
