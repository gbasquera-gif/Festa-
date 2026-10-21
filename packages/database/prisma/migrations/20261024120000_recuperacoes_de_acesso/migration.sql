-- Registro do que o seed faz com a conta de administrador.
--
-- Só CRIA uma tabela nova. Nenhuma tabela existente muda, nenhum usuário é
-- alterado: a partir desta versão o seed deixa de regravar senha, papel e
-- situação do administrador a cada boot, e só mexe na conta a pedido
-- explícito (SEED_ADMIN_RECUPERACAO), registrando aqui cada pedido aplicado.

-- CreateTable
CREATE TABLE "recuperacoes_de_acesso" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "pedido" TEXT NOT NULL,
    "alteracoes" JSONB NOT NULL,
    "aplicadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recuperacoes_de_acesso_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "recuperacoes_de_acesso_usuarioId_pedido_key" ON "recuperacoes_de_acesso"("usuarioId", "pedido");
