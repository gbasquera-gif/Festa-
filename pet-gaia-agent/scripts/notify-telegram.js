#!/usr/bin/env node
// Lê o log do ciclo que acabou de rodar, separa as recomendações/rascunhos de
// cada módulo e manda uma mensagem no Telegram por item, com botões
// Aprovar/Rejeitar.
//
// Cada item começa com uma linha marcadora própria:
//   ---RECOMENDACAO---                    → recomendação de texto (ver run-agent.sh)
//   ---RASCUNHO-CAMPANHA:<id>---          → rascunho de campanha PAUSADA (ver prompts/trafego.md)
//
// Fase 1 (piloto): aprovar/rejeitar uma RECOMENDACAO só registra a decisão
// (ver bot/server.js) — nada é executado. Aprovar/rejeitar um
// RASCUNHO-CAMPANHA de fato ATIVA ou APAGA a campanha pausada correspondente
// — é a única ação de escrita permitida nesta fase (ver rules/guardrails.md).
"use strict";

const fs = require("fs");
const path = require("path");
const { sendRecommendation, requireEnv } = require("./telegram-api");

function splitBlocks(text) {
  const delimRe = /^---(RECOMENDACAO|RASCUNHO-CAMPANHA:([^\n]+?))---[ \t]*$/gm;
  const marks = [];
  let m;
  while ((m = delimRe.exec(text)) !== null) {
    marks.push({ campaignId: m[2], start: m.index, contentStart: delimRe.lastIndex });
  }

  if (marks.length === 0) {
    const trimmed = text.trim();
    return trimmed ? [{ campaignId: undefined, text: trimmed }] : [];
  }

  const blocks = [];
  for (let i = 0; i < marks.length; i++) {
    const end = i + 1 < marks.length ? marks[i + 1].start : text.length;
    const content = text.slice(marks[i].contentStart, end).trim();
    if (content) blocks.push({ campaignId: marks[i].campaignId, text: content });
  }
  return blocks;
}

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
    for (const item of splitBlocks(body)) {
      const isCampaignDraft = Boolean(item.campaignId);
      const label = isCampaignDraft ? `${module} · rascunho de campanha` : module;
      const approveData = isCampaignDraft ? `approve:campaign:${item.campaignId}` : `approve:${module}`;
      const rejectData = isCampaignDraft ? `reject:campaign:${item.campaignId}` : `reject:${module}`;

      await sendRecommendation({
        chatId,
        text: `*[${label}]* — ${path.basename(logFile)}\n\n${item.text}`,
        approveData,
        rejectData,
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
