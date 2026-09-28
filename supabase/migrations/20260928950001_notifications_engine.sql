-- Phase 14 (Notifications).

-- REQUEST_ASSIGNED : une demande est confiée à un utilisateur (il en est
-- notifié). TEAM_NOTIFIED : trace dans la timeline des personnes
-- notifiées pour une étape (section 43 : « 🔔 Commercial notifié »).
alter type event_type add value 'REQUEST_ASSIGNED';
alter type event_type add value 'TEAM_NOTIFIED';

-- Une notification = un destinataire × un canal pour un événement.
-- La contrainte d'unicité est la clé d'idempotence (section 63) : rejouer
-- un événement ou un job ne produit jamais une seconde notification.
-- Contrainte pleine (et non index partiel) pour être utilisable par
-- ON CONFLICT ; les lignes sans événement (event_id NULL) restent libres.
alter table notifications
  add column event_id uuid references events(id) on delete cascade,
  add column priority priority_level not null default 'MEDIUM',
  add column link text,
  -- Canaux externes (EMAIL) : sent_at NULL = envoi en attente ou en échec.
  add column sent_at timestamptz,
  add column error text,
  add constraint uniq_notifications_event_user_channel unique (event_id, user_id, channel);

create index idx_notifications_user_channel_created
  on notifications(user_id, channel, created_at desc);

-- Templates (section 41) : modifiables en base sans toucher au code.
-- Variables : {{reference}} {{subject}} {{source}} {{serviceName}}
-- {{confidence}} {{channel}} {{actorName}} {{link}}.
insert into notification_templates (key, channel, language, subject, body) values
  ('REQUEST_RECEIVED', 'IN_APP', 'fr',
   'Nouvelle demande {{reference}}',
   '{{subject}} — reçue {{source}}.'),
  ('REQUEST_RECEIVED', 'EMAIL', 'fr',
   '[KPS] Nouvelle demande {{reference}} : {{subject}}',
   'Une nouvelle demande a été reçue {{source}}.

Référence : {{reference}}
Objet : {{subject}}

Ouvrir la demande : {{link}}'),

  ('REQUEST_ANALYSIS_COMPLETED', 'IN_APP', 'fr',
   'Analyse terminée — {{reference}}',
   '{{subject}} : analyse IA terminée (confiance {{confidence}}).'),
  ('REQUEST_ANALYSIS_COMPLETED', 'EMAIL', 'fr',
   '[KPS] Analyse terminée — {{reference}}',
   'L''analyse IA de la demande « {{subject}} » est terminée (confiance {{confidence}}).

Ouvrir la demande : {{link}}'),

  ('AI_ANALYSIS_FAILED', 'IN_APP', 'fr',
   'Échec de l''analyse IA — {{reference}}',
   'L''analyse automatique de « {{subject}} » a échoué. Un traitement manuel est requis.'),
  ('AI_ANALYSIS_FAILED', 'EMAIL', 'fr',
   '[KPS] Échec de l''analyse IA — {{reference}}',
   'L''analyse automatique de la demande « {{subject}} » a échoué.
Un traitement manuel est requis.

Ouvrir la demande : {{link}}'),

  ('BUSINESS_APPLICATION_DETECTED', 'IN_APP', 'fr',
   'Application métier détectée — {{reference}}',
   '{{subject}} : l''IA a identifié un besoin d''application métier.'),
  ('BUSINESS_APPLICATION_DETECTED', 'EMAIL', 'fr',
   '[KPS] Application métier détectée — {{reference}}',
   'L''IA a identifié un besoin d''application métier dans la demande « {{subject}} ».

Ouvrir la demande : {{link}}'),

  ('QUALIFICATION_REQUIRED', 'IN_APP', 'fr',
   'Qualification à envoyer — {{reference}}',
   '{{subject}} : service {{serviceName}} identifié. Envoyez le formulaire de qualification au prospect.'),
  ('QUALIFICATION_REQUIRED', 'EMAIL', 'fr',
   '[KPS] Qualification à envoyer — {{reference}}',
   'Le service {{serviceName}} a été identifié pour la demande « {{subject}} ».
Envoyez le formulaire de qualification au prospect depuis la fiche.

Ouvrir la demande : {{link}}'),

  ('QUALIFICATION_LINK_SENT', 'IN_APP', 'fr',
   'Formulaire envoyé — {{reference}}',
   'Le formulaire de qualification a été envoyé {{channel}} pour « {{subject}} ».'),
  ('QUALIFICATION_LINK_SENT', 'EMAIL', 'fr',
   '[KPS] Formulaire envoyé — {{reference}}',
   'Le formulaire de qualification a été envoyé {{channel}} pour la demande « {{subject}} ».

Ouvrir la demande : {{link}}'),

  ('FORM_COMPLETED', 'IN_APP', 'fr',
   'Réponse client reçue — {{reference}}',
   'Le prospect a complété le formulaire de qualification pour « {{subject}} ».'),
  ('FORM_COMPLETED', 'EMAIL', 'fr',
   '[KPS] Réponse client reçue — {{reference}}',
   'Le prospect a complété le formulaire de qualification pour la demande « {{subject}} ».

Ouvrir la demande : {{link}}'),

  ('REQUEST_QUALIFIED', 'IN_APP', 'fr',
   'Demande qualifiée — {{reference}}',
   '« {{subject}} » a été qualifiée par {{actorName}}.'),
  ('REQUEST_QUALIFIED', 'EMAIL', 'fr',
   '[KPS] Demande qualifiée — {{reference}}',
   'La demande « {{subject}} » a été qualifiée par {{actorName}}.

Ouvrir la demande : {{link}}'),

  ('REQUEST_ASSIGNED', 'IN_APP', 'fr',
   'Demande assignée — {{reference}}',
   '{{actorName}} vous a assigné la demande « {{subject}} ».'),
  ('REQUEST_ASSIGNED', 'EMAIL', 'fr',
   '[KPS] Demande assignée — {{reference}}',
   '{{actorName}} vous a assigné la demande « {{subject}} ».

Ouvrir la demande : {{link}}'),

  ('CONVERSATION_MESSAGE_RECEIVED', 'IN_APP', 'fr',
   'Nouveau message — {{reference}}',
   'Le prospect a envoyé un nouveau message {{channel}} concernant « {{subject}} ».'),
  ('CONVERSATION_MESSAGE_RECEIVED', 'EMAIL', 'fr',
   '[KPS] Nouveau message du prospect — {{reference}}',
   'Le prospect a envoyé un nouveau message {{channel}} concernant la demande « {{subject}} ».

Ouvrir la demande : {{link}}');
