-- AlterTable
ALTER TABLE "orcamentos" ADD COLUMN     "totalCalculado" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "valorFinalManual" BOOLEAN NOT NULL DEFAULT false;

-- As propostas que já existem nasceram sem negociação: o total delas é, por
-- definição, a soma da composição. Sem esta linha elas apareceriam no painel
-- com composição R$ 0,00 ao lado do valor de verdade.
UPDATE "orcamentos" SET "totalCalculado" = "total";
