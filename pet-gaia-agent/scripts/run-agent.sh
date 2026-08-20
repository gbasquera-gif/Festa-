#!/usr/bin/env bash
# Orquestrador do agente Pet Gaia — executado a cada ciclo agendado (08h/18h).
#
# Fase 1 (piloto): só roda módulos de leitura (trafego, analise). O módulo
# atendimento entra depois, quando o fluxo do WhatsApp for definido. Nenhum
# módulo aqui tem permissão de escrita — isso é reforçado no próprio prompt
# de cada um (ver rules/guardrails.md), não só por esse script.
set -euo pipefail

AGENT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# $HOME aponta para o volume persistente montado em produção (ver fly.toml) —
# é onde vivem o mcp-servers.json real (nunca entra na imagem, ver
# .dockerignore) e as credenciais OAuth que o Claude Code salva depois do
# login manual único (`claude mcp login meta-ads --no-browser`). Em dev
# local, se não houver HOME configurado dessa forma, cai no arquivo dentro
# do próprio repo (útil para testar sem volume).
MCP_CONFIG="$AGENT_DIR/mcp-config/mcp-servers.json"
if [ ! -f "$MCP_CONFIG" ]; then
  MCP_CONFIG="$HOME/mcp-servers.json"
fi

LOG_DIR="$HOME/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/$(date +%F).log"

if [ ! -f "$MCP_CONFIG" ]; then
  echo "ERRO: nenhum mcp-servers.json encontrado (procurado em" \
       "$AGENT_DIR/mcp-config/mcp-servers.json e $HOME/mcp-servers.json)." \
       "Copie mcp-servers.json.example e preencha antes de rodar o agente." >&2
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
execute nenhuma ação de escrita. Se houver mais de uma recomendação, separe
cada uma com uma linha contendo apenas: ---RECOMENDACAO---" \
    >> "$LOG_FILE" 2>&1

  echo "[$(date '+%Y-%m-%d %H:%M')] módulo=${module} concluído" | tee -a "$LOG_FILE"
}

run_module trafego
run_module analise

if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_CHAT_ID:-}" ]; then
  node "$AGENT_DIR/scripts/notify-telegram.js" "$LOG_FILE"
else
  echo "Telegram não configurado (TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID ausentes)," \
       "pulando notificação." | tee -a "$LOG_FILE"
fi
