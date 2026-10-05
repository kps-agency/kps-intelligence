-- Phase 19 (Missions & tâches, sections 52-53).

-- Même raison que pour les opportunités (Phase 17) : une opportunité née
-- d'une demande entrante peut être gagnée sans fiche client.
alter table missions alter column client_id drop not null;

alter table missions
  add column title text,
  add column currency text,
  add column blocked_reason text,
  add column completed_at timestamptz;

update missions set title = 'Mission' where title is null;
alter table missions alter column title set not null;

-- Idempotence de la création automatique (section 63) : une mission par
-- opportunité gagnée.
create unique index uniq_missions_opportunity on missions(opportunity_id)
  where opportunity_id is not null;
create index idx_missions_project_manager on missions(project_manager_id);
create index idx_mission_members_user on mission_members(user_id);
create index idx_tasks_assignee on tasks(assignee_id);

-- Une opportunité n'est jamais supprimée par l'application ; les tests
-- d'intégration nettoient leurs données (même choix qu'en Phase 17).
alter table missions drop constraint missions_opportunity_id_fkey;
alter table missions
  add constraint missions_opportunity_id_fkey
  foreign key (opportunity_id) references opportunities(id) on delete cascade;

alter table tasks
  add column created_by uuid references users(id) on delete set null,
  add column completed_at timestamptz;

insert into permissions (key, description) values
  ('missions.read', 'Consulter les missions et leurs tâches.'),
  ('missions.manage', 'Créer et piloter les missions : statut, équipe, tâches.');

-- Lecture : tous les rôles (un collaborateur voit les missions pour y
-- suivre ses tâches). Pilotage : administrateurs, chefs de projet,
-- responsables techniques.
insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r join permissions p on p.key = 'missions.read';

insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r join permissions p on p.key = 'missions.manage'
where r.key in ('SUPER_ADMIN', 'ADMIN', 'PROJECT_MANAGER', 'TECHNICAL_MANAGER');

-- Section 45 : opportunité gagnée → mission, avec l'équipe affectée à la
-- demande ; la demande devient « Convertie en mission ».
insert into workflows (key, name, description, trigger_event, conditions, actions, cancel_on) values
(
  'mission-on-opportunity-won',
  'Création de la mission',
  'Quand une opportunité est gagnée, sa mission est créée (une seule par opportunité) avec l''équipe affectée à la demande d''origine. Le chef de projet reste à désigner.',
  'OPPORTUNITY_WON', '[]'::jsonb,
  '[{"delayMinutes": 0, "conditions": [], "action": {"type": "CREATE_MISSION", "params": {}}}]'::jsonb,
  '{}'
),
(
  'request-converted-on-mission-created',
  'Demande convertie en mission',
  'Quand une mission est créée depuis une demande, la demande passe au statut « Convertie en mission ».',
  'MISSION_CREATED', '[]'::jsonb,
  '[{"delayMinutes": 0, "conditions": [], "action": {"type": "MARK_REQUEST_CONVERTED", "params": {}}}]'::jsonb,
  '{}'
);

insert into notification_templates (key, channel, language, subject, body) values
  ('MISSION_CREATED', 'IN_APP', 'fr',
   'Nouvelle mission — {{title}}',
   'Mission créée pour {{clientName}}. Chef de projet et planning à définir.'),
  ('MISSION_CREATED', 'EMAIL', 'fr',
   '[KPS] Nouvelle mission — {{title}}',
   'La mission « {{title}} » a été créée pour {{clientName}}.
Chef de projet et planning à définir.

Ouvrir la mission : {{link}}'),
  ('MISSION_ASSIGNED', 'IN_APP', 'fr',
   'Vous rejoignez la mission — {{title}}',
   '{{actorName}} vous a ajouté(e) à l''équipe de la mission « {{title}} » ({{clientName}}).'),
  ('MISSION_ASSIGNED', 'EMAIL', 'fr',
   '[KPS] Vous rejoignez la mission — {{title}}',
   '{{actorName}} vous a ajouté(e) à l''équipe de la mission « {{title}} » ({{clientName}}).

Ouvrir la mission : {{link}}'),
  ('MISSION_BLOCKED', 'IN_APP', 'fr',
   'Mission bloquée — {{title}}',
   '{{actorName}} a signalé la mission « {{title}} » comme bloquée{{reasonSuffix}}.'),
  ('MISSION_BLOCKED', 'EMAIL', 'fr',
   '[KPS] Mission bloquée — {{title}}',
   '{{actorName}} a signalé la mission « {{title}} » ({{clientName}}) comme bloquée{{reasonSuffix}}.

Ouvrir la mission : {{link}}'),
  ('TASK_ASSIGNED', 'IN_APP', 'fr',
   'Nouvelle tâche — {{taskTitle}}',
   '{{actorName}} vous a confié la tâche « {{taskTitle}} » (mission « {{title}} »){{dueSuffix}}.'),
  ('TASK_ASSIGNED', 'EMAIL', 'fr',
   '[KPS] Nouvelle tâche — {{taskTitle}}',
   '{{actorName}} vous a confié la tâche « {{taskTitle}} » dans la mission « {{title}} »{{dueSuffix}}.

Ouvrir la mission : {{link}}');
