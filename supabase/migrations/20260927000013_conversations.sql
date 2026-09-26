-- Conversations multi-canal (email/WhatsApp/système), avec idempotence
-- sur l'identifiant de message externe (section 17/63 du prompt).

create table conversations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete set null,
  contact_id uuid references contacts(id) on delete set null,
  request_id uuid references requests(id) on delete set null,
  opportunity_id uuid references opportunities(id) on delete set null,
  mission_id uuid references missions(id) on delete set null,
  channel conversation_channel not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_conversations_updated_at
  before update on conversations
  for each row execute function set_updated_at();

create table conversation_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  direction message_direction not null,
  channel conversation_channel not null,
  from_address text,
  to_address text,
  subject text,
  body text not null,
  external_message_id text,
  external_thread_id text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

-- Idempotence : un même message externe (Message-Id email, id WhatsApp)
-- ne peut jamais être inséré deux fois. NULL autorisé pour les messages
-- système sans identifiant externe.
create unique index uniq_conversation_messages_external_id
  on conversation_messages(external_message_id) where external_message_id is not null;

create index idx_conversation_messages_conversation_id on conversation_messages(conversation_id);
