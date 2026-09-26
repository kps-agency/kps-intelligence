-- Extensions
create extension if not exists pgcrypto;

-- Fonction générique de maintenance de updated_at, réutilisée par toutes
-- les tables mutables des migrations suivantes.
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Enums métier — alignés 1:1 sur packages/types/src/enums.ts.
-- Toute évolution doit être faite dans les deux endroits en même temps.

create type user_status as enum ('ACTIVE', 'INACTIVE', 'INVITED', 'SUSPENDED');

create type client_status as enum ('PROSPECT', 'ACTIVE', 'INACTIVE', 'CHURNED');

create type service_status as enum ('ACTIVE', 'INACTIVE', 'COMING_SOON');

create type service_slug as enum (
  'WEBSITE', 'ECOMMERCE', 'SEO', 'MAINTENANCE', 'BUSINESS_APPLICATION',
  'MOBILE_APP', 'AI', 'AUTOMATION', 'SOFTWARE', 'CONSULTING'
);

create type request_source as enum ('WEBSITE', 'EMAIL', 'WHATSAPP', 'API', 'MANUAL');

create type request_status as enum (
  'NEW', 'RECEIVED', 'AI_ANALYZING', 'ANALYZED', 'FORM_PENDING', 'FORM_SENT',
  'WAITING_CLIENT', 'RESPONSE_RECEIVED', 'QUALIFYING', 'QUALIFIED', 'UNQUALIFIED',
  'MATCHING', 'ASSIGNED', 'QUOTE_PENDING', 'QUOTE_SENT', 'NEGOTIATION', 'WON', 'LOST',
  'CONVERTED_TO_MISSION', 'CLOSED'
);

create type priority_level as enum ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

create type form_status as enum ('DRAFT', 'PUBLISHED', 'ARCHIVED');

create type form_field_type as enum (
  'TEXT', 'TEXTAREA', 'EMAIL', 'PHONE', 'NUMBER', 'SELECT', 'MULTI_SELECT',
  'RADIO', 'CHECKBOX', 'DATE', 'URL', 'FILE', 'CURRENCY', 'RANGE'
);

create type qualification_session_status as enum (
  'CREATED', 'SENT', 'OPENED', 'IN_PROGRESS', 'COMPLETED', 'EXPIRED', 'CANCELLED'
);

create type event_type as enum (
  'REQUEST_RECEIVED', 'REQUEST_ANALYSIS_STARTED', 'REQUEST_ANALYSIS_COMPLETED', 'SERVICE_DETECTED',
  'QUALIFICATION_REQUIRED', 'QUALIFICATION_LINK_CREATED', 'QUALIFICATION_LINK_SENT', 'QUALIFICATION_LINK_OPENED',
  'FORM_STARTED', 'FORM_PROGRESS_UPDATED', 'FORM_COMPLETED', 'QUALIFICATION_ANALYSIS_STARTED',
  'QUALIFICATION_ANALYSIS_COMPLETED', 'REQUEST_QUALIFIED', 'REQUEST_UNQUALIFIED', 'MATCHING_STARTED',
  'MATCHING_COMPLETED', 'TEAM_MEMBER_RECOMMENDED', 'TEAM_MEMBER_ASSIGNED', 'QUOTE_REQUIRED', 'QUOTE_CREATED',
  'QUOTE_SENT', 'QUOTE_ACCEPTED', 'QUOTE_REJECTED', 'MISSION_CREATED', 'MISSION_ASSIGNED',
  'MISSION_STATUS_CHANGED', 'MISSION_BLOCKED', 'REQUEST_CLOSED', 'AI_ANALYSIS_FAILED'
);

create type event_actor_type as enum ('SYSTEM', 'AI', 'USER', 'AUTOMATION');

create type workflow_run_status as enum ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

create type notification_channel as enum ('IN_APP', 'EMAIL', 'WHATSAPP');

create type availability_status as enum ('AVAILABLE', 'BUSY', 'UNAVAILABLE');

create type opportunity_status as enum (
  'NEW', 'QUALIFIED', 'PROPOSAL_REQUIRED', 'PROPOSAL_SENT', 'NEGOTIATION', 'WON', 'LOST'
);

create type quote_status as enum ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED');

create type mission_status as enum ('PLANNED', 'IN_PROGRESS', 'BLOCKED', 'ON_HOLD', 'COMPLETED', 'CANCELLED');

create type task_status as enum ('TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED');

create type conversation_channel as enum ('EMAIL', 'WHATSAPP', 'SYSTEM');

create type message_direction as enum ('INBOUND', 'OUTBOUND');
