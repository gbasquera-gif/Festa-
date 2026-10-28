-- Contas a pagar e despesas recorrentes. Aditiva:
--   * gastos ganha duas colunas opcionais (recorrenciaId, competencia), nulas
--     em todas as linhas existentes, um índice único sobre as duas (vários
--     NULL convivem) e um índice em venceEm. Nenhuma linha é alterada.
--   * tabelas e tipos novos para recorrências, conferências, avisos, envios
--     de e-mail e execução da tarefa agendada.
-- Nada é apagado, renomeado ou reescrito; o código anterior ignora o que foi
-- acrescentado.

-- CreateEnum
CREATE TYPE "TipoDeValorRecorrente" AS ENUM ('FIXO', 'VARIAVEL');

-- CreateEnum
CREATE TYPE "AjusteDeDiaInexistente" AS ENUM ('ULTIMO_DIA_DO_MES', 'PRIMEIRO_DIA_DO_MES_SEGUINTE');

-- CreateEnum
CREATE TYPE "AjusteDeDiaNaoUtil" AS ENUM ('MANTER', 'ANTECIPAR', 'ADIAR');

-- CreateEnum
CREATE TYPE "SituacaoDaRecorrencia" AS ENUM ('ATIVA', 'PAUSADA', 'ENCERRADA');

-- CreateEnum
CREATE TYPE "TipoDeEventoDaRecorrencia" AS ENUM ('CRIADA', 'EDITADA', 'PAUSADA', 'RETOMADA', 'ENCERRADA', 'RETROATIVAS_GERADAS');

-- CreateEnum
CREATE TYPE "SituacaoDaConferencia" AS ENUM ('PENDENTE', 'VINCULADA', 'GERADA', 'DISPENSADA');

-- CreateEnum
CREATE TYPE "SituacaoDoEnvio" AS ENUM ('PENDENTE', 'ENVIANDO', 'ENVIADO', 'FALHOU', 'ESGOTADO', 'CANCELADO', 'INCERTO');

-- AlterTable
ALTER TABLE "gastos" ADD COLUMN     "competencia" TEXT,
ADD COLUMN     "recorrenciaId" TEXT;

