-- Demandes reçues des sites web (formulaires akoraweb...) : idempotence de
-- la création de demande sur l'identifiant de soumission côté site. Le site
-- peut renvoyer la même soumission (timeout, nouvel essai) : une seule
-- demande doit en résulter (section 63).
--
-- Valeur : "<site>:<type de formulaire>:<id côté site>", unique entre sites
-- et entre formulaires d'un même site.

alter table requests
  add column website_submission_id text;

create unique index idx_requests_website_submission_id
  on requests(website_submission_id)
  where website_submission_id is not null;
