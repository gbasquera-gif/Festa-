# Monorepo-aware build using `turbo prune` — run from the repository root:
#   docker build -f apps/backend/Dockerfile -t festae-backend .
#
# NOTE: this Dockerfile was authored without a working Docker daemon
# available (sandboxed dev environment) — verify the full build in a real
# environment before relying on it for production.
FROM node:22-alpine AS base
RUN corepack enable

FROM base AS pruner
WORKDIR /repo
COPY . .
RUN npx turbo prune @festae/backend --docker

FROM base AS installer
WORKDIR /repo
COPY --from=pruner /repo/out/json/ .
RUN pnpm install --frozen-lockfile

FROM installer AS builder
WORKDIR /repo
COPY --from=pruner /repo/out/full/ .
RUN npx turbo run build --filter=@festae/backend

FROM base AS runtime
WORKDIR /repo
ENV NODE_ENV=production
COPY --from=builder /repo ./
EXPOSE 3333
CMD ["node", "apps/backend/dist/main.js"]
