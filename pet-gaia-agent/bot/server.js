#!/usr/bin/env node
// Servidor leve, sempre ativo, que recebe os webhooks do Telegram quando
// você clica em Aprovar/Rejeitar numa recomendação. Roda como um app Fly
// separado do agente principal (que só liga nos horários agendados) — ver
// README.md desta pasta para o porquê.
//
// Fase 1 (piloto): aprovar/rejeitar aqui SÓ registra a decisão em
// decisoes.log. Nenhuma ação é executada automaticamente a partir daqui —
// isso muda só quando a fase de piloto terminar (ver rules/guardrails.md).
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const { answerCallback, editMessageAfterDecision, requireEnv } = require("./telegram-api");

const PORT = process.env.PORT || 8080;
const WEBHOOK_PATH = "/telegram-webhook";
// DATA_DIR deve apontar para um Fly Volume montado neste app (ver fly.toml)
// para que decisoes.log sobreviva a reinícios da máquina.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const DECISIONS_FILE = path.join(DATA_DIR, "decisoes.log");

fs.mkdirSync(DATA_DIR, { recursive: true });

function appendDecision(entry) {
  fs.appendFileSync(DECISIONS_FILE, entry + "\n");
}

async function handleCallbackQuery(callbackQuery) {
  const [action, module = "desconhecido"] = (callbackQuery.data || "").split(":");

  if (action !== "approve" && action !== "reject") {
    await answerCallback(callbackQuery.id, "Ação não reconhecida.");
    return;
  }

  const decisionLabel = action === "approve" ? "✅ Aprovado" : "❌ Rejeitado";
  const approvedBy = callbackQuery.from?.username || callbackQuery.from?.first_name || "desconhecido";
  const timestamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  const originalText = callbackQuery.message?.text || "";

  appendDecision(
    `[${timestamp}] módulo=${module}\n` +
      `status: ${action === "approve" ? "aprovada" : "rejeitada"}\n` +
      `aprovado_por: ${approvedBy}\n` +
      `texto: ${originalText.replace(/\n/g, " ")}\n`
  );

  await answerCallback(callbackQuery.id, decisionLabel);

  if (callbackQuery.message) {
    await editMessageAfterDecision({
      chatId: callbackQuery.message.chat.id,
      messageId: callbackQuery.message.message_id,
      originalText,
      decisionLabel: `${decisionLabel} por ${approvedBy} em ${timestamp}`,
    });
  }
}

const server = http.createServer((req, res) => {
  if (req.method !== "POST" || req.url !== WEBHOOK_PATH) {
    res.writeHead(404);
    res.end();
    return;
  }

  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret && req.headers["x-telegram-bot-api-secret-token"] !== secret) {
    res.writeHead(401);
    res.end();
    return;
  }

  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    res.writeHead(200);
    res.end("ok");
    try {
      const update = JSON.parse(body);
      if (update.callback_query) {
        handleCallbackQuery(update.callback_query).catch((err) =>
          console.error("Erro processando callback_query:", err)
        );
      }
    } catch (err) {
      console.error("Erro processando update do Telegram:", err);
    }
  });
});

requireEnv("TELEGRAM_BOT_TOKEN");
server.listen(PORT, () => {
  console.log(`Bot Pet Gaia ouvindo em :${PORT}${WEBHOOK_PATH}`);
});
