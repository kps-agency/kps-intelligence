-- Matching équipe : skills, user_skills, availability, matching_results.

create table skills (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  category text,
  created_at timestamptz not null default now()
);

create table user_skills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  skill_id uuid not null references skills(id) on delete cascade,
  proficiency_level smallint not null check (proficiency_level between 1 and 5),
  years_experience numeric(4, 1),
  created_at timestamptz not null default now(),
  unique (user_id, skill_id)
);

create table availability (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  status availability_status not null default 'AVAILABLE',
  capacity_hours_per_week smallint,
  available_from date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_availability_updated_at
  before update on availability
  for each row execute function set_updated_at();

create table matching_results (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references requests(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  score numeric(5, 2) not null,
  explanation jsonb not null,
  created_at timestamptz not null default now()
);

create index idx_matching_results_request_id on matching_results(request_id);
