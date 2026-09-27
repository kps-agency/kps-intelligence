-- Phase 8 (Claude AI) : trace de chaque analyse IA (section 6 du prompt —
-- "Toutes les actions IA doivent être traçables"). Une ligne par appel
-- réel à Claude, jamais écrasée : une ré-analyse en ajoute une nouvelle,
-- l'historique complet reste consultable.

-- Un seul type d'analyse pour l'instant (analyse de la demande entrante,
-- section 19). L'analyse des réponses de qualification (section 40,
-- Phase 9+) et l'extraction de documents (section 55) ajouteront leurs
-- propres valeurs plus tard — jamais un texte libre non contrôlé.
create type ai_analysis_kind as enum ('REQUEST_ANALYSIS');

create type ai_analysis_status as enum ('COMPLETED', 'FAILED');

create table ai_analyses (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references requests(id) on delete cascade,
  kind ai_analysis_kind not null,
  status ai_analysis_status not null,
  prompt_version text not null,
  model text not null,
  -- Renseigné uniquement si status = COMPLETED.
  confidence numeric(4, 3),
  result jsonb,
  -- Renseigné uniquement si status = FAILED. Jamais le détail brut d'une
  -- erreur Anthropic (clé API, etc.) — un message généraliste seulement.
  error text,
  created_at timestamptz not null default now()
);

create index idx_ai_analyses_request_id on ai_analyses(request_id, created_at desc);

alter table ai_analyses enable row level security;
