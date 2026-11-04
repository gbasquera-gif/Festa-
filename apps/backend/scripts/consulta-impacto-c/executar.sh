#!/usr/bin/env bash
# Impacto da Entrega C em produção: somente leitura, só números agregados.
set -Eeuo pipefail
umask 077
: "${FESTAE_DATABASE_PUBLIC_URL:?Configure o segredo FESTAE_DATABASE_PUBLIC_URL}"
URL="$FESTAE_DATABASE_PUBLIC_URL"
unset FESTAE_DATABASE_PUBLIC_URL
if [[ "$URL" != postgres://* && "$URL" != postgresql://* ]]; then echo 'ERRO: endereço PostgreSQL inválido.'; exit 1; fi
if [[ "$URL" == *'sslmode=disable'* ]]; then echo 'ERRO: URL sem SSL.'; exit 1; fi
sep='?'; [[ "$URL" == *'?'* ]] && sep='&'
if [[ "$URL" != *'sslmode='* ]]; then URL+="${sep}sslmode=require&sslaccept=accept_invalid_certs"; sep='&'; fi
URL+="${sep}connection_limit=1"
DIR="$(cd "$(dirname "$0")" && pwd)"
# stderr descartado: mensagem de erro de conexão pode citar o servidor.
SAIDA=$(DATABASE_URL="$URL" node "$DIR/contar.cjs" 2>/dev/null || true)
unset URL
FILTRADA=$(grep -E '^([a-z0-9_]+=([0-9]+|on|off)|falha=[A-Za-z]+)$' <<<"$SAIDA" || true)
printf '%s\n' "$FILTRADA"
if ! grep -qx 'transacao_somente_leitura=on' <<<"$FILTRADA" || ! grep -qx 'escrita_bloqueada=on' <<<"$FILTRADA"; then
  echo 'ERRO: sem confirmação de transação somente leitura com escrita bloqueada.'
  exit 1
fi
{
  echo '### Impacto da Entrega C (somente leitura, números agregados)'
  echo
  echo '| indicador | valor |'
  echo '|---|---|'
  sed -E 's/^([a-z0-9_]+)=(.*)$/| \1 | \2 |/' <<<"$FILTRADA"
} >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
