-- ============================================================
-- SEED — HAITI REH-CARE
-- Centre de physiothérapie, massothérapie, orthèses & prothèses,
-- vente de matériel orthopédique.
-- Run AFTER: 09_fixes.sql
-- Idempotent: ka egzekite plizyè fwa san doublon.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Type d'entreprise: physiotherapy
-- ------------------------------------------------------------
INSERT INTO erp_enterprise_types (code, name, description, icon, features) VALUES
('physiotherapy', 'Centre de Physiothérapie',
 'Physiothérapie, massothérapie, orthèses, prothèses et matériel orthopédique',
 'activity',
 '{"modules": ["patients","rdv","seances","services","protheses","ortheses","materiel_orthopedique","stock","catalogue","ventes","caisse","facturation","finances","employes","presences"], "interface": "medical"}')
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  features = EXCLUDED.features;

-- ------------------------------------------------------------
-- 2. Modules métier spécifiques au centre
--    (kòd -> tab erp_<code> pou module.html)
-- ------------------------------------------------------------
INSERT INTO erp_modules (code, name, category, description, icon, default_permissions) VALUES
('seances',              'Séances de soin',       'Clinique', 'Séances de physiothérapie et massothérapie', 'activity',       '{"view": true, "create": true, "edit": true}'),
('services',             'Services & Tarifs',     'Clinique', 'Catalogue des soins et tarifs',              'clipboard-list', '{"view": true, "create": true, "edit": true}'),
('protheses',            'Prothèses',             'Clinique', 'Évaluation, fabrication et pose de prothèses','bone',          '{"view": true, "create": true, "edit": true}'),
('ortheses',             'Orthèses',              'Clinique', 'Évaluation et pose d''orthèses',             'footprints',     '{"view": true, "create": true, "edit": true}'),
('materiel_orthopedique','Matériel Orthopédique', 'Clinique', 'Achat et vente de matériel orthopédique',    'package-plus',   '{"view": true, "create": true, "edit": true}')
ON CONFLICT (code) DO NOTHING;

