-- Résout la liste des clés de permission d'un rôle en un seul aller-retour,
-- utilisé par apps/api pour construire le contexte RBAC de chaque requête
-- authentifiée (voir apps/api/src/users/users.service.ts).

create or replace function get_role_permissions(p_role_id uuid)
returns text[] as $$
  select coalesce(array_agg(p.key), '{}'::text[])
  from role_permissions rp
  join permissions p on p.id = rp.permission_id
  where rp.role_id = p_role_id;
$$ language sql stable;
