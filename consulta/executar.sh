#!/usr/bin/env bash
# Contagem somente leitura na produção. Imprime só números agregados.
set -Eeuo pipefail
umask 077
: "${FESTAE_DATABASE_PUBLIC_URL:?Configure o segredo FESTAE_DATABASE_PUBLIC_URL}"
URL="$FESTAE_DATABASE_PUBLIC_URL"
unset FESTAE_DATABASE_PUBLIC_URL
if [[ "$URL" != postgres://* && "$URL" != postgresql://* ]]; then echo 'ERRO: endereço PostgreSQL inválido.' >&2; exit 1; fi
if [[ "$URL" == *'sslmode=disable'* ]]; then echo 'ERRO: URL sem SSL.' >&2; exit 1; fi
if [[ "$URL" != *'sslmode='* ]]; then
  if [[ "$URL" == *'?'* ]]; then URL+='&sslmode=require'; else URL+='?sslmode=require'; fi
fi
DIR="$(cd "$(dirname "$0")" && pwd)"
SAIDA=$(printf '%s\n' "$URL" | docker run --rm -i --user "$(id -u):$(id -g)" \
  -v "$DIR:/consulta:ro" postgres:18-alpine sh /consulta/no-container.sh)
unset URL
printf '%s\n' "$SAIDA"
grep -qx 'transacao_somente_leitura=on' <<<"$SAIDA" || { echo 'ERRO: a transação não estava em modo somente leitura.' >&2; exit 1; }
{
  echo '### Datas divergentes (somente leitura, números agregados)'
  echo
  echo '| indicador | quantidade |'
  echo '|---|---|'
  grep -v '^transacao_' <<<"$SAIDA" | sed -E 's/^([a-z0-9_]+)=(.*)$/| \1 | \2 |/'
} >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