-- ------------------------------------------------------------
-- 3. Tables cliniques (convention: module <code> -> erp_<code>)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS erp_patients (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  enterprise_id uuid REFERENCES erp_enterprise_registrations(id),
  nom text NOT NULL,
  prenom text,
  date_naissance date,
  sexe text CHECK (sexe IN ('M','F','autre')),
  phone text,
  email text,
  adresse text,
  diagnostic text,
  praticien_id uuid REFERENCES auth.users(id),
  statut text DEFAULT 'actif' CHECK (statut IN ('actif','en_suivi','termine')),
  notes text,
  is_active boolean DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS erp_services (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  enterprise_id uuid REFERENCES erp_enterprise_registrations(id),
  code text,
  name text NOT NULL,
  category text,
  description text,
  price numeric DEFAULT 0,
  devise text DEFAULT 'HTG',
  duration_min int,
  is_active boolean DEFAULT true,
  is_public boolean DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(enterprise_id, code)
);

CREATE TABLE IF NOT EXISTS erp_rdv (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  enterprise_id uuid REFERENCES erp_enterprise_registrations(id),
  patient_id uuid REFERENCES erp_patients(id),
  patient_nom text NOT NULL,
  patient_prenom text,
  patient_phone text,
  patient_email text,
  service_id uuid REFERENCES erp_services(id),
  praticien_id uuid REFERENCES auth.users(id),
  date_rdv date NOT NULL,
  heure_rdv time,
  statut text DEFAULT 'en_attente' CHECK (statut IN ('en_attente','confirme','annule','termine','absent')),
  motif text,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS erp_seances (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  enterprise_id uuid REFERENCES erp_enterprise_registrations(id),
  patient_id uuid REFERENCES erp_patients(id),
  service_id uuid REFERENCES erp_services(id),
  praticien_id uuid REFERENCES auth.users(id),
  date_seance date NOT NULL DEFAULT CURRENT_DATE,
  heure time,
  duree_min int DEFAULT 45,
  type_seance text,
  statut text DEFAULT 'prevue' CHECK (statut IN ('prevue','realisee','annulee')),
  observations text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS erp_protheses (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  enterprise_id uuid REFERENCES erp_enterprise_registrations(id),
  patient_id uuid REFERENCES erp_patients(id),
  type_prothese text NOT NULL,
  membre text,
  etape text DEFAULT 'evaluation'
    CHECK (etape IN ('evaluation','moulage','fabrication','essayage','livraison','suivi')),
  cout numeric DEFAULT 0,
  statut text DEFAULT 'en_cours' CHECK (statut IN ('en_cours','livre','annule')),
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS erp_ortheses (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  enterprise_id uuid REFERENCES erp_enterprise_registrations(id),
  patient_id uuid REFERENCES erp_patients(id),
  type_orthese text NOT NULL,
  zone text,
  etape text DEFAULT 'evaluation'
    CHECK (etape IN ('evaluation','moulage','fabrication','essayage','livraison','suivi')),
  cout numeric DEFAULT 0,
  statut text DEFAULT 'en_cours' CHECK (statut IN ('en_cours','livre','annule')),
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Produits visibles dans le catalogue public
ALTER TABLE erp_produits
  ADD COLUMN IF NOT EXISTS is_public boolean DEFAULT false;

-- Triggers updated_at
DROP TRIGGER IF EXISTS trg_patients_ts ON erp_patients;
CREATE TRIGGER trg_patients_ts BEFORE UPDATE ON erp_patients
  FOR EACH ROW EXECUTE FUNCTION erp_update_ts();
DROP TRIGGER IF EXISTS trg_services_ts ON erp_services;
CREATE TRIGGER trg_services_ts BEFORE UPDATE ON erp_services
  FOR EACH ROW EXECUTE FUNCTION erp_update_ts();
DROP TRIGGER IF EXISTS trg_rdv_ts ON erp_rdv;
CREATE TRIGGER trg_rdv_ts BEFORE UPDATE ON erp_rdv
  FOR EACH ROW EXECUTE FUNCTION erp_update_ts();
DROP TRIGGER IF EXISTS trg_protheses_ts ON erp_protheses;
CREATE TRIGGER trg_protheses_ts BEFORE UPDATE ON erp_protheses
  FOR EACH ROW EXECUTE FUNCTION erp_update_ts();
DROP TRIGGER IF EXISTS trg_ortheses_ts ON erp_ortheses;
CREATE TRIGGER trg_ortheses_ts BEFORE UPDATE ON erp_ortheses
  FOR EACH ROW EXECUTE FUNCTION erp_update_ts();

-- ------------------------------------------------------------
-- 4. RLS — le personnel lit, le praticien contrôle SES patients,
--    la direction contrôle tout. Réservation publique possible.
-- ------------------------------------------------------------
ALTER TABLE erp_patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_rdv ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_seances ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_protheses ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_ortheses ENABLE ROW LEVEL SECURITY;

-- Patients: tout le staff lit; praticien + direction modifient
DROP POLICY IF EXISTS "patients_select" ON erp_patients;
CREATE POLICY "patients_select" ON erp_patients FOR SELECT USING (
  praticien_id = auth.uid() OR created_by = auth.uid()
  OR erp_has_role(ARRAY['pdg','directrice','directeur','manager','secretaire','employe','comptable','rh'])
);
DROP POLICY IF EXISTS "patients_insert" ON erp_patients;
CREATE POLICY "patients_insert" ON erp_patients FOR INSERT WITH CHECK (
  erp_has_role(ARRAY['pdg','directrice','directeur','manager','secretaire','employe'])
);
DROP POLICY IF EXISTS "patients_update" ON erp_patients;
CREATE POLICY "patients_update" ON erp_patients FOR UPDATE USING (
  praticien_id = auth.uid()
  OR erp_has_role(ARRAY['pdg','directrice','directeur','manager','secretaire'])
);
DROP POLICY IF EXISTS "patients_delete" ON erp_patients;
CREATE POLICY "patients_delete" ON erp_patients FOR DELETE USING (erp_is_pdg());

-- Services: staff gère; le public lit uniquement is_public
DROP POLICY IF EXISTS "services_staff" ON erp_services;
CREATE POLICY "services_staff" ON erp_services FOR ALL USING (
  erp_has_role(ARRAY['pdg','directrice','directeur','manager','secretaire','employe','comptable'])
);
DROP POLICY IF EXISTS "services_public" ON erp_services;
CREATE POLICY "services_public" ON erp_services FOR SELECT USING (is_public = true AND is_active = true);

-- RDV: insertion publique (booking en ligne), staff lit/modifie
DROP POLICY IF EXISTS "rdv_public_insert" ON erp_rdv;
CREATE POLICY "rdv_public_insert" ON erp_rdv FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "rdv_staff" ON erp_rdv;
CREATE POLICY "rdv_staff" ON erp_rdv FOR SELECT USING (
  praticien_id = auth.uid() OR created_by = auth.uid()
  OR erp_has_role(ARRAY['pdg','directrice','directeur','manager','secretaire','employe','comptable'])
);
DROP POLICY IF EXISTS "rdv_staff_update" ON erp_rdv;
CREATE POLICY "rdv_staff_update" ON erp_rdv FOR UPDATE USING (
  praticien_id = auth.uid()
  OR erp_has_role(ARRAY['pdg','directrice','directeur','manager','secretaire'])
);

-- Séances: praticien gère les siennes, direction tout
DROP POLICY IF EXISTS "seances_select" ON erp_seances;
CREATE POLICY "seances_select" ON erp_seances FOR SELECT USING (
  praticien_id = auth.uid() OR created_by = auth.uid()
  OR erp_has_role(ARRAY['pdg','directrice','directeur','manager','secretaire','employe'])
);
DROP POLICY IF EXISTS "seances_insert" ON erp_seances;
CREATE POLICY "seances_insert" ON erp_seances FOR INSERT WITH CHECK (
  erp_has_role(ARRAY['pdg','directrice','directeur','manager','secretaire','employe'])
);
DROP POLICY IF EXISTS "seances_update" ON erp_seances;
CREATE POLICY "seances_update" ON erp_seances FOR UPDATE USING (
  praticien_id = auth.uid()
  OR erp_has_role(ARRAY['pdg','directrice','directeur','manager','secretaire'])
);
DROP POLICY IF EXISTS "seances_delete" ON erp_seances;
CREATE POLICY "seances_delete" ON erp_seances FOR DELETE USING (erp_is_pdg());

-- Prothèses / Orthèses: même logique que séances
DROP POLICY IF EXISTS "protheses_select" ON erp_protheses;
CREATE POLICY "protheses_select" ON erp_protheses FOR SELECT USING (
  created_by = auth.uid()
  OR erp_has_role(ARRAY['pdg','directrice','directeur','manager','secretaire','employe'])
);
DROP POLICY IF EXISTS "protheses_write" ON erp_protheses;
CREATE POLICY "protheses_write" ON erp_protheses FOR INSERT WITH CHECK (
  erp_has_role(ARRAY['pdg','directrice','directeur','manager','secretaire','employe'])
);
DROP POLICY IF EXISTS "protheses_update" ON erp_protheses;
CREATE POLICY "protheses_update" ON erp_protheses FOR UPDATE USING (
  created_by = auth.uid()
  OR erp_has_role(ARRAY['pdg','directrice','directeur','manager','secretaire','employe'])
);
DROP POLICY IF EXISTS "protheses_delete" ON erp_protheses;
CREATE POLICY "protheses_delete" ON erp_protheses FOR DELETE USING (erp_is_pdg());

DROP POLICY IF EXISTS "ortheses_select" ON erp_ortheses;
CREATE POLICY "ortheses_select" ON erp_ortheses FOR SELECT USING (
  created_by = auth.uid()
  OR erp_has_role(ARRAY['pdg','directrice','directeur','manager','secretaire','employe'])
);
DROP POLICY IF EXISTS "ortheses_write" ON erp_ortheses;
CREATE POLICY "ortheses_write" ON erp_ortheses FOR INSERT WITH CHECK (
  erp_has_role(ARRAY['pdg','directrice','directeur','manager','secretaire','employe'])
);
DROP POLICY IF EXISTS "ortheses_update" ON erp_ortheses;
CREATE POLICY "ortheses_update" ON erp_ortheses FOR UPDATE USING (
  created_by = auth.uid()
  OR erp_has_role(ARRAY['pdg','directrice','directeur','manager','secretaire','employe'])
);
DROP POLICY IF EXISTS "ortheses_delete" ON erp_ortheses;
CREATE POLICY "ortheses_delete" ON erp_ortheses FOR DELETE USING (erp_is_pdg());

-- ------------------------------------------------------------
-- 5. RPC public — catalogue sans connexion
--    catalogue.html?e=<enterprise_id> appelle cette fonction.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION erp_public_catalog(p_enterprise_id uuid)
RETURNS jsonb AS $$
  SELECT jsonb_build_object(
    'company', jsonb_build_object(
      'id', r.id,
      'name', r.company_name,
      'phone', r.company_phone,
      'email', r.company_email,
      'address', r.company_address,
      'city', r.company_city,
      'country', r.company_country,
      'website', r.company_website,
      'description', r.description,
      'type', t.name
    ),
    'services', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name, 'category', s.category,
        'description', s.description, 'price', s.price,
        'devise', s.devise, 'duration_min', s.duration_min
      ) ORDER BY s.category, s.price)
      FROM erp_services s
      WHERE s.enterprise_id = p_enterprise_id AND s.is_public AND s.is_active
    ), '[]'::jsonb),
    'products', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', p.id, 'designation', p.designation, 'categorie', p.categorie,
        'description', p.description, 'prix_vente', p.prix_vente,
        'unite', p.unite, 'image_url', p.image_url
      ) ORDER BY p.designation)
      FROM erp_produits p
      WHERE p.is_public AND p.is_active
    ), '[]'::jsonb)
  )
  FROM erp_enterprise_registrations r
  LEFT JOIN erp_enterprise_types t ON t.id = r.enterprise_type_id
  WHERE r.id = p_enterprise_id;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ------------------------------------------------------------
