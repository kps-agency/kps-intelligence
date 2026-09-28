-- Phase 11 (Email) : idempotence stricte sur l'ingestion (section 17 —
-- "un même email reçu deux fois ne doit jamais créer deux demandes") et
-- curseur de polling IMAP (pas de webhook Gmail simple pour un compte
-- personnel — voir docs/AI_CONTEXT.md pour le choix d'architecture).

alter table requests
  add column email_message_id text,
  add column email_thread_id text;

-- Unique seulement quand renseigné (une demande MANUAL/WHATSAPP n'a pas
-- de message_id) : un index unique partiel plutôt qu'une contrainte
-- unique classique, qui traiterait tous les NULL comme égaux entre eux
-- selon le moteur — en Postgres ce n'est pas le cas (NULL <> NULL), mais
-- le rendre explicite documente l'intention.
create unique index idx_requests_email_message_id
  on requests(email_message_id)
  where email_message_id is not null;

-- Une seule ligne : le curseur global du polling IMAP (dernier UID
-- traité). Recommencer à zéro à chaque redémarrage de l'API relirait
-- (et re-filtrerait via idx_requests_email_message_id, donc sans
-- doublon, mais inutilement) toute la boîte à chaque restart.
create table email_ingestion_state (
  id boolean primary key default true,
  last_uid bigint not null default 0,
  last_polled_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now(),
  constraint email_ingestion_state_singleton check (id)
);

create trigger trg_email_ingestion_state_updated_at
  before update on email_ingestion_state
  for each row execute function set_updated_at();

alter table email_ingestion_state enable row level security;
