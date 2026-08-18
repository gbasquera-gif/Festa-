# Monorepo-aware build using `turbo prune` — run from the repository root:
#   docker build -f apps/admin/Dockerfile -t festae-admin .
#
# Painel é uma SPA estática (Vite) — o build final só precisa de um
# servidor de arquivos estáticos, não de Node em produção.
FROM node:22-alpine AS base
RUN corepack enable

FROM base AS pruner
WORKDIR /repo
COPY . .
RUN npx turbo prune @festae/admin --docker

FROM base AS installer
WORKDIR /repo
COPY --from=pruner /repo/out/json/ .
RUN pnpm install --frozen-lockfile

FROM installer AS builder
WORKDIR /repo
COPY --from=pruner /repo/out/full/ .
# URL pública do backend — precisa estar disponível em build-time porque o
# Vite embute VITE_* no bundle final (não é lido em runtime). Como ARG, o
# provedor de hospedagem consegue sobrescrever sem editar este arquivo.
ARG VITE_API_URL=https://festa-production.up.railway.app/api/v1
ENV VITE_API_URL=$VITE_API_URL
RUN npx turbo run build --filter=@festae/admin

FROM node:22-alpine AS runtime
RUN npm install -g serve
COPY --from=builder /repo/apps/admin/dist /site
# Forma shell de propósito: hospedagens como Railway e Render escolhem a
# porta em tempo de execução e a entregam em $PORT. Fixar 3000 deixaria o
# serviço no ar mas inalcançável pelo roteador da plataforma.
EXPOSE 3000
CMD serve -s /site -l ${PORT:-3000}
