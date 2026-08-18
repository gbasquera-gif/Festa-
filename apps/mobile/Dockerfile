# Versão web do aplicativo — build a partir da raiz do repositório:
#   docker build -f apps/mobile/Dockerfile -t festae-web .
#
# É o MESMO código do app das lojas, exportado por `expo export` para rodar
# no navegador. Serve para testar com pessoas reais e para o teste do Pix
# antes de existir conta na App Store ou no Google Play.
#
# Debian (slim) em vez de Alpine no build: o Metro e o toolchain do Expo
# puxam binários que assumem glibc, e depurar isso num container é caro. O
# runtime, que só entrega arquivo estático, continua no Alpine.
FROM node:22-slim AS base
RUN corepack enable

FROM base AS pruner
WORKDIR /repo
COPY . .
RUN npx turbo prune @festae/mobile --docker

FROM base AS installer
WORKDIR /repo
COPY --from=pruner /repo/out/json/ .
RUN pnpm install --frozen-lockfile

FROM installer AS builder
WORKDIR /repo
COPY --from=pruner /repo/out/full/ .

# Endereço da API. Precisa existir em tempo de build porque o Expo embute as
# variáveis EXPO_PUBLIC_* no pacote final — não são lidas em execução. Como
# ARG, a hospedagem sobrescreve sem editar este arquivo.
ARG EXPO_PUBLIC_API_URL=https://festa-production.up.railway.app/api/v1
ENV EXPO_PUBLIC_API_URL=$EXPO_PUBLIC_API_URL

# Sem telemetria: build de CI não deve gastar tempo nem rede com isso.
ENV EXPO_NO_TELEMETRY=1
ENV CI=1

RUN npx turbo run build:web --filter=@festae/mobile

FROM node:22-alpine AS runtime
RUN npm install -g serve
COPY --from=builder /repo/apps/mobile/dist /site
# Forma shell de propósito: o Railway escolhe a porta em execução e a
# entrega em $PORT. Fixar 3000 deixaria o serviço no ar e inalcançável.
EXPOSE 3000
CMD serve -s /site -l ${PORT:-3000}