-- 6. Entreprise HAITI REH-CARE + rattachement du compte existant
-- ------------------------------------------------------------
DO $$
DECLARE
  v_enterprise_id uuid;
  v_type_id uuid;
  v_user_id uuid;
BEGIN
  SELECT id INTO v_type_id FROM erp_enterprise_types WHERE code = 'physiotherapy';

  INSERT INTO erp_enterprise_registrations (
    company_name, company_email, company_phone, company_address,
    company_city, company_country, enterprise_type_id, secteur,
    nombre_employes, description,
    pdg_first_name, pdg_last_name, pdg_email, pdg_phone,
    statut, subscription_plan, features_unlocked
  ) VALUES (
    'HAITI REH-CARE', 'haitirecareerp@gmail.com', '+509 0000 0000',
    'Port-au-Prince', 'Port-au-Prince', 'Haïti', v_type_id,
    'Santé — Physiothérapie & Réadaptation', '11-50',
    'Centre de physiothérapie, massothérapie, pose de prothèses et orthèses, achat et vente de matériel orthopédique.',
    'Direction', 'HAITI REH-CARE', 'haitirecareerp@gmail.com', '+509 0000 0000',
    'active', 'premium', '{"all": true}'
  )
  ON CONFLICT (company_email) DO UPDATE SET
    enterprise_type_id = v_type_id,
    statut = 'active',
    subscription_plan = 'premium',
    features_unlocked = '{"all": true}'
  RETURNING id INTO v_enterprise_id;

  INSERT INTO erp_settings (
    company_name, company_email, company_phone, company_address,
    company_city, company_country, sector, enterprise_id,
    is_enterprise_active, subscription_status, features_enabled
  )
  SELECT 'HAITI REH-CARE', 'haitirecareerp@gmail.com', '+509 0000 0000',
         'Port-au-Prince', 'Port-au-Prince', 'Haïti',
         'Santé — Physiothérapie', v_enterprise_id,
         true, 'active', '{"all": true}'
  WHERE NOT EXISTS (
    SELECT 1 FROM erp_settings WHERE enterprise_id = v_enterprise_id
  );

  -- Rattache le compte Supabase Auth existant (déjà créé)
  SELECT id INTO v_user_id FROM auth.users WHERE email = 'haitirecareerp@gmail.com';

  IF v_user_id IS NOT NULL THEN
    INSERT INTO erp_users (id, first_name, last_name, email, role, is_active)
    VALUES (v_user_id, 'Direction', 'HAITI REH-CARE', 'haitirecareerp@gmail.com', 'pdg', true)
    ON CONFLICT (id) DO UPDATE SET role = 'pdg', is_active = true;

    INSERT INTO erp_user_enterprises (user_id, enterprise_id, role_in_enterprise, is_primary)
    VALUES (v_user_id, v_enterprise_id, 'pdg', true)
    ON CONFLICT (user_id, enterprise_id) DO UPDATE
      SET is_primary = true, role_in_enterprise = 'pdg';

    INSERT INTO erp_employes (id, date_embauche, type_contrat)
    VALUES (v_user_id, CURRENT_DATE, 'CDI')
    ON CONFLICT (id) DO NOTHING;
  ELSE
    RAISE NOTICE 'Compte auth haitirecareerp@gmail.com introuvable — créez-le dans Supabase Auth puis re-exécutez ce fichier.';
  END IF;
