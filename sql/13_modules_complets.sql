-- ============================================================
-- MODIL KONPLÈ — HAITI REH-CARE
-- Run AFTER: 11_portal.sql
-- Idempotent: ka egzekite plizyè fwa san pwoblèm.
--
-- Pwoblèm: modil tankou Pharmacie, Factures, Fournisseurs, Agenda,
-- Ordonnances ak Facturation Médicale te montre placeholder
-- "Module actif — interface sera configurée" paske tab erp_<code>
-- yo pa t egziste (module.html chèche erp_<code>).
-- ============================================================

-- ------------------------------------------------------------
-- 1. Tab yo
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS erp_pharmacie (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  enterprise_id uuid REFERENCES erp_enterprise_registrations(id),
  medicament text NOT NULL,
  forme text,
  dosage text,
  quantite numeric DEFAULT 0,
  unite text DEFAULT 'boîte',
  prix_unitaire numeric DEFAULT 0,
  date_expiration date,
  lot text,
  fournisseur text,
  seuil_alerte numeric DEFAULT 5,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS erp_fournisseurs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  enterprise_id uuid REFERENCES erp_enterprise_registrations(id),
  nom text NOT NULL,
  contact text,
  phone text,
  email text,
  adresse text,
  categorie text,
  notes text,
  is_active boolean DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS erp_factures (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  enterprise_id uuid REFERENCES erp_enterprise_registrations(id),
  numero text,
  client_nom text NOT NULL,
  date_facture date DEFAULT CURRENT_DATE,
  montant numeric DEFAULT 0,
  devise text DEFAULT 'HTG',
  statut text DEFAULT 'brouillon'
    CHECK (statut IN ('brouillon','envoyee','payee','annulee')),
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS erp_facturation_medical (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  enterprise_id uuid REFERENCES erp_enterprise_registrations(id),
  patient_id uuid REFERENCES erp_patients(id) ON DELETE SET NULL,
  patient_nom text NOT NULL,
  service text,
  date_facture date DEFAULT CURRENT_DATE,
  montant numeric DEFAULT 0,
  devise text DEFAULT 'HTG',
  mode_paiement text,
  statut text DEFAULT 'en_attente'
    CHECK (statut IN ('en_attente','payee','annulee')),
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS erp_ordonnances (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  enterprise_id uuid REFERENCES erp_enterprise_registrations(id),
  patient_id uuid REFERENCES erp_patients(id) ON DELETE SET NULL,
  patient_nom text NOT NULL,
  medecin text,
  date_ordonnance date DEFAULT CURRENT_DATE,
  prescription text,
  posologie text,
  duree text,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS erp_agenda (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  enterprise_id uuid REFERENCES erp_enterprise_registrations(id),
  titre text NOT NULL,
  date_event date DEFAULT CURRENT_DATE,
  heure_debut time,
  heure_fin time,
  lieu text,
  description text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ------------------------------------------------------------
-- 2. Triggers updated_at + RLS
--    Direction (pdg/directrice/directeur) kontwole tout;
--    staff la li ak ekri; sèlman PDG ka efase.
-- ------------------------------------------------------------
DO $$
DECLARE
  t text;
  tables text[] := ARRAY['erp_pharmacie','erp_fournisseurs','erp_factures',
                         'erp_facturation_medical','erp_ordonnances','erp_agenda'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_ts ON %I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%s_ts BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION erp_update_ts()', t, t);

    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);

    EXECUTE format('DROP POLICY IF EXISTS "%s_select" ON %I', t, t);
    EXECUTE format($p$CREATE POLICY "%s_select" ON %I FOR SELECT USING (
      created_by = auth.uid()
      OR erp_has_role(ARRAY['pdg','directrice','directeur','manager','secretaire','comptable','responsable_stock','commercial','rh','employe'])
    )$p$, t, t);

    EXECUTE format('DROP POLICY IF EXISTS "%s_insert" ON %I', t, t);
    EXECUTE format($p$CREATE POLICY "%s_insert" ON %I FOR INSERT WITH CHECK (
      erp_has_role(ARRAY['pdg','directrice','directeur','manager','secretaire','comptable','responsable_stock','commercial','employe'])
    )$p$, t, t);

    EXECUTE format('DROP POLICY IF EXISTS "%s_update" ON %I', t, t);
    EXECUTE format($p$CREATE POLICY "%s_update" ON %I FOR UPDATE USING (
      created_by = auth.uid()
      OR erp_has_role(ARRAY['pdg','directrice','directeur','manager','secretaire','comptable','responsable_stock'])
    )$p$, t, t);

    EXECUTE format('DROP POLICY IF EXISTS "%s_delete" ON %I', t, t);
    EXECUTE format('CREATE POLICY "%s_delete" ON %I FOR DELETE USING (erp_is_pdg())', t, t);
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- 3. Metadone modil yo (module.html)
-- ------------------------------------------------------------
INSERT INTO erp_modules (code, name, category, description, icon, default_permissions) VALUES
('pharmacie',           'Pharmacie',            'Gestion',       'Médicaments, lots, dates d''expiration et stock pharmacie', 'pill',           '{"view": true, "create": true, "edit": true}'),
('fournisseurs',        'Fournisseurs',         'Gestion',       'Carnet des fournisseurs',                                   'truck',          '{"view": true, "create": true, "edit": true}'),
('factures',            'Factures',             'Gestion',       'Factures clients',                                          'file-text',      '{"view": true, "create": true, "edit": true}'),
('facturation_medical', 'Facturation Médicale', 'Gestion',       'Facturation des soins aux patients',                        'receipt',        '{"view": true, "create": true, "edit": true}'),
('ordonnances',         'Ordonnances',          'Clinique',      'Prescriptions médicales des patients',                      'file-text',      '{"view": true, "create": true, "edit": true}'),
('agenda',              'Agenda',               'Communication', 'Événements et réunions du centre',                          'calendar',       '{"view": true, "create": true, "edit": true}')
ON CONFLICT (code) DO NOTHING;

-- ------------------------------------------------------------
-- 4. PDG: haitirecareerp@gmail.com = chèf tout bagay
--    role 'pdg' + antrepriz debloke nèt ({"all": true}).
-- ------------------------------------------------------------
DO $$
DECLARE
  v_uid uuid;
  v_eid uuid;
BEGIN
  UPDATE erp_enterprise_registrations
  SET features_unlocked = '{"all": true}', statut = 'active'
  WHERE lower(company_email) = 'haitirecareerp@gmail.com'
  RETURNING id INTO v_eid;

  UPDATE erp_settings SET features_enabled = '{"all": true}'
  WHERE v_eid IS NULL OR enterprise_id = v_eid OR enterprise_id IS NULL;

  SELECT id INTO v_uid FROM auth.users WHERE lower(email) = 'haitirecareerp@gmail.com';
  IF v_uid IS NULL THEN
    RAISE NOTICE 'Kont auth haitirecareerp@gmail.com pa egziste — kreye l nan Supabase Auth epi re-egzekite fichye sa a.';
    RETURN;
  END IF;

  INSERT INTO erp_users (id, email, first_name, last_name, role, is_active)
  VALUES (v_uid, 'haitirecareerp@gmail.com', 'Direction', 'HAITI REH-CARE', 'pdg', true)
  ON CONFLICT (id) DO UPDATE SET role = 'pdg', is_active = true;

  -- Retire nenpòt modil ki te dezaktive manyèlman pou PDG a
  DELETE FROM erp_user_modules WHERE user_id = v_uid AND is_enabled = false;

  IF v_eid IS NOT NULL THEN
    UPDATE erp_user_enterprises SET is_primary = false WHERE user_id = v_uid;
    INSERT INTO erp_user_enterprises (user_id, enterprise_id, role_in_enterprise, is_primary)
    VALUES (v_uid, v_eid, 'pdg', true)
    ON CONFLICT (user_id, enterprise_id) DO UPDATE
      SET is_primary = true, role_in_enterprise = 'pdg';
  END IF;
END $$;
