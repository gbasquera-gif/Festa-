-- Contadores do Assistente IA do painel.
--
-- Só acréscimo: uma tabela nova, sem tocar nas existentes e sem backfill.
-- Guarda apenas contagens e gasto estimado por hora, dia e mês, para que os
-- limites de perguntas e o teto de gasto valham entre instâncias da API e
-- não zerem a cada deploy. Nenhum conteúdo de conversa vai para cá.

-- CreateTable
CREATE TABLE "assistente_uso" (
    "janela" TEXT NOT NULL,
    "escopo" TEXT NOT NULL,
    "perguntas" INTEGER NOT NULL DEFAULT 0,
    "falas" INTEGER NOT NULL DEFAULT 0,
    "custoUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assistente_uso_pkey" PRIMARY KEY ("janela","escopo")
);