END $$;

-- ------------------------------------------------------------
-- 7. Postes cliniques (permissions fusionnées dans
--    getEffectivePermissions côté frontend)
-- ------------------------------------------------------------
INSERT INTO erp_postes (name, department, description, permissions)
SELECT v.name, v.department, v.description, v.permissions::jsonb
FROM (VALUES
  ('Secrétaire', 'Administration', 'Accueil, agenda et rendez-vous',
   '{"clients":true,"patients":true,"rdv":true,"seances":true,"services":true,"agenda":true,"taches":true,"messages":true,"rapports":true}'),
  ('Physiothérapeute', 'Clinique', 'Séances de physiothérapie et rééducation',
   '{"patients":true,"rdv":true,"seances":true,"services":true,"protheses":true,"ortheses":true,"taches":true,"messages":true}'),
  ('Massothérapeute', 'Clinique', 'Massages thérapeutiques et relaxants',
   '{"patients":true,"rdv":true,"seances":true,"services":true,"taches":true,"messages":true}'),
  ('Orthoprothésiste', 'Clinique', 'Conception et pose de prothèses et orthèses',
   '{"patients":true,"protheses":true,"ortheses":true,"materiel_orthopedique":true,"stock":true,"seances":true,"taches":true,"messages":true}'),
  ('Médecin Référent', 'Médical', 'Supervision médicale et dossiers patients',
   '{"patients":true,"rdv":true,"seances":true,"ordonnances":true,"protheses":true,"ortheses":true,"rapports":true,"messages":true}'),
  ('Caissier', 'Finances', 'Encaissements, caisse et facturation',
   '{"caisse":true,"facturation":true,"ventes":true,"clients":true,"patients":true,"services":true,"rapports":true,"messages":true}'),
  ('Responsable Magasin', 'Stock', 'Matériel orthopédique — achats et ventes',
   '{"stock":true,"materiel_orthopedique":true,"catalogue":true,"fournisseurs":true,"ventes":true,"rapports":true,"messages":true}')
) AS v(name, department, description, permissions)
WHERE NOT EXISTS (
  SELECT 1 FROM erp_postes p WHERE p.name = v.name
);

