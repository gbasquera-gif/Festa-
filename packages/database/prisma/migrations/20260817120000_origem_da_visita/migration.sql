-- Origem da visita gravada na festa, para ligar campanha a reserva e a receita.
-- Colunas opcionais: as festas que já existem não têm origem conhecida e devem
-- continuar válidas.
ALTER TABLE "events" ADD COLUMN "utmSource" TEXT;
ALTER TABLE "events" ADD COLUMN "utmMedium" TEXT;
ALTER TABLE "events" ADD COLUMN "utmCampaign" TEXT;
