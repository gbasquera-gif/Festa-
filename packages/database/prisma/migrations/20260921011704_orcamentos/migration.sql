-- CreateEnum
CREATE TYPE "StatusDoOrcamento" AS ENUM ('RASCUNHO', 'ENVIADO', 'APROVADO', 'RECUSADO', 'EXPIRADO');

-- CreateEnum
CREATE TYPE "TipoDaLinha" AS ENUM ('KIT', 'PRODUTO', 'BALOES', 'SERVICO', 'MONTAGEM', 'ENTREGA', 'MANUAL');

-- CreateTable
CREATE TABLE "orcamentos" (
    "id" TEXT NOT NULL,
    "numero" SERIAL NOT NULL,
    "versao" INTEGER NOT NULL DEFAULT 1,
    "status" "StatusDoOrcamento" NOT NULL DEFAULT 'RASCUNHO',
    "token" TEXT NOT NULL,
    "userId" TEXT,
    "clienteNome" TEXT NOT NULL,
    "clienteTelefone" TEXT NOT NULL,
    "clienteEmail" TEXT,
    "festaEm" TIMESTAMP(3) NOT NULL,
    "tipoDeFesta" "EventType" NOT NULL DEFAULT 'ANIVERSARIO',
    "cidade" TEXT NOT NULL DEFAULT 'Chapecó',
    "local" TEXT,
    "convidados" INTEGER,
    "observacoes" TEXT,
    "validoAte" TIMESTAMP(3) NOT NULL,
    "themeId" TEXT,
    "kitId" TEXT,
    "imagens" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "subtotal" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "desconto" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "entrega" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "montagem" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "enviadoEm" TIMESTAMP(3),
    "aprovadoEm" TIMESTAMP(3),
    "recusadoEm" TIMESTAMP(3),
    "motivoDaPerda" TEXT,
    "aprovadoPorNome" TEXT,
    "aprovadoPorIp" TEXT,
    "aprovadoPorAgente" TEXT,
    "valorAprovado" DECIMAL(10,2),
    "reservationId" TEXT,
    "criadoPorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orcamentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orcamento_itens" (
    "id" TEXT NOT NULL,
    "orcamentoId" TEXT NOT NULL,
    "tipo" "TipoDaLinha" NOT NULL DEFAULT 'PRODUTO',
    "productId" TEXT,
    "descricao" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL DEFAULT 1,
    "valorUnitario" DECIMAL(10,2) NOT NULL,
    "total" DECIMAL(10,2) NOT NULL,
    "imagemUrl" TEXT,
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "orcamento_itens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orcamento_versoes" (
    "id" TEXT NOT NULL,
    "orcamentoId" TEXT NOT NULL,
    "versao" INTEGER NOT NULL,
    "total" DECIMAL(10,2) NOT NULL,
    "conteudo" JSONB NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orcamento_versoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conteudo_institucional" (
    "chave" TEXT NOT NULL,
    "titulo" TEXT,
    "texto" TEXT,
    "imagemUrl" TEXT,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conteudo_institucional_pkey" PRIMARY KEY ("chave")
);

-- CreateIndex
CREATE UNIQUE INDEX "orcamentos_numero_key" ON "orcamentos"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "orcamentos_token_key" ON "orcamentos"("token");

-- CreateIndex
CREATE UNIQUE INDEX "orcamentos_reservationId_key" ON "orcamentos"("reservationId");

-- CreateIndex
CREATE INDEX "orcamentos_status_idx" ON "orcamentos"("status");

-- CreateIndex
CREATE INDEX "orcamentos_festaEm_idx" ON "orcamentos"("festaEm");

-- CreateIndex
CREATE INDEX "orcamentos_userId_idx" ON "orcamentos"("userId");

-- CreateIndex
CREATE INDEX "orcamento_itens_orcamentoId_idx" ON "orcamento_itens"("orcamentoId");

-- CreateIndex
CREATE INDEX "orcamento_itens_productId_idx" ON "orcamento_itens"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "orcamento_versoes_orcamentoId_versao_key" ON "orcamento_versoes"("orcamentoId", "versao");

-- AddForeignKey
ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_themeId_fkey" FOREIGN KEY ("themeId") REFERENCES "themes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_kitId_fkey" FOREIGN KEY ("kitId") REFERENCES "kits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "reservations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orcamento_itens" ADD CONSTRAINT "orcamento_itens_orcamentoId_fkey" FOREIGN KEY ("orcamentoId") REFERENCES "orcamentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orcamento_itens" ADD CONSTRAINT "orcamento_itens_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orcamento_versoes" ADD CONSTRAINT "orcamento_versoes_orcamentoId_fkey" FOREIGN KEY ("orcamentoId") REFERENCES "orcamentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
