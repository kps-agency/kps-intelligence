-- Phase 9 : les 5 formulaires de qualification concrets (sections 25-29
-- du prompt), construits avec le form builder générique (forms/
-- form_steps/form_fields) — jamais codés en dur côté frontend. Publiés
-- directement (PUBLISHED) : ce sont les formulaires réels du catalogue,
-- pas des brouillons.
--
-- Le formulaire WEBSITE reprend aussi l'exemple de logique conditionnelle
-- de la section 30 ("Avez-vous déjà un site ? OUI → URL, NON → objectif").

do $$
declare
  v_form_id uuid;
  v_step_id uuid;
begin
  -- ========== WEBSITE (section 25) ==========
  insert into forms (name, slug, description, status, service_id)
  values (
    'Qualification — Site web',
    'website-qualification',
    'Cerner le besoin d''un prospect qui souhaite un nouveau site ou refondre l''existant.',
    'PUBLISHED',
    (select id from services where slug = 'WEBSITE')
  )
  returning id into v_form_id;

  insert into form_steps (form_id, title, order_index) values (v_form_id, 'Votre projet', 0)
  returning id into v_step_id;
  insert into form_fields (form_step_id, key, label, type, required, options, conditional_logic, order_index) values
    (v_step_id, 'siteType', 'Quel type de site souhaitez-vous ?', 'SELECT', true,
      '[{"value":"VITRINE","label":"Site vitrine"},{"value":"BLOG","label":"Blog"},{"value":"PORTFOLIO","label":"Portfolio"},{"value":"INSTITUTIONNEL","label":"Site institutionnel"},{"value":"LANDING","label":"Landing page"},{"value":"AUTRE","label":"Autre"}]'::jsonb,
      null, 0),
    (v_step_id, 'hasExistingSite', 'Avez-vous déjà un site web ?', 'RADIO', true,
      '[{"value":"OUI","label":"Oui"},{"value":"NON","label":"Non"}]'::jsonb, null, 1),
    (v_step_id, 'existingSiteUrl', 'Quelle est l''URL de votre site actuel ?', 'URL', false, null,
      '{"field":"hasExistingSite","equals":"OUI"}'::jsonb, 2),
    (v_step_id, 'objective', 'Quel est l''objectif principal de ce nouveau site ?', 'TEXTAREA', false, null,
      '{"field":"hasExistingSite","equals":"NON"}'::jsonb, 3);

  insert into form_steps (form_id, title, order_index) values (v_form_id, 'Contenu & pages', 1)
  returning id into v_step_id;
  insert into form_fields (form_step_id, key, label, type, required, options, order_index) values
    (v_step_id, 'pageCount', 'Combien de pages estimez-vous nécessaires ?', 'NUMBER', true, null, 0),
    (v_step_id, 'contentReady', 'Le contenu (textes, images) est-il déjà prêt ?', 'RADIO', false,
      '[{"value":"OUI","label":"Oui, tout est prêt"},{"value":"EN_COURS","label":"En cours de préparation"},{"value":"NON","label":"Non, à créer"}]'::jsonb, 1),
    (v_step_id, 'brandIdentity', 'Avez-vous une identité visuelle (logo, charte graphique) ?', 'RADIO', false,
      '[{"value":"COMPLETE","label":"Oui, complète"},{"value":"PARTIELLE","label":"Partielle"},{"value":"AUCUNE","label":"Aucune, à créer"}]'::jsonb, 2);

  insert into form_steps (form_id, title, order_index) values (v_form_id, 'Fonctionnalités & références', 2)
  returning id into v_step_id;
  insert into form_fields (form_step_id, key, label, type, required, order_index) values
    (v_step_id, 'features', 'Quelles fonctionnalités souhaitez-vous (formulaire, réservation, multilingue...) ?', 'TEXTAREA', false, 0),
    (v_step_id, 'references', 'Avez-vous des sites de référence qui vous plaisent ?', 'TEXTAREA', false, 1);

  insert into form_steps (form_id, title, order_index) values (v_form_id, 'Budget & délai', 3)
  returning id into v_step_id;
  insert into form_fields (form_step_id, key, label, type, required, order_index) values
    (v_step_id, 'budget', 'Quel budget envisagez-vous ?', 'CURRENCY', false, 0),
    (v_step_id, 'deadline', 'Quelle échéance souhaitez-vous ?', 'DATE', false, 1);

  update services set qualification_form_id = v_form_id where slug = 'WEBSITE';

  -- ========== ECOMMERCE (section 26) ==========
  insert into forms (name, slug, description, status, service_id)
  values (
    'Qualification — E-commerce',
    'ecommerce-qualification',
    'Cerner le besoin d''un prospect qui souhaite créer ou refondre une boutique en ligne.',
    'PUBLISHED',
    (select id from services where slug = 'ECOMMERCE')
  )
  returning id into v_form_id;

  insert into form_steps (form_id, title, order_index) values (v_form_id, 'Catalogue', 0)
  returning id into v_step_id;
  insert into form_fields (form_step_id, key, label, type, required, order_index) values
    (v_step_id, 'productCount', 'Combien de produits souhaitez-vous vendre ?', 'NUMBER', true, 0),
    (v_step_id, 'categories', 'Quelles sont vos catégories de produits ?', 'TEXTAREA', false, 1),
    (v_step_id, 'countries', 'Dans quel(s) pays souhaitez-vous vendre ?', 'TEXT', false, 2);

  insert into form_steps (form_id, title, order_index) values (v_form_id, 'Paiement & livraison', 1)
  returning id into v_step_id;
  insert into form_fields (form_step_id, key, label, type, required, options, order_index) values
    (v_step_id, 'paymentMethods', 'Quels moyens de paiement souhaitez-vous proposer ?', 'MULTI_SELECT', false,
      '[{"value":"CARD","label":"Carte bancaire"},{"value":"PAYPAL","label":"PayPal"},{"value":"BANK_TRANSFER","label":"Virement"},{"value":"TWINT","label":"TWINT"},{"value":"OTHER","label":"Autre"}]'::jsonb, 0),
    (v_step_id, 'stockManagement', 'Avez-vous besoin d''une gestion des stocks ?', 'RADIO', false,
      '[{"value":"OUI","label":"Oui"},{"value":"NON","label":"Non"}]'::jsonb, 1);
  insert into form_fields (form_step_id, key, label, type, required, order_index) values
    (v_step_id, 'shipping', 'Comment souhaitez-vous gérer la livraison ?', 'TEXTAREA', false, 2);

  insert into form_steps (form_id, title, order_index) values (v_form_id, 'Fonctionnalités avancées', 2)
  returning id into v_step_id;
  insert into form_fields (form_step_id, key, label, type, required, options, order_index) values
    (v_step_id, 'customerAccounts', 'Vos clients doivent-ils pouvoir créer un compte ?', 'RADIO', false,
      '[{"value":"OUI","label":"Oui"},{"value":"NON","label":"Non"}]'::jsonb, 0),
    (v_step_id, 'coupons', 'Avez-vous besoin de codes promo / coupons ?', 'RADIO', false,
      '[{"value":"OUI","label":"Oui"},{"value":"NON","label":"Non"}]'::jsonb, 1),
    (v_step_id, 'marketplace', 'Souhaitez-vous être présent sur des marketplaces ?', 'MULTI_SELECT', false,
      '[{"value":"AMAZON","label":"Amazon"},{"value":"GOOGLE_SHOPPING","label":"Google Shopping"},{"value":"NONE","label":"Aucune"},{"value":"OTHER","label":"Autre"}]'::jsonb, 2);
  insert into form_fields (form_step_id, key, label, type, required, order_index) values
    (v_step_id, 'integrations', 'Des intégrations spécifiques sont-elles nécessaires (compta, CRM, stock) ?', 'TEXTAREA', false, 3);

  insert into form_steps (form_id, title, order_index) values (v_form_id, 'Budget & délai', 3)
  returning id into v_step_id;
  insert into form_fields (form_step_id, key, label, type, required, order_index) values
    (v_step_id, 'budget', 'Quel budget envisagez-vous ?', 'CURRENCY', false, 0),
    (v_step_id, 'deadline', 'Quelle échéance souhaitez-vous ?', 'DATE', false, 1);

  update services set qualification_form_id = v_form_id where slug = 'ECOMMERCE';

  -- ========== SEO (section 27) ==========
  insert into forms (name, slug, description, status, service_id)
  values (
    'Qualification — SEO',
    'seo-qualification',
    'Cerner le besoin d''un prospect qui souhaite améliorer son référencement naturel.',
    'PUBLISHED',
    (select id from services where slug = 'SEO')
  )
  returning id into v_form_id;

  insert into form_steps (form_id, title, order_index) values (v_form_id, 'Votre site', 0)
  returning id into v_step_id;
  insert into form_fields (form_step_id, key, label, type, required, order_index) values
    (v_step_id, 'siteUrl', 'Quelle est l''URL de votre site ?', 'URL', true, 0),
    (v_step_id, 'countries', 'Dans quel(s) pays visez-vous du trafic ?', 'TEXT', false, 1),
    (v_step_id, 'languages', 'Dans quelle(s) langue(s) votre site est-il disponible ?', 'TEXT', false, 2);

  insert into form_steps (form_id, title, order_index) values (v_form_id, 'Objectifs & mots-clés', 1)
  returning id into v_step_id;
  insert into form_fields (form_step_id, key, label, type, required, order_index) values
    (v_step_id, 'objectives', 'Quels sont vos objectifs SEO (trafic, ventes, notoriété...) ?', 'TEXTAREA', false, 0),
    (v_step_id, 'keywords', 'Sur quels mots-clés souhaitez-vous être visible ?', 'TEXTAREA', false, 1),
    (v_step_id, 'currentTraffic', 'Quel est votre trafic actuel (estimation) ?', 'TEXT', false, 2),
    (v_step_id, 'competitors', 'Qui sont vos principaux concurrents en ligne ?', 'TEXTAREA', false, 3);

  insert into form_steps (form_id, title, order_index) values (v_form_id, 'Outils & historique', 2)
  returning id into v_step_id;
  insert into form_fields (form_step_id, key, label, type, required, options, order_index) values
    (v_step_id, 'hasSearchConsole', 'Utilisez-vous déjà Google Search Console ?', 'RADIO', false,
      '[{"value":"OUI","label":"Oui"},{"value":"NON","label":"Non"}]'::jsonb, 0),
    (v_step_id, 'hasAnalytics', 'Utilisez-vous déjà un outil d''analytics (Google Analytics...) ?', 'RADIO', false,
      '[{"value":"OUI","label":"Oui"},{"value":"NON","label":"Non"}]'::jsonb, 1);
  insert into form_fields (form_step_id, key, label, type, required, order_index) values
    (v_step_id, 'seoHistory', 'Avez-vous déjà fait du SEO ou travaillé avec une agence ?', 'TEXTAREA', false, 2);

  insert into form_steps (form_id, title, order_index) values (v_form_id, 'Budget', 3)
  returning id into v_step_id;
  insert into form_fields (form_step_id, key, label, type, required, order_index) values
    (v_step_id, 'monthlyBudget', 'Quel budget mensuel envisagez-vous ?', 'CURRENCY', false, 0);

  update services set qualification_form_id = v_form_id where slug = 'SEO';

  -- ========== MAINTENANCE (section 28) ==========
  insert into forms (name, slug, description, status, service_id)
  values (
    'Qualification — Maintenance',
    'maintenance-qualification',
    'Cerner le besoin d''un prospect qui souhaite un contrat de maintenance ou une intervention.',
    'PUBLISHED',
    (select id from services where slug = 'MAINTENANCE')
  )
  returning id into v_form_id;

  insert into form_steps (form_id, title, order_index) values (v_form_id, 'Votre site', 0)
  returning id into v_step_id;
  insert into form_fields (form_step_id, key, label, type, required, order_index) values
    (v_step_id, 'siteUrl', 'Quelle est l''URL du site concerné ?', 'URL', true, 0),
    (v_step_id, 'technology', 'Sur quelle technologie est-il construit (si vous le savez) ?', 'TEXT', false, 1),
    (v_step_id, 'cms', 'Quel CMS utilisez-vous (WordPress, autre) ?', 'TEXT', false, 2),
    (v_step_id, 'host', 'Chez quel hébergeur est-il hébergé ?', 'TEXT', false, 3);

  insert into form_steps (form_id, title, order_index) values (v_form_id, 'Problème & besoin', 1)
  returning id into v_step_id;
  insert into form_fields (form_step_id, key, label, type, required, options, order_index) values
    (v_step_id, 'issue', 'Décrivez le problème ou le besoin de maintenance.', 'TEXTAREA', true, null, 0),
    (v_step_id, 'frequency', 'À quelle fréquence pensez-vous avoir besoin d''intervention ?', 'SELECT', false,
      '[{"value":"PONCTUEL","label":"Ponctuel"},{"value":"MENSUEL","label":"Mensuel"},{"value":"TRIMESTRIEL","label":"Trimestriel"},{"value":"AUTRE","label":"Autre"}]'::jsonb, 1),
    (v_step_id, 'urgency', 'Quel est le niveau d''urgence ?', 'RADIO', false,
      '[{"value":"FAIBLE","label":"Faible"},{"value":"MOYENNE","label":"Moyenne"},{"value":"HAUTE","label":"Haute"},{"value":"URGENTE","label":"Urgente"}]'::jsonb, 2);

  insert into form_steps (form_id, title, order_index) values (v_form_id, 'Ce qui est inclus', 2)
  returning id into v_step_id;
  insert into form_fields (form_step_id, key, label, type, required, options, order_index) values
    (v_step_id, 'security', 'Souhaitez-vous un suivi de la sécurité (failles, correctifs) ?', 'RADIO', false,
      '[{"value":"OUI","label":"Oui"},{"value":"NON","label":"Non"}]'::jsonb, 0),
    (v_step_id, 'backups', 'Souhaitez-vous des sauvegardes régulières ?', 'RADIO', false,
      '[{"value":"OUI","label":"Oui"},{"value":"NON","label":"Non"}]'::jsonb, 1),
    (v_step_id, 'performance', 'Souhaitez-vous un suivi des performances ?', 'RADIO', false,
      '[{"value":"OUI","label":"Oui"},{"value":"NON","label":"Non"}]'::jsonb, 2),
    (v_step_id, 'updates', 'Souhaitez-vous les mises à jour techniques (CMS, plugins) ?', 'RADIO', false,
      '[{"value":"OUI","label":"Oui"},{"value":"NON","label":"Non"}]'::jsonb, 3);

  insert into form_steps (form_id, title, order_index) values (v_form_id, 'Formule', 3)
  returning id into v_step_id;
  insert into form_fields (form_step_id, key, label, type, required, options, order_index) values
    (v_step_id, 'engagementType', 'Préférez-vous une intervention ponctuelle ou un abonnement ?', 'RADIO', false,
      '[{"value":"PONCTUEL","label":"Ponctuel"},{"value":"ABONNEMENT","label":"Abonnement"}]'::jsonb, 0);

  update services set qualification_form_id = v_form_id where slug = 'MAINTENANCE';

  -- ========== BUSINESS_APPLICATION (section 29) ==========
  insert into forms (name, slug, description, status, service_id)
  values (
    'Qualification — Application métier',
    'business-application-qualification',
    'Cerner le besoin d''un prospect qui souhaite une application métier sur mesure.',
    'PUBLISHED',
    (select id from services where slug = 'BUSINESS_APPLICATION')
  )
  returning id into v_form_id;

  insert into form_steps (form_id, title, order_index) values (v_form_id, 'Votre besoin', 0)
  returning id into v_step_id;
  insert into form_fields (form_step_id, key, label, type, required, order_index) values
    (v_step_id, 'businessProblem', 'Quel problème métier souhaitez-vous résoudre ?', 'TEXTAREA', true, 0),
    (v_step_id, 'currentProcess', 'Comment gérez-vous ce processus aujourd''hui ?', 'TEXTAREA', false, 1);

  insert into form_steps (form_id, title, order_index) values (v_form_id, 'Utilisateurs', 1)
  returning id into v_step_id;
  insert into form_fields (form_step_id, key, label, type, required, order_index) values
    (v_step_id, 'users', 'Qui utilisera cette application (équipes, rôles) ?', 'TEXTAREA', false, 0),
    (v_step_id, 'userCount', 'Combien d''utilisateurs environ ?', 'NUMBER', false, 1);

  insert into form_steps (form_id, title, order_index) values (v_form_id, 'Existant', 2)
  returning id into v_step_id;
  insert into form_fields (form_step_id, key, label, type, required, options, order_index) values
    (v_step_id, 'usesExcel', 'Utilisez-vous actuellement Excel pour ce processus ?', 'RADIO', false,
      '[{"value":"OUI","label":"Oui"},{"value":"NON","label":"Non"}]'::jsonb, 0);
  insert into form_fields (form_step_id, key, label, type, required, order_index) values
    (v_step_id, 'currentTools', 'Quels outils utilisez-vous actuellement ?', 'TEXTAREA', false, 1),
    (v_step_id, 'existingSoftware', 'Utilisez-vous déjà un logiciel dédié ? Lequel ?', 'TEXT', false, 2),
    (v_step_id, 'documents', 'Avez-vous des documents décrivant le processus actuel ?', 'TEXTAREA', false, 3);

  insert into form_steps (form_id, title, order_index) values (v_form_id, 'Fonctionnalités', 3)
  returning id into v_step_id;
  insert into form_fields (form_step_id, key, label, type, required, options, order_index) values
    (v_step_id, 'platform', 'Web, mobile, ou les deux ?', 'RADIO', false,
      '[{"value":"WEB","label":"Web"},{"value":"MOBILE","label":"Mobile"},{"value":"BOTH","label":"Les deux"}]'::jsonb, 0),
    (v_step_id, 'reporting', 'Avez-vous besoin de rapports / tableaux de bord ?', 'RADIO', false,
      '[{"value":"OUI","label":"Oui"},{"value":"NON","label":"Non"}]'::jsonb, 1);
  insert into form_fields (form_step_id, key, label, type, required, order_index) values
    (v_step_id, 'features', 'Quelles fonctionnalités sont indispensables ?', 'TEXTAREA', false, 2),
    (v_step_id, 'integrations', 'Des intégrations avec d''autres outils sont-elles nécessaires ?', 'TEXTAREA', false, 3);

  insert into form_steps (form_id, title, order_index) values (v_form_id, 'Budget & délai', 4)
  returning id into v_step_id;
  insert into form_fields (form_step_id, key, label, type, required, order_index) values
    (v_step_id, 'budget', 'Quel budget envisagez-vous ?', 'CURRENCY', false, 0),
    (v_step_id, 'deadline', 'Quelle échéance souhaitez-vous ?', 'DATE', false, 1);

  update services set qualification_form_id = v_form_id where slug = 'BUSINESS_APPLICATION';
end $$;
