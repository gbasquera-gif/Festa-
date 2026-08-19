// Wrapper fino sobre a Bot API do Telegram — lado do server.js (recebe os
// cliques de Aprovar/Rejeitar). Cópia deliberadamente separada de
// scripts/telegram-api.js: os dois lados rodam em apps Fly diferentes (ver
// README.md desta pasta) e não compartilham disco nem deploy.
"use strict";

const TELEGRAM_API = "https://api.telegram.org";

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Variável de ambiente ausente: ${name}`);
  return value;
}

async function callTelegram(method, payload) {
  const token = requireEnv("TELEGRAM_BOT_TOKEN");
  const res = await fetch(`${TELEGRAM_API}/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!data.ok) {
    throw new Error(`Telegram API (${method}) falhou: ${data.description}`);
  }
  return data.result;
}

function answerCallback(callbackQueryId, text) {
  return callTelegram("answerCallbackQuery", { callback_query_id: callbackQueryId, text });
}

function editMessageAfterDecision({ chatId, messageId, originalText, decisionLabel }) {
  return callTelegram("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text: `${originalText}\n\n— ${decisionLabel}`,
  });
}

module.exports = { answerCallback, editMessageAfterDecision, requireEnv };
