# KPS Intelligence

Plateforme interne de KPS Agency : système event-driven qui reçoit les
demandes entrantes (email, WhatsApp, site web), les fait analyser par
Claude, qualifie les prospects via des formulaires envoyés par lien
sécurisé, matche l'équipe adaptée, puis transforme la demande en
opportunité, devis et mission.

Le cahier des charges complet est dans [`prompt.md`](./prompt.md). Le plan
d'implémentation détaillé (phases, checkpoints, definition of done) est
documenté dans [`docs/AI_CONTEXT.md`](./docs/AI_CONTEXT.md) et sera
complété au fil des phases par `ARCHITECTURE.md`, `DATABASE.md`, `API.md`,
`AI.md`, `WORKFLOWS.md`, `NOTIFICATIONS.md`, `SECURITY.md`,
`DEPLOYMENT.md`, `TESTING.md`.

## Stack

- **Frontend** : Next.js (App Router), TypeScript, Tailwind CSS,
  shadcn/ui, TanStack Query, React Hook Form, Zod, Recharts.
- **Backend** : NestJS, TypeScript, REST + Swagger, class-validator,
  Supabase Auth (JWT), RBAC, BullMQ, Redis.
- **Database** : Supabase (PostgreSQL, Auth, Storage, RLS).
- **IA** : Claude API (Anthropic), via une abstraction `AIService`.
- **Messaging** : provider email (SMTP), WhatsApp Business Cloud API.

## Structure du monorepo

```text
apps/
  web/       Next.js
  api/       NestJS
packages/
  ui/        Composants partagés (shadcn/ui)
  types/     Types/enums partagés frontend ↔ backend
  shared/    Constantes et helpers partagés
  config/    tsconfig / eslint / tailwind partagés
supabase/
  migrations/  seed/  functions/
infrastructure/
  docker/  deployment/
docs/        Documentation projet
tests/       Tests transverses (e2e, integration)
```

## Prérequis

- Node.js ≥ 20
- pnpm ≥ 9
- Docker (pour Redis en local ; Supabase peut être distant)

## Démarrage

```bash
pnpm install
cp .env.example .env   # puis renseigner les vraies valeurs
pnpm dev
```

## Scripts racine

| Commande | Effet |
|---|---|
| `pnpm dev` | Lance `web` et `api` en mode développement |
| `pnpm build` | Build tous les packages/apps (via Turborepo) |
| `pnpm lint` | Lint sur tout le monorepo |
| `pnpm typecheck` | Vérification TypeScript stricte sur tout le monorepo |
| `pnpm test` | Tests unitaires/intégration |
| `pnpm test:e2e` | Tests end-to-end |

## État du projet

En cours de construction, phase par phase (voir `docs/AI_CONTEXT.md`).
Aucune fonctionnalité de ce dépôt n'est mockée : chaque module listé comme
"livré" dans `AI_CONTEXT.md` est branché à une vraie base de données, une
vraie API, et, le cas échéant, un vrai fournisseur externe (Claude,
email, WhatsApp).
