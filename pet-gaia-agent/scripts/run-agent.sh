#!/usr/bin/env bash
# Orquestrador do agente Pet Gaia — executado a cada ciclo agendado (08h/18h).
#
# Fase 1 (piloto): só roda módulos de leitura (trafego, analise). O módulo
# atendimento entra depois, quando o fluxo do WhatsApp for definido. Nenhum
# módulo aqui tem permissão de escrita — isso é reforçado no próprio prompt
# de cada um (ver rules/guardrails.md), não só por esse script.
set -euo pipefail

AGENT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# /data é o volume persistente montado em produção (ver fly.toml) — é onde
# vivem o mcp-servers.json real (nunca entra na imagem, ver .dockerignore) e
# as credenciais OAuth que o Claude Code salva depois do login manual único
# (`claude mcp login meta-ads --no-browser`).
#
# Importante: definir HOME=/data no [env] do fly.toml NÃO funciona — o
# Fly.io ignora/reseta essa variável (confirmado testando: uma sessão SSH
# e o processo principal continuam vendo $HOME=/root). Por isso, em vez de
# depender disso, este script copia manualmente as credenciais entre /data
# e o $HOME real a cada execução — funciona não importa onde o sistema
# decida que $HOME fica.
DATA_DIR="/data"
if [ -d "$DATA_DIR" ]; then
  [ -f "$DATA_DIR/.claude.json" ] && cp "$DATA_DIR/.claude.json" "$HOME/.claude.json"
  [ -d "$DATA_DIR/.claude" ] && cp -r "$DATA_DIR/.claude" "$HOME/.claude"
fi

# Em dev local, se não houver volume /data, cai no arquivo dentro do
# próprio repo (útil para testar sem volume).
MCP_CONFIG="$AGENT_DIR/mcp-config/mcp-servers.json"
if [ ! -f "$MCP_CONFIG" ]; then
  MCP_CONFIG="$DATA_DIR/mcp-servers.json"
fi

LOG_DIR="$DATA_DIR/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/$(date +%F).log"

if [ ! -f "$MCP_CONFIG" ]; then
  echo "ERRO: nenhum mcp-servers.json encontrado (procurado em" \
       "$AGENT_DIR/mcp-config/mcp-servers.json e $DATA_DIR/mcp-servers.json)." \
       "Copie mcp-servers.json.example e preencha antes de rodar o agente." >&2
  exit 1
fi

# Persiste de volta qualquer renovação de token que o Claude Code tenha
# feito durante a execução, não importa como o script termine.
sync_credentials_back() {
  [ -f "$HOME/.claude.json" ] && cp "$HOME/.claude.json" "$DATA_DIR/.claude.json"
  [ -d "$HOME/.claude" ] && cp -r "$HOME/.claude" "$DATA_DIR/.claude"
}
trap sync_credentials_back EXIT

run_module() {
  local module="$1"
  local prompt_file="$AGENT_DIR/prompts/${module}.md"
  local guardrails_file="$AGENT_DIR/rules/guardrails.md"

  echo "[$(date '+%Y-%m-%d %H:%M')] módulo=${module} iniciando" | tee -a "$LOG_FILE"

  # Sem --allowedTools, chamadas às tools MCP (mesmo de leitura) não
  # completam em modo --print, pois não há terminal para confirmação
  # (ver rules/guardrails.md para o que cada módulo pode/não pode fazer).
  claude \
    --print \
    --mcp-config "$MCP_CONFIG" \
    --append-system-prompt "$(cat "$guardrails_file")" \
    --output-format text \
    --allowedTools "mcp__meta-ads__*" "mcp__google-ads__*" \
    "$(cat "$prompt_file")

Execute sua função agora: leia as métricas disponíveis via MCP e produza a
saída no formato descrito acima. Fase atual: Piloto (somente leitura, exceto
a exceção específica de rascunho de campanha pausada descrita em
rules/guardrails.md, se aplicável ao seu módulo). Se houver mais de um item,
comece CADA um com sua própria linha marcadora: ---RECOMENDACAO--- para
recomendação de texto, ou ---RASCUNHO-CAMPANHA:<id>--- para rascunho de
campanha (id retornado pela ferramenta de criação)." \
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
