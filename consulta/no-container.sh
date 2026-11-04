#!/bin/sh
# Roda dentro do postgres:18-alpine. O endereço do banco chega pela entrada
# padrão (nunca por argumento ou variável visível) e não é impresso.
set -eu
IFS= read -r URL
export PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=15000 -c TimeZone=UTC'
export PGAPPNAME='festae-contagem-somente-leitura'
export PGCONNECT_TIMEOUT=15
if psql "$URL" -X -q -v ON_ERROR_STOP=1 -A -t -f /consulta/contagem.sql >/tmp/saida 2>/tmp/erro; then
  # Só linhas chave=número.
  grep -E '^[a-z0-9_]+=([0-9]+|on|off)$' /tmp/saida
else
  # Erro de conexão pode citar o servidor: não é repassado.
  if grep -q 'ERROR:' /tmp/erro; then
    grep -oE 'ERROR: +[^:]{0,120}' /tmp/erro | head -3
  else
    echo 'Falha de conexão (detalhes suprimidos).'
  fi
  exit 1
fi
