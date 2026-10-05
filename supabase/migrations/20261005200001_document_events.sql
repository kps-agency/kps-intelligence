-- Phase 20 (Documents, section 54). Fichier séparé : une valeur d'enum
-- ajoutée n'est utilisable qu'après le commit de sa transaction.
alter type event_type add value 'DOCUMENT_UPLOADED';
alter type event_type add value 'DOCUMENT_DELETED';
