# Painel financeiro — código preservado (Sprint 0)

Fonte do `painel.festaechapeco.com.br` como ele existia em **13/09/2026**,
recuperado porque **não havia nenhuma cópia versionada**: o site foi publicado
no Netlify por *drop* (upload manual), sem repositório, sem commit, sem branch.
Se o arquivo se perdesse no computador da operação, o painel não poderia mais
ser alterado — só refeito do zero.

**Isto é preservação, não base de trabalho.** Nada aqui será evoluído. O
financeiro será reconstruído dentro da aplicação operacional (Postgres +
Prisma), conforme a direção aprovada. Esta pasta existe para consulta e para
conferência dos números durante a migração.

## Como o sistema funciona

Quatro arquivos, e o de verdade é um só:

| Arquivo | Papel |
|---|---|
| `index.html` | A aplicação inteira — 556 KB, dos quais **86% são fontes e imagens em base64**. O código real é ~74 KB de HTML, CSS e JS num arquivo só. |
| `netlify/functions/dados.mjs` | A única API. Rota `/api/dados`. |
| `netlify.toml` | Publica a raiz, funções em `netlify/functions`. |
| `package.json` | Duas dependências: `@netlify/blobs` e `@netlify/functions`. |

### Onde os dados moram

**Netlify Blobs** — store `festae`, uma única chave: `estado`.

Dentro dela, um objeto plano onde cada valor é uma *string* JSON:

```
festae:vendas      → lista de contratos
festae:contas      → contas a pagar e a receber
festae:aportes     → aportes e retiradas de capital
festae:meta        → { valor: 5000 }
festae:orcamentos  → declarado no código, vazio no backup
festae:seed        → marcador de carga inicial
```

Não há banco relacional, não há tabelas, não há histórico de alterações.
Gravar é reescrever o objeto inteiro.

### A API

`GET /api/dados` devolve tudo. `POST` aceita três ações: `set` (grava uma
chave), `importar` (grava um lote) e `apagar`. Só aceita chaves com prefixo
`festae:`.

> **Sem autenticação.** A função não verifica sessão, token, senha ou origem.
> Qualquer pessoa com o endereço lê e escreve todo o financeiro da empresa.
> Ver `docs/SPRINT-0-PAINEL-FINANCEIRO.md`, seção de riscos.

## Atenção: o original embutia os dados no próprio HTML

O `index.html` publicado traz uma constante `SEED` com **todo o financeiro
dentro dele** — vendas, aportes, valores e nome de cliente. Como o arquivo é
servido publicamente, esses dados já estão ao alcance de qualquer pessoa que
abra o endereço e leia o código da página.

A cópia versionada aqui vai **sem** essa constante, porque este repositório é
público e não faz sentido repetir a exposição. O restante do arquivo está
íntegro. Os dados reais estão no backup, fora do Git.

## Onde está o backup

**Não neste repositório — ele é público.**

O arquivo `backup-festae.txt` contém faturamento, aportes, metas e dados de
cliente. Ele deve ser guardado fora do Git (drive privado, gerenciador de
senhas ou repositório privado). O `.gitignore` desta pasta bloqueia nomes
óbvios para evitar que entre por engano.

O conteúdo dele em 13/09/2026 está descrito — sem valores — em
`docs/SPRINT-0-PAINEL-FINANCEIRO.md`.

## Conferência dos números

As fórmulas atuais estão documentadas no relatório da Sprint 0. Elas **não**
devem ser copiadas para o sistema novo sem correção: o painel de hoje soma
faturamento por data do contrato e despesas por data de pagamento, o que
mistura competência com caixa num mesmo indicador de lucro.
