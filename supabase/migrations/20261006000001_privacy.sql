-- Phase 22 (RGPD, section 66) : consentement, effacement, traçabilité.

-- Consentement recueilli sur la page publique avant l'envoi du formulaire :
-- quand, et sur quelle version du texte affiché.
alter table qualification_sessions
  add column consent_at timestamptz,
  add column consent_version text;

alter table contacts add column anonymized_at timestamptz;

insert into permissions (key, description) values
  ('privacy.manage', 'Exporter ou effacer les données personnelles d''un contact (RGPD).');

insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r join permissions p on p.key = 'privacy.manage'
where r.key in ('SUPER_ADMIN', 'ADMIN');

-- Droit à l'effacement : efface, en une transaction, les données
-- personnelles d'un contact et de ses demandes. Les objets commerciaux
-- (demande, opportunité, devis, mission) sont conservés, vidés de ce qui
-- identifie la personne : ce sont des pièces de l'activité de l'agence.
--
-- Renvoie les compteurs de ce qui a été effacé et les chemins des
-- fichiers à supprimer du stockage (l'API s'en charge : le stockage
-- n'est pas transactionnel).
create function anonymize_contact(
  p_contact_id uuid,
  p_user_id uuid,
  p_ip text,
  p_user_agent text
)
returns jsonb
language plpgsql
as $$
declare
  v_anonymized_at timestamptz;
  v_request_ids uuid[];
  v_messages integer;
  v_responses integer;
  v_analyses integer;
  v_notifications integer;
  v_events integer;
  v_paths text[];
  v_result jsonb;
begin
  select anonymized_at into v_anonymized_at from contacts where id = p_contact_id for update;
  if not found then
    raise exception 'Contact introuvable' using errcode = 'P0002';
  end if;
  if v_anonymized_at is not null then
    raise exception 'Contact déjà anonymisé' using errcode = 'P0001';
  end if;

  select coalesce(array_agg(id), '{}') into v_request_ids from requests where contact_id = p_contact_id;

  -- Échanges avec la personne (emails, WhatsApp).
  with deleted as (
    delete from conversation_messages m
    using conversations c
    where m.conversation_id = c.id
      and (c.contact_id = p_contact_id or c.request_id = any(v_request_ids))
    returning m.id
  ) select count(*) into v_messages from deleted;

  -- Réponses au formulaire de qualification.
  with deleted as (
    delete from form_responses fr
    using qualification_sessions s
    where fr.qualification_session_id = s.id and s.request_id = any(v_request_ids)
    returning fr.id
  ) select count(*) into v_responses from deleted;

  -- Analyses IA : elles résument le message et les réponses de la personne.
  with deleted as (
    delete from ai_analyses where request_id = any(v_request_ids) returning id
  ) select count(*) into v_analyses from deleted;

  -- Notifications internes : leur texte reprend le sujet de la demande.
  with deleted as (
    delete from notifications
    where related_entity_type = 'request' and related_entity_id = any(v_request_ids)
    returning id
  ) select count(*) into v_notifications from deleted;

  -- Journal : seuls les événements qui citent un message de la personne.
  with deleted as (
    delete from events
    where request_id = any(v_request_ids) and type = 'CONVERSATION_MESSAGE_RECEIVED'
    returning id
  ) select count(*) into v_events from deleted;

  -- Documents déposés sur ses demandes (cahier des charges, pièces...).
  with deleted as (
    delete from documents
    where entity_type = 'request' and entity_id = any(v_request_ids)
    returning storage_path
  ) select coalesce(array_agg(storage_path), '{}') into v_paths from deleted;

  update requests
  set subject = 'Demande anonymisée', original_message = null
  where id = any(v_request_ids);

  -- Description reprise du résumé de l'analyse IA à la création.
  update opportunities set description = null where request_id = any(v_request_ids);

  update contacts
  set first_name = 'Contact', last_name = 'anonymisé',
      email = null, phone = null, whatsapp = null, position = null,
      anonymized_at = now()
  where id = p_contact_id;

  v_result := jsonb_build_object(
    'requests', coalesce(array_length(v_request_ids, 1), 0),
    'messages', v_messages,
    'formResponses', v_responses,
    'aiAnalyses', v_analyses,
    'notifications', v_notifications,
    'events', v_events,
    'documents', coalesce(array_length(v_paths, 1), 0)
  );

  -- Preuve de l'effacement : qui, quand, quoi — sans aucune donnée effacée.
  insert into audit_logs (user_id, action, entity_type, entity_id, new_value, ip_address, user_agent)
  values (p_user_id, 'CONTACT_ANONYMIZED', 'contact', p_contact_id, v_result, p_ip, p_user_agent);

  return v_result || jsonb_build_object('storagePaths', to_jsonb(v_paths));
end;
$$;
