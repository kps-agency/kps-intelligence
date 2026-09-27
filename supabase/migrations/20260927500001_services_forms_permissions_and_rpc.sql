-- Phase 9 (Services & formulaires de qualification) : permissions,
-- fonctions de réordonnancement atomique pour les étapes/champs du form
-- builder.

-- 1. Permissions (chacune correspond à un endpoint livré en Phase 9).
-- Le catalogue de services est pré-seedé (migration 000016) : pas de
-- "services.create", seulement lecture/configuration. Lecture ouverte à
-- tous les rôles (catalogue non sensible) ; configuration réservée aux
-- administrateurs.
insert into permissions (key, description) values
  ('services.read', 'Consulter le catalogue de services.'),
  ('services.manage', 'Configurer un service (statut, description, formulaire lié).'),
  ('forms.read', 'Consulter les formulaires de qualification.'),
  ('forms.manage', 'Créer et modifier les formulaires de qualification (étapes, champs).');

insert into role_permissions (role_id, permission_id)
select r.id, p.id
from roles r
join permissions p on p.key in ('services.read', 'services.manage', 'forms.read', 'forms.manage')
where
  r.key in ('SUPER_ADMIN', 'ADMIN')
  or (r.key not in ('SUPER_ADMIN', 'ADMIN') and p.key in ('services.read', 'forms.read'));

-- 2. Réordonnancement atomique des étapes d'un formulaire. Une contrainte
-- unique (form_id, order_index) empêche deux UPDATE séquentiels de
-- permuter deux valeurs directement (collision transitoire) : on décale
-- d'abord tout hors de portée, puis on réassigne les positions finales
-- dans le même ordre que le tableau reçu — une seule opération atomique
-- du point de vue de l'appelant.
create or replace function reorder_form_steps(p_form_id uuid, p_step_ids uuid[])
returns void as $$
begin
  update form_steps set order_index = order_index + 100000 where form_id = p_form_id;

  update form_steps
  set order_index = t.idx - 1
  from unnest(p_step_ids) with ordinality as t(step_id, idx)
  where form_steps.id = t.step_id and form_steps.form_id = p_form_id;
end;
$$ language plpgsql;

-- Même logique pour les champs d'une étape (form_fields n'a pas de
-- contrainte unique sur order_index, mais la même stratégie évite tout
-- état intermédiaire incohérent si l'appel est interrompu).
create or replace function reorder_form_fields(p_form_step_id uuid, p_field_ids uuid[])
returns void as $$
begin
  update form_fields set order_index = order_index + 100000 where form_step_id = p_form_step_id;

  update form_fields
  set order_index = t.idx - 1
  from unnest(p_field_ids) with ordinality as t(field_id, idx)
  where form_fields.id = t.field_id and form_fields.form_step_id = p_form_step_id;
end;
$$ language plpgsql;

revoke execute on function reorder_form_steps(uuid, uuid[]) from public, anon, authenticated;
grant execute on function reorder_form_steps(uuid, uuid[]) to service_role;

revoke execute on function reorder_form_fields(uuid, uuid[]) from public, anon, authenticated;
grant execute on function reorder_form_fields(uuid, uuid[]) to service_role;
