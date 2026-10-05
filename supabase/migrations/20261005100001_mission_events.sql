-- Phase 19 (Missions & tâches, sections 52-53). Fichier séparé : une
-- valeur d'enum ajoutée n'est utilisable qu'après le commit de sa
-- transaction.
alter type event_type add value 'TASK_CREATED';
alter type event_type add value 'TASK_ASSIGNED';
alter type event_type add value 'TASK_STATUS_CHANGED';
