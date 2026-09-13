# Sprint 0 — Preservação e engenharia reversa do painel financeiro

**Data:** 13/09/2026 · **Escopo:** preservar e entender. Nada foi reconstruído,
nenhuma migração criada, nada em produção alterado.

---

## 1. O que foi preservado

| Item | Onde ficou | Observação |
|---|---|---|
| Código-fonte | `legado/painel-financeiro/` | Versionado pela primeira vez |
| Dados financeiros | **Fora do Git** | Repositório é público — ver §6 |
| Documentação da estrutura | Este arquivo + README da pasta | — |

## 2. Arquitetura encontrada

- **Frontend:** um `index.html` de 556 KB, 86% base64 (fontes e imagens).
- **Backend:** uma função Netlify, rota `/api/dados`, Node 24.
- **Armazenamento:** Netlify Blobs, store `festae`, chave única `estado`.
- **Banco relacional:** nenhum.
- **Autenticação:** nenhuma.

A inferência feita na auditoria anterior — "provável Netlify Blobs" — está
**confirmada** pelo código: `getStore({ name: "festae", consistency: "strong" })`.

## 3. Volume de dados

Exportação de 13/09/2026:

| Chave | Registros |
|---|---|
| `festae:vendas` | 6 contratos |
| `festae:contas` | 3 lançamentos, todos PAGAR e quitados |
| `festae:aportes` | 58 lançamentos |
| `festae:meta` | 1 valor mensal |
| `festae:orcamentos` | ausente da exportação |

**O volume é pequeno** — cabe em conferência manual, o que reduz muito o risco
da carga.

> **Os valores reais não estão neste arquivo.** O repositório é público; os
> números foram entregues em relatório separado. Aqui ficam só a estrutura e
> os achados.

### 3.1 As duas exportações e o contrato que sumiu

Recebi duas exportações: a que veio junto com o zip e a que você enviou depois
como "backup atualizado". Confirmei por script qual é qual — os 37 aportes da
primeira estão **todos contidos** nos 58 da segunda (após normalizar o formato
de data, que a origem mistura entre ISO e `DD/MM/AAAA`). A segunda é mesmo a
mais recente, e é a base de toda a apuração deste relatório.

Só que a aba de vendas **não** se comporta como acréscimo. A exportação antiga
tem um contrato `001/2026` — um cliente, um valor, modalidade Retirada — que
**não existe em nenhum registro da exportação nova**, com nenhum número. Na
nova, esse mesmo cliente aparece com outro número de contrato, outro valor,
outra modalidade e a data da festa dois dias diferente.

Duas leituras possíveis, e elas levam a cargas diferentes:

- **foi correção** — o contrato foi refeito com os dados certos, a numeração
  reiniciou quando a operação começou de fato, e não há nada a recuperar;
- **foi perda** — a aba foi limpa e reescrita, e esse contrato deixou de
  existir junto com o que ele faturava.

Só você sabe qual. Se foi correção, seguimos direto. Se foi perda, a
exportação antiga é a única cópia que resta dele, e ela está preservada.

O que isso já prova, independente da resposta: **a origem não tem histórico.**
Um registro reescrito não deixa rastro, e um apagado não deixa nenhum. É o
mesmo argumento da falta de autenticação, visto por outro ângulo — e no
Postgres esse problema não existe, porque a reserva tem `createdAt`,
`updatedAt` e os pagamentos são linhas próprias em vez de um campo `sinal`
sobrescrito.

### 3.2 Divergência de versão

A exportação traz a chave `festae:seed:v1`; o código preservado usa
`festae:seed:v3`. O que está no ar e o que está no zip **não são a mesma
versão**. Não muda o formato dos dados, mas convém saber qual é qual antes de
concluir que o painel antigo pode ser desligado.

## 4. As fórmulas de hoje

```js
function calcMes(mk){
  const vendas = getArr('festae:vendas').filter(v => mesVenda(v) === mk);
  const fat    = vendas.reduce((s,v) => s + (v.valor||0), 0);
  const desp   = getArr('festae:contas')
                   .filter(c => c.tipo==='PAGAR' && mesConta(c)===mk)
                   .reduce((s,c) => s + (c.valor||0), 0);
  const lucro  = fat - desp;
  return { fat, n: vendas.length, desp, lucro,
           ticket: vendas.length ? fat/vendas.length : 0,
           margem: fat ? lucro/fat : 0 };
}

function mesVenda(v){ return mesDe(v.data);                          }  // data do CONTRATO
function mesConta(c){ return mesDe(c.dataPgto || c.venc || c.data);  }  // data do PAGAMENTO
```

### 4.1 Os três problemas conceituais

**a) Lucro mistura dois regimes.** Faturamento é contado pela data do contrato;
despesa, pela data do pagamento. `lucro = fat − desp` subtrai competência de
caixa. É exatamente a mistura que a direção aprovada proíbe.

**b) Faturamento não é nem caixa nem competência.** É "valor contratado no mês
da assinatura". Com os seis contratos exportados, a diferença entre as réguas
é material: um contrato fechado num mês para festa no mês seguinte aparece
inteiro no mês da assinatura, e o mês da festa fica zerado.

**c) O regime de caixa é impossível de apurar.** A planilha guarda o *valor* do
sinal, mas **não guarda a data em que ele entrou** — só a data do contrato.
Sem data de recebimento não existe visão de caixa, e nenhuma reclassificação
posterior recupera isso. É a maior perda de informação do sistema atual, e o
argumento mais forte para a migração: no Postgres, `Payment.paidAt` já existe
e já é preenchido.

**d) Despesa operacional está lançada como aporte.** Dos 58 "aportes",
**85,3% do valor** é compra de patrimônio. Os outros **14,7%** se dividem em:

