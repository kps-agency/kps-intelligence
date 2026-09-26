-- Audit des actions utilisateur sensibles (complémentaire de la table
-- events, qui couvre le système/IA — voir DATABASE.md §13).

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid not null,
  old_value jsonb,
  new_value jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index idx_audit_logs_entity on audit_logs(entity_type, entity_id, created_at);
create index idx_audit_logs_user on audit_logs(user_id, created_at);
