# API NestJS (processus permanent : polling IMAP, workers BullMQ, relances
# différées, traitements de l'Event Bus). Construite depuis la racine du
# monorepo : docker build -f infrastructure/docker/api.Dockerfile .

FROM node:22-bookworm-slim AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /repo

# ---- Build : paquets partagés puis API.
FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY packages ./packages
COPY apps/api ./apps/api
RUN pnpm install --frozen-lockfile --filter "@kps/api..."
RUN pnpm --filter @kps/types build \
 && pnpm --filter @kps/shared build \
 && pnpm --filter @kps/api build

# ---- Image finale : dépendances de production seulement + code compilé.
FROM base AS runtime
ENV NODE_ENV=production
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/types/package.json packages/types/
COPY packages/shared/package.json packages/shared/
COPY packages/config/package.json packages/config/
COPY apps/api/package.json apps/api/
RUN pnpm install --prod --frozen-lockfile --filter "@kps/api..." \
 && pnpm store prune
COPY --from=build /repo/packages/types/dist packages/types/dist
COPY --from=build /repo/packages/shared/dist packages/shared/dist
COPY --from=build /repo/apps/api/dist apps/api/dist

WORKDIR /repo/apps/api
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://localhost:4000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
