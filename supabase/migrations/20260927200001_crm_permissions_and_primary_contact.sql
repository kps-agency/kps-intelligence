-- Phase 6 (CRM) : permissions clients/contacts, désignation atomique du
-- contact principal, index de filtrage, et verrouillage des fonctions RPC.

-- 1. Permissions (chacune correspond à un endpoint livré en Phase 6).
insert into permissions (key, description) values
  ('clients.read', 'Consulter les clients.'),
  ('clients.manage', 'Créer et modifier les clients.'),
  ('contacts.read', 'Consulter les contacts.'),
  ('contacts.manage', 'Créer, modifier et supprimer les contacts.');

-- Lecture pour tous les rôles qui travaillent avec les clients (le rôle
-- TEAM_MEMBER n'en a pas besoin pour l'instant) ; écriture pour les
-- administrateurs et le commercial.
insert into role_permissions (role_id, permission_id)
select r.id, p.id
from roles r
join permissions p on p.key in ('clients.read', 'clients.manage', 'contacts.read', 'contacts.manage')
where
  r.key in ('SUPER_ADMIN', 'ADMIN', 'SALES')
  or (r.key in ('DIRECTOR', 'PROJECT_MANAGER', 'TECHNICAL_MANAGER', 'VIEWER')
      and p.key in ('clients.read', 'contacts.read'));

-- 2. Filtrage des listes.
create index idx_clients_status on clients(status);

-- 3. Contact principal : bascule atomique. Deux appels SQL séparés
-- (retirer l'ancien, poser le nouveau) laisseraient un client sans contact
-- principal si le second échouait. Le verrou sur la ligne du client
-- sérialise les appels concurrents (sans lui, deux bascules simultanées
-- sur deux contacts du même client peuvent s'interbloquer).
create or replace function set_primary_contact(p_contact_id uuid)
returns void as $$
declare
  v_client_id uuid;
begin
  select client_id into v_client_id from contacts where id = p_contact_id;
  if v_client_id is null then
    raise exception 'contact % introuvable', p_contact_id using errcode = 'P0002';
  end if;

  perform 1 from clients where id = v_client_id for update;

  update contacts
    set is_primary = false
    where client_id = v_client_id and is_primary and id <> p_contact_id;
  update contacts set is_primary = true where id = p_contact_id;
end;
$$ language plpgsql;

-- 4. Les fonctions du schéma public sont appelables via l'API REST
-- (/rest/v1/rpc/...) par défaut. Seule l'API (rôle service_role) doit
-- pouvoir les exécuter : on retire l'accès aux rôles publics.
revoke execute on function set_primary_contact(uuid) from public, anon, authenticated;
grant execute on function set_primary_contact(uuid) to service_role;

revoke execute on function get_role_permissions(uuid) from public, anon, authenticated;
grant execute on function get_role_permissions(uuid) to service_role;

revoke execute on function generate_request_reference() from public, anon, authenticated;
grant execute on function generate_request_reference() to service_role;
