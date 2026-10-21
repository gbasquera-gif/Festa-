#!/usr/bin/env bash
# Backup manual Festae: leitura da origem, restauro descartavel, AES-256.
set -Eeuo pipefail
umask 077
: "\${FESTAE_DATABASE_PUBLIC_URL:?Configure o segredo FESTAE_DATABASE_PUBLIC_URL}"
: "\${FESTAE_BACKUP_PASSPHRASE:?Configure o segredo FESTAE_BACKUP_PASSPHRASE}"
: "\${SOURCE_DIR:?SOURCE_DIR nao informado}"
if (($(printf '%s' "$FESTAE_BACKUP_PASSPHRASE" | wc -c) < 32)); then
  echo 'ERRO: senha do backup requer 32+ caracteres aleatorios.' >&2; exit 1
fi
if [[ "$FESTAE_DATABASE_PUBLIC_URL" != postgres://* && "$FESTAE_DATABASE_PUBLIC_URL" != postgresql://* ]]; then
  echo 'ERRO: endereco PostgreSQL invalido.' >&2; exit 1
fi
if [[ "$FESTAE_DATABASE_PUBLIC_URL" == *'sslmode=disable'* ]]; then
  echo 'ERRO: URL sem SSL.' >&2; exit 1
fi
if [[ "$FESTAE_DATABASE_PUBLIC_URL" != *'sslmode='* ]]; then
  if [[ "$FESTAE_DATABASE_PUBLIC_URL" == *'?'* ]]; then
    FESTAE_DATABASE_PUBLIC_URL+='&sslmode=require'
  else
    FESTAE_DATABASE_PUBLIC_URL+='?sslmode=require'
  fi
fi
SOURCE_DIR=$(realpath "$SOURCE_DIR")
for f in no-container.sh verificar-banco.sql assinaturas.sql; do
  test -s "$SOURCE_DIR/$f" || { echo "Script ausente: $f" >&2; exit 1; }
done
WORK_DIR=$(mktemp -d)
OUT_DIR="$GITHUB_WORKSPACE/backup-cifrado"
mkdir -p "$OUT_DIR"
RESTORE_CONTAINER="festae-restore-\${GITHUB_RUN_ID:-manual}-\${GITHUB_RUN_ATTEMPT:-1}"
PG_IMAGE='postgres:18-alpine'
cleanup() {
  docker rm -f -v "$RESTORE_CONTAINER" >/dev/null 2>&1 || true
  rm -rf "$WORK_DIR"
  unset FESTAE_DATABASE_PUBLIC_URL FESTAE_BACKUP_PASSPHRASE
}
trap cleanup EXIT
trap 'echo "Backup interrompido; nenhum dado em claro sera publicado." >&2' ERR

echo '1/5 Verificando servidor (somente leitura)...'
SERVER_VER=$(printf '%s\n' "$FESTAE_DATABASE_PUBLIC_URL" | docker run --rm -i \
  -v "$SOURCE_DIR:/scripts:ro" "$PG_IMAGE" sh /scripts/no-container.sh versao | tail -n 1 | tr -d '\r[:space:]')
[[ "$SERVER_VER" =~ ^[0-9]+$ ]] || { echo 'Versao nao identificada.' >&2; exit 1; }
if ((SERVER_VER / 10000 != 18)); then
  echo 'Versao PostgreSQL inesperada. Backup interrompido.' >&2; exit 1
fi

echo '2/5 Fazendo dump com assinaturas do mesmo snapshot...'
printf '%s\n' "$FESTAE_DATABASE_PUBLIC_URL" | docker run --rm -i \
  -v "$SOURCE_DIR:/scripts:ro" -v "$WORK_DIR:/saida" \
  "$PG_IMAGE" sh /scripts/no-container.sh backup festae.dump foto-producao.txt
test -s "$WORK_DIR/festae.dump" && test -s "$WORK_DIR/foto-producao.txt"

echo '3/5 Restaurando em PostgreSQL isolado, sem rede...'
docker run -d --name "$RESTORE_CONTAINER" --network none \
  --tmpfs /var/lib/postgresql/data:rw,size=1g \
  -e PGDATA=/var/lib/postgresql/data/pgdata -e POSTGRES_HOST_AUTH_METHOD=trust \
  -v "$SOURCE_DIR:/scripts:ro" -v "$WORK_DIR:/saida" \
  "$PG_IMAGE" >/dev/null
docker exec "$RESTORE_CONTAINER" sh /scripts/no-container.sh esperar
docker exec "$RESTORE_CONTAINER" sh /scripts/no-container.sh restaurar festae.dump foto-restauro.txt

echo '4/5 Comparando as assinaturas...'
if ! cmp -s "$WORK_DIR/foto-producao.txt" "$WORK_DIR/foto-restauro.txt"; then
  echo 'DIFERENTES: backup NAO aprovado.' >&2; exit 1
fi
MIGRATION=$(sed -n 's/^ultima_migration | //p' "$WORK_DIR/foto-producao.txt" | head -n 1)
[[ -n "$MIGRATION" ]] || { echo 'Migration nao identificada.' >&2; exit 1; }
FAILED_MIGRATIONS=$(sed -n 's/^migrations_com_falha | //p' "$WORK_DIR/foto-producao.txt" | head -n 1)
[[ "$FAILED_MIGRATIONS" == 0 ]] || { echo 'Migrations com falha.' >&2; exit 1; }

echo '5/5 Criptografando AES-256 e verificando o arquivo...'
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
ARCHIVE="$WORK_DIR/festae.tar.gz"
ENCRYPTED="$OUT_DIR/festae-$STAMP.tar.gz.gpg"
tar -C "$WORK_DIR" -czf "$ARCHIVE" festae.dump foto-producao.txt foto-restauro.txt
printf '%s' "$FESTAE_BACKUP_PASSPHRASE" | gpg --quiet --batch --yes \
  --pinentry-mode loopback --cipher-algo AES256 --s2k-digest-algo SHA256 \
  --s2k-count 65011712 --passphrase-fd 0 --symmetric --output "$ENCRYPTED" "$ARCHIVE"
printf '%s' "$FESTAE_BACKUP_PASSPHRASE" | gpg --quiet --batch --yes \
  --pinentry-mode loopback --passphrase-fd 0 --decrypt --output /dev/null "$ENCRYPTED"
(cd "$OUT_DIR" && sha256sum "$(basename "$ENCRYPTED")" > "$(basename "$ENCRYPTED").sha256")
chmod 600 "$OUT_DIR"/*
{
  echo '### Backup Festae — validado'
  echo '- Banco de origem: somente leitura.'
  echo '- Restauracao isolada: **IGUAIS**.'
  echo "- Ultima migration: \`$MIGRATION\`."
  echo '- Migrations com falha: **0**.'
  echo '- Arquivo cifrado AES-256 e hash SHA-256 gerados.'
  echo '- Salve o arquivo fora do GitHub em armazenamento pessoal privado.'
} >> "$GITHUB_STEP_SUMMARY"
echo "VALIDADO: IGUAIS; migration $MIGRATION; backup criptografado pronto."