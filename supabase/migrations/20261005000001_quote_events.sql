-- Phase 18 (Devis, section 51). Fichier séparé : une valeur d'enum ajoutée
-- n'est utilisable qu'après le commit de sa transaction.
-- Un devis déjà envoyé repasse en brouillon pour être corrigé : étape
-- absente du catalogue, nécessaire pour que l'historique reste complet.
alter type event_type add value 'QUOTE_REVISED';
