#!/bin/sh
# Roda DENTRO de um container da imagem oficial do Postgres, chamado por
# backup-windows.ps1. Nenhum endereço de banco passa pela linha de comando:
# a produção chega só pela variável PGURL, e o restauro usa só o socket local
# do container isolado (sem rede).
#
#   versao                     versão do servidor de produção (só leitura)
#   backup <dump> <foto>       foto + pg_dump da produção no MESMO instantâneo
#   esperar                    espera o Postgres do container isolado ficar pronto
#   restaurar <dump> <foto>    restaura no container isolado e tira a mesma foto
set -eu
SCRIPTS=${SCRIPTS:-/scripts}
SAIDA=${SAIDA:-/saida}

case "${1:-}" in
  versao)
    : "${PGURL:?PGURL não definida}"
    psql "$PGURL" -X -v ON_ERROR_STOP=1 -qtA \
      -c "SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY" \
      -c "SHOW server_version_num"
    ;;

  backup)
    : "${PGURL:?PGURL não definida}"
    DUMP=${2:?informe o nome do dump}
    FOTO=${3:?informe o nome da foto}
    # Uma transação SÓ DE LEITURA segura um instantâneo do banco. A foto é
    # tirada dentro dela, e o pg_dump lê o mesmo instantâneo (--snapshot):
    # o que a foto descreve é exatamente o que o dump contém, mesmo que o
    # sistema esteja em uso durante o backup.
    TMP=$(mktemp -d)
    mkfifo "$TMP/entrada"
    psql "$PGURL" -X -v ON_ERROR_STOP=1 -qtA -F ' | ' < "$TMP/entrada" > "$TMP/saida" 2>&1 &
    SESSAO=$!
    exec 3> "$TMP/entrada"
    echo "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;" >&3
    echo "SELECT pg_export_snapshot();" >&3
    esperar_linha() {
      i=0
      until grep -q "$1" "$TMP/saida"; do
        kill -0 "$SESSAO" 2>/dev/null || { echo "A sessão com o banco caiu:"; cat "$TMP/saida"; exit 1; }
        i=$((i + 1)); [ "$i" -le 3000 ] || { echo "O banco não respondeu em 10 minutos."; exit 1; }
        sleep 0.2
      done
    }
    esperar_linha '-'
    INSTANTANEO=$(head -n 1 "$TMP/saida")
    case "$INSTANTANEO" in
      *ERROR*|*FATAL*|*erro*) echo "Não consegui abrir a transação de leitura: $INSTANTANEO"; exit 1 ;;
    esac
    {
      echo "\\o $SAIDA/$FOTO"
      echo "\\i $SCRIPTS/verificar-banco.sql"
      echo "\\i $SCRIPTS/assinaturas.sql"
      echo "\\o"
      echo "\\echo FOTO-PRONTA"
    } >&3
    esperar_linha 'FOTO-PRONTA'
    pg_dump "$PGURL" --snapshot="$INSTANTANEO" -Fc -f "$SAIDA/$DUMP"
    echo "COMMIT;" >&3
    exec 3>&-
    wait "$SESSAO"
    if grep -q -E 'ERROR|FATAL' "$TMP/saida"; then cat "$TMP/saida"; exit 1; fi
    rm -rf "$TMP"
    ;;

  esperar)
    # O entrypoint da imagem sobe um Postgres provisório para se configurar e
    # depois o substitui. Pronto é quando o processo 1 já é o postgres final.
    i=0
    until [ "$(cat /proc/1/comm)" = "postgres" ] && pg_isready -q -U postgres; do
      i=$((i + 1)); [ "$i" -le 120 ] || { echo "O Postgres isolado não subiu em 2 minutos."; exit 1; }
      sleep 1
    done
    ;;

  restaurar)
    if [ -n "${PGURL:-}" ]; then
      echo "Recusado: o restauro roda só no container isolado, sem endereço de banco externo."
      exit 1
    fi
    DUMP=${2:?informe o nome do dump}
    FOTO=${3:?informe o nome da foto}
    createdb -U postgres festae_restauro
    pg_restore -U postgres -d festae_restauro --no-owner --no-acl --exit-on-error "$SAIDA/$DUMP"
    psql -X -U postgres -d festae_restauro -v ON_ERROR_STOP=1 -qtA -F ' | ' \
      -c "SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY" \
      -f "$SCRIPTS/verificar-banco.sql" -f "$SCRIPTS/assinaturas.sql" > "$SAIDA/$FOTO"
    ;;

  *)
    echo "uso: no-container.sh versao | backup <dump> <foto> | esperar | restaurar <dump> <foto>"
    exit 2
    ;;
esac
