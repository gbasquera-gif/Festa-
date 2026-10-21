#!/bin/bash
# Testa a restauração de um pg_dump num Postgres ISOLADO (local), sem tocar
# produção. Cria um banco novo, restaura, imprime a "foto" de verificar-banco.sql
# para comparar com a de produção, e diz como apagar o banco de teste.
#
# Uso: testar-restauro.sh <arquivo.dump> <url-do-postgres-local-sem-banco>
#   ex.: testar-restauro.sh festae-20261022-0900.dump postgresql://postgres:senha@localhost:5433
set -euo pipefail
DUMP=${1:?informe o arquivo .dump}
SERVIDOR=${2:?informe a URL do Postgres local, sem o nome do banco}
case "$SERVIDOR" in
  *@localhost:*|*@localhost|*@127.0.0.1:*|*@127.0.0.1) ;;
  *) echo "Recusado: o teste de restauração só roda num Postgres local, isolado da produção."; exit 1 ;;
esac
AQUI=$(cd "$(dirname "$0")" && pwd)
BANCO="festae_restauro_$(date +%Y%m%d%H%M%S)"
psql "$SERVIDOR/postgres" -v ON_ERROR_STOP=1 -qc "CREATE DATABASE $BANCO"
pg_restore --no-owner --no-acl --exit-on-error -d "$SERVIDOR/$BANCO" "$DUMP"
echo "== Restaurado em $BANCO. Compare com a mesma consulta rodada em produção:"
psql "$SERVIDOR/$BANCO" -qtA -F ' | ' -f "$AQUI/verificar-banco.sql"
echo "== Para apagar o banco de teste: psql \"$SERVIDOR/postgres\" -c \"DROP DATABASE $BANCO\""
