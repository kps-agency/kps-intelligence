-- CRM : clients, contacts.

create table clients (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  country text,
  city text,
  industry text,
  website text,
  email text,
  phone text,
  whatsapp text,
  status client_status not null default 'PROSPECT',
  source request_source,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_clients_updated_at
  before update on clients
  for each row execute function set_updated_at();

create table contacts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  email text,
  phone text,
  whatsapp text,
  position text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_contacts_updated_at
  before update on contacts
  for each row execute function set_updated_at();

create index idx_contacts_client_id on contacts(client_id);

-- Un seul contact principal par client.
create unique index uniq_contacts_primary_per_client
  on contacts(client_id) where is_primary;
