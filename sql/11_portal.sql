-- ============================================================
-- PORTAIL PUBLIC — HAITI REH-CARE
-- Run this AFTER: 10_haiti_rehcare.sql
-- Idempotent: ka egzekite plizyè fwa san pwoblèm.
-- IMPORTANT: fichye sa a PA manyen okenn bagay CVisual —
--            li ajoute sèlman sa pòtal piblik la bezwen.
--            (Netwayaj CVisual la se nan 12_cleanup.sql — opsyonèl)
--
-- Sa fichye sa a fè:
--   1. Kont pasyan sou sit piblik la (auth.users <-> erp_patients)
--   2. Tab "erp_annonces" — achat/vente prothèses & matériel
--   3. Tab "erp_site_messages" — fòmilè kontak piblik
--   4. RPC piblik/pòtal (antrepriz, enskripsyon pasyan, doktè)
--   5. FIX: kreyasyon anplwaye san kraze sesyon admin an
--   6. Storage: mete ajou logo nan "erp-settings"
--   7. Modil "Site Web" + "Annonces" nan ERP la
-- ============================================================

-- Direksyon an ka jere manm antrepriz la (lyen nouvo anplwaye)
DROP POLICY IF EXISTS "user_enterprises_manage" ON erp_user_enterprises;
CREATE POLICY "user_enterprises_manage" ON erp_user_enterprises FOR ALL
  USING (erp_can_manage_users());

-- ------------------------------------------------------------
-- 1. KONT PASYAN — lyen auth.users <-> erp_patients
-- ------------------------------------------------------------
ALTER TABLE erp_patients ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);
CREATE INDEX IF NOT EXISTS idx_patients_user ON erp_patients(user_id);

-- Pasyan an wè/modifye pwòp dossier l (pa user_id oswa pa email)
DROP POLICY IF EXISTS "patients_self_select" ON erp_patients;
CREATE POLICY "patients_self_select" ON erp_patients FOR SELECT
  USING (user_id = auth.uid()
         OR lower(email) = lower(auth.jwt() ->> 'email'));

DROP POLICY IF EXISTS "patients_self_update" ON erp_patients;
CREATE POLICY "patients_self_update" ON erp_patients FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "patients_self_insert" ON erp_patients;
CREATE POLICY "patients_self_insert" ON erp_patients FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Pasyan an wè randevou l yo (pa dossier oswa pa email rezervasyon an)
DROP POLICY IF EXISTS "rdv_patient_select" ON erp_rdv;
CREATE POLICY "rdv_patient_select" ON erp_rdv FOR SELECT
  USING (patient_id IN (SELECT id FROM erp_patients WHERE user_id = auth.uid())
         OR lower(patient_email) = lower(auth.jwt() ->> 'email'));

-- Katalòg piblik: nenpòt moun li pwodwi is_public (materiel.html)
DROP POLICY IF EXISTS "produits_public" ON erp_produits;
CREATE POLICY "produits_public" ON erp_produits FOR SELECT
  USING (is_public = true AND is_active = true);

