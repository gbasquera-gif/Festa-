#!/bin/sh
# Roda DENTRO de um container da imagem oficial do Postgres, chamado por
# backup-windows.ps1.
#
# O endereço da produção chega pela ENTRADA PADRÃO (nunca por argumento nem
# por variável do container, que `docker inspect` mostraria). A senha sai do
# endereço e vai para PGPASSWORD, só dentro deste processo: os comandos
# recebem o endereço sem senha. O restauro usa só o socket local do container
# isolado, que não tem rede.
#
#   versao                     versão do servidor de produção (só leitura)
#   backup <dump> <foto>       foto + pg_dump da produção no MESMO instantâneo
#   esperar                    espera o Postgres do container isolado ficar pronto
#   restaurar <dump> <foto>    restaura no container isolado e tira a mesma foto
set -eu
SCRIPTS=${SCRIPTS:-/scripts}
SAIDA=${SAIDA:-/saida}

# Decodifica %XX do endereço (senhas com caractere especial vêm assim).
decodificar() {
  resto=$1
  saida=""
  while [ -n "$resto" ]; do
    case "$resto" in
      %[0-9A-Fa-f][0-9A-Fa-f]*)
        hexa=${resto#%}
        hexa=${hexa%"${hexa#??}"}
        saida="$saida$(printf "\\$(printf '%03o' "0x$hexa")")"
        resto=${resto#%??}
        ;;
      *)
        saida="$saida${resto%"${resto#?}"}"
        resto=${resto#?}
        ;;
    esac
  done
  printf '%s' "$saida"
}

ler_conexao() {
  URL=""
  IFS= read -r URL || true
  URL=$(printf '%s' "$URL" | tr -d '\r')
  case "$URL" in
    postgres://*|postgresql://*) ;;
    *) echo "Endereço do banco não recebido ou inválido."; exit 1 ;;
  esac
  SENHA=$(printf '%s' "$URL" | sed -n 's#^[a-z]*://[^:@/]*:\([^@]*\)@.*#\1#p')
  if [ -n "$SENHA" ]; then
    PGPASSWORD=$(decodificar "$SENHA")
    export PGPASSWORD
    CONEXAO=$(printf '%s' "$URL" | sed 's#^\([a-z]*://[^:@/]*\):[^@]*@#\1@#')
  else
    CONEXAO=$URL
  fi
  unset URL SENHA
}

case "${1:-}" in
  versao)
    ler_conexao
    psql "$CONEXAO" -X -v ON_ERROR_STOP=1 -qtA \
      -c "SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY" \
      -c "SHOW server_version_num"
    ;;

  backup)
    DUMP=${2:?informe o nome do dump}
    FOTO=${3:?informe o nome da foto}
    ler_conexao
    # Uma transação SÓ DE LEITURA (REPEATABLE READ) segura um instantâneo do
    # banco e o exporta (pg_export_snapshot). A foto é tirada dentro dela, e o
    # pg_dump entra no MESMO instantâneo (--snapshot) enquanto ela continua
    # aberta: o que a foto descreve é exatamente o que o dump contém, mesmo
    # com o sistema em uso durante o backup.
    TMP=$(mktemp -d)
    mkfifo "$TMP/entrada"
    psql "$CONEXAO" -X -v ON_ERROR_STOP=1 -qtA -F ' | ' < "$TMP/entrada" > "$TMP/saida" 2>&1 &
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
    pg_dump "$CONEXAO" --snapshot="$INSTANTANEO" -Fc -f "$SAIDA/$DUMP"
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
    if [ -n "${PGURL:-}${PGHOST:-}${PGPASSWORD:-}" ]; then
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
