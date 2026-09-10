-- Número do contrato, impresso no comprovante que a cliente guarda.
--
-- Vem de uma sequência do banco, e não de uma contagem feita na aplicação:
-- duas reservas fechadas no mesmo segundo pegariam o mesmo número se alguém
-- contasse linhas para decidir o próximo. É o banco que garante que cada
-- contrato tem um número só seu.
--
-- As reservas que já existem são numeradas na ordem em que nasceram, e não
-- na ordem física das linhas no disco: um contrato número 7 emitido antes do
-- número 3 seria uma numeração que não quer dizer nada.
--
-- INTEGER e não BIGINT: BigInt não sobrevive a JSON.stringify e derrubaria a
-- lista de reservas do painel. Dois bilhões de contratos é limite de sobra.

ALTER TABLE "reservations" ADD COLUMN "contractSeq" INTEGER;

WITH ordenadas AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY "requestedAt", id) AS n
  FROM "reservations"
)
UPDATE "reservations" r
SET "contractSeq" = o.n
FROM ordenadas o
WHERE o.id = r.id;

CREATE SEQUENCE "reservations_contractSeq_seq" OWNED BY "reservations"."contractSeq";

-- A próxima reserva continua de onde a numeração parou, nunca reaproveitando
-- um número que já foi impresso num comprovante.
SELECT setval(
  '"reservations_contractSeq_seq"',
  COALESCE((SELECT MAX("contractSeq") FROM "reservations"), 0) + 1,
  false
);

ALTER TABLE "reservations"
  ALTER COLUMN "contractSeq" SET DEFAULT nextval('"reservations_contractSeq_seq"');
ALTER TABLE "reservations" ALTER COLUMN "contractSeq" SET NOT NULL;

CREATE UNIQUE INDEX "reservations_contractSeq_key" ON "reservations"("contractSeq");
