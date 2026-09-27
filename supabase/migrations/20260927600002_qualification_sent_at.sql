-- Phase 10 : horodatage réel du passage au statut SENT (section 38 —
-- indicateur "Envoyé" du suivi). Sans cette colonne, un lien marqué
-- envoyé puis révoqué avant toute ouverture perdrait la trace d'avoir
-- été envoyé (le statut courant ne suffit pas à reconstruire l'historique).

alter table qualification_sessions
  add column sent_at timestamptz;
