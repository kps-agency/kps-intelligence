-- Pipeline commercial : opportunities, quotes, quote_items, quote_versions.
-- currency n'a volontairement pas de défaut SQL — déduit du pays du
-- client par le service applicatif (voir DATABASE.md §17).

create table opportunities (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references requests(id) on delete set null,
  client_id uuid not null references clients(id) on delete restrict,
  service_id uuid references services(id) on delete set null,
  status opportunity_status not null default 'NEW',
  estimated_value numeric(12, 2),
  currency text,
  owner_user_id uuid references users(id) on delete set null,
  expected_close_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_opportunities_updated_at
  before update on opportunities
  for each row execute function set_updated_at();

create index idx_opportunities_client_id on opportunities(client_id);
create index idx_opportunities_status on opportunities(status);

create table quotes (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references opportunities(id) on delete cascade,
  client_id uuid not null references clients(id) on delete restrict,
  reference text unique not null,
  status quote_status not null default 'DRAFT',
  currency text,
  subtotal numeric(12, 2) not null default 0,
  discount numeric(12, 2) not null default 0,
  tax_rate numeric(5, 2) not null default 0,
  total numeric(12, 2) not null default 0,
  valid_until date,
  created_by uuid references users(id) on delete set null,
  sent_at timestamptz,
  accepted_at timestamptz,
  rejected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_quotes_updated_at
  before update on quotes
  for each row execute function set_updated_at();

create index idx_quotes_opportunity_id on quotes(opportunity_id);

create table quote_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references quotes(id) on delete cascade,
  description text not null,
  quantity numeric(10, 2) not null default 1,
  unit_price numeric(12, 2) not null,
  discount_percent numeric(5, 2) not null default 0,
  total numeric(12, 2) not null,
  order_index integer not null
);

create index idx_quote_items_quote_id on quote_items(quote_id);

create table quote_versions (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references quotes(id) on delete cascade,
  version integer not null,
  snapshot jsonb not null,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (quote_id, version)
);
