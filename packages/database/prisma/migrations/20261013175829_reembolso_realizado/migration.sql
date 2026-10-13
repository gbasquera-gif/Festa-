-- Reembolso a realizar → reembolso realizado.
--
-- Só acréscimos: uma tabela nova, sem backfill. O tratamento do cancelamento
-- diz quanto volta para a cliente; esta tabela registra a devolução que a
-- Festaê de fato fez (por Pix ou outro meio, fora do sistema). É ela que tira
-- o valor do caixa, na data em que o dinheiro saiu.

-- CreateTable
CREATE TABLE "reembolsos_realizados" (
    "id" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "tratamentoId" TEXT,
    "tratamentoComplementarId" TEXT,
    "valor" DECIMAL(10,2) NOT NULL,
    "realizadoEm" TIMESTAMP(3) NOT NULL,
    "forma" "PaymentMethod" NOT NULL,
    "observacao" TEXT,
    "registradoPorId" TEXT NOT NULL,
    "registradoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reembolsos_realizados_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reembolsos_realizados_tratamentoId_key" ON "reembolsos_realizados"("tratamentoId");

-- CreateIndex
CREATE UNIQUE INDEX "reembolsos_realizados_tratamentoComplementarId_key" ON "reembolsos_realizados"("tratamentoComplementarId");

-- CreateIndex
CREATE INDEX "reembolsos_realizados_reservationId_idx" ON "reembolsos_realizados"("reservationId");

-- CreateIndex
CREATE INDEX "reembolsos_realizados_realizadoEm_idx" ON "reembolsos_realizados"("realizadoEm");

-- CreateIndex
CREATE INDEX "reembolsos_realizados_registradoPorId_idx" ON "reembolsos_realizados"("registradoPorId");

-- AddForeignKey
ALTER TABLE "reembolsos_realizados" ADD CONSTRAINT "reembolsos_realizados_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "reservations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reembolsos_realizados" ADD CONSTRAINT "reembolsos_realizados_tratamentoId_fkey" FOREIGN KEY ("tratamentoId") REFERENCES "tratamentos_de_cancelamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reembolsos_realizados" ADD CONSTRAINT "reembolsos_realizados_tratamentoComplementarId_fkey" FOREIGN KEY ("tratamentoComplementarId") REFERENCES "tratamentos_complementares_de_cancelamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reembolsos_realizados" ADD CONSTRAINT "reembolsos_realizados_registradoPorId_fkey" FOREIGN KEY ("registradoPorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Integridade que não depende da aplicação lembrar.

ALTER TABLE "reembolsos_realizados" ADD CONSTRAINT "reembolso_realizado_positivo"
  CHECK ("valor" > 0);

-- Pertence a exatamente um tratamento: o do cancelamento ou um complementar.
ALTER TABLE "reembolsos_realizados" ADD CONSTRAINT "reembolso_de_um_tratamento"
  CHECK (("tratamentoId" IS NULL) <> ("tratamentoComplementarId" IS NULL));

-- Registro de dinheiro que saiu não se edita nem se apaga: corrigir seria
-- reescrever o caixa de um dia que já passou.
CREATE FUNCTION "reembolso_realizado_imutavel"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Reembolso realizado é registro definitivo: não pode ser alterado nem apagado.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "reembolso_realizado_imutavel"
  BEFORE UPDATE OR DELETE ON "reembolsos_realizados"
  FOR EACH ROW EXECUTE FUNCTION "reembolso_realizado_imutavel"();
