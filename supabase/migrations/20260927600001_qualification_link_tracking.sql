-- Phase 10 (Qualification links) : horodatage de la première ouverture
-- publique du lien, nécessaire pour le suivi de la section 38
-- (Envoyé / Ouvert / Commencé / Progression / Complété), distinct de
-- started_at (première réponse enregistrée) et de last_activity_at.

alter table qualification_sessions
  add column opened_at timestamptz;
