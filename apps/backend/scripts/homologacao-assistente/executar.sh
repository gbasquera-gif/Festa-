#!/bin/bash
# Homologação do Assistente IA com a OpenAI REAL, no banco LOCAL, sem publicar.
# Uso (na raiz do repositório, depois de `pnpm turbo run build`):
#   apps/backend/scripts/homologacao-assistente/executar.sh
# A chave vem de OPENAI_API_KEY no ambiente e nunca é impressa.
set -u
AQUI="$(cd "$(dirname "$0")" && pwd)"
BACKEND="$(cd "$AQUI/../.." && pwd)"
PORTA="${HOMOLOGACAO_PORTA:-3340}"

if [ -z "${OPENAI_API_KEY:-}" ]; then echo "PENDENTE: OPENAI_API_KEY não está no ambiente."; exit 2; fi
codigo=$(curl -s -m 20 -o /dev/null -w "%{http_code}" https://api.openai.com/v1/models -H "Authorization: Bearer $OPENAI_API_KEY")
case "$codigo" in
  200) echo "Conexão com api.openai.com: ok, chave aceita." ;;
  401) echo "PENDENTE: api.openai.com recusou a chave (401)."; exit 2 ;;
  000) echo "PENDENTE: sem conexão com api.openai.com (acesso de rede do ambiente)."; exit 2 ;;
  *) echo "PENDENTE: api.openai.com respondeu $codigo."; exit 2 ;;
esac

cd "$BACKEND"
CHAVE_DO_AMBIENTE="$OPENAI_API_KEY"
set -a; [ -f .env ] && . ./.env; set +a
# A chave do ambiente vale mais que qualquer linha do .env local.
export OPENAI_API_KEY="$CHAVE_DO_AMBIENTE"
unset CHAVE_DO_AMBIENTE
export ASSISTENTE_IA_PROVEDOR=openai ASSISTENTE_IA_SAIDA_DE_VOZ=openai HOMOLOGACAO_PORTA="$PORTA" \
  ASSISTENTE_IA_PERGUNTAS_POR_HORA=200 ASSISTENTE_IA_PERGUNTAS_POR_DIA=1000 ASSISTENTE_IA_PERGUNTAS_POR_DIA_TOTAL=5000 \
  ASSISTENTE_IA_GASTO_MAXIMO_DIA_USD=2
unset OPENAI_BASE_URL

node "$AQUI/servidor.cjs" > "${TMPDIR:-/tmp}/homologacao-assistente.log" 2>&1 &
SERVIDOR=$!
trap 'kill $SERVIDOR 2>/dev/null' EXIT
for _ in $(seq 1 60); do
  [ "$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$PORTA/api/v1/assistente/estado")" = 401 ] && break; sleep 0.5
done

entrar() {
  curl -s -X POST "http://localhost:$PORTA/api/v1/auth/login" -H 'content-type: application/json' \
    -d "$(node -e 'console.log(JSON.stringify({email: process.argv[1], password: process.argv[2]}))' "$1" "$2")" \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).accessToken||"")}catch{}})'
}
HOMOLOGACAO_TOKEN_ADMIN="$(entrar "${SEED_ADMIN_EMAIL:-}" "${SEED_ADMIN_PASSWORD:-}")"
[ -z "$HOMOLOGACAO_TOKEN_ADMIN" ] && { echo "Não consegui entrar como ADMIN local (SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD do .env)."; exit 1; }
HOMOLOGACAO_TOKEN_OPS=""
[ -n "${HOMOLOGACAO_OPS_EMAIL:-}" ] && HOMOLOGACAO_TOKEN_OPS="$(entrar "$HOMOLOGACAO_OPS_EMAIL" "${HOMOLOGACAO_OPS_SENHA:-}")"
export HOMOLOGACAO_TOKEN_ADMIN HOMOLOGACAO_TOKEN_OPS BASE="http://localhost:$PORTA"

node "$AQUI/dados-ficticios.mjs" || exit 1
node "$AQUI/perguntas.mjs"; r1=$?
node "$AQUI/voz.mjs"; r2=$?
curl -s "http://localhost:$PORTA/api/v1/assistente/metricas" -H "Authorization: Bearer $HOMOLOGACAO_TOKEN_ADMIN" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const m=JSON.parse(s);console.log(`\nMétricas: ${m.eventos.PERGUNTA} perguntas, ${m.eventos.TRANSCRICAO} transcrições, ${m.eventos.FALA} falas · tokens ${m.tokensDeEntrada} entrada / ${m.tokensDeSaida} saída · custo estimado US$ ${m.custoEstimadoUsd} · latência média ${m.latenciaMediaMs} ms`)})'
exit $(( r1 || r2 ))
