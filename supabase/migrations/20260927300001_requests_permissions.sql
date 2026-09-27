-- Phase 7 (Requests) : permissions dédiées, même schéma d'attribution que
-- le CRM (Phase 6) — SALES est le propriétaire principal des demandes.

insert into permissions (key, description) values
  ('requests.read', 'Consulter les demandes.'),
  ('requests.manage', 'Créer et modifier les demandes.');

insert into role_permissions (role_id, permission_id)
select r.id, p.id
from roles r
join permissions p on p.key in ('requests.read', 'requests.manage')
where
  r.key in ('SUPER_ADMIN', 'ADMIN', 'SALES')
  or (r.key in ('DIRECTOR', 'PROJECT_MANAGER', 'TECHNICAL_MANAGER', 'VIEWER')
      and p.key = 'requests.read');