-- ------------------------------------------------------------
-- 8. Services du catalogue (tarifs HTG) — publics par défaut
-- ------------------------------------------------------------
DO $$
DECLARE
  v_eid uuid;
BEGIN
  SELECT id INTO v_eid FROM erp_enterprise_registrations
  WHERE company_email = 'haitirecareerp@gmail.com';

  INSERT INTO erp_services (enterprise_id, code, name, category, description, price, duration_min, is_public)
  SELECT v_eid, s.code, s.name, s.category, s.description, s.price, s.duration_min, true
  FROM (VALUES
    ('EVAL-INIT',  'Évaluation initiale',              'Physiothérapie',  'Bilan complet, anamnèse et plan de traitement personnalisé.', 1500, 60),
    ('SEA-PHY',    'Séance de physiothérapie',         'Physiothérapie',  'Séance de rééducation individuelle avec un physiothérapeute.', 1200, 45),
    ('REED-POST',  'Rééducation post-opératoire',      'Physiothérapie',  'Protocole de récupération après chirurgie (ligaments, prothèses, fractures).', 1500, 60),
    ('ELECTRO',    'Électrothérapie / Ultrason',       'Physiothérapie',  'Traitement antalgique par électrothérapie ou ultrasons.', 1000, 30),
    ('KINE-RES',   'Kinésithérapie respiratoire',      'Physiothérapie',  'Drainage bronchique et rééducation respiratoire.', 1400, 45),
    ('MASS-30',    'Massage thérapeutique 30 min',     'Massothérapie',   'Massage ciblé pour douleurs musculaires et tensions.', 800, 30),
    ('MASS-60',    'Massage thérapeutique 60 min',     'Massothérapie',   'Massage complet du corps à visée thérapeutique.', 1500, 60),
    ('MASS-RELAX', 'Massage relaxant',                 'Massothérapie',   'Massage de détente pour stress et fatigue.', 1200, 45),
    ('DRAIN',      'Drainage lymphatique',             'Massothérapie',   'Drainage lymphatique manuel (œdèmes, post-opératoire).', 1800, 60),
    ('CONS-ORTHO', 'Consultation orthopédique',        'Orthèses & Prothèses', 'Consultation et prescription d''appareillage.', 2000, 30),
    ('POSE-ORTH',  'Pose d''orthèse',                  'Orthèses & Prothèses', 'Mesure, adaptation et pose d''orthèse. Prix à partir de.', 3000, 45),
    ('EVAL-PROTH', 'Évaluation prothétique',           'Orthèses & Prothèses', 'Évaluation pour prothèse de membre. Prix à partir de.', 5000, 60),
    ('SEMELLE',    'Semelles orthopédiques sur mesure','Orthèses & Prothèses', 'Empreinte, fabrication et ajustement de semelles.', 4500, 45),
    ('DOMICILE',   'Séance à domicile',                'Physiothérapie',  'Séance de soin à domicile (zone métropolitaine).', 2500, 45),
    ('PACK-10',    'Forfait 10 séances',               'Forfaits',        'Forfait de 10 séances de physiothérapie — tarif préférentiel.', 10000, 45)
  ) AS s(code, name, category, description, price, duration_min)
  WHERE v_eid IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM erp_services x
      WHERE x.enterprise_id = v_eid AND x.code = s.code
    );
