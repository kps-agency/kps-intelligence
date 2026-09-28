-- Phase 12 (WhatsApp) : idempotence de la création de demande sur l'id de
-- message WhatsApp (wamid) — Meta rejoue un webhook tant qu'il n'a pas
-- reçu de 200, un même message peut donc arriver plusieurs fois.

alter table requests
  add column whatsapp_message_id text;

create unique index idx_requests_whatsapp_message_id
  on requests(whatsapp_message_id)
  where whatsapp_message_id is not null;

-- Rattachement automatique d'un numéro WhatsApp entrant à un contact
-- existant. Meta envoie le numéro au format international en chiffres
-- seuls ("41791234567") alors qu'un contact saisi à la main peut contenir
-- espaces, "+", tirets ou le préfixe "00" : on compare sur une forme
-- normalisée calculée par Postgres plutôt que de charger tous les contacts
-- côté API. Un numéro saisi au format national ("079...") ne peut pas
-- être rapproché sans connaître le pays — limite assumée.
alter table contacts
  add column whatsapp_digits text generated always as (
    nullif(regexp_replace(regexp_replace(whatsapp, '\D', '', 'g'), '^00', ''), '')
  ) stored,
  add column phone_digits text generated always as (
    nullif(regexp_replace(regexp_replace(phone, '\D', '', 'g'), '^00', ''), '')
  ) stored;

create index idx_contacts_whatsapp_digits on contacts(whatsapp_digits) where whatsapp_digits is not null;
create index idx_contacts_phone_digits on contacts(phone_digits) where phone_digits is not null;
