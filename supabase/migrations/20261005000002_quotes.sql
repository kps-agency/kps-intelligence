-- Phase 18 (Devis, section 51).

-- Référence DEVIS-{AAAA}-{NNNN}, remise à zéro chaque année (même
-- mécanisme que les demandes, DATABASE.md §17).
create table quote_reference_counters (
  year integer primary key,
  last_value integer not null default 0
);
alter table quote_reference_counters enable row level security;

create function generate_quote_reference()
returns text as $$
declare
  current_year integer := extract(year from now())::integer;
  next_value integer;
begin
  insert into quote_reference_counters(year, last_value)
  values (current_year, 0)
  on conflict (year) do nothing;

  update quote_reference_counters
  set last_value = last_value + 1
  where year = current_year
  returning last_value into next_value;

  return 'DEVIS-' || current_year::text || '-' || lpad(next_value::text, 4, '0');
end;
$$ language plpgsql;

alter table quotes
  alter column reference set default generate_quote_reference(),
  add column title text,
  add column notes text,
  -- Remise globale en % ; `discount` garde le montant calculé.
  add column discount_percent numeric(5, 2) not null default 0
    check (discount_percent between 0 and 100),
  add column tax_amount numeric(12, 2) not null default 0,
  add column sent_to text,
  add column rejection_reason text;

update quotes set title = 'Devis' where title is null;
alter table quotes alter column title set not null;

create index idx_quotes_client_id on quotes(client_id);
create index idx_quotes_status on quotes(status);

