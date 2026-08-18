#!/bin/sh
set -e

# Aplica migrations pendentes e garante que o catálogo/usuários demo
# existam (o seed usa upsert, então rodar em todo boot é seguro e não
# duplica dados — só é útil de verdade na primeira vez que o container sobe).
pnpm --filter @festae/database run migrate:deploy
pnpm --filter @festae/database run seed

exec node apps/backend/dist/main.js
