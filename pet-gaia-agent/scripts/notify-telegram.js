#!/usr/bin/env node
// Lê o log do ciclo que acabou de rodar, separa as recomendações de cada
// módulo (delimitadas por "---RECOMENDACAO---", ver instrução em
// run-agent.sh) e manda uma mensagem no Telegram por recomendação, com
// botões Aprovar/Rejeitar.
//
// Fase 1 (piloto): aprovar/rejeitar só registra a decisão (ver bot/server.js)
// — nenhuma ação é executada automaticamente. Isso muda só quando a fase de
// piloto terminar (ver rules/guardrails.md).
"use strict";

const fs = require("fs");
const path = require("path");
const { sendRecommendation, requireEnv } = require("./telegram-api");

function splitModuleBlocks(logText) {
  const markerRe = /\[[^\]]+\]\s*módulo=(\w+)\s*(iniciando|concluído)/g;
  const markers = [];
  let match;
  while ((match = markerRe.exec(logText)) !== null) {
    markers.push({ module: match[1], kind: match[2], start: match.index, end: markerRe.lastIndex });
  }

  const blocks = [];
  for (let i = 0; i < markers.length; i++) {
    const start = markers[i];
    if (start.kind !== "iniciando") continue;
    const end = markers[i + 1];
    if (!end || end.module !== start.module || end.kind !== "concluído") continue;
    const body = logText.slice(start.end, end.start).trim();
    if (body) blocks.push({ module: start.module, body });
  }
  return blocks;
}

async function main() {
  const logFile = process.argv[2];
  if (!logFile || !fs.existsSync(logFile)) {
    console.error("Uso: node notify-telegram.js <caminho-do-log-do-ciclo>");
    process.exit(1);
  }

  const chatId = requireEnv("TELEGRAM_CHAT_ID");
  const logText = fs.readFileSync(logFile, "utf8");
  const moduleBlocks = splitModuleBlocks(logText);

  if (moduleBlocks.length === 0) {
    console.log("Nenhum bloco de módulo encontrado no log — nada para enviar.");
    return;
  }

  let sent = 0;
  for (const { module, body } of moduleBlocks) {
    const recommendations = body
      .split("---RECOMENDACAO---")
      .map((s) => s.trim())
      .filter(Boolean);

    for (const text of recommendations) {
      await sendRecommendation({
        chatId,
        text: `*[${module}]* — ${path.basename(logFile)}\n\n${text}`,
        approveData: `approve:${module}`,
        rejectData: `reject:${module}`,
      });
      sent += 1;
    }
  }

  console.log(`Enviada(s) ${sent} mensagem(ns) para o Telegram.`);
}

main().catch((err) => {
  console.error("Falha ao notificar o Telegram:", err.message);
  // Não derruba o ciclo do agente por causa disso — a notificação é
  // best-effort, o log já foi gravado independentemente.
  process.exit(0);
});