END $$;

-- ------------------------------------------------------------
-- 9. Stock — matériel orthopédique (achat/vente, visible public)
-- ------------------------------------------------------------
INSERT INTO erp_produits (code, designation, categorie, quantite, quantite_min, prix_achat, prix_vente, unite, description, is_public)
SELECT v.code, v.designation, 'Matériel Orthopédique', v.quantite, v.quantite_min, v.prix_achat, v.prix_vente, v.unite, v.description, true
FROM (VALUES
  ('GEN-01',   'Genouillère élastique',            25, 5, 700,   1200,  'pièce', 'Maintien et soutien de l''articulation du genou.'),
  ('GEN-ART',  'Genouillère articulée',            10, 3, 2500,  4000,  'pièce', 'Genouillère avec articulations latérales.'),
  ('CHE-01',   'Chevillère élastique',             30, 5, 550,   1000,  'pièce', 'Soutien de la cheville — entorses légères.'),
  ('POIG-01',  'Attelle de poignet',               20, 5, 900,   1500,  'pièce', 'Immobilisation du poignet (canal carpien, entorses).'),
  ('LOM-01',   'Ceinture lombaire',                15, 4, 1500,  2500,  'pièce', 'Soutien lombaire pour douleurs de dos.'),
  ('COL-01',   'Collier cervical',                 12, 4, 1100,  1800,  'pièce', 'Collier cervical souple ou semi-rigide.'),
  ('BEQ-01',   'Béquilles axillaires (paire)',     10, 3, 2200,  3500,  'paire', 'Béquilles réglables en aluminium.'),
  ('CAN-01',   'Canne de marche',                  15, 4, 1000,  1800,  'pièce', 'Canne de marche réglable.'),
  ('DEA-01',   'Déambulateur pliant',              6,  2, 7500,  12000, 'pièce', 'Déambulateur 4 roues avec siège.'),
  ('FAUT-01',  'Fauteuil roulant standard',        4,  1, 16000, 25000, 'pièce', 'Fauteuil roulant pliant standard.'),
  ('SEM-01',   'Semelles orthopédiques',           20, 5, 2800,  4500,  'paire', 'Semelles de correction sur mesure.'),
  ('BAS-01',   'Bas de contention',                25, 5, 1200,  2000,  'paire', 'Bas de compression classe 2.'),
  ('COUDE-01', 'Bande épicondylienne',             18, 5, 500,   900,   'pièce', 'Bande de coude — tendinite, tennis elbow.'),
  ('ELAST-01', 'Bande élastique d''exercice',      40, 10, 200,  400,   'rouleau','Bande de résistance pour exercices de rééducation.'),
  ('COUSS-01', 'Coussin lombaire',                 15, 5, 800,   1500,  'pièce', 'Coussin ergonomique pour chaise.'),
  ('ORTH-PL',  'Orthèse plantaire sur mesure',     10, 3, 3200,  5000,  'paire', 'Orthèses plantaires moulées sur mesure.'),
  ('HUILE-01', 'Huile de massage thérapeutique',   30, 8, 300,   600,   'flacon','Huile professionnelle pour massothérapie.'),
  ('CRIO-01',  'Poche de gel chaud/froid',         20, 6, 400,   800,   'pièce', 'Poche thermique réutilisable.')
) AS v(code, designation, quantite, quantite_min, prix_achat, prix_vente, unite, description)
WHERE NOT EXISTS (
  SELECT 1 FROM erp_produits p WHERE p.code = v.code
);

