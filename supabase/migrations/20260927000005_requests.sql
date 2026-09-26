-- Objet central : requests, avec génération atomique de référence
-- (KPS-{AAAA}-{NNNNN}, remise à zéro chaque année) — voir DATABASE.md §17.

create table request_reference_counters (
  year integer primary key,
  last_value integer not null default 0
);

create or replace function generate_request_reference()
returns text as $$
declare
  current_year integer := extract(year from now())::integer;
  next_value integer;
begin
  insert into request_reference_counters(year, last_value)
  values (current_year, 0)
  on conflict (year) do nothing;

  update request_reference_counters
  set last_value = last_value + 1
  where year = current_year
  returning last_value into next_value;

  return 'KPS-' || current_year::text || '-' || lpad(next_value::text, 5, '0');
end;
$$ language plpgsql;

create table requests (
  id uuid primary key default gen_random_uuid(),
  reference text unique not null default generate_request_reference(),
  client_id uuid references clients(id) on delete set null,
  contact_id uuid references contacts(id) on delete set null,
  source request_source not null,
  channel text,
  subject text,
  original_message text,
  language text,
  country text,
  detected_service_id uuid references services(id) on delete set null,
  detected_subservice text,
  status request_status not null default 'NEW',
  priority priority_level default 'MEDIUM',
  urgency priority_level,
  qualification_status text,
  ai_confidence numeric(4, 3),
  assigned_user_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_requests_updated_at
  before update on requests
  for each row execute function set_updated_at();

create index idx_requests_status on requests(status);
create index idx_requests_client_id on requests(client_id);
create index idx_requests_source on requests(source);
