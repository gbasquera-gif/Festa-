-- AlterTable
ALTER TABLE "events" ADD COLUMN     "nomeDoFestejado" TEXT;

-- AlterTable
ALTER TABLE "orcamento_itens" ADD COLUMN     "opcaoId" TEXT;

-- AlterTable
ALTER TABLE "orcamentos" ADD COLUMN     "nomeDoFestejado" TEXT,
ADD COLUMN     "opcaoAprovadaId" TEXT,
ADD COLUMN     "opcaoAprovadaNome" TEXT;

-- CreateTable
CREATE TABLE "orcamento_opcoes" (
    "id" TEXT NOT NULL,
    "orcamentoId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "kitId" TEXT,
    "imagens" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "composicaoDoKit" JSONB,
    "subtotal" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "desconto" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "entrega" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "montagem" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "totalCalculado" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "valorFinalManual" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orcamento_opcoes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "orcamento_opcoes_orcamentoId_idx" ON "orcamento_opcoes"("orcamentoId");

-- CreateIndex
CREATE INDEX "orcamento_itens_opcaoId_idx" ON "orcamento_itens"("opcaoId");

-- AddForeignKey
ALTER TABLE "orcamento_itens" ADD CONSTRAINT "orcamento_itens_opcaoId_fkey" FOREIGN KEY ("opcaoId") REFERENCES "orcamento_opcoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orcamento_opcoes" ADD CONSTRAINT "orcamento_opcoes_orcamentoId_fkey" FOREIGN KEY ("orcamentoId") REFERENCES "orcamentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orcamento_opcoes" ADD CONSTRAINT "orcamento_opcoes_kitId_fkey" FOREIGN KEY ("kitId") REFERENCES "kits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: cada orçamento que já existe passa a ser uma proposta com uma
-- única "Opção 1", com exatamente os mesmos dados (kit, imagens, composição
-- congelada e valores). O id é derivado do orçamento, então é determinístico
-- e rodar de novo não duplica nada. Status, aprovação, valor aprovado,
-- reserva e pagamentos não são tocados; as colunas antigas do orçamento
-- continuam lá.
INSERT INTO "orcamento_opcoes" (
  "id", "orcamentoId", "ordem", "nome", "kitId", "imagens", "composicaoDoKit",
  "subtotal", "desconto", "entrega", "montagem", "total", "totalCalculado",
  "valorFinalManual", "createdAt", "updatedAt"
)
SELECT
  'opc_' || o."id", o."id", 0, 'Opção 1', o."kitId", o."imagens", o."composicaoDoKit",
  o."subtotal", o."desconto", o."entrega", o."montagem", o."total", o."totalCalculado",
  o."valorFinalManual", o."createdAt", o."updatedAt"
FROM "orcamentos" o
WHERE NOT EXISTS (SELECT 1 FROM "orcamento_opcoes" x WHERE x."orcamentoId" = o."id");

-- As linhas de cada orçamento passam a pertencer à Opção 1 dele.
UPDATE "orcamento_itens" i
SET "opcaoId" = 'opc_' || i."orcamentoId"
WHERE i."opcaoId" IS NULL;
