-- Colonne vertébrale event-driven : events (append-only), workflows,
-- workflow_runs.

create table events (
  id uuid primary key default gen_random_uuid(),
  type event_type not null,
  entity_type text not null,
  entity_id uuid not null,
  payload jsonb not null default '{}'::jsonb,
  actor_type event_actor_type not null,
  actor_id uuid,
  created_at timestamptz not null default now()
);

create index idx_events_entity on events(entity_type, entity_id, created_at);
create index idx_events_type on events(type, created_at);

create table workflows (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  trigger_event event_type not null,
  conditions jsonb not null default '[]'::jsonb,
  actions jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_workflows_updated_at
  before update on workflows
  for each row execute function set_updated_at();

create table workflow_runs (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references workflows(id) on delete cascade,
  triggering_event_id uuid references events(id) on delete set null,
  status workflow_run_status not null default 'PENDING',
  result jsonb,
  error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_workflow_runs_workflow_id on workflow_runs(workflow_id);