-- Identité de l'émetteur des devis (mentions légales du PDF) : une seule
-- ligne, renseignée par un administrateur depuis Paramètres. Rien n'est
-- pré-rempli : un devis ne peut pas être envoyé sans raison sociale.
create table company_settings (
  id boolean primary key default true check (id),
  legal_name text,
  address text,
  postal_code text,
  city text,
  country text,
  vat_number text,
  email text,
  phone text,
  website text,
  iban text,
  default_tax_rate numeric(5, 2) not null default 0 check (default_tax_rate between 0 and 100),
  quote_validity_days integer not null default 30 check (quote_validity_days between 1 and 365),
  quote_terms text,
  updated_by uuid references users(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table company_settings enable row level security;
insert into company_settings (id) values (true);

create trigger trg_company_settings_updated_at
  before update on company_settings
  for each row execute function set_updated_at();

-- Enregistre le contenu d'un brouillon en une transaction : en-tête,
-- totaux (calculés par l'API) et remplacement des lignes. Un devis déjà
-- envoyé ne se modifie pas (il faut le réviser d'abord).
create function save_quote_content(p_quote_id uuid, p_quote jsonb, p_items jsonb)
returns void
language plpgsql
as $$
declare
  v_status quote_status;
begin
  select status into v_status from quotes where id = p_quote_id for update;
  if not found then
    raise exception 'Devis introuvable' using errcode = 'P0002';
  end if;
  if v_status <> 'DRAFT' then
    raise exception 'Devis non modifiable' using errcode = 'P0001';
  end if;

  update quotes set
    title = p_quote->>'title',
    notes = p_quote->>'notes',
    currency = p_quote->>'currency',
    valid_until = (p_quote->>'valid_until')::date,
    discount_percent = (p_quote->>'discount_percent')::numeric,
    tax_rate = (p_quote->>'tax_rate')::numeric,
    subtotal = (p_quote->>'subtotal')::numeric,
    discount = (p_quote->>'discount')::numeric,
    tax_amount = (p_quote->>'tax_amount')::numeric,
    total = (p_quote->>'total')::numeric
  where id = p_quote_id;

  delete from quote_items where quote_id = p_quote_id;
  insert into quote_items (quote_id, description, quantity, unit_price, discount_percent, total, order_index)
  select
    p_quote_id,
    item->>'description',
    (item->>'quantity')::numeric,
    (item->>'unit_price')::numeric,
    (item->>'discount_percent')::numeric,
    (item->>'total')::numeric,
    (ordinality - 1)::integer
  from jsonb_array_elements(p_items) with ordinality as t(item, ordinality);
end;
$$;

-- Envoi : fige une version (instantané complet) et passe le devis à SENT
-- en une transaction. Renvoie le numéro de version créé.
create function mark_quote_sent(p_quote_id uuid, p_snapshot jsonb, p_sent_to text, p_user_id uuid)
returns integer
language plpgsql
as $$
declare
  v_status quote_status;
  v_version integer;
begin
  select status into v_status from quotes where id = p_quote_id for update;
  if not found then
    raise exception 'Devis introuvable' using errcode = 'P0002';
  end if;
  if v_status <> 'DRAFT' then
    raise exception 'Devis déjà envoyé' using errcode = 'P0001';
  end if;

  select coalesce(max(version), 0) + 1 into v_version from quote_versions where quote_id = p_quote_id;
  insert into quote_versions (quote_id, version, snapshot, created_by)
  values (p_quote_id, v_version, p_snapshot, p_user_id);

  update quotes set
    status = 'SENT',
    sent_at = now(),
    sent_to = p_sent_to,
    accepted_at = null,
    rejected_at = null,
    rejection_reason = null
  where id = p_quote_id;
  return v_version;
end;
$$;

insert into permissions (key, description) values
  ('quotes.read', 'Consulter les devis.'),
  ('quotes.manage', 'Créer, modifier, envoyer les devis et enregistrer la réponse du client.'),
  ('settings.manage', 'Modifier l''identité de l''entreprise (mentions des devis).');

insert into role_permissions (role_id, permission_id)
select r.id, p.id
from roles r
join permissions p on p.key in ('quotes.read', 'quotes.manage')
where
  r.key in ('SUPER_ADMIN', 'ADMIN', 'SALES')
  or (r.key in ('DIRECTOR', 'PROJECT_MANAGER', 'TECHNICAL_MANAGER', 'VIEWER')
      and p.key = 'quotes.read');

insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r join permissions p on p.key = 'settings.manage'
where r.key in ('SUPER_ADMIN', 'ADMIN');

-- Le devis fait avancer son opportunité (jamais reculer, jamais une
-- opportunité déjà gagnée ou perdue) ; la demande suit par le workflow
-- `request-status-on-opportunity-stage` (Phase 17).
insert into workflows (key, name, description, trigger_event, conditions, actions, cancel_on) values
(
  'opportunity-stage-on-quote-created',
  'Devis créé → devis à préparer',
  'Quand un devis est créé, son opportunité passe à l''étape « Devis à préparer » (si elle n''est pas déjà plus avancée).',
  'QUOTE_CREATED', '[]'::jsonb,
  '[{"delayMinutes": 0, "conditions": [], "action": {"type": "SET_OPPORTUNITY_STAGE", "params": {"stage": "PROPOSAL_REQUIRED"}}}]'::jsonb,
  '{}'
),
(
  'opportunity-stage-on-quote-sent',
  'Devis envoyé → devis envoyé',
  'Quand un devis est envoyé au client, son opportunité passe à l''étape « Devis envoyé ».',
  'QUOTE_SENT', '[]'::jsonb,
  '[{"delayMinutes": 0, "conditions": [], "action": {"type": "SET_OPPORTUNITY_STAGE", "params": {"stage": "PROPOSAL_SENT"}}}]'::jsonb,
  '{}'
),
(
  'opportunity-stage-on-quote-accepted',
  'Devis accepté → opportunité gagnée',
  'Quand l''acceptation d''un devis est enregistrée, son opportunité est gagnée.',
  'QUOTE_ACCEPTED', '[]'::jsonb,
  '[{"delayMinutes": 0, "conditions": [], "action": {"type": "SET_OPPORTUNITY_STAGE", "params": {"stage": "WON"}}}]'::jsonb,
  '{}'
),
(
  'opportunity-stage-on-quote-rejected',
  'Devis refusé → négociation',
  'Quand le refus d''un devis est enregistré, son opportunité passe en négociation : à l''équipe de décider de la suite (nouveau devis ou opportunité perdue).',
  'QUOTE_REJECTED', '[]'::jsonb,
  '[{"delayMinutes": 0, "conditions": [], "action": {"type": "SET_OPPORTUNITY_STAGE", "params": {"stage": "NEGOTIATION"}}}]'::jsonb,
  '{}'
);

insert into notification_templates (key, channel, language, subject, body) values
  ('QUOTE_SENT', 'IN_APP', 'fr',
   'Devis envoyé — {{reference}}',
   '{{actorName}} a envoyé le devis « {{title}} » à {{clientName}}{{valueSuffix}}.'),
  ('QUOTE_SENT', 'EMAIL', 'fr',
   '[KPS] Devis envoyé — {{reference}}',
   '{{actorName}} a envoyé le devis « {{title}} » à {{clientName}}{{valueSuffix}}.

Ouvrir le devis : {{link}}'),
  ('QUOTE_ACCEPTED', 'IN_APP', 'fr',
   'Devis accepté — {{reference}}',
   '{{clientName}} a accepté le devis « {{title}} »{{valueSuffix}}.'),
  ('QUOTE_ACCEPTED', 'EMAIL', 'fr',
   '[KPS] Devis accepté — {{reference}}',
   '{{clientName}} a accepté le devis « {{title}} »{{valueSuffix}}.

Ouvrir le devis : {{link}}'),
  ('QUOTE_REJECTED', 'IN_APP', 'fr',
   'Devis refusé — {{reference}}',
   '{{clientName}} a refusé le devis « {{title}} »{{reasonSuffix}}.'),
  ('QUOTE_REJECTED', 'EMAIL', 'fr',
   '[KPS] Devis refusé — {{reference}}',
   '{{clientName}} a refusé le devis « {{title}} »{{reasonSuffix}}.

Ouvrir le devis : {{link}}');
