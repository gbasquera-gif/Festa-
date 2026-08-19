// Wrapper fino sobre a Bot API do Telegram — usado pelo notify-telegram.js
// (roda dentro do ciclo agendado do agente, só envia mensagens).
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

function sendRecommendation({ chatId, text, approveData, rejectData }) {
  return callTelegram("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [
          { text: "✅ Aprovar", callback_data: approveData },
          { text: "❌ Rejeitar", callback_data: rejectData },
        ],
      ],
    },
  });
}

module.exports = { sendRecommendation, callTelegram, requireEnv };
