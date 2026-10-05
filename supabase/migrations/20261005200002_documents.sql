-- Phase 20 (Documents, section 54). La table `documents` existe déjà
-- (association polymorphe, DATABASE.md §11) ; le fichier lui-même vit dans
-- le bucket privé `documents` de Supabase Storage, créé au démarrage de
-- l'API (voir DocumentsService).

create index idx_documents_uploaded_by on documents(uploaded_by);

insert into permissions (key, description) values
  ('documents.read', 'Consulter et télécharger les documents des objets auxquels on a accès.'),
  ('documents.manage', 'Déposer des documents et supprimer ceux que l''on a déposés.');

insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r join permissions p on p.key = 'documents.read';

-- Tous les rôles déposent, sauf l'observateur (lecture seule par nature).
insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r join permissions p on p.key = 'documents.manage'
where r.key <> 'VIEWER';
