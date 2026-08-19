#!/usr/bin/env bash
# Orquestrador do agente Pet Gaia — executado a cada ciclo agendado (08h/18h).
#
# Fase 1 (piloto): só roda módulos de leitura (trafego, analise). O módulo
# atendimento entra depois, quando o fluxo do WhatsApp for definido. Nenhum
# módulo aqui tem permissão de escrita — isso é reforçado no próprio prompt
# de cada um (ver rules/guardrails.md), não só por esse script.
set -euo pipefail

AGENT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_FILE="$AGENT_DIR/logs/$(date +%F).log"
MCP_CONFIG="$AGENT_DIR/mcp-config/mcp-servers.json"

if [ ! -f "$MCP_CONFIG" ]; then
  echo "ERRO: $MCP_CONFIG não encontrado. Copie mcp-servers.json.example e preencha" \
       "as variáveis de ambiente antes de rodar o agente." >&2
  exit 1
fi

run_module() {
  local module="$1"
  local prompt_file="$AGENT_DIR/prompts/${module}.md"
  local guardrails_file="$AGENT_DIR/rules/guardrails.md"

  echo "[$(date '+%Y-%m-%d %H:%M')] módulo=${module} iniciando" | tee -a "$LOG_FILE"

  claude \
    --print \
    --mcp-config "$MCP_CONFIG" \
    --append-system-prompt "$(cat "$guardrails_file")" \
    --output-format text \
    "$(cat "$prompt_file")

Execute sua função agora: leia as métricas disponíveis via MCP e produza a
saída no formato descrito acima. Fase atual: Piloto (somente leitura) — não
execute nenhuma ação de escrita." \
    >> "$LOG_FILE" 2>&1

  echo "[$(date '+%Y-%m-%d %H:%M')] módulo=${module} concluído" | tee -a "$LOG_FILE"
}

run_module trafego
run_module analise

# TODO: enviar resumo do ciclo (logs do dia) para aprovação/leitura via Telegram.
