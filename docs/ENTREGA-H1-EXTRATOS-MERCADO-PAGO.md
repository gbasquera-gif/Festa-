# Entrega H1 — Importação de extratos do Mercado Pago

Prévia, só leitura. O ADMIN escolhe os arquivos em **Financeiro → Mercado Pago →
Extrato da conta Mercado Pago**. A API lê os arquivos na memória, confere,
classifica e devolve a análise. **Nada é gravado e nenhum lançamento muda.**

- Leitura e regras: `packages/shared/src/extrato-mercado-pago.ts`
- Rota (ADMIN): `POST /pagamentos/extratos-mercado-pago/analise`, multipart, campo
  `arquivos`, até 5 arquivos de 2 MB — `apps/backend/src/modules/payments/extratos-mercado-pago.controller.ts`
- Tela: `apps/admin/src/components/financeiro/ImportarExtrato.tsx`

## Formatos aceitos

| Formato | Colunas exigidas (nome exato) | Evidência |
|---|---|---|
| Relatório de Liberações | `DATE`, `SOURCE_ID`, `RECORD_TYPE`, `DESCRIPTION`, `NET_CREDIT_AMOUNT`, `NET_DEBIT_AMOUNT` (opcionais: `EXTERNAL_REFERENCE`, `GROSS_AMOUNT`, `MP_FEE_AMOUNT`, `BALANCE_AMOUNT`, `CURRENCY`) | Documentação oficial do Mercado Pago. A documentação diverge sobre o sentido de crédito/débito: o arquivo só é dado como conferido se `BALANCE_AMOUNT` fechar linha a linha. |
| Extrato da conta (CSV) | `RELEASE_DATE`, `TRANSACTION_TYPE`, `REFERENCE_ID`, `TRANSACTION_NET_AMOUNT`, `PARTIAL_BALANCE` (+ resumo opcional `INITIAL_BALANCE`, `CREDITS`, `DEBITS`, `FINAL_BALANCE`) | **Sem documentação oficial encontrada.** Aceito só se o saldo parcial de cada linha e o resumo do próprio arquivo fecharem. Confirmar com um arquivo real. |

Recusados com mensagem: relatório de vendas (`SETTLEMENT_NET_AMOUNT` — não traz
todas as movimentações), PDF, Excel, cabeçalho desconhecido (mostra só os nomes
das colunas), valor com mais de duas casas, data impossível, moeda diferente de
BRL, arquivo cujas contas não fecham, formatos misturados no mesmo lote.

Separador `;`, `,` ou tabulação; UTF-8 (ou Windows-1252, com aviso); decimal com
vírgula ou ponto, decidido pelo arquivo inteiro; centavos inteiros, lidos do
texto. Datas com fuso viram o dia de Brasília; sem fuso, vale o dia escrito
(com aviso).

## Repetições

1. **Arquivo**: SHA-256 do conteúdo. O mesmo conteúdo no lote não é lido de novo.
2. **Operação com identificador** (`SOURCE_ID`/`REFERENCE_ID`): chave = formato +
   id + descrição + valor + dia. Em outro arquivo (período sobreposto), fica fora
   da soma.
3. **Sem identificador**: data, descrição, valor e saldo iguais são só *possível*
   repetição — somam e ficam marcadas para conferência.
4. **Mesmo arquivo**: se o saldo do arquivo foi conferido, duas linhas iguais
   movimentaram dinheiro de fato e as duas contam.

## Persistência proposta (NÃO aplicada)

A H1 funciona sem banco. Guardar o histórico das importações (para reconhecer
um arquivo já importado em outro dia e para a H2) exige as tabelas abaixo.
**Nenhuma migration foi criada na pasta `prisma/migrations` nem executada.**
É só para revisão; aplicar depende de autorização expressa.

Somente tabelas novas. Nenhuma coluna das tabelas existentes muda; o `User`
ganha apenas o campo de relação do Prisma, que não gera SQL.

