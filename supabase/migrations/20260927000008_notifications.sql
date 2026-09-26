-- Notifications : templates, préférences utilisateur, notifications émises.

create table notification_templates (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  channel notification_channel not null,
  language text not null,
  subject text,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (key, channel, language)
);

create trigger trg_notification_templates_updated_at
  before update on notification_templates
  for each row execute function set_updated_at();

create table notification_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  event_type event_type not null,
  channel notification_channel not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, event_type, channel)
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  event_type event_type not null,
  channel notification_channel not null,
  title text not null,
  body text not null,
  related_entity_type text,
  related_entity_id uuid,
  is_read boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_notifications_user_unread on notifications(user_id, is_read);
