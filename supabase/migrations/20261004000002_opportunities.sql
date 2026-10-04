-- Phase 17 (Opportunités, sections 45 et 50).

-- Une demande entrante (email, WhatsApp, site web) n'a un client que si
-- l'expéditeur est déjà un contact connu : l'opportunité d'un nouveau
-- prospect naît donc sans client, rattaché ensuite (obligatoire au plus
-- tard pour le devis, `quotes.client_id` restant not null).
alter table opportunities alter column client_id drop not null;

alter table opportunities
  add column title text,
  add column description text,
  add column probability smallint check (probability between 0 and 100),
  add column lost_reason text,
  add column closed_at timestamptz;

update opportunities set title = 'Opportunité' where title is null;
alter table opportunities alter column title set not null;

-- Idempotence de la création automatique (section 63) : une opportunité
-- par demande.
create unique index uniq_opportunities_request on opportunities(request_id)
  where request_id is not null;
create index idx_opportunities_owner on opportunities(owner_user_id);

-- Même choix que `events` et `workflow_runs` : une demande n'est jamais
-- supprimée par l'application, mais les tests d'intégration nettoient
-- leurs données — sans cascade, chaque demande de test laisserait une
-- opportunité orpheline dans le pipeline.
alter table opportunities drop constraint opportunities_request_id_fkey;
alter table opportunities
  add constraint opportunities_request_id_fkey
  foreign key (request_id) references requests(id) on delete cascade;

insert into permissions (key, description) values
  ('opportunities.read', 'Consulter le pipeline des opportunités.'),
  ('opportunities.manage', 'Créer, modifier et faire avancer les opportunités.');

insert into role_permissions (role_id, permission_id)
select r.id, p.id
from roles r
join permissions p on p.key in ('opportunities.read', 'opportunities.manage')
where
  r.key in ('SUPER_ADMIN', 'ADMIN', 'SALES')
  or (r.key in ('DIRECTOR', 'PROJECT_MANAGER', 'TECHNICAL_MANAGER', 'VIEWER')
      and p.key = 'opportunities.read');

-- Chaîne de la section 45 : matching terminé sur une demande qualifiée →
-- opportunité. Le statut de la demande suit ensuite l'étape de
-- l'opportunité (devis à préparer, devis envoyé, négociation, gagnée,
-- perdue).
insert into workflows (key, name, description, trigger_event, conditions, actions, cancel_on) values
(
  'opportunity-on-matching',
  'Création de l''opportunité',
  'Quand le matching d''une demande qualifiée est terminé, une opportunité est créée dans le pipeline commercial (une seule par demande).',
  'MATCHING_COMPLETED',
  '[{"field": "request.status", "operator": "in", "value": ["QUALIFIED", "MATCHING", "ASSIGNED"]}]'::jsonb,
  '[{"delayMinutes": 0, "conditions": [], "action": {"type": "CREATE_OPPORTUNITY", "params": {}}}]'::jsonb,
  '{}'
),
(
  'request-status-on-opportunity-stage',
  'Statut de la demande selon l''opportunité',
  'Quand une opportunité change d''étape, le statut de la demande d''origine suit : devis à préparer, devis envoyé, négociation, gagnée ou perdue.',
  'OPPORTUNITY_STAGE_CHANGED',
  '[]'::jsonb,
  '[{"delayMinutes": 0, "conditions": [], "action": {"type": "SYNC_REQUEST_STATUS", "params": {}}}]'::jsonb,
  '{}'
);

-- Notifications (section 5) : commercial en charge et responsable.
insert into notification_templates (key, channel, language, subject, body) values
  ('OPPORTUNITY_CREATED', 'IN_APP', 'fr',
   'Nouvelle opportunité — {{title}}',
   'Opportunité créée pour {{clientName}}{{valueSuffix}}.'),
  ('OPPORTUNITY_CREATED', 'EMAIL', 'fr',
   '[KPS] Nouvelle opportunité — {{title}}',
   'Une opportunité a été créée pour {{clientName}}{{valueSuffix}}.

Ouvrir l''opportunité : {{link}}'),
  ('OPPORTUNITY_STAGE_CHANGED', 'IN_APP', 'fr',
   'Opportunité : {{stage}} — {{title}}',
   '{{clientName}} : étape « {{fromStage}} » → « {{stage}} » (par {{actorName}}).'),
  ('OPPORTUNITY_STAGE_CHANGED', 'EMAIL', 'fr',
   '[KPS] Opportunité : {{stage}} — {{title}}',
   'L''opportunité « {{title}} » ({{clientName}}) passe de « {{fromStage}} » à « {{stage}} » (par {{actorName}}).

Ouvrir l''opportunité : {{link}}'),
  ('OPPORTUNITY_WON', 'IN_APP', 'fr',
   'Opportunité gagnée — {{title}}',
   '{{clientName}}{{valueSuffix}} : opportunité gagnée.'),
  ('OPPORTUNITY_WON', 'EMAIL', 'fr',
   '[KPS] Opportunité gagnée — {{title}}',
   'L''opportunité « {{title}} » ({{clientName}}{{valueSuffix}}) est gagnée.

Ouvrir l''opportunité : {{link}}'),
  ('OPPORTUNITY_LOST', 'IN_APP', 'fr',
   'Opportunité perdue — {{title}}',
   '{{clientName}} : opportunité perdue{{lostReasonSuffix}}.'),
  ('OPPORTUNITY_LOST', 'EMAIL', 'fr',
   '[KPS] Opportunité perdue — {{title}}',
   'L''opportunité « {{title}} » ({{clientName}}) est perdue{{lostReasonSuffix}}.

Ouvrir l''opportunité : {{link}}');
