-- A vitrine passou a ser organizada por ocasião, e não por categoria de
-- produto. "Festa infantil" virou "Aniversário" porque a Festaê também atende
-- aniversário de adulto, e entrou "Batizado", que a operação já atendia por
-- fora do aplicativo.

-- RENAME em vez de DROP + CREATE: as festas já cadastradas continuam
-- apontando para o mesmo valor, sem precisar de UPDATE nem correr o risco de
-- perder o tipo de quem já reservou.
ALTER TYPE "EventType" RENAME VALUE 'FESTA_INFANTIL' TO 'ANIVERSARIO';

ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'BATIZADO';
