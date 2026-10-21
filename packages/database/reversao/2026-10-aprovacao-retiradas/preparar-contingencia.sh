#!/bin/bash
# Monta a versão de contingência, sem tocar em nenhum dado.
#
# Contingência = o código que estava em produção antes (4c30da8) + o schema e
# as migrations do commit publicado. O código antigo passa a conhecer os
# valores novos (pagamento ANULADO, despesa PRO_LABORE) e lê tudo como está:
# nenhum registro é convertido, nenhuma classificação muda, nenhuma migration
# é desfeita. As funcionalidades novas ficam fora do ar enquanto durar.
#
# Única mudança no código antigo: `contingencia-permissoes.patch`, as mesmas
# restrições da versão publicada (registrar recebimento, confirmar sinal e
# registrar devolução feita são só do ADMIN). Sem ele, o OPS voltaria a
# registrar pagamento durante a contingência.
#
# O commit criado tem o publicado como pai, então sobe por avanço normal do
# branch de produção (sem forçar). Para voltar: `git revert <commit>`.
#
# Uso: preparar-contingencia.sh <commit-publicado> [nome-do-branch-local]
set -euo pipefail
ESTAVEL=4c30da8
PUBLICADO=$(git rev-parse --verify "${1:?informe o commit publicado}^{commit}")
RAMO=${2:-contingencia/$(git rev-parse --short "$ESTAVEL")-com-schema-$(git rev-parse --short "$PUBLICADO")}

INDICE=$(mktemp -u)
export GIT_INDEX_FILE="$INDICE"
git read-tree "$ESTAVEL"
git rm -r -q -f --cached packages/database/prisma
git read-tree --prefix=packages/database/prisma/ "$PUBLICADO:packages/database/prisma"
git rm -r -q -f --cached --ignore-unmatch packages/database/reversao
git read-tree --prefix=packages/database/reversao/ "$PUBLICADO:packages/database/reversao"
git show "$PUBLICADO:packages/database/reversao/2026-10-aprovacao-retiradas/contingencia-permissoes.patch" | git apply --cached
ARVORE=$(git write-tree)
unset GIT_INDEX_FILE
rm -f "$INDICE"

COMMIT=$(git commit-tree "$ARVORE" -p "$PUBLICADO" -m "Contingência: código de $ESTAVEL com o schema de $(git rev-parse --short "$PUBLICADO")

Nenhum dado é alterado: o código anterior passa a ler o schema atual
(inclusive pagamentos ANULADO e despesas PRO_LABORE) sem conversões.
As permissões financeiras da versão publicada continuam valendo:
registrar recebimento, confirmar sinal e registrar devolução feita
são só do ADMIN.
Para voltar à versão publicada: git revert deste commit.")
git branch -f "$RAMO" "$COMMIT"
echo "$RAMO $COMMIT"
