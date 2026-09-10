-- Ancora toda data de festa ao meio-dia UTC.
--
-- Havia duas convenções no banco para a mesma coisa. A reserva registrada
-- pelo painel gravava o dia às 12:00 UTC; a reserva fechada pela loja
-- gravava às 00:00 UTC, porque "2026-09-25" vira meia-noite UTC quando lido
-- como instante. Meia-noite UTC é 21h do dia anterior em Chapecó — e foi por
-- isso que a festa do dia 25 aparecia como 24 no painel, no resumo da
-- cliente e na tela de pagamento, e que a régua da operação dizia "hoje é a
-- festa" na véspera.
--
-- A correção move o horário, nunca o dia: cada linha vai para as 12:00 UTC
-- da SUA PRÓPRIA data em UTC. Para as linhas da loja, essa data em UTC é
-- exatamente o dia que a cliente tocou no calendário — o dia certo, que só
-- estava sendo lido errado. Para as linhas do painel, que já estão às 12:00,
-- a operação não muda nada.
--
-- Meio-dia UTC é a âncora porque é o único horário que continua sendo o
-- mesmo dia do calendário em qualquer fuso de UTC-11 a UTC+11.

UPDATE events
SET date = date_trunc('day', date) + INTERVAL '12 hours'
WHERE date <> date_trunc('day', date) + INTERVAL '12 hours';

UPDATE reservations
SET "eventDate" = date_trunc('day', "eventDate") + INTERVAL '12 hours'
WHERE "eventDate" <> date_trunc('day', "eventDate") + INTERVAL '12 hours';

-- A data de origem de uma festa remarcada é mostrada na tela ("antes era
-- 24/09") e é lida do mesmo jeito. Fica na mesma âncora.
UPDATE reservations
SET "rescheduledFrom" = date_trunc('day', "rescheduledFrom") + INTERVAL '12 hours'
WHERE "rescheduledFrom" IS NOT NULL
  AND "rescheduledFrom" <> date_trunc('day', "rescheduledFrom") + INTERVAL '12 hours';