-- CreateTable
CREATE TABLE "despesas_recorrentes" (
    "id" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "natureza" "NaturezaDoGasto" NOT NULL,
    "categoria" TEXT,
    "fornecedor" TEXT,
    "tipoDeValor" "TipoDeValorRecorrente" NOT NULL,
    "valorPrevisto" DECIMAL(10,2) NOT NULL,
    "intervaloMeses" INTEGER NOT NULL DEFAULT 1,
    "diaDoVencimento" INTEGER NOT NULL,
    "dataInicial" TEXT NOT NULL,
    "dataFinal" TEXT,
    "ajusteDiaInexistente" "AjusteDeDiaInexistente" NOT NULL DEFAULT 'ULTIMO_DIA_DO_MES',
    "ajusteDiaNaoUtil" "AjusteDeDiaNaoUtil" NOT NULL DEFAULT 'MANTER',
    "situacao" "SituacaoDaRecorrencia" NOT NULL DEFAULT 'ATIVA',
    "geracaoDesde" TEXT NOT NULL,
    "pausadaEm" TIMESTAMP(3),
    "encerradaEm" TIMESTAMP(3),
    "chaveDeIdempotencia" TEXT,
    "criadoPorId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "despesas_recorrentes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eventos_da_recorrencia" (
    "id" TEXT NOT NULL,
    "recorrenciaId" TEXT NOT NULL,
    "tipo" "TipoDeEventoDaRecorrencia" NOT NULL,
    "antes" JSONB,
    "depois" JSONB,
    "contasAfetadas" INTEGER NOT NULL DEFAULT 0,
    "usuarioId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eventos_da_recorrencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conferencias_de_recorrencia" (
    "id" TEXT NOT NULL,
    "recorrenciaId" TEXT NOT NULL,
    "competencia" TEXT NOT NULL,
    "vencimento" TEXT NOT NULL,
    "situacao" "SituacaoDaConferencia" NOT NULL DEFAULT 'PENDENTE',
    "candidatos" TEXT[],
    "gastoId" TEXT,
    "resolvidaEm" TIMESTAMP(3),
    "resolvidaPorId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conferencias_de_recorrencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "configuracao_de_avisos" (
    "id" TEXT NOT NULL DEFAULT 'padrao',
    "marcos" INTEGER[],
    "horaDoAviso" INTEGER NOT NULL DEFAULT 8,
    "emailAtivo" BOOLEAN NOT NULL DEFAULT false,
    "mostrarValorNoEmail" BOOLEAN NOT NULL DEFAULT false,
    "atualizadoPorId" TEXT,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "configuracao_de_avisos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "destinatarios_de_aviso" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "nome" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "verificadoEm" TIMESTAMP(3),
    "codigoHash" TEXT,
    "codigoExpiraEm" TIMESTAMP(3),
    "codigoEnviadoEm" TIMESTAMP(3),
    "tentativasDoCodigo" INTEGER NOT NULL DEFAULT 0,
    "criadoPorId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "destinatarios_de_aviso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notificacoes_de_conta" (
    "id" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "gastoId" TEXT,
    "marco" INTEGER NOT NULL,
    "vencimento" TEXT NOT NULL,
    "dia" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "lidaEm" TIMESTAMP(3),
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notificacoes_de_conta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "envios_de_aviso" (
    "id" TEXT NOT NULL,
    "destinatarioId" TEXT NOT NULL,
    "dia" TEXT NOT NULL,
    "situacao" "SituacaoDoEnvio" NOT NULL DEFAULT 'PENDENTE',
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "proximaTentativaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "travadoAte" TIMESTAMP(3),
    "primeiraTentativaEm" TIMESTAMP(3),
    "enviadoEm" TIMESTAMP(3),
    "idNoProvedor" TEXT,
    "assunto" TEXT,
    "corpo" TEXT,
    "ultimoErro" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "envios_de_aviso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "itens_do_envio" (
    "envioId" TEXT NOT NULL,
    "notificacaoId" TEXT NOT NULL,
    "destinatarioId" TEXT NOT NULL,

    CONSTRAINT "itens_do_envio_pkey" PRIMARY KEY ("envioId","notificacaoId")
);

-- CreateTable
CREATE TABLE "execucoes_de_tarefa" (
    "id" TEXT NOT NULL,
    "tarefa" TEXT NOT NULL,
    "iniciadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "terminadaEm" TIMESTAMP(3),
    "sucesso" BOOLEAN,
    "resumo" JSONB,
    "erro" TEXT,

    CONSTRAINT "execucoes_de_tarefa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "travas_de_tarefa" (
    "nome" TEXT NOT NULL,
    "dono" TEXT NOT NULL,
    "ate" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "travas_de_tarefa_pkey" PRIMARY KEY ("nome")
);

-- CreateIndex
CREATE UNIQUE INDEX "despesas_recorrentes_chaveDeIdempotencia_key" ON "despesas_recorrentes"("chaveDeIdempotencia");

-- CreateIndex
CREATE INDEX "despesas_recorrentes_situacao_idx" ON "despesas_recorrentes"("situacao");

-- CreateIndex
CREATE INDEX "eventos_da_recorrencia_recorrenciaId_criadoEm_idx" ON "eventos_da_recorrencia"("recorrenciaId", "criadoEm");

-- CreateIndex
CREATE INDEX "conferencias_de_recorrencia_situacao_idx" ON "conferencias_de_recorrencia"("situacao");

-- CreateIndex
CREATE UNIQUE INDEX "conferencias_de_recorrencia_recorrenciaId_competencia_key" ON "conferencias_de_recorrencia"("recorrenciaId", "competencia");

-- CreateIndex
CREATE UNIQUE INDEX "destinatarios_de_aviso_email_key" ON "destinatarios_de_aviso"("email");

-- CreateIndex
CREATE UNIQUE INDEX "notificacoes_de_conta_chave_key" ON "notificacoes_de_conta"("chave");

-- CreateIndex
CREATE INDEX "notificacoes_de_conta_lidaEm_idx" ON "notificacoes_de_conta"("lidaEm");

-- CreateIndex
CREATE INDEX "notificacoes_de_conta_criadaEm_idx" ON "notificacoes_de_conta"("criadaEm");

-- CreateIndex
CREATE INDEX "envios_de_aviso_situacao_proximaTentativaEm_idx" ON "envios_de_aviso"("situacao", "proximaTentativaEm");

-- CreateIndex
CREATE UNIQUE INDEX "itens_do_envio_notificacaoId_destinatarioId_key" ON "itens_do_envio"("notificacaoId", "destinatarioId");

-- CreateIndex
CREATE INDEX "execucoes_de_tarefa_tarefa_iniciadaEm_idx" ON "execucoes_de_tarefa"("tarefa", "iniciadaEm");

-- CreateIndex
CREATE INDEX "gastos_venceEm_idx" ON "gastos"("venceEm");

-- CreateIndex
CREATE UNIQUE INDEX "gastos_recorrenciaId_competencia_key" ON "gastos"("recorrenciaId", "competencia");

-- AddForeignKey
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_recorrenciaId_fkey" FOREIGN KEY ("recorrenciaId") REFERENCES "despesas_recorrentes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos_da_recorrencia" ADD CONSTRAINT "eventos_da_recorrencia_recorrenciaId_fkey" FOREIGN KEY ("recorrenciaId") REFERENCES "despesas_recorrentes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conferencias_de_recorrencia" ADD CONSTRAINT "conferencias_de_recorrencia_recorrenciaId_fkey" FOREIGN KEY ("recorrenciaId") REFERENCES "despesas_recorrentes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificacoes_de_conta" ADD CONSTRAINT "notificacoes_de_conta_gastoId_fkey" FOREIGN KEY ("gastoId") REFERENCES "gastos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "envios_de_aviso" ADD CONSTRAINT "envios_de_aviso_destinatarioId_fkey" FOREIGN KEY ("destinatarioId") REFERENCES "destinatarios_de_aviso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itens_do_envio" ADD CONSTRAINT "itens_do_envio_envioId_fkey" FOREIGN KEY ("envioId") REFERENCES "envios_de_aviso"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "itens_do_envio" ADD CONSTRAINT "itens_do_envio_notificacaoId_fkey" FOREIGN KEY ("notificacaoId") REFERENCES "notificacoes_de_conta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

