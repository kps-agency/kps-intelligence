-- Formulaires dynamiques, étapes, champs, sessions de qualification et
-- réponses progressives (autosave).

create table forms (
  id uuid primary key default gen_random_uuid(),
  service_id uuid references services(id) on delete set null,
  name text not null,
  slug text unique not null,
  description text,
  status form_status not null default 'DRAFT',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_forms_updated_at
  before update on forms
  for each row execute function set_updated_at();

-- Dépendance circulaire services <-> forms : la colonne est ajoutée ici,
-- une fois forms créée.
alter table services
  add column qualification_form_id uuid references forms(id) on delete set null;

create table form_steps (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references forms(id) on delete cascade,
  title text not null,
  order_index integer not null,
  created_at timestamptz not null default now(),
  unique (form_id, order_index)
);

create table form_fields (
  id uuid primary key default gen_random_uuid(),
  form_step_id uuid not null references form_steps(id) on delete cascade,
  key text not null,
  label text not null,
  type form_field_type not null,
  required boolean not null default false,
  options jsonb,
  validation jsonb,
  conditional_logic jsonb,
  order_index integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (form_step_id, key)
);

create trigger trg_form_fields_updated_at
  before update on form_fields
  for each row execute function set_updated_at();

create table qualification_sessions (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references requests(id) on delete cascade,
  form_id uuid not null references forms(id) on delete restrict,
  token_hash text unique not null,
  status qualification_session_status not null default 'CREATED',
  expires_at timestamptz not null,
  started_at timestamptz,
  completed_at timestamptz,
  last_activity_at timestamptz,
  language text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_qualification_sessions_updated_at
  before update on qualification_sessions
  for each row execute function set_updated_at();

create index idx_qualification_sessions_token_hash on qualification_sessions(token_hash);
create index idx_qualification_sessions_request_id on qualification_sessions(request_id);

create table form_responses (
  id uuid primary key default gen_random_uuid(),
  qualification_session_id uuid not null references qualification_sessions(id) on delete cascade,
  form_field_id uuid not null references form_fields(id) on delete cascade,
  value jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (qualification_session_id, form_field_id)
);

create trigger trg_form_responses_updated_at
  before update on form_responses
  for each row execute function set_updated_at();
