#!/bin/bash
# Homologação da disponibilidade dos orçamentos no banco LOCAL. Uso (na raiz, depois do build):
#   DATABASE_URL=postgresql://...@localhost:5432/festae_descartavel apps/backend/scripts/homologacao-orcamentos/executar.sh
set -u
AQUI="$(cd "$(dirname "$0")" && pwd)"
PORTA="${HOMOLOGACAO_PORTA:-3340}"
LOG="${TMPDIR:-/tmp}/homologacao-orcamentos.log"

HOMOLOGACAO_PORTA="$PORTA" node "$AQUI/servidor.cjs" > "$LOG" 2>&1 &
SERVIDOR=$!
trap 'kill $SERVIDOR 2>/dev/null' EXIT
for _ in $(seq 1 60); do
  grep -q "Homologação da disponibilidade dos orçamentos em" "$LOG" && break
  kill -0 $SERVIDOR 2>/dev/null || { cat "$LOG"; exit 1; }
  sleep 0.5
done

BASE="http://localhost:$PORTA" node "$AQUI/cenarios.mjs"
