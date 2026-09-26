-- Catalogue de services. La colonne qualification_form_id est ajoutée
-- dans la migration forms (dépendance circulaire services <-> forms).

create table services (
  id uuid primary key default gen_random_uuid(),
  slug service_slug unique not null,
  name text not null,
  description text,
  status service_status not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_services_updated_at
  before update on services
  for each row execute function set_updated_at();
