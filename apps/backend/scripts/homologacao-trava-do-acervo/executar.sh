#!/bin/bash
# Homologação da trava única do acervo, no banco LOCAL.
# Uso (na raiz, depois do build):
#   DATABASE_URL=postgresql://...@localhost:5432/festae_descartavel apps/backend/scripts/homologacao-trava-do-acervo/executar.sh
set -u
AQUI="$(cd "$(dirname "$0")" && pwd)"
PORTA="${HOMOLOGACAO_PORTA:-3350}"
LOG="${TMPDIR:-/tmp}/homologacao-trava-do-acervo.log"

HOMOLOGACAO_PORTA="$PORTA" node "$AQUI/servidor.cjs" > "$LOG" 2>&1 &
SERVIDOR=$!
trap 'kill $SERVIDOR 2>/dev/null' EXIT
for _ in $(seq 1 60); do
  grep -q "Homologação da trava do acervo em" "$LOG" && break
  kill -0 $SERVIDOR 2>/dev/null || { cat "$LOG"; exit 1; }
  sleep 0.5
done

BASE="http://localhost:$PORTA" node "$AQUI/cenarios.mjs"
