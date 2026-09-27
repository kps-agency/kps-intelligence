-- Permissions RBAC réelles pour les endpoints livrés en Phase 3
-- (users, roles). Chaque permission correspond à un endpoint qui existe
-- vraiment — pas de permission spéculative pour une fonctionnalité pas
-- encore construite (elles seront ajoutées module par module).

insert into permissions (key, description) values
  ('users.read', 'Lister les utilisateurs et consulter leur profil.'),
  ('users.manage', 'Créer des utilisateurs et modifier leur rôle/statut.'),
  ('roles.read', 'Lister les rôles et permissions disponibles.');

insert into role_permissions (role_id, permission_id)
select r.id, p.id
from roles r
join permissions p on true
where
  (r.key = 'SUPER_ADMIN' and p.key in ('users.read', 'users.manage', 'roles.read'))
  or (r.key = 'ADMIN' and p.key in ('users.read', 'users.manage', 'roles.read'))
  or (r.key = 'DIRECTOR' and p.key in ('users.read', 'roles.read'));
