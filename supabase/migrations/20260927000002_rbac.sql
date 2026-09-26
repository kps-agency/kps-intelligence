-- RBAC : roles, permissions, matrice role_permissions, users.
-- users.id est volontairement égal à auth.users.id (pattern Supabase
-- standard) : un profil applicatif n'existe jamais sans compte Auth.

create table roles (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  label text not null,
  description text,
  created_at timestamptz not null default now()
);

create table permissions (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  description text,
  created_at timestamptz not null default now()
);

create table role_permissions (
  role_id uuid not null references roles(id) on delete cascade,
  permission_id uuid not null references permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

create table users (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  email text unique not null,
  phone text,
  whatsapp text,
  avatar_url text,
  role_id uuid not null references roles(id) on delete restrict,
  status user_status not null default 'ACTIVE',
  timezone text not null default 'Europe/Zurich',
  language text not null default 'fr',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_users_updated_at
  before update on users
  for each row execute function set_updated_at();

create index idx_users_role_id on users(role_id);
