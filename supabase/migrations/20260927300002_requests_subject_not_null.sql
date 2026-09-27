-- La migration initiale (20260927000005) a omis `not null` sur subject
-- alors que c'est un champ obligatoire partout où une request est créée
-- (formulaire manuel, et bientôt email/WhatsApp qui dérivent toujours un
-- sujet). La contrainte applicative (CreateRequestDto) existait déjà ;
-- celle-ci l'aligne côté base. Aucune ligne existante à ce jour.
alter table requests alter column subject set not null;