- **consumíveis** — balões, fita, cola, linha, tinta, bomba: somem na festa e
  são despesa do mês, não acervo;
- **custeio** — anúncios, assinatura de e-mail, domínio, curso, uniforme:
  despesa pura.

Como `desp` só lê a aba Contas, essa parcela some do resultado e ao mesmo tempo
infla o "capital investido", que alimenta o ROI. Recalculando mês a mês: em um
dos meses apurados o painel exibe lucro **2,9× maior** que o real, e em outro
exibe **lucro onde o resultado foi negativo**. Os valores estão no relatório
separado.

**e) A mesma natureza de compra está em dois lugares.** Compras de balões
aparecem tanto em `contas` (categoria "Compra de Itens para Locação",
contabilizadas como despesa) quanto em `aportes` (contabilizadas como capital).
Não há critério que separe as duas — é escolha do momento do lançamento.

## 5. Mapa de migração para o Postgres

| Origem | Destino | Como |
|---|---|---|
| `festae:vendas` | `Order` + `Reservation` existentes | **Conferir duplicidade antes.** Ver §7 |
| `festae:contas` (PAGAR) | Tabela nova `Expense` | Direto |
| `festae:contas` (RECEBER) | **Não migrar** — derivado de `Payment` | Passa a ser calculado |
| `festae:aportes` tipo APORTE, compra de acervo | Tabela nova `CapitalContribution` | 30 lançamentos |
| `festae:aportes` tipo APORTE, custeio | Tabela nova `Expense` | 7 lançamentos, **reclassificar** |
| `festae:aportes` tipo RETIRADA | `CapitalContribution` com sinal negativo | Nenhum no backup |
| `festae:meta` | Tabela nova `Goal` | 1 registro |
| `festae:orcamentos` | **Não migrar** — derivado de `Order` em `CART` | Vazio hoje |

### 5.1 O que deixa de ser digitado

Depois da migração, contrato, cliente, valor, sinal, saldo e orçamento passam a
vir da reserva. Só continuam manuais: **despesa, aporte e meta** — as três que
nenhuma reserva pode informar.

## 6. Riscos encontrados

| Risco | Gravidade | Situação |
|---|---|---|
| `/api/dados` sem autenticação | **Alto** | Aberto — qualquer pessoa lê e grava o financeiro |
| Dados embutidos no HTML público | **Alto** | Aberto — ver §6.2 |
| Repositório público | **Alto** | Por isso os dados não entraram no Git |
| Fonte sem versionamento | Alto | **Resolvido** por esta Sprint |
| Backup pode estar desatualizado | Médio | Exportar de novo antes da carga |
| Contratos podem existir nos dois sistemas | Médio | Conferir os 6 — §7 |
| Regime de caixa impossível de reconstituir | Médio | Sem data de recebimento na origem — §4.1c |
| Versão do código ≠ versão dos dados | Baixo | `seed:v3` no zip, `seed:v1` na exportação — §3.2 |
| Contrato presente só na exportação antiga | **Alto** | Correção ou perda? Decidir antes da carga — §3.1 |
| Origem não tem histórico de alteração | Alto | Resolvido pela migração ao Postgres — §3.1 |
| Lucro exibido hoje está errado | Médio | Não replicar as fórmulas |

### 6.2 Os dados estão dentro do HTML público

O `index.html` carrega uma constante `SEED` com todos os lançamentos — vendas,
aportes, valores, nome de cliente. O arquivo é servido publicamente, então
**basta abrir o endereço e ler o código da página** para ver o financeiro
inteiro. Isso é independente da falta de autenticação na API: são duas portas
abertas para o mesmo dado.

A cópia em `legado/painel-financeiro/` foi versionada **sem** essa constante,
porque o repositório é público.

### 6.1 Sobre a falta de autenticação

A função aceita `GET` sem qualquer verificação e `POST` com as ações `set`,
`importar` e `apagar`. Não é só leitura exposta: **é escrita e exclusão
abertas**. Enquanto o painel existir no ar, isso vale.

Mitigações possíveis, em ordem de esforço: proteção por senha do próprio
Netlify, ou remover o site do ar assim que o financeiro novo estiver conferido.

## 7. Conferência pendente de duplicidade

Os **seis contratos** precisam ser conferidos um a um contra as reservas do
Postgres de produção, à qual não tenho acesso deste ambiente. Pelo menos um
deles corresponde a uma festa que a operação já trata no sistema operacional.

Para cada contrato:

- **Se existir como reserva:** não migrar. A reserva é a fonte única, e o
  financeiro passa a derivar dela.
- **Se não existir:** cadastrar como reserva manual é preferível a migrar só o
  histórico financeiro — assim ele entra também na agenda e no estoque.

### 7.1 Conflito de regra de negócio encontrado

Um dos contratos é **fora de Chapecó, com entrega e montagem**. O sistema
operacional hoje só oferece entrega em Chapecó (`DELIVERY_CITY`), com retirada
obrigatória para as demais cidades. Ou a regra mudou na prática, ou o contrato
foi uma exceção combinada. Isso precisa ser decidido antes da carga — senão a
migração cria uma reserva que o próprio sistema considera inválida.

## 8. Método

Todo número deste relatório e do relatório separado foi calculado **por script,
lendo o JSON exportado** — não por leitura visual dos registros. O script está
em `legado/painel-financeiro/README.md`, junto com a instrução de onde guardar
a exportação (fora do repositório).

Isso importa porque numa primeira passagem eu havia conferido parte dos
lançamentos à mão e errei um dos totais. Conferência manual não é aceitável
para carga financeira, mesmo com volume pequeno.

## 9. O que NÃO foi feito

Nada de reconstrução. Sem migração, sem alteração de banco, sem deploy, sem
apagar o painel atual. Produção segue em `61ee80e`.
