-- Documents (Supabase Storage). Association polymorphe assumée sans FK
-- native (voir DATABASE.md §17, point 3) — intégrité vérifiée par
-- DocumentsService avant tout insert.

create table documents (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  storage_path text not null,
  mime_type text not null,
  size bigint not null,
  entity_type text not null,
  entity_id uuid not null,
  uploaded_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index idx_documents_entity on documents(entity_type, entity_id);
