-- Phase 17 (Opportunités, section 50) : événements du pipeline commercial.
-- Fichier séparé : une valeur d'enum ajoutée n'est utilisable qu'après le
-- commit de sa transaction, or la migration suivante seede des workflows
-- déclenchés par ces événements.
alter type event_type add value 'OPPORTUNITY_CREATED';
alter type event_type add value 'OPPORTUNITY_STAGE_CHANGED';
alter type event_type add value 'OPPORTUNITY_WON';
alter type event_type add value 'OPPORTUNITY_LOST';