-- ------------------------------------------------------------
-- 10. Patients de démonstration
-- ------------------------------------------------------------
DO $$
DECLARE
  v_eid uuid;
BEGIN
  SELECT id INTO v_eid FROM erp_enterprise_registrations
  WHERE company_email = 'haitirecareerp@gmail.com';

  INSERT INTO erp_patients (enterprise_id, nom, prenom, date_naissance, sexe, phone, adresse, diagnostic, statut)
  SELECT v_eid, p.nom, p.prenom, p.date_naissance::date, p.sexe, p.phone, p.adresse, p.diagnostic, p.statut
  FROM (VALUES
    ('JEAN',     'Marie-Lourdes', '1978-04-12', 'F', '+509 3400 1122', 'Delmas 33',        'Lombalgie chronique — programme de 12 séances', 'en_suivi'),
    ('PIERRE',   'Jean-Robert',   '1965-09-03', 'M', '+509 3700 4455', 'Pétion-Ville',     'Rééducation post-opératoire genou (LCA)',       'en_suivi'),
    ('JOSEPH',   'Nadège',        '1990-01-25', 'F', '+509 3800 7788', 'Tabarre',          'Entorse de cheville grade 2',                   'actif'),
    ('CHARLES',  'Wisdom',        '1958-06-18', 'M', '+509 3500 9900', 'Carrefour',        'Amputation transtibiale — prothèse en cours',   'en_suivi'),
    ('DORVIL',   'Samantha',      '2001-11-30', 'F', '+509 3900 2233', 'Delmas 75',        'Scoliose — orthèse de correction',              'actif'),
    ('LOUIS',    'Ernst',         '1983-02-14', 'M', '+509 3600 6677', 'Croix-des-Bouquets','Tendinite épaule droite — massages + séances', 'en_suivi')
  ) AS p(nom, prenom, date_naissance, sexe, phone, adresse, diagnostic, statut)
  WHERE v_eid IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM erp_patients x
      WHERE x.enterprise_id = v_eid AND x.nom = p.nom AND x.prenom = p.prenom
    );
END $$;

-- ------------------------------------------------------------
-- 11. Rendez-vous + séances de démonstration
-- ------------------------------------------------------------
DO $$
DECLARE
  v_eid uuid;
  svc record;
  pat record;
  v_i int := 0;
  v_parts text[];
  v_names text[] := ARRAY[
    'JEAN|Marie-Lourdes|+509 3400 1122',
    'JOSEPH|Nadège|+509 3800 7788',
    'CHARLES|Wisdom|+509 3500 9900',
    'DORVIL|Samantha|+509 3900 2233',
    'LOUIS|Ernst|+509 3600 6677'
  ];
