-- ============================================================
-- CVISUAL ENTERPRISE & SUPER ADMIN SEED DATA
-- Fichier: sql/08_seed_cvisual.sql
-- Pou: laurorejeanclarens9@gmail.com
-- Entreprise: Cvisual (Création Visuelle, Design, Multimédia)
-- ============================================================

DO $$
DECLARE
  v_email text := 'laurorejeanclarens9@gmail.com';
  v_first_name text := 'Jean-Clarens';
  v_last_name text := 'Laurore';
  v_company_name text := 'Cvisual';
  v_auth_user_id uuid;
  v_enterprise_id uuid;
  v_type_id uuid;
  v_poste_pdg_id uuid;
BEGIN
  -- 1. Rekipere ID itilizatè a nan auth.users (ke w te deja kreye nan Supabase Dashboard la)
  SELECT id INTO v_auth_user_id FROM auth.users WHERE email = v_email;

  IF v_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'Itilizatè % la pa jwenn nan Supabase Authentication. Tanpri asire w ke w te kreye l nan Supabase Dashboard (Authentication -> Users) ak menm adrès imèl sa a!', v_email;
  END IF;

  -- Asire imèl la konfime pou w ka konekte dirèkteman san w pa bezwen tann konfimasyon imèl
  UPDATE auth.users
  SET email_confirmed_at = COALESCE(email_confirmed_at, now()),
      raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('first_name', v_first_name, 'last_name', v_last_name)
  WHERE id = v_auth_user_id;

  RAISE NOTICE 'Itilizatè jwenn nan auth.users avèk siksè: % (ID: %)', v_email, v_auth_user_id;

  -- 2. Jwenn poste PDG a
  SELECT id INTO v_poste_pdg_id FROM erp_postes WHERE name = 'PDG' LIMIT 1;
  IF v_poste_pdg_id IS NULL THEN
    INSERT INTO erp_postes (name, department, description, permissions)
    VALUES ('PDG', 'Direction', 'Président Directeur Général — accès total', '{"all": true}')
    RETURNING id INTO v_poste_pdg_id;
  END IF;

  -- 3. Kreye oswa mete ajou pwofil erp_users la
  INSERT INTO erp_users (id, email, first_name, last_name, role, poste_id, is_active, updated_at)
  VALUES (v_auth_user_id, v_email, v_first_name, v_last_name, 'pdg', v_poste_pdg_id, true, now())
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    role = 'pdg',
    poste_id = v_poste_pdg_id,
    is_active = true,
    updated_at = now();

  -- 4. Jwenn oswa kreye tip entreprise "services" oswa "visual"
  SELECT id INTO v_type_id FROM erp_enterprise_types WHERE code = 'services' LIMIT 1;
  IF v_type_id IS NULL THEN
    SELECT id INTO v_type_id FROM erp_enterprise_types LIMIT 1;
  END IF;

  -- 5. Kreye oswa mete ajou Entreprise Cvisual nan erp_enterprise_registrations
  SELECT id INTO v_enterprise_id FROM erp_enterprise_registrations WHERE company_email = v_email;

  IF v_enterprise_id IS NULL THEN
    INSERT INTO erp_enterprise_registrations (
      company_name,
      company_email,
      company_phone,
      company_address,
      company_city,
      company_country,
      company_website,
      enterprise_type_id,
      secteur,
      nombre_employes,
      description,
      pdg_first_name,
      pdg_last_name,
      pdg_email,
      pdg_phone,
      pdg_position,
      statut,
      cvisual_verified,
      cvisual_verified_at,
      cvisual_notes,
      subscription_plan,
      features_unlocked
    ) VALUES (
      v_company_name,
      v_email,
      '+509 3700-0000',
      'Port-au-Prince',
      'Port-au-Prince',
      'Haïti',
      'https://cvisualagency.org',
      v_type_id,
      'Création Visuelle, Design & Multimédia',
      12,
      'Entreprise spécialisée dans les arts visuels, design graphique, identité de marque, photographie, vidéo publicitaire et communication visuelle.',
      v_first_name,
      v_last_name,
      v_email,
      '+509 3700-0000',
      'PDG / Fondateur',
      'active',
      true,
      now(),
      'Compte entreprise officiel et validé par CVisual Platform',
      'premium',
      '{"all": true, "branding": true, "multimedia": true, "projets": true, "finances": true, "stock": true}'
    ) RETURNING id INTO v_enterprise_id;
    RAISE NOTICE 'Entreprise Cvisual anrejistre avèk siksè (ID: %)', v_enterprise_id;
  ELSE
    UPDATE erp_enterprise_registrations SET
      company_name = v_company_name,
      statut = 'active',
      cvisual_verified = true,
      cvisual_verified_at = now(),
      subscription_plan = 'premium',
      secteur = 'Création Visuelle, Design & Multimédia',
      description = 'Entreprise spécialisée dans les arts visuels, design graphique, identité de marque, photographie, vidéo publicitaire et communication visuelle.',
      features_unlocked = '{"all": true, "branding": true, "multimedia": true, "projets": true, "finances": true, "stock": true}'
    WHERE id = v_enterprise_id;
    RAISE NOTICE 'Entreprise Cvisual mete ajou (ID: %)', v_enterprise_id;
  END IF;

  -- 6. Lye itilizatè a ak entreprise la nan erp_user_enterprises
  INSERT INTO erp_user_enterprises (user_id, enterprise_id, role_in_enterprise, is_primary)
  VALUES (v_auth_user_id, v_enterprise_id, 'pdg', true)
  ON CONFLICT (user_id, enterprise_id) DO UPDATE SET
    role_in_enterprise = 'pdg',
    is_primary = true;

  -- 7. Mete itilizatè a kòm Super Admin nan erp_cvisual_admins
  INSERT INTO erp_cvisual_admins (
    user_id,
    admin_level,
    permissions,
    can_verify_enterprises,
    can_unlock_features
  ) VALUES (
    v_auth_user_id,
    'super',
    '{"all": true, "verify_enterprises": true, "unlock_features": true, "manage_subscriptions": true, "view_analytics": true}',
    true,
    true
  )
  ON CONFLICT (user_id) DO UPDATE SET
    admin_level = 'super',
    can_verify_enterprises = true,
    can_unlock_features = true,
    permissions = '{"all": true, "verify_enterprises": true, "unlock_features": true, "manage_subscriptions": true, "view_analytics": true}';

  -- 8. Mete ajou paramèt entreprise jeneral yo (erp_settings)
  UPDATE erp_settings SET
    company_name = v_company_name,
    company_email = v_email,
    company_phone = '+509 3700-0000',
    company_website = 'https://cvisualagency.org',
    sector = 'Création Visuelle, Design & Multimédia',
    default_currency = 'USD',
    enterprise_id = v_enterprise_id,
    is_enterprise_active = true,
    subscription_status = 'active',
    updated_at = now()
  WHERE id = (SELECT id FROM erp_settings LIMIT 1);

  IF NOT FOUND THEN
    INSERT INTO erp_settings (
      company_name,
      company_email,
      company_phone,
      company_website,
      sector,
      default_currency,
      enterprise_id,
      is_enterprise_active,
      subscription_status
    ) VALUES (
      v_company_name,
      v_email,
      '+509 3700-0000',
      'https://cvisualagency.org',
      'Création Visuelle, Design & Multimédia',
      'USD',
      v_enterprise_id,
      true,
      'active'
    );
  END IF;

  -- 9. Kèk modèl sèvis & pwodui vizyèl pou Cvisual (erp_produits)
  INSERT INTO erp_produits (code, designation, categorie, quantite, quantite_min, prix_achat, prix_vente, unite, description, is_active, created_by)
  VALUES
  ('VIS-001', 'Pack Identité Visuelle & Logo Pro', 'Design & Branding', 999, 5, 50, 350, 'projet', 'Création logo vectoriel, déclinaisons, charte graphique et palette de couleurs.', true, v_auth_user_id),
  ('VIS-002', 'Création Visuels Réseaux Sociaux (Pack 10)', 'Social Media', 999, 10, 30, 150, 'pack', '10 affiches publicitaires professionnelles pour Instagram/Facebook/LinkedIn.', true, v_auth_user_id),
  ('VIS-003', 'Production Vidéo & Spot Commercial', 'Production Multimédia', 999, 2, 100, 500, 'vidéo', 'Tournage, motion design, montage et étalonnage vidéo publicitaire en 4K.', true, v_auth_user_id),
  ('VIS-004', 'Séance Shooting Photo & Retouche Pro', 'Photographie', 999, 5, 40, 200, 'séance', 'Shooting professionnel en studio ou extérieur avec retouches haute définition.', true, v_auth_user_id),
  ('VIS-005', 'Impression Banderole & Affiche Grand Format', 'Impression & Signalétique', 50, 10, 15, 45, 'pièce', 'Impression sur vinyle haute qualité, résistant aux intempéries.', true, v_auth_user_id)
  ON CONFLICT (code) DO NOTHING;

  -- 10. Kèk kliyan modèl pou Cvisual (erp_clients)
  INSERT INTO erp_clients (nom, prenom, company, email, phone, type, notes, created_by)
  VALUES
  ('Global Tech HT', 'Patrick', 'Global Tech S.A.', 'contact@globaltech.ht', '+509 3811-2233', 'entreprise', 'Contrat mensuel création visuels réseaux sociaux', v_auth_user_id),
  ('Horizon Hotel & Resort', 'Marie', 'Horizon Group', 'marketing@horizonhotel.com', '+509 3455-6677', 'entreprise', 'Refonte identité visuelle et shooting photo', v_auth_user_id),
  ('Boutique Éclat', 'Sophia', 'Éclat Fashion', 'eclat.fashion@gmail.com', '+509 3122-3344', 'particulier', 'Catalogue produits et spots vidéo promos', v_auth_user_id)
  ON CONFLICT DO NOTHING;

  RAISE NOTICE '=========================================================';
  RAISE NOTICE 'Konfigirasyon fini avèk siksè pou Cvisual!';
  RAISE NOTICE 'Ou ka konekte dirèkteman ak modpas ou te chwazi a sou Supabase!';
  RAISE NOTICE '=========================================================';
END $$;
