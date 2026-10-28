#!/bin/bash
# Homologação de contas a pagar no banco LOCAL. Uso (na raiz, depois do build):
#   DATABASE_URL=postgresql://...@localhost:5432/festae_descartavel apps/backend/scripts/homologacao-contas/executar.sh
set -u
AQUI="$(cd "$(dirname "$0")" && pwd)"
PORTA="${HOMOLOGACAO_PORTA:-3360}"
LOG="${TMPDIR:-/tmp}/homologacao-contas.log"
EMAILS="$(mktemp -d "${TMPDIR:-/tmp}/homologacao-contas-emails.XXXXXX")"

export AVISOS_EMAIL_PROVEDOR=arquivo AVISOS_EMAIL_DIRETORIO="$EMAILS"
HOMOLOGACAO_PORTA="$PORTA" node "$AQUI/servidor.cjs" > "$LOG" 2>&1 &
SERVIDOR=$!
trap 'kill $SERVIDOR 2>/dev/null; rm -rf "$EMAILS"' EXIT
for _ in $(seq 1 60); do
  grep -q "Homologação de contas a pagar em" "$LOG" && break
  kill -0 $SERVIDOR 2>/dev/null || { cat "$LOG"; exit 1; }
  sleep 0.5
done

BASE="http://localhost:$PORTA" HOMOLOGACAO_LOG="$LOG" EMAILS="$EMAILS" node "$AQUI/cenarios.mjs"
