# DEPLOYMENT.md — Mise en production

Architecture retenue (29/09/2026) :

```text
Navigateur ──► Vercel : web Next.js (vercel.json)
          └──► VPS    : Caddy (HTTPS) ──► API NestJS ──► Redis
                                     └──► Supabase (base, auth), Claude, SMTP/IMAP
```

- **Web sur Vercel** : rien d'autre à héberger, voir « Vercel » plus bas.
- **API sur un VPS avec Docker Compose** : elle a besoin d'un processus
  permanent (polling IMAP, workers BullMQ, relances différées, réactions
  de l'Event Bus après la réponse HTTP, analyse Claude synchrone longue) —
  incompatible avec le serverless.
- **Supabase reste distant** (section 74).

Fichiers : `infrastructure/docker/api.Dockerfile`,
`docker-compose.prod.yml`, `infrastructure/deployment/Caddyfile`.
Vérifié en local : image construite, pile complète démarrée, HTTPS via
Caddy, redirection HTTP → HTTPS, 401 sans jeton, appel authentifié réel,
Swagger désactivé en production, CORS limité à `APP_URL`, files BullMQ
enregistrées dans Redis.

## 1. Prérequis

- Un VPS Linux (2 vCPU / 2-4 Go de RAM suffisent au départ), Debian ou
  Ubuntu récent, ports **80** et **443** ouverts.
- Un nom de domaine pour l'API, par ex. `api.kps.agency`, avec un
  enregistrement DNS **A** (et AAAA si IPv6) vers l'IP du VPS. Caddy
  obtient le certificat Let's Encrypt tout seul au premier démarrage.
- L'URL finale du web sur Vercel (ex. `https://app.kps.agency` ou
  `https://<projet>.vercel.app`).

## 2. Installer Docker sur le VPS

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # puis se reconnecter
```

## 3. Récupérer le code

```bash
git clone https://github.com/kps-agency/kps-intelligence.git
cd kps-intelligence
```

(Dépôt privé : clé SSH de déploiement en lecture seule, ou jeton GitHub.)

## 4. Créer `.env.production` (jamais commité)

Partir de `.env.example` et renseigner les vraies valeurs. Spécifique à
la production :

| Variable | Valeur |
|---|---|
| `API_DOMAIN` | domaine de l'API, ex. `api.kps.agency` (lu par Caddy) |
| `APP_URL` | URL du web Vercel — seule origine autorisée par CORS |
| `PUBLIC_QUALIFICATION_URL` | `https://<domaine web>/qualification` (liens envoyés aux prospects) |
| `DATABASE_URL`, `SUPABASE_*` | projet Supabase de production |
| `ANTHROPIC_API_KEY`, `SMTP_*`, `IMAP_*`, `WHATSAPP_*`, `WEBSITE_WEBHOOK_SECRETS` | comme en dev, valeurs de production |
| `LOG_LEVEL` | `info` |

`APP_ENV`, `API_PORT` et `REDIS_URL` sont imposés par
`docker-compose.prod.yml` (inutile de les mettre).

```bash
chmod 600 .env.production
```

## 5. Appliquer les migrations

Depuis un poste qui a le dépôt et Node (`DATABASE_URL` pointant sur la
base de production) :

```bash
pnpm install && pnpm db:migrate
```

À refaire avant chaque déploiement qui ajoute une migration.

## 6. Démarrer

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
docker compose -f docker-compose.prod.yml ps          # api (healthy), redis (healthy), caddy
curl https://api.kps.agency/health                    # 200
```

## 7. Vercel (web)

Projet Vercel relié au dépôt GitHub ; `vercel.json` (racine) déclare le
service `web`. Variables d'environnement du projet :

| Variable | Valeur |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://api.kps.agency` (sans `/api/v1`) |
| `NEXT_PUBLIC_SUPABASE_URL` | URL Supabase de production |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | clé publishable Supabase |

Dans Supabase (Authentication → URL Configuration) : ajouter le domaine
Vercel aux URL de redirection (réinitialisation de mot de passe).

## 8. Mettre à jour

```bash
git pull
pnpm db:migrate        # si nouvelles migrations (depuis un poste avec Node)
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

Les jobs en attente (emails de notification, relances programmées)
survivent au redémarrage : Redis persiste sur disque (AOF, volume
`redis-data`) et l'API réarme ses étapes en attente au démarrage.

## 9. Exploitation

```bash
docker compose -f docker-compose.prod.yml logs -f api      # logs JSON (requestId)
docker compose -f docker-compose.prod.yml restart api
```

## 10. Webhooks à déclarer

- **WhatsApp (Meta)** : `https://<API_DOMAIN>/api/v1/webhooks/whatsapp`
  (champ « messages »), avec `WHATSAPP_VERIFY_TOKEN` / `WHATSAPP_APP_SECRET`.
- **Sites web** : `https://<API_DOMAIN>/api/v1/webhooks/website/<site>`
  (voir `API.md` et `SECURITY.md`).

## Reste à faire (Phase 25)

Pipeline CI/CD (build de l'image, tests, déploiement automatique),
sauvegardes, supervision/alertes, durcissement du VPS (pare-feu, SSH par
clé, mises à jour automatiques).
