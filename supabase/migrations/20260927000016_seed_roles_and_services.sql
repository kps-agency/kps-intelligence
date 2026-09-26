-- Seed structurel minimal (pas des données de démo — celles-ci arrivent
-- en Phase 24). Sans ces lignes, aucun utilisateur ne peut être créé
-- (users.role_id est not null) et aucune request ne peut être classifiée.

insert into roles (key, label, description) values
  ('SUPER_ADMIN', 'Super administrateur', 'Accès complet à toutes les fonctionnalités et à la configuration système.'),
  ('ADMIN', 'Administrateur', 'Gestion opérationnelle complète de la plateforme.'),
  ('DIRECTOR', 'Directeur', 'Vision globale, validation des décisions commerciales importantes.'),
  ('SALES', 'Commercial', 'Gestion des demandes, clients et opportunités.'),
  ('PROJECT_MANAGER', 'Chef de projet', 'Gestion des missions et des tâches.'),
  ('TECHNICAL_MANAGER', 'Responsable technique', 'Validation technique, gestion du matching équipe.'),
  ('TEAM_MEMBER', 'Collaborateur', 'Exécution des tâches assignées.'),
  ('VIEWER', 'Observateur', 'Accès en lecture uniquement.');

insert into services (slug, name, description, status) values
  ('WEBSITE', 'Création de sites web', 'Conception et développement de sites web sur mesure.', 'ACTIVE'),
  ('ECOMMERCE', 'E-commerce', 'Boutiques en ligne et solutions de vente e-commerce.', 'ACTIVE'),
  ('SEO', 'SEO / Référencement', 'Optimisation du référencement naturel.', 'ACTIVE'),
  ('MAINTENANCE', 'Maintenance de sites', 'Maintenance, support et sécurité de sites existants.', 'ACTIVE'),
  ('BUSINESS_APPLICATION', 'Applications métier', 'Développement d''applications métier sur mesure.', 'ACTIVE'),
  ('MOBILE_APP', 'Applications mobiles', 'Développement d''applications mobiles.', 'COMING_SOON'),
  ('AI', 'Intelligence artificielle', 'Solutions et intégrations IA.', 'COMING_SOON'),
  ('AUTOMATION', 'Automatisation', 'Automatisation de processus métier.', 'COMING_SOON'),
  ('SOFTWARE', 'Logiciels SaaS', 'Conception de logiciels SaaS.', 'COMING_SOON'),
  ('CONSULTING', 'Consulting', 'Accompagnement et conseil digital.', 'COMING_SOON');
