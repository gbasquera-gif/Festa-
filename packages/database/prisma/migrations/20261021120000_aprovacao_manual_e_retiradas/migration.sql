-- Aprovação manual de proposta com Pix recebido por fora, correção
-- administrativa de pagamentos e retiradas dos sócios.
--
-- Só acréscimos: tipos novos, um valor novo no status de pagamento, colunas
-- anuláveis em payments e orcamentos, e tabelas novas. Nenhuma linha
-- existente é alterada, nenhum dado é preenchido, nada é apagado.


-- CreateEnum
CREATE TYPE "OrigemDoPagamento" AS ENUM ('REGISTRO_MANUAL', 'APROVACAO_MANUAL_DA_PROPOSTA');

-- CreateEnum
CREATE TYPE "EntidadeAlterada" AS ENUM ('PAGAMENTO', 'RETIRADA_DE_SOCIO');

-- CreateEnum
CREATE TYPE "AcaoDeAlteracao" AS ENUM ('CORRECAO', 'ANULACAO', 'EDICAO', 'ESTORNO');

-- CreateEnum
CREATE TYPE "CategoriaDaRetirada" AS ENUM ('DISTRIBUICAO_DE_LUCROS', 'DEVOLUCAO_DE_APORTE');

-- CreateEnum
CREATE TYPE "FormaDaRetirada" AS ENUM ('PIX', 'TRANSFERENCIA', 'DINHEIRO', 'OUTRO');

-- AlterEnum
ALTER TYPE "PaymentStatus" ADD VALUE 'ANULADO';

-- AlterTable
ALTER TABLE "orcamentos" ADD COLUMN     "aprovadoPelaEquipePorId" TEXT;

-- AlterTable
ALTER TABLE "payments" ADD COLUMN     "chaveDeIdempotencia" TEXT,
ADD COLUMN     "observacao" TEXT,
ADD COLUMN     "origem" "OrigemDoPagamento",
ADD COLUMN     "registradoPorId" TEXT;


-- CreateTable
CREATE TABLE "alteracoes_financeiras" (
    "id" TEXT NOT NULL,
    "entidade" "EntidadeAlterada" NOT NULL,
    "entidadeId" TEXT NOT NULL,
    "acao" "AcaoDeAlteracao" NOT NULL,
    "antes" JSONB NOT NULL,
    "depois" JSONB NOT NULL,
    "justificativa" TEXT NOT NULL,
    "usuarioId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alteracoes_financeiras_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "socios" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "socios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retiradas_de_socios" (
    "id" TEXT NOT NULL,
    "socioId" TEXT NOT NULL,
    "categoria" "CategoriaDaRetirada" NOT NULL,
    "valor" DECIMAL(10,2) NOT NULL,
    "retiradaEm" TIMESTAMP(3) NOT NULL,
    "forma" "FormaDaRetirada" NOT NULL,
    "descricao" TEXT,
    "registradoPorId" TEXT,
    "registradoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "estornadaEm" TIMESTAMP(3),
    "estornadaPorId" TEXT,
    "motivoDoEstorno" TEXT,
    "chaveDeIdempotencia" TEXT,

    CONSTRAINT "retiradas_de_socios_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "alteracoes_financeiras_entidade_entidadeId_idx" ON "alteracoes_financeiras"("entidade", "entidadeId");

-- CreateIndex
CREATE UNIQUE INDEX "socios_nome_key" ON "socios"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "retiradas_de_socios_chaveDeIdempotencia_key" ON "retiradas_de_socios"("chaveDeIdempotencia");

-- CreateIndex
CREATE INDEX "retiradas_de_socios_retiradaEm_idx" ON "retiradas_de_socios"("retiradaEm");

-- CreateIndex
CREATE INDEX "retiradas_de_socios_socioId_idx" ON "retiradas_de_socios"("socioId");

-- CreateIndex
CREATE INDEX "retiradas_de_socios_categoria_idx" ON "retiradas_de_socios"("categoria");

-- CreateIndex
CREATE UNIQUE INDEX "payments_chaveDeIdempotencia_key" ON "payments"("chaveDeIdempotencia");

-- CreateIndex
CREATE INDEX "payments_registradoPorId_idx" ON "payments"("registradoPorId");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_registradoPorId_fkey" FOREIGN KEY ("registradoPorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_aprovadoPelaEquipePorId_fkey" FOREIGN KEY ("aprovadoPelaEquipePorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alteracoes_financeiras" ADD CONSTRAINT "alteracoes_financeiras_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retiradas_de_socios" ADD CONSTRAINT "retiradas_de_socios_socioId_fkey" FOREIGN KEY ("socioId") REFERENCES "socios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retiradas_de_socios" ADD CONSTRAINT "retiradas_de_socios_registradoPorId_fkey" FOREIGN KEY ("registradoPorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retiradas_de_socios" ADD CONSTRAINT "retiradas_de_socios_estornadaPorId_fkey" FOREIGN KEY ("estornadaPorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
