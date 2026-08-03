# Festaê! — Plataforma

Monorepo da Festaê: locação de artigos para festas infantis, chá de bebê e chá de revelação em Chapecó-SC, evoluindo para o maior ecossistema digital de celebrações.

## Estrutura

```
apps/
  site/      Site institucional (React + Vite) + wrapper Capacitor p/ Android/iOS
  backend/   API REST (NestJS)
  admin/     Painel administrativo (React + Vite) — catálogo, kits e reservas
  mobile/    App do cliente (Expo / React Native) — fluxo "criar minha festa"
packages/
  database/  Schema Prisma, migrations e seed
  shared/    Enums e schemas Zod compartilhados entre backend, admin e mobile
```

Gerenciado com **pnpm workspaces** + **Turborepo**.

## Pré-requisitos

- Node.js 22+
- pnpm 10+ (`corepack enable`)
- PostgreSQL 16 rodando localmente (ou via `docker compose up postgres`)

## Setup inicial

```bash
pnpm install

# banco de dados
cp packages/database/.env.example packages/database/.env
cp apps/backend/.env.example apps/backend/.env
# edite os .env se suas credenciais de Postgres forem diferentes

pnpm --filter @festae/database run migrate   # aplica as migrations
pnpm --filter @festae/database run seed      # popular temas/kits/produtos/admins de exemplo
```

Usuários criados pelo seed (senha entre parênteses):
- `guilherme@festae.com.br` — ADMIN (`festae-admin-123`)
- `mariluiza@festae.com.br` — OPS (`festae-admin-123`)
- `cliente@exemplo.com` — CLIENT (`festae-demo-123`)

## Rodando cada app

```bash
pnpm dev:backend   # API em http://localhost:3333/api/v1 (Swagger em /api/docs)
pnpm dev:admin     # painel em http://localhost:5174
pnpm dev:mobile    # Expo — abre o menu do Metro (pressione w para web, ou escaneie o QR no Expo Go)
pnpm dev:site      # site institucional em http://localhost:3000
```

Cada app tem um `.env.example` — copie para `.env` e ajuste conforme necessário (a URL da API do admin/mobile aponta para `http://localhost:3333/api/v1` por padrão).

## Build & typecheck do monorepo inteiro

```bash
pnpm build   # turbo run build (respeita a ordem de dependências entre packages)
pnpm check   # turbo run check (tsc --noEmit em todos os packages)
```

## Deploy

- **Backend**: `apps/backend/Dockerfile` (multi-stage, usa `turbo prune`) + `docker-compose.yml` (Postgres + backend). Rode as migrations em produção com `pnpm --filter @festae/database run migrate:deploy` antes de subir uma nova versão — o container não roda migrations automaticamente no start.
  > O Dockerfile foi escrito sem um daemon Docker disponível neste ambiente de desenvolvimento (sandbox) — valide o build completo antes de usar em produção.
  > **Imagens do catálogo**: configure o bucket (`S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_URL` e, fora da AWS, `S3_ENDPOINT`). Sem essas variáveis o backend cai no disco local do container, que é apagado a cada deploy — as fotos de kits e produtos somem no restart seguinte. O boot avisa em log qual dos dois está ativo.
- **Admin**: `pnpm --filter @festae/admin run build` gera estático em `apps/admin/dist` — publique em qualquer host de site estático (Netlify, Vercel, S3+CloudFront etc), configurando `VITE_API_URL` para a URL pública do backend. Há também `apps/admin/Dockerfile` para publicar como serviço (Railway etc).
- **Mobile**: builds nativos via [EAS Build](https://docs.expo.dev/build/introduction/) (`apps/mobile/eas.json`). Requer `eas login` + `eas init` (gera `extra.eas.projectId` em `app.json`) antes do primeiro build — isso precisa ser feito uma vez por uma pessoa com conta Expo, não dá para automatizar sem credenciais. Depois disso, `pnpm build:android:preview` (dentro de `apps/mobile`) gera um APK instalável sem precisar de Android Studio/Xcode local. Há também um workflow manual (`.github/workflows/eas-build.yml`) que dispara isso pelo GitHub Actions, dado um secret `EXPO_TOKEN`.
- **Site**: já publicado como estava antes (Vite build + Capacitor para Android/iOS — ver `.github/workflows/android-build.yml`).

## CI

`.github/workflows/ci.yml` roda em todo push: instala o workspace inteiro, builda e typecheca todos os packages, aplica as migrations do Prisma contra um Postgres efêmero (pega migration quebrada/dessincronizada) e valida que o bundle web do app mobile exporta sem erros (`expo export --platform web` — pega bugs de runtime que o typecheck sozinho não pega, como já aconteceu com um conflito de classes Tailwind).

## Arquitetura e roadmap

Ver histórico de commits para o racional das decisões de arquitetura (monorepo, stack por app, modelagem do banco). Em resumo, o MVP cobre: cadastro/login, criação de evento, recomendação de kit por convidados/tema, carrinho com orçamento automático, solicitação e confirmação de reserva — tanto pelo app mobile quanto gerenciável pelo painel admin.

Ganchos já modelados no banco para a evolução futura (ainda sem lógica real): `Partner` (marketplace de decoradores/docerias/fotógrafos/etc, com `Product.partnerId` opcional) e o módulo `ai-magic` no backend (visualização de festa por IA a partir de foto do ambiente).