-- ------------------------------------------------------------
-- 3. ANNONCES — achat/vente prothèses & matériel ortopedik
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS erp_annonces (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  enterprise_id uuid REFERENCES erp_enterprise_registrations(id),
  titre text NOT NULL,
  description text,
  type text DEFAULT 'vente' CHECK (type IN ('vente','achat','don')),
  categorie text DEFAULT 'Matériel orthopédique',
  prix numeric DEFAULT 0,
  devise text DEFAULT 'HTG',
  etat text DEFAULT 'bon' CHECK (etat IN ('neuf','tres_bon','bon','usage')),
  contact_nom text,
  contact_phone text,
  contact_email text,
  image_url text,
  statut text DEFAULT 'en_attente' CHECK (statut IN ('en_attente','publie','rejete','vendu')),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_annonces_ts ON erp_annonces;
CREATE TRIGGER trg_annonces_ts BEFORE UPDATE ON erp_annonces
  FOR EACH ROW EXECUTE FUNCTION erp_update_ts();

ALTER TABLE erp_annonces ENABLE ROW LEVEL SECURITY;

-- Tout moun wè annonce pibliye yo; pwopriyetè a wè pa l yo
DROP POLICY IF EXISTS "annonces_public" ON erp_annonces;
CREATE POLICY "annonces_public" ON erp_annonces FOR SELECT
  USING (statut = 'publie' OR created_by = auth.uid());

-- Itilizatè konekte ka poste (statut fòse 'en_attente' pa trigger la)
DROP POLICY IF EXISTS "annonces_insert" ON erp_annonces;
CREATE POLICY "annonces_insert" ON erp_annonces FOR INSERT
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "annonces_own_update" ON erp_annonces;
CREATE POLICY "annonces_own_update" ON erp_annonces FOR UPDATE
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "annonces_own_delete" ON erp_annonces;
CREATE POLICY "annonces_own_delete" ON erp_annonces FOR DELETE
  USING (created_by = auth.uid());

DROP POLICY IF EXISTS "annonces_staff" ON erp_annonces;
CREATE POLICY "annonces_staff" ON erp_annonces FOR ALL
  USING (erp_has_role(ARRAY['pdg','directrice','directeur','manager','secretaire','employe','comptable','rh']));

-- Pwoteksyon: yon non-staff pa ka pibliye pwòp annonce li
CREATE OR REPLACE FUNCTION erp_annonces_guard()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT erp_has_role(ARRAY['pdg','directrice','directeur','manager','secretaire','employe','comptable','rh']) THEN
    IF TG_OP = 'INSERT' THEN
      NEW.statut := 'en_attente';
    ELSIF NEW.statut IS DISTINCT FROM OLD.statut AND NEW.statut <> 'vendu' THEN
      NEW.statut := OLD.statut;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_annonces_guard ON erp_annonces;
CREATE TRIGGER trg_annonces_guard BEFORE INSERT OR UPDATE ON erp_annonces
  FOR EACH ROW EXECUTE FUNCTION erp_annonces_guard();

-- ------------------------------------------------------------
-- 3b. MESAJ SIT LA — fòmilè kontak piblik (san kont)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS erp_site_messages (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  enterprise_id uuid REFERENCES erp_enterprise_registrations(id),
  nom text NOT NULL,
  email text,
  phone text,
  sujet text,
  message text NOT NULL,
  is_read boolean DEFAULT false,
  replied_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE erp_site_messages ENABLE ROW LEVEL SECURITY;

-- Tout moun ka voye yon mesaj; sèlman staff la ka li/jere yo
DROP POLICY IF EXISTS "site_messages_insert" ON erp_site_messages;
CREATE POLICY "site_messages_insert" ON erp_site_messages FOR INSERT
  WITH CHECK (true);
DROP POLICY IF EXISTS "site_messages_staff" ON erp_site_messages;
CREATE POLICY "site_messages_staff" ON erp_site_messages FOR ALL
  USING (erp_has_role(ARRAY['pdg','directrice','directeur','manager','secretaire','employe','rh']));

-- ------------------------------------------------------------
-- 4. RPC PIBLIK / PÒTAL
-- ------------------------------------------------------------

-- Antrepriz aktif la pou sit piblik la — HAITI REH-CARE (physiotherapy)
-- an premye, pa yon lòt antrepriz ki te ka rete nan baz la.
CREATE OR REPLACE FUNCTION erp_public_enterprise()
RETURNS jsonb AS $$
  SELECT jsonb_build_object(
    'id', r.id,
    'name', r.company_name,
    'phone', r.company_phone,
    'email', r.company_email,
    'address', r.company_address,
    'city', r.company_city,
    'country', r.company_country,
    'website', r.company_website,
    'description', r.description,
    'type', t.name,
    'logo_url', s.logo_url
  )
  FROM erp_enterprise_registrations r
  LEFT JOIN erp_enterprise_types t ON t.id = r.enterprise_type_id
  LEFT JOIN erp_settings s ON s.enterprise_id = r.id
  WHERE r.statut = 'active'
  ORDER BY CASE WHEN t.code = 'physiotherapy' THEN 0 ELSE 1 END, r.created_at
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Enskripsyon / lyen kont pasyan sou sit la
CREATE OR REPLACE FUNCTION erp_portal_register_patient(
  p_nom text,
  p_prenom text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_date_naissance date DEFAULT NULL,
  p_sexe text DEFAULT NULL,
  p_adresse text DEFAULT NULL
)
RETURNS uuid AS $$
DECLARE
  v_eid uuid;
  v_patient_id uuid;
  v_email text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  SELECT id INTO v_eid FROM erp_enterprise_registrations
   WHERE statut = 'active' ORDER BY created_at LIMIT 1;

  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();

  -- Si yon dosye pasyan gen menm imèl deja → lyen li ak kont lan
  SELECT id INTO v_patient_id FROM erp_patients
   WHERE user_id = auth.uid()
      OR (v_email IS NOT NULL AND lower(email) = lower(v_email))
   ORDER BY created_at LIMIT 1;

  IF v_patient_id IS NOT NULL THEN
    UPDATE erp_patients SET
      user_id = auth.uid(),
      nom = COALESCE(NULLIF(p_nom, ''), nom),
      prenom = COALESCE(NULLIF(p_prenom, ''), prenom),
      phone = COALESCE(NULLIF(p_phone, ''), phone),
      email = COALESCE(v_email, email),
      date_naissance = COALESCE(p_date_naissance, date_naissance),
      sexe = COALESCE(p_sexe, sexe),
      adresse = COALESCE(NULLIF(p_adresse, ''), adresse),
      updated_at = now()
    WHERE id = v_patient_id;
  ELSE
    INSERT INTO erp_patients (enterprise_id, user_id, nom, prenom, phone, email,
                              date_naissance, sexe, adresse, statut)
    VALUES (v_eid, auth.uid(),
            COALESCE(NULLIF(p_nom, ''), 'Patient'), p_prenom, p_phone, v_email,
            p_date_naissance, p_sexe, p_adresse, 'actif')
    RETURNING id INTO v_patient_id;
  END IF;

  RETURN v_patient_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ID dosye pasyan itilizatè konekte a
CREATE OR REPLACE FUNCTION erp_my_patient_id()
RETURNS uuid AS $$
  SELECT id FROM erp_patients WHERE user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Lis personèl la pou pasyan an (médecin référent an premye)
CREATE OR REPLACE FUNCTION erp_portal_staff()
RETURNS TABLE(id uuid, nom text, poste text) AS $$
BEGIN
  RETURN QUERY
  SELECT u.id,
         trim(u.first_name || ' ' || COALESCE(u.last_name, ''))::text AS nom,
         COALESCE(p.name, u.role)::text AS poste
  FROM erp_users u
  LEFT JOIN erp_postes p ON p.id = u.poste_id
  WHERE u.is_active = true
  ORDER BY CASE WHEN p.name = 'Médecin Référent' THEN 0 ELSE 1 END, u.first_name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ------------------------------------------------------------
-- 5. FIX — Kreyasyon anplwaye
--    Anvan: signUp() chanje sesyon admin an epi insert la tonbe
--    sou RLS → itilizatè a nan auth.users men pa nan ERP la.
--    Kounye a: RPC sa a kreye pwofil + lyen antrepriz + fiche
--    anplwaye an yon sèl apèl (SECURITY DEFINER).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION erp_register_staff(
  p_user_id uuid,
  p_email text,
  p_first_name text,
  p_last_name text,
  p_role text DEFAULT 'employe',
  p_poste_id uuid DEFAULT NULL,
  p_phone text DEFAULT NULL
)
RETURNS boolean AS $$
DECLARE
  v_eid uuid;
BEGIN
  -- COALESCE: si itilizatè a pa gen wòl ditòl (NULL), refize —
  -- sinon "IF NOT NULL" t ap kite tout moun pase.
  IF NOT COALESCE(erp_can_manage_users(), false) THEN
    RAISE EXCEPTION 'Permission denied: Only PDG/Directeur can create staff';
  END IF;

  IF p_role NOT IN ('pdg','directrice','directeur','manager','secretaire',
                    'comptable','responsable_stock','commercial','rh','employe') THEN
    RAISE EXCEPTION 'Invalid role: %', p_role;
  END IF;

  INSERT INTO erp_users (id, email, first_name, last_name, role, poste_id, phone, is_active)
  VALUES (p_user_id, p_email, p_first_name, p_last_name, p_role, p_poste_id, p_phone, true)
  ON CONFLICT (id) DO UPDATE SET
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    role = EXCLUDED.role,
    poste_id = EXCLUDED.poste_id,
    phone = EXCLUDED.phone,
    is_active = true,
    updated_at = now();

  v_eid := erp_get_user_enterprise();
  IF v_eid IS NOT NULL THEN
    INSERT INTO erp_user_enterprises (user_id, enterprise_id, role_in_enterprise, is_primary)
    VALUES (p_user_id, v_eid, 'employe', true)
    ON CONFLICT (user_id, enterprise_id)
    DO UPDATE SET is_primary = true;
  END IF;

  INSERT INTO erp_employes (id, date_embauche, type_contrat)
  VALUES (p_user_id, CURRENT_DATE, 'CDI')
  ON CONFLICT (id) DO NOTHING;

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Reparasyon pwofil: yon itilizatè ki egziste nan auth.users men ki
-- pa gen liy erp_users (ex. anplwaye kreye anvan fix la) rele sa a
-- nan premye login li → pwofil + lyen antrepriz + fiche anplwaye.
CREATE OR REPLACE FUNCTION erp_claim_my_profile(
  p_first_name text DEFAULT NULL,
  p_last_name text DEFAULT NULL
)
RETURNS boolean AS $$
DECLARE
  v_eid uuid;
  v_email text;
  v_pdg_email text;
  v_role text := 'employe';
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  -- Deja gen pwofil → anyen a fè
  IF EXISTS (SELECT 1 FROM erp_users WHERE id = auth.uid()) THEN
    RETURN true;
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();

  -- Antrepriz Recare a (physiotherapy an premye) + imel PDG li a
  SELECT r.id, COALESCE(NULLIF(r.pdg_email, ''), r.company_email)
    INTO v_eid, v_pdg_email
  FROM erp_enterprise_registrations r
  LEFT JOIN erp_enterprise_types t ON t.id = r.enterprise_type_id
  WHERE r.statut = 'active'
  ORDER BY CASE WHEN t.code = 'physiotherapy' THEN 0 ELSE 1 END, r.created_at
  LIMIT 1;

  -- Si imel itilizatè a se imel PDG ki deklare sou antrepriz la → wòl pdg
  IF v_pdg_email IS NOT NULL AND lower(v_email) = lower(v_pdg_email) THEN
    v_role := 'pdg';
  END IF;

  INSERT INTO erp_users (id, email, first_name, last_name, role, is_active)
  VALUES (auth.uid(), v_email,
          COALESCE(NULLIF(p_first_name, ''), split_part(COALESCE(v_email,''), '@', 1)),
          COALESCE(p_last_name, ''),
          v_role, true);

  IF v_eid IS NOT NULL THEN
    INSERT INTO erp_user_enterprises (user_id, enterprise_id, role_in_enterprise, is_primary)
    VALUES (auth.uid(), v_eid, v_role, true)
    ON CONFLICT (user_id, enterprise_id) DO UPDATE
      SET is_primary = true, role_in_enterprise = EXCLUDED.role_in_enterprise;
  END IF;

  INSERT INTO erp_employes (id, date_embauche, type_contrat)
  VALUES (auth.uid(), CURRENT_DATE, 'CDI')
  ON CONFLICT (id) DO NOTHING;

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------
-- 6. STORAGE — logo a ka mete ajou/efase (pa sèlman insert)
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "erp_settings_update" ON storage.objects;
CREATE POLICY "erp_settings_update" ON storage.objects
  FOR UPDATE USING (bucket_id = 'erp-settings' AND erp_is_pdg());
DROP POLICY IF EXISTS "erp_settings_delete" ON storage.objects;
CREATE POLICY "erp_settings_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'erp-settings' AND erp_is_pdg());

-- ------------------------------------------------------------
-- 7. MODILS SIT WEB NAN ERP LA
-- ------------------------------------------------------------
INSERT INTO erp_modules (code, name, category, description, icon, default_permissions) VALUES
('annonces', 'Annonces', 'Site Web', 'Achat/vente prothèses & matériel — modération', 'megaphone', '{"view": true, "create": true, "edit": true, "delete": true}'),
('siteweb',  'Site Web', 'Administration', 'Gestion du site public: rendez-vous en ligne, annonces, messages patients', 'globe', '{"view": true, "edit": true}')
ON CONFLICT (code) DO NOTHING;

-- Tab ventes: modil "Ventes" te montre placeholder la paske erp_ventes
-- pa t egziste. Vant materyèl/pwotez/òtèz yo konsève isit la.
CREATE TABLE IF NOT EXISTS erp_ventes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  produit_id uuid REFERENCES erp_produits(id) ON DELETE SET NULL,
  patient_id uuid REFERENCES erp_patients(id) ON DELETE SET NULL,
  client_nom text,
  designation text NOT NULL,
  quantite numeric DEFAULT 1,
  prix_unitaire numeric DEFAULT 0,
  total numeric DEFAULT 0,
  statut text DEFAULT 'terminee'
    CHECK (statut IN ('en_attente','terminee','annulee')),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);
ALTER TABLE erp_ventes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ventes_select" ON erp_ventes;
CREATE POLICY "ventes_select" ON erp_ventes FOR SELECT
  USING (erp_has_role(ARRAY['pdg','directrice','directeur','manager','commercial','secretaire','comptable']));
DROP POLICY IF EXISTS "ventes_insert" ON erp_ventes;
CREATE POLICY "ventes_insert" ON erp_ventes FOR INSERT WITH CHECK
  (erp_has_role(ARRAY['pdg','directrice','directeur','manager','commercial','secretaire']));
DROP POLICY IF EXISTS "ventes_update" ON erp_ventes;
CREATE POLICY "ventes_update" ON erp_ventes FOR UPDATE
  USING (erp_has_role(ARRAY['pdg','directrice','directeur','manager','commercial','secretaire']));
DROP POLICY IF EXISTS "ventes_delete" ON erp_ventes;
CREATE POLICY "ventes_delete" ON erp_ventes FOR DELETE USING (erp_is_pdg());

-- Fòse lis modil konplè a sou kalite "physiotherapy" (HAITI REH-CARE) —
-- sa garanti PDG a wè TOUT modil yo: Inventaire, Site Web, Annonces, elatriye.
UPDATE erp_enterprise_types
SET features = jsonb_set(features, '{modules}',
  '["patients","rdv","seances","services","protheses","ortheses",
    "materiel_orthopedique","stock","catalogue","ventes","caisse",
    "facturation","finances","employes","presences","taches","messages",
    "rapports","annonces","siteweb","users","parametres"]'::jsonb)
WHERE code = 'physiotherapy';

-- ------------------------------------------------------------
-- 7b. REPARASYON PDG: imel ki deklare kòm PDG sou antrepriz
--     Recare a dwe gen role 'pdg' + Recare kòm antrepriz primary.
--     Sa repare kont ki te kreye kòm 'employe' oswa ki te gen
--     yon lòt antrepriz (ex. Cvisual) kòm primary.
-- ------------------------------------------------------------
DO $$
DECLARE
  v_eid uuid;
  v_uid uuid;
  v_pdg_email text;
BEGIN
  SELECT r.id, COALESCE(NULLIF(r.pdg_email, ''), r.company_email)
    INTO v_eid, v_pdg_email
  FROM erp_enterprise_registrations r
  LEFT JOIN erp_enterprise_types t ON t.id = r.enterprise_type_id
  WHERE r.statut = 'active' AND t.code = 'physiotherapy'
  ORDER BY r.created_at
  LIMIT 1;

  IF v_eid IS NULL OR v_pdg_email IS NULL THEN
    RAISE NOTICE 'Pa gen antrepriz physiotherapy aktif — sote repare PDG.';
    RETURN;
  END IF;

  SELECT id INTO v_uid FROM auth.users WHERE lower(email) = lower(v_pdg_email);
  IF v_uid IS NULL THEN
    RAISE NOTICE 'Kont auth % pa egziste ankò — li pral resevwa wòl pdg otomatikman nan premye login li (erp_claim_my_profile).', v_pdg_email;
    RETURN;
  END IF;

  INSERT INTO erp_users (id, email, first_name, last_name, role, is_active)
  VALUES (v_uid, v_pdg_email, 'Direction', 'HAITI REH-CARE', 'pdg', true)
  ON CONFLICT (id) DO UPDATE SET role = 'pdg', is_active = true;

  -- Recare = sèl antrepriz primary pou kont sa a
  UPDATE erp_user_enterprises SET is_primary = false WHERE user_id = v_uid;
  INSERT INTO erp_user_enterprises (user_id, enterprise_id, role_in_enterprise, is_primary)
  VALUES (v_uid, v_eid, 'pdg', true)
  ON CONFLICT (user_id, enterprise_id) DO UPDATE
    SET is_primary = true, role_in_enterprise = 'pdg';

  INSERT INTO erp_employes (id, date_embauche, type_contrat)
  VALUES (v_uid, CURRENT_DATE, 'CDI')
  ON CONFLICT (id) DO NOTHING;
END $$;

-- ------------------------------------------------------------
-- 8. PÈMISYON EXECUTE
-- ------------------------------------------------------------
GRANT EXECUTE ON FUNCTION erp_public_enterprise() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION erp_public_catalog(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION erp_portal_register_patient(text, text, text, date, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION erp_my_patient_id() TO authenticated;
GRANT EXECUTE ON FUNCTION erp_portal_staff() TO authenticated;
GRANT EXECUTE ON FUNCTION erp_register_staff(uuid, text, text, text, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION erp_claim_my_profile(text, text) TO authenticated;
