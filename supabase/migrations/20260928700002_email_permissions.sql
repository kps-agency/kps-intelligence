-- Phase 11 (Email) : permission pour le statut d'ingestion (opérationnel,
-- pas une donnée métier) — réservée aux administrateurs, contrairement
-- aux permissions .read des modules précédents ouvertes à tous les rôles.

insert into permissions (key, description) values
  ('email.read', 'Consulter le statut de l''ingestion email (polling IMAP).');

insert into role_permissions (role_id, permission_id)
select r.id, p.id
from roles r
join permissions p on p.key = 'email.read'
where r.key in ('SUPER_ADMIN', 'ADMIN');
