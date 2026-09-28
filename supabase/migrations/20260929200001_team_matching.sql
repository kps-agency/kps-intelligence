-- Phase 16 (Matching équipe, sections 40, 47, 48).

-- Analyse des réponses de qualification par Claude (section 40).
alter type ai_analysis_kind add value 'QUALIFICATION_ANALYSIS';

alter type event_type add value 'TEAM_MEMBER_UNASSIGNED';

-- Profil d'un collaborateur (section 47) : langues parlées (distinctes de
-- users.language, la langue de l'interface), pays, expertise.
alter table users
  add column languages text[] not null default '{}',
  add column country text,
  add column expertise text;

-- Une disponibilité courante par collaborateur.
alter table availability add constraint uniq_availability_user unique (user_id);

-- Résultat d'un calcul de matching : une recommandation classée. Chaque
-- nouveau calcul remplace le précédent pour la demande.
alter table matching_results add column rank smallint not null default 0;

-- Affectation définitive d'un collaborateur à une demande : décision
-- humaine (section 6), distincte de la recommandation.
create table request_team_members (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references requests(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  assigned_by uuid references users(id) on delete set null,
  score numeric(5, 2),
  created_at timestamptz not null default now(),
  unique (request_id, user_id)
);

create index idx_request_team_members_user on request_team_members(user_id);
alter table request_team_members enable row level security;

insert into permissions (key, description) values
  ('team.read', 'Consulter les profils de l''équipe (compétences, disponibilités).'),
  ('team.manage', 'Modifier le profil de n''importe quel collaborateur et le catalogue de compétences.'),
  ('matching.manage', 'Lancer un matching et affecter des collaborateurs à une demande.');

insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r join permissions p on p.key = 'team.read';

insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r join permissions p on p.key = 'team.manage'
where r.key in ('SUPER_ADMIN', 'ADMIN', 'TECHNICAL_MANAGER', 'PROJECT_MANAGER');

insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r join permissions p on p.key = 'matching.manage'
where r.key in ('SUPER_ADMIN', 'ADMIN', 'DIRECTOR', 'TECHNICAL_MANAGER', 'PROJECT_MANAGER');

-- Catalogue de compétences de départ (extensible depuis /team).
insert into skills (name, category) values
  ('Next.js', 'Développement web'),
  ('React', 'Développement web'),
  ('Vue.js', 'Développement web'),
  ('TypeScript', 'Développement web'),
  ('Node.js', 'Développement web'),
  ('NestJS', 'Développement web'),
  ('PHP', 'Développement web'),
  ('Laravel', 'Développement web'),
  ('Python', 'Développement web'),
  ('PostgreSQL', 'Données'),
  ('Supabase', 'Données'),
  ('WordPress', 'CMS & e-commerce'),
  ('WooCommerce', 'CMS & e-commerce'),
  ('Shopify', 'CMS & e-commerce'),
  ('Prestashop', 'CMS & e-commerce'),
  ('Paiement en ligne (Stripe…)', 'CMS & e-commerce'),
  ('React Native', 'Mobile'),
  ('Flutter', 'Mobile'),
  ('UX/UI design', 'Design'),
  ('Figma', 'Design'),
  ('SEO technique', 'SEO & contenu'),
  ('SEO éditorial', 'SEO & contenu'),
  ('Rédaction web', 'SEO & contenu'),
  ('Google Analytics / Search Console', 'SEO & contenu'),
  ('Intégration d''API', 'Architecture'),
  ('Architecture logicielle', 'Architecture'),
  ('IA / LLM', 'Architecture'),
  ('Automatisation (n8n, Make…)', 'Architecture'),
  ('DevOps / Docker', 'Infrastructure'),
  ('Hébergement & sécurité web', 'Infrastructure'),
  ('Maintenance de sites', 'Infrastructure'),
  ('Gestion de projet', 'Gestion');

-- Chaîne de la section 45 : FORM_COMPLETED → analyser Claude ;
-- REQUEST_QUALIFIED → démarrer le matching.
insert into workflows (key, name, description, trigger_event, conditions, actions, cancel_on) values
(
  'qualification-analysis',
  'Analyse des réponses de qualification',
  'Quand le prospect complète le formulaire, Claude analyse ses réponses : qualification (avec assez de confiance) ou demande de validation humaine, et compétences nécessaires au projet.',
  'FORM_COMPLETED',
  '[]'::jsonb,
  '[{"delayMinutes": 0, "conditions": [], "action": {"type": "ANALYZE_QUALIFICATION", "params": {}}}]'::jsonb,
  '{}'
),
(
  'matching-on-qualified',
  'Matching équipe',
  'Quand une demande est qualifiée, calcule les collaborateurs les plus adaptés (recommandation : l''affectation reste une décision de l''équipe).',
  'REQUEST_QUALIFIED',
  '[]'::jsonb,
  '[{"delayMinutes": 0, "conditions": [], "action": {"type": "START_MATCHING", "params": {}}}]'::jsonb,
  '{}'
);

-- Notifications (section 5) : « Matching terminé → Responsable »,
-- « Profil assigné → Collaborateur concerné », et validation humaine si
-- l'analyse des réponses est incertaine (section 40).
insert into notification_templates (key, channel, language, subject, body) values
  ('QUALIFICATION_REVIEW_REQUIRED', 'IN_APP', 'fr',
   'Qualification à valider — {{reference}}',
   'Les réponses du prospect pour « {{subject}} » ont été analysées avec une confiance de {{confidence}} : une validation humaine est nécessaire.'),
  ('QUALIFICATION_REVIEW_REQUIRED', 'EMAIL', 'fr',
   '[KPS] Qualification à valider — {{reference}}',
   'Les réponses du prospect pour la demande « {{subject}} » ont été analysées avec une confiance de {{confidence}}.
Une validation humaine est nécessaire.

Ouvrir la demande : {{link}}'),
  ('MATCHING_COMPLETED', 'IN_APP', 'fr',
   'Matching terminé — {{reference}}',
   '{{subject}} : collaborateurs recommandés — {{topCandidates}}.'),
  ('MATCHING_COMPLETED', 'EMAIL', 'fr',
   '[KPS] Matching terminé — {{reference}}',
   'Le matching de la demande « {{subject}} » est terminé.
Collaborateurs recommandés : {{topCandidates}}.

L''affectation reste à décider depuis la fiche : {{link}}'),
  ('TEAM_MEMBER_ASSIGNED', 'IN_APP', 'fr',
   'Vous êtes affecté(e) — {{reference}}',
   '{{actorName}} vous a affecté(e) à la demande « {{subject}} ».'),
  ('TEAM_MEMBER_ASSIGNED', 'EMAIL', 'fr',
   '[KPS] Nouvelle affectation — {{reference}}',
   '{{actorName}} vous a affecté(e) à la demande « {{subject}} ».

Ouvrir la demande : {{link}}');
