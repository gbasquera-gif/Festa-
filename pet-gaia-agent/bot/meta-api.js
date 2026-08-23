// Wrapper fino sobre a Graph API do Meta — usado só para ativar ou apagar
// rascunhos de campanha PAUSADOS criados pelo módulo trafego (ver
// prompts/trafego.md e rules/guardrails.md). Não usa o Meta Ads MCP (que só
// existe dentro da sessão do Claude Code no app principal) — este é um
// serviço leve e separado, então fala direto com a Graph API usando um
// token de usuário do sistema (System User) com permissão ads_management.
"use strict";

const GRAPH_API_VERSION = "v25.0";

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Variável de ambiente ausente: ${name}`);
  return value;
}

async function callGraphApi(method, objectId, params = {}) {
  const token = requireEnv("META_SYSTEM_USER_TOKEN");
  const url = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/${objectId}`);
  url.searchParams.set("access_token", token);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const res = await fetch(url, { method });
  const data = await res.json();
  if (data.error) {
    throw new Error(`Meta Graph API (${method} ${objectId}) falhou: ${data.error.message}`);
  }
  return data;
}

// Aprovar um rascunho: tira do status PAUSADO e ativa de verdade (aí sim
// passa a gastar). É a ÚNICA forma de escrita real que este bot dispara.
function activateCampaign(campaignId) {
  return callGraphApi("POST", campaignId, { status: "ACTIVE" });
}

// Rejeitar um rascunho: apaga a campanha pausada (nunca chegou a gastar
// nem a ficar visível ao público).
function deleteCampaign(campaignId) {
  return callGraphApi("DELETE", campaignId);
}

module.exports = { activateCampaign, deleteCampaign };
