-- Phase 15 (Workflow Engine, sections 39, 45, 46).

alter type workflow_run_status add value 'WAITING';
alter type workflow_run_status add value 'CANCELLED';

-- Relance envoyée au prospect (section 39) : distincte de
-- QUALIFICATION_LINK_SENT, sinon chaque relance relancerait elle-même la
-- chaîne de relances.
alter type event_type add value 'QUALIFICATION_REMINDER_SENT';

-- Définition d'un workflow :
--   trigger_event          déclencheur
--   conditions             conditions du déclencheur (évaluées à l'événement)
--   actions                étapes ordonnées : { delayMinutes, conditions, action }
--                          (conditions réévaluées au moment de l'étape)
--   cancel_on              événements qui annulent une exécution en attente
--                          portant sur le même objet (ex. formulaire complété)
-- `key` identifie les workflows livrés avec l'application (non supprimables).
alter table workflows
  add column key text unique,
  add column description text,
  add column cancel_on event_type[] not null default '{}',
  add column updated_by uuid references users(id) on delete set null;

-- Exécution : une par (workflow, événement déclencheur) — clé
-- d'idempotence (section 63). `subject_*` = l'objet de l'événement
-- déclencheur (ex. la session de qualification), pour l'annulation.
alter table workflow_runs
  add column request_id uuid references requests(id) on delete cascade,
  add column subject_type text,
  add column subject_id uuid,
  add column current_step integer not null default 0,
  add column next_step_at timestamptz,
  add column steps_log jsonb not null default '[]'::jsonb,
  add constraint uniq_workflow_runs_workflow_event unique (workflow_id, triggering_event_id);

create index idx_workflow_runs_subject on workflow_runs(subject_id, status);
create index idx_workflow_runs_request on workflow_runs(request_id);

insert into permissions (key, description) values
  ('workflows.read', 'Consulter les workflows et leurs exécutions.'),
  ('workflows.manage', 'Modifier les workflows (activation, conditions, délais).');

insert into role_permissions (role_id, permission_id)
select r.id, p.id
from roles r
join permissions p on p.key = 'workflows.read'
where r.key in ('SUPER_ADMIN', 'ADMIN', 'DIRECTOR');

insert into role_permissions (role_id, permission_id)
select r.id, p.id
from roles r
join permissions p on p.key = 'workflows.manage'
where r.key in ('SUPER_ADMIN', 'ADMIN');

-- Workflows livrés : la règle de qualification automatique (auparavant
-- codée en dur, Phase 13) et les relances de la section 39.
insert into workflows (key, name, description, trigger_event, conditions, actions, cancel_on) values
(
  'qualification-required',
  'Qualification requise',
  'Quand l''IA identifie un service avec assez de confiance, la demande doit être qualifiée par le formulaire de ce service (s''il en a un publié et qu''aucun lien n''existe déjà).',
  'SERVICE_DETECTED',
  '[{"field": "event.payload.confidence", "operator": "gte", "value": 0.6}]'::jsonb,
  '[{"delayMinutes": 0, "conditions": [], "action": {"type": "REQUIRE_QUALIFICATION", "params": {}}}]'::jsonb,
  '{}'
),
(
  'qualification-auto-send',
  'Envoi automatique du formulaire',
  'Quand une qualification est requise et que le prospect a écrit par email ou WhatsApp, le lien de qualification lui est envoyé sur ce même canal.',
  'QUALIFICATION_REQUIRED',
  '[{"field": "request.hasReplyChannel", "operator": "eq", "value": true}]'::jsonb,
  '[{"delayMinutes": 0, "conditions": [], "action": {"type": "SEND_QUALIFICATION_LINK", "params": {}}}]'::jsonb,
  '{}'
),
(
  'qualification-reminders',
  'Relances du formulaire',
  'Formulaire envoyé : 48 h sans ouverture → relance par email ; 24 h de plus sans ouverture → relance par WhatsApp. Annulé dès que le lien est ouvert, le formulaire commencé ou complété, le lien révoqué ou expiré.',
  'QUALIFICATION_LINK_SENT',
  '[]'::jsonb,
  '[
    {"delayMinutes": 2880, "conditions": [{"field": "session.status", "operator": "eq", "value": "SENT"}], "action": {"type": "SEND_QUALIFICATION_REMINDER", "params": {"channel": "EMAIL"}}},
    {"delayMinutes": 1440, "conditions": [{"field": "session.status", "operator": "eq", "value": "SENT"}], "action": {"type": "SEND_QUALIFICATION_REMINDER", "params": {"channel": "WHATSAPP"}}}
  ]'::jsonb,
  '{QUALIFICATION_LINK_OPENED,FORM_STARTED,FORM_COMPLETED,QUALIFICATION_LINK_REVOKED,QUALIFICATION_LINK_EXPIRED}'
);
