-- A quantidade de convidados deixa de ser obrigatória para criar a festa.
-- Quem ainda não fechou a lista travava no primeiro passo; agora segue e a
-- Festaê acerta o número antes de separar os itens.
--
-- As festas já cadastradas mantêm o valor que informaram: só a coluna passa
-- a aceitar nulo, nada é apagado.
ALTER TABLE "events" ALTER COLUMN "guestCount" DROP NOT NULL;
