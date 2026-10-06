-- Data da festa ainda não definida.
--
-- Só deixa de exigir a data: a coluna, o índice e todas as datas já gravadas
-- ficam exatamente como estão. Nenhum dado é lido, apagado ou alterado.
-- Proposta com data vazia pode ser enviada e vista pela cliente, mas não
-- pode ser aprovada nem virar reserva enquanto a data não for preenchida.

-- AlterTable
ALTER TABLE "orcamentos" ALTER COLUMN "festaEm" DROP NOT NULL;