```prisma
enum FormatoDoExtrato {
  LIBERACOES
  EXTRATO_DA_CONTA
}

enum CategoriaDoExtrato {
  RECEBIMENTO
  SAIDA
  TRANSFERENCIA_PARA_COFRINHO
  RETIRADA_DO_COFRINHO
  RESERVA_AUTOMATICA_POR_VENDAS
  RENDIMENTO_DO_COFRINHO
  TARIFA_MERCADO_PAGO
  ESTORNO_OU_DEVOLUCAO
  DESCONHECIDA
}

/// Um arquivo aceito. O arquivo em si não é guardado: só o hash e as linhas.
model ExtratoImportado {
  id             String           @id @default(cuid())
  hash           String           @unique
  nomeDoArquivo  String
  formato        FormatoDoExtrato
  periodoDe      DateTime         @db.Date
  periodoAte     DateTime         @db.Date
  saldoInicial   Decimal?         @db.Decimal(12, 2)
  saldoFinal     Decimal?         @db.Decimal(12, 2)
  saldoConferido Boolean
  linhas         Int
  importadoPorId String
  importadoEm    DateTime         @default(now())

  importadoPor  User                    @relation("ExtratosImportados", fields: [importadoPorId], references: [id], onDelete: Restrict)
  movimentacoes MovimentacaoDoExtrato[]

  @@map("extratos_importados")
}

/// Uma linha do extrato. Não é lançamento: não entra em saldo, faturamento,
/// despesas ou contas a receber. A classificação é só sugestão.
model MovimentacaoDoExtrato {
  id                String             @id @default(cuid())
  extratoId         String
  linha             Int
  chave             String
  chaveConfiavel    Boolean
  dataOriginal      String
  dia               DateTime           @db.Date
  dataBrasilia      DateTime?
  idDaOperacao      String?
  referenciaExterna String?
  tipoNoArquivo     String?
  descricao         String
  valor             Decimal            @db.Decimal(12, 2)
  valorBruto        Decimal?           @db.Decimal(12, 2)
  tarifa            Decimal?           @db.Decimal(12, 2)
  saldoApos         Decimal?           @db.Decimal(12, 2)
  categoriaSugerida CategoriaDoExtrato
  regra             String

  extrato ExtratoImportado @relation(fields: [extratoId], references: [id], onDelete: Restrict)

  @@unique([extratoId, linha])
  @@index([chave])
  @@index([dia])
  @@index([idDaOperacao])
  @@map("movimentacoes_do_extrato")
}
```

```sql
-- Extratos do Mercado Pago (H1). Aditiva: só tipos e tabelas novos.
CREATE TYPE "FormatoDoExtrato" AS ENUM ('LIBERACOES', 'EXTRATO_DA_CONTA');
CREATE TYPE "CategoriaDoExtrato" AS ENUM ('RECEBIMENTO', 'SAIDA', 'TRANSFERENCIA_PARA_COFRINHO',
  'RETIRADA_DO_COFRINHO', 'RESERVA_AUTOMATICA_POR_VENDAS', 'RENDIMENTO_DO_COFRINHO',
  'TARIFA_MERCADO_PAGO', 'ESTORNO_OU_DEVOLUCAO', 'DESCONHECIDA');

CREATE TABLE "extratos_importados" (
  "id" TEXT NOT NULL,
  "hash" TEXT NOT NULL,
  "nomeDoArquivo" TEXT NOT NULL,
  "formato" "FormatoDoExtrato" NOT NULL,
  "periodoDe" DATE NOT NULL,
  "periodoAte" DATE NOT NULL,
  "saldoInicial" DECIMAL(12,2),
  "saldoFinal" DECIMAL(12,2),
  "saldoConferido" BOOLEAN NOT NULL,
  "linhas" INTEGER NOT NULL,
  "importadoPorId" TEXT NOT NULL,
  "importadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "extratos_importados_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "extratos_importados_hash_key" ON "extratos_importados"("hash");
ALTER TABLE "extratos_importados" ADD CONSTRAINT "extratos_importados_importadoPorId_fkey"
  FOREIGN KEY ("importadoPorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "movimentacoes_do_extrato" (
  "id" TEXT NOT NULL,
  "extratoId" TEXT NOT NULL,
  "linha" INTEGER NOT NULL,
  "chave" TEXT NOT NULL,
  "chaveConfiavel" BOOLEAN NOT NULL,
  "dataOriginal" TEXT NOT NULL,
  "dia" DATE NOT NULL,
  "dataBrasilia" TIMESTAMP(3),
  "idDaOperacao" TEXT,
  "referenciaExterna" TEXT,
  "tipoNoArquivo" TEXT,
  "descricao" TEXT NOT NULL,
  "valor" DECIMAL(12,2) NOT NULL,
  "valorBruto" DECIMAL(12,2),
  "tarifa" DECIMAL(12,2),
  "saldoApos" DECIMAL(12,2),
  "categoriaSugerida" "CategoriaDoExtrato" NOT NULL,
  "regra" TEXT NOT NULL,
  CONSTRAINT "movimentacoes_do_extrato_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "movimentacoes_do_extrato_extratoId_linha_key" ON "movimentacoes_do_extrato"("extratoId", "linha");
CREATE INDEX "movimentacoes_do_extrato_chave_idx" ON "movimentacoes_do_extrato"("chave");
CREATE INDEX "movimentacoes_do_extrato_dia_idx" ON "movimentacoes_do_extrato"("dia");
CREATE INDEX "movimentacoes_do_extrato_idDaOperacao_idx" ON "movimentacoes_do_extrato"("idDaOperacao");
-- A mesma operação (identificador confiável) uma vez só, em qualquer arquivo.
CREATE UNIQUE INDEX "movimentacoes_do_extrato_chave_confiavel_key"
  ON "movimentacoes_do_extrato"("chave") WHERE "chaveConfiavel";
ALTER TABLE "movimentacoes_do_extrato" ADD CONSTRAINT "movimentacoes_do_extrato_extratoId_fkey"
  FOREIGN KEY ("extratoId") REFERENCES "extratos_importados"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
```

Antes de aplicar: gerar
a migration com `prisma migrate diff` para comparar com o SQL acima, testar em
banco descartável e fazer backup validado.