BEGIN
  SELECT id INTO v_eid FROM erp_enterprise_registrations
  WHERE company_email = 'haitirecareerp@gmail.com';
  IF v_eid IS NULL THEN RETURN; END IF;

  -- Un rendez-vous par service principal, répartis sur la semaine
  FOR svc IN
    SELECT id, name FROM erp_services
    WHERE enterprise_id = v_eid AND code IN ('SEA-PHY','MASS-60','CONS-ORTHO','EVAL-INIT','DOMICILE')
  LOOP
    v_i := v_i + 1;
    v_parts := string_to_array(v_names[v_i], '|');
    INSERT INTO erp_rdv (enterprise_id, patient_nom, patient_prenom, patient_phone,
                         service_id, date_rdv, heure_rdv, statut, motif)
    SELECT v_eid, v_parts[1], v_parts[2], v_parts[3],
           svc.id, CURRENT_DATE + v_i, ((8 + v_i) || ':00')::time, 'confirme', svc.name
    WHERE NOT EXISTS (
      SELECT 1 FROM erp_rdv r WHERE r.enterprise_id = v_eid AND r.service_id = svc.id
    );
  END LOOP;

  -- Séances réalisées / prévues sur les patients de démo
  FOR pat IN
    SELECT id, nom FROM erp_patients WHERE enterprise_id = v_eid LIMIT 4
  LOOP
    INSERT INTO erp_seances (enterprise_id, patient_id, service_id, date_seance, heure, duree_min, type_seance, statut, observations)
    SELECT v_eid, pat.id,
           (SELECT id FROM erp_services WHERE enterprise_id = v_eid AND code = 'SEA-PHY'),
           CURRENT_DATE - 2, '10:00', 45, 'Physiothérapie', 'realisee',
           'Séance effectuée — progression normale.'
    WHERE NOT EXISTS (
      SELECT 1 FROM erp_seances s WHERE s.patient_id = pat.id
    );
  END LOOP;

  -- Prothèses / orthèses en cours
  INSERT INTO erp_protheses (enterprise_id, patient_id, type_prothese, membre, etape, cout, statut, notes)
  SELECT v_eid,
         (SELECT id FROM erp_patients WHERE enterprise_id = v_eid AND nom = 'CHARLES'),
         'Prothèse transtibiale', 'Jambe gauche', 'moulage', 85000, 'en_cours',
         'Moulage réalisé — essayage prévu la semaine prochaine.'
  WHERE v_eid IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM erp_protheses x WHERE x.enterprise_id = v_eid AND x.type_prothese = 'Prothèse transtibiale');

  INSERT INTO erp_ortheses (enterprise_id, patient_id, type_orthese, zone, etape, cout, statut, notes)
  SELECT v_eid,
         (SELECT id FROM erp_patients WHERE enterprise_id = v_eid AND nom = 'DORVIL'),
         'Corset de correction', 'Rachis dorso-lombaire', 'essayage', 25000, 'en_cours',
         'Orthèse pour scoliose — ajustement en cours.'
  WHERE v_eid IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM erp_ortheses x WHERE x.enterprise_id = v_eid AND x.type_orthese = 'Corset de correction');
END $$;

-- ------------------------------------------------------------
-- 12. Clients génériques (module Clients)
-- ------------------------------------------------------------
INSERT INTO erp_clients (nom, prenom, company, email, phone, type, notes)
SELECT v.nom, v.prenom, v.company, v.email, v.phone, v.type, v.notes
FROM (VALUES
  ('HAITI REH-CARE', 'Fournisseur', 'MedEquip S.A.',       'contact@medequip.ht',  '+509 2810 0000', 'entreprise',  'Fournisseur de matériel orthopédique.'),
  ('ASSURANCE',      'AIC',         'AIC Assurances',      'dossiers@aic.ht',      '+509 2800 1111', 'entreprise',  'Convention assurance santé.'),
  ('BAPTISTE',       'Guerline',    NULL,                  'guerline.b@gmail.com', '+509 3400 5555', 'particulier', 'Cliente — forfait massages.'),
  ('NOEL',           'Patrick',     NULL,                  'patrick.noel@yahoo.fr','+509 3700 8888', 'particulier', 'Client — achat déambulateur.')
) AS v(nom, prenom, company, email, phone, type, notes)
WHERE NOT EXISTS (
  SELECT 1 FROM erp_clients c WHERE c.email = v.email
);

-- ------------------------------------------------------------
-- LIEN PUBLIC (à donner aux patients):
--   catalogue.html?e=<enterprise_id>
-- L'ID est affiché par cette requête:
SELECT id AS enterprise_id,
       company_name,
       'catalogue.html?e=' || id AS lien_catalogue_public
FROM erp_enterprise_registrations
WHERE company_email = 'haitirecareerp@gmail.com';
