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

| Chave | Registros |
|---|---|
| `festae:vendas` | 1 contrato |
| `festae:contas` | 1 lançamento (valor R$ 0,00) |
| `festae:aportes` | 37 lançamentos |
| `festae:meta` | 1 valor mensal |
| `festae:orcamentos` | vazio |

**O volume é pequeno.** Isso muda o risco da migração: não é um banco de anos
de histórico, é um punhado de lançamentos que cabem numa conferência manual.

> **Ressalva:** o backup recebido é uma exportação de um instante. Se houve
> lançamento depois dela, ele não está aqui. Uma exportação nova deve ser
> tirada imediatamente antes da carga definitiva.

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
da assinatura". O contrato 001/2026 ilustra os três resultados possíveis:

| Leitura | Mês | Valor |
|---|---|---|
| Como o painel conta hoje (data do contrato) | julho | R$ 350 |
| Competência (data da festa, 26/09) | setembro | R$ 350 |
| Caixa (sinal recebido) | — | R$ 0 |

Julho aparece com R$ 350 de receita de uma festa que ainda não aconteceu e de
um dinheiro que nunca entrou.

**c) Despesa operacional está lançada como aporte.** Dos 37 "aportes",
**7 são despesa de custeio** — Meta Ads, assinatura Zoho, registro de domínio —
e não compra de patrimônio. Como `desp` só lê a aba Contas (que tem um único
lançamento de R$ 0,00), o resultado é:

```
lucro líquido exibido = faturamento − 0
```

O painel reporta lucro ignorando praticamente toda a saída de caixa, e ao mesmo
tempo infla o "capital investido", que alimenta o ROI.

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
| Contrato 001/2026 pode existir nos dois sistemas | Médio | Conferir — §7 |
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

O único contrato lançado — **001/2026, festa em 26/09/2026, R$ 350, retirada,
sinal R$ 0** — precisa ser conferido contra as reservas do Postgres de
produção, às quais não tenho acesso deste ambiente.

- **Se existir como reserva:** não migrar. A reserva é a fonte única.
- **Se não existir:** decidir entre cadastrá-la como reserva manual (preferível,
  entra na agenda e no estoque) ou migrá-la apenas como histórico financeiro.

## 8. O que NÃO foi feito

Nada de reconstrução. Sem migração, sem alteração de banco, sem deploy, sem
apagar o painel atual. Produção segue em `61ee80e`.
