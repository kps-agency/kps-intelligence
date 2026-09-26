-- Exécution : missions, membres de mission, tâches, commentaires de tâche.

create table missions (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid references opportunities(id) on delete set null,
  client_id uuid not null references clients(id) on delete restrict,
  service_id uuid references services(id) on delete set null,
  project_manager_id uuid references users(id) on delete set null,
  start_date date,
  end_date date,
  status mission_status not null default 'PLANNED',
  priority priority_level default 'MEDIUM',
  budget numeric(12, 2),
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_missions_updated_at
  before update on missions
  for each row execute function set_updated_at();

create index idx_missions_client_id on missions(client_id);
create index idx_missions_status on missions(status);

create table mission_members (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references missions(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role_on_mission text,
  created_at timestamptz not null default now(),
  unique (mission_id, user_id)
);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references missions(id) on delete cascade,
  title text not null,
  description text,
  assignee_id uuid references users(id) on delete set null,
  due_date date,
  priority priority_level default 'MEDIUM',
  status task_status not null default 'TODO',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_tasks_updated_at
  before update on tasks
  for each row execute function set_updated_at();

create index idx_tasks_mission_id on tasks(mission_id);

create table task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  author_id uuid references users(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);

create index idx_task_comments_task_id on task_comments(task_id);
