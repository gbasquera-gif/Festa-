-- Pró-labore como natureza própria de despesa.
--
-- Só ACRESCENTA um valor ao enum de natureza dos gastos. Nenhum lançamento
-- existente muda de natureza: o que já está como consumo ou custeio continua
-- como está, e o Resultado Operacional (consumo + custeio) não muda.

-- AlterEnum
ALTER TYPE "NaturezaDoGasto" ADD VALUE 'PRO_LABORE';
