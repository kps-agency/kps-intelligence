-- Phase 13 (Event Bus).

-- Étapes déjà réelles dans le produit mais absentes du catalogue de la
-- section 4 (qui ne donne que des exemples) : sans elles, la timeline ne
-- pourrait pas reconstituer fidèlement l'historique d'une demande.
alter type event_type add value 'REQUEST_STATUS_CHANGED';
alter type event_type add value 'QUALIFICATION_LINK_REVOKED';
alter type event_type add value 'QUALIFICATION_LINK_EXTENDED';
alter type event_type add value 'QUALIFICATION_LINK_EXPIRED';
alter type event_type add value 'CONVERSATION_MESSAGE_RECEIVED';

-- Demande racine de l'événement, quel que soit son entity_type
-- (demande, session de qualification, conversation, puis opportunité,
-- mission...) : la timeline d'une demande devient une seule requête
-- indexée au lieu d'une union qui grossirait à chaque nouveau module.
-- Cascade : une demande n'est jamais supprimée par l'application, mais
-- les tests d'intégration nettoient leurs données.
alter table events
  add column request_id uuid references requests(id) on delete cascade;

create index idx_events_request on events(request_id, created_at) where request_id is not null;

-- Journal en ajout seul : un événement passé ne se réécrit pas. La
-- suppression reste possible (cascade ci-dessus, futur droit à l'oubli
-- RGPD en Phase 22).
create function forbid_event_update() returns trigger
language plpgsql as $$
begin
  raise exception 'events est en ajout seul : modification interdite';
end;
$$;

create trigger trg_events_append_only
  before update on events
  for each row execute function forbid_event_update();

-- Nom affiché de l'expéditeur (email "From" ou profil WhatsApp), pour
-- saluer le prospect par son prénom même quand aucun contact n'existe.
alter table conversation_messages add column from_name text;
