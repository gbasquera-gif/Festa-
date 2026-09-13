# Sprint 1 — a camada financeira no Postgres

Estado: **pronta para homologação, não publicada.** Produção segue em `61ee80e`.

O que esta Sprint faz: tira o financeiro da planilha embutida num HTML público
e o põe no mesmo banco onde a operação já vive, derivando dinheiro das reservas
em vez de pedir que alguém digite tudo de novo.

> Os valores reais não estão neste arquivo. O repositório é público; os números
> foram entregues em relatório separado.

## 1. A decisão que muda o resultado: uma tabela, não duas

O painel antigo separava **Contas** de **Aportes** em abas. Parecia
organização e era a origem do erro central: o cálculo de despesa lia só a aba
Contas, então cada balão comprado como "aporte" sumia do resultado do mês *e*
inflava o capital investido que alimenta o ROI.

Aqui existe uma tabela só — `Gasto` — e a diferença entre comprar um painel e
comprar um rolo de fita é um campo:

| natureza | o que é | entra no resultado? |
|---|---|---|
| `ACERVO` | vira patrimônio alugável | não — é capital que fica |
| `CONSUMO` | some na festa | sim, no mês em que saiu |
| `CUSTEIO` | mantém a empresa de pé | sim, no mês em que saiu |

Não existe lugar onde digitar errado esconda o gasto do resultado. A escolha é
obrigatória no formulário e não tem padrão.

## 2. Nenhum indicador mistura regime

O "lucro líquido" do painel antigo somava contrato assinado e descontava conta
paga — competência menos caixa, num número só. Esta Sprint não conserta esse
número: ela o **substitui por dois**, cada um inteiro e declarado.

- **Competência** — a festa pertence ao mês em que acontece. Responde *este mês
  deu lucro?*
- **Caixa** — só o que entrou e saiu, na data em que entrou e saiu. Responde
  *tenho dinheiro?*

As duas perguntas são legítimas e as respostas divergem: um mês pode ser
lucrativo e apertado ao mesmo tempo. A tela mostra as duas lado a lado, e cada
indicador solto diz por qual regime foi apurado.

A linha de ritmo mede **competência**, porque a meta é de lucro e lucro é uma
pergunta de competência — medi-la pelo caixa faria um mês de recebimento
atrasado parecer fracasso.

## 3. O recebido deixa de ter duas fontes

No painel antigo, quanto já foi recebido estava gravado em dois lugares que
podiam discordar: o campo `sinal` e a string `status`. Um contrato quitado
ficava com `status: "Pago"` e `sinal` zerado — quem somasse o campo cobraria de
novo de quem já pagou (§8.1 do relatório da Sprint 0).

Aqui o recebido é **a soma dos pagamentos**. Cada pagamento é uma linha com
valor e data. Não existe campo digitado ao lado para discordar.

### 3.1 O que não dá para recuperar

A origem guardava *quanto* foi pago e nunca *quando*. Esse dado não existe
mais. A carga grava o pagamento sem data, e a tela mostra o total separado,
com o aviso de que ele não entra no caixa de mês nenhum — atribuir uma data
inventada faria um mês qualquer parecer melhor do que foi.

O caixa passa a valer de verdade para o que for registrado daqui pra frente.

## 4. A carga roda em simulação por padrão

`apps/backend/scripts/importar-painel-financeiro.ts` não grava nada sem
`--aplicar`. Ela imprime antes:

- a reclassificação inteira, lançamento a lançamento, para conferência humana;
- quais contratos da exportação **já existem** como reserva no Postgres, para
  não duplicar faturamento;
- quais conflitam com regra de negócio vigente (entrega fora de Chapecó).

Cada lançamento carrega uma `referenciaExterna` derivada do registro de origem,
então rodar a carga duas vezes não duplica nada — confirmado em execução.

A criação das reservas ausentes **não** é automática: ela precisa passar pelo
mesmo caminho da venda manual do painel, com conferência de capacidade do dia e
de estoque. O script lista quais cadastrar.

### 4.1 A reclassificação é um palpite, e por isso é impressa

Classificar por texto é imperfeito. A primeira versão classificou "Display
Margaridas" como custeio porque `includes("das")` casa dentro de "Margaridas" —
duas compras de acervo viraram despesa. O erro só apareceu porque a carga
imprime tudo antes de gravar.

Hoje o casamento é por palavra inteira, com plural aceito, e há teste para o
caso. Ainda assim: **o julgamento final é de quem conhece as compras.**

## 5. Quem vê

`/financeiro` e os endpoints são **só ADMIN**. Quem monta a festa precisa saber
o que entregar e quando, não a margem do negócio. O item some do menu para OPS
em vez de entregar um 403 a quem clicar.

É a diferença mais direta para o painel antigo, cuja API aceitava `GET` sem
autenticação e `POST` com `apagar`.

## 6. Por que os números vão mudar

Quando a carga rodar em produção, três indicadores mudam de valor — e mudam
porque estavam errados, não porque a migração falhou:

| indicador | por que muda |
|---|---|
| capital investido | encolhe: consumo e custeio saem do acervo |
| despesa do mês | cresce: consumo e custeio passam a contar |
| lucro / margem | caem: a despesa que faltava entra na conta |

O faturamento acumulado, o nº de contratos, o ticket e o saldo a receber
**não** mudam de valor. São a prova de que a carga está completa: se algum
deles divergir, é erro de migração, não de método.

## 7. O que NÃO foi feito

- Não há multi-tenancy (ver `docs/VISAO-SAAS.md`).
- Fluxo de caixa por parcela do cartão não é modelado: uma compra em 9x conta
  inteira na data da compra, como no painel antigo. Está registrado aqui
  porque afeta a visão de caixa e um dia vai precisar existir.
- Orçamentos (o funil do painel antigo) não foram migrados — a exportação não
  trazia nenhum.
- Nenhum deploy. Nenhuma alteração em produção. O painel antigo segue no ar.
