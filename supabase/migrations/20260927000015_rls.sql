-- RLS : activé sur toutes les tables métier, sans aucune policy.
-- Stratégie deny-all (voir ARCHITECTURE.md §1 et DATABASE.md §16) : tout
-- accès aux données métier passe par apps/api avec la clé "secret"
-- (service_role, bypass RLS par construction). Aucun rôle Supabase
-- (anon, authenticated) ne doit jamais pouvoir lire ces tables
-- directement — activer RLS sans policy suffit à les rendre
-- inaccessibles à ces rôles.

alter table roles enable row level security;
alter table permissions enable row level security;
alter table role_permissions enable row level security;
alter table users enable row level security;
alter table clients enable row level security;
alter table contacts enable row level security;
alter table services enable row level security;
alter table request_reference_counters enable row level security;
alter table requests enable row level security;
alter table forms enable row level security;
alter table form_steps enable row level security;
alter table form_fields enable row level security;
alter table qualification_sessions enable row level security;
alter table form_responses enable row level security;
alter table events enable row level security;
alter table workflows enable row level security;
alter table workflow_runs enable row level security;
alter table notification_templates enable row level security;
alter table notification_preferences enable row level security;
alter table notifications enable row level security;
alter table skills enable row level security;
alter table user_skills enable row level security;
alter table availability enable row level security;
alter table matching_results enable row level security;
alter table opportunities enable row level security;
alter table quotes enable row level security;
alter table quote_items enable row level security;
alter table quote_versions enable row level security;
alter table missions enable row level security;
alter table mission_members enable row level security;
alter table tasks enable row level security;
alter table task_comments enable row level security;
alter table documents enable row level security;
alter table conversations enable row level security;
alter table conversation_messages enable row level security;
alter table audit_logs enable row level security;
